/* =========================================================
   eval.js · Đo độ chính xác của bộ chấm điểm trên tập kiểm tra
   Chạy: node eval.js [data.csv] [--seed=42] [--test=0.2] [--errors] [--json]

   Cách làm:
   - Nạp phần lõi của public/script.js (không cần trình duyệt) + từ điển slang.js,
     đúng như server nạp cho trình duyệt.
   - Chia data.csv thành tập huấn luyện / kiểm tra theo tỉ lệ nhãn (stratified),
     cố định seed để lần nào chạy cũng ra cùng kết quả.
   - Báo cáo trên TẬP KIỂM TRA (số liệu đưa vào báo cáo) và trên TOÀN BỘ dữ liệu (tham khảo).
   - Từ điển hiện là từ điển tay (không học từ data.csv) nên không có rò rỉ dữ liệu.
     Nếu sau này nạp từ học máy (train_lexicon.py), phải huấn luyện CHỈ trên tập huấn luyện,
     nếu không số liệu kiểm tra sẽ cao giả.
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const file = args.find(a => !a.startsWith('--')) || path.join(__dirname, 'data.csv');
const SEED = +opt('seed', 42), TEST = +opt('test', 0.2);
const LABELS = ['Tích cực', 'Trung tính', 'Tiêu cực'];
const UNK = 'Chưa đủ thông tin';
const COLS = [...LABELS, UNK];

/* ---------- 1. Nạp bộ chấm điểm và dữ liệu ---------- */
const { readCsv } = require('./csvread');
const engine = require('./engine')({ model: false });   // mô hình dự phòng được huấn luyện bên dưới, tránh dùng model.json đã thấy tập kiểm tra
const trainFile = path.join(__dirname, 'data.csv');
const data = readCsv(file);

/* ---------- 3. Chia tập (stratified, seed cố định) ---------- */
function rng(seed) {   // mulberry32
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rand = rng(SEED);
const train = [], test = [];
for (const l of LABELS) {
  const g = data.filter(d => d.gold === l);
  for (let i = g.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [g[i], g[j]] = [g[j], g[i]]; }
  const nTest = Math.round(g.length * TEST);
  test.push(...g.slice(0, nTest)); train.push(...g.slice(nTest));
}

/* ---------- 3b. Mô hình dự phòng Naive Bayes ----------
   - Đang đánh giá chính data.csv: chỉ huấn luyện trên phần train (không nhìn thấy phần kiểm tra).
   - Đánh giá tệp khác (ví dụ test_independent.csv): huấn luyện trên toàn bộ data.csv.
   - --no-model: tắt mô hình, chỉ dùng từ điển (để so sánh).                                       */
const useModel = !args.includes('--no-model');
if (useModel) {
  const same = path.resolve(file) === path.resolve(trainFile);
  const m = engine.nbTrain(same ? train : readCsv(trainFile), 2, 1);
  engine.setModel(m);
  console.error(`(Mô hình dự phòng: ${m.features} đặc trưng, huấn luyện trên ${same ? 'phần train của ' : ''}data.csv)`);
} else console.error('(Chỉ dùng từ điển, không dùng mô hình dự phòng)');

/* ---------- 4. Chấm và tổng hợp ---------- */
function evaluate(set) {
  const cm = Object.fromEntries(LABELS.map(a => [a, Object.fromEntries(COLS.map(b => [b, 0]))]));
  const errors = [];
  for (const d of set) {
    const r = engine.analyze(d.text);
    cm[d.gold][r.label]++;
    if (r.label !== d.gold) errors.push({ via: r.viaModel ? 'mô hình' : 'từ điển', text: d.text, gold: d.gold, pred: r.label, score: +r.score.toFixed(2), conf: +r.confidence.toFixed(2) });
  }
  const abstain = LABELS.reduce((s, l) => s + cm[l][UNK], 0);
  const answered = set.length - abstain;
  const per = {};
  let correct = 0;
  for (const l of LABELS) {
    const tp = cm[l][l];
    const fp = LABELS.reduce((s, o) => s + (o === l ? 0 : cm[o][l]), 0);
    const fn = cm[l] ? COLS.reduce((s, o) => s + (o === l ? 0 : cm[l][o]), 0) : 0;   // câu bỏ qua tính là bỏ sót
    const p = tp + fp ? tp / (tp + fp) : 0, r = tp + fn ? tp / (tp + fn) : 0;
    per[l] = { precision: p, recall: r, f1: p + r ? 2 * p * r / (p + r) : 0, support: tp + fn };
    correct += tp;
  }
  return {
    n: set.length,
    accuracy: correct / set.length,                         // câu "chưa đủ thông tin" tính là sai (nghiêm ngặt)
    coverage: answered / set.length,
    accuracyAnswered: answered ? correct / answered : 0,    // chỉ tính các câu hệ thống dám trả lời
    abstain,
    macroF1: LABELS.reduce((s, l) => s + per[l].f1, 0) / LABELS.length,
    per, cm, errors,
  };
}

const pct = x => (x * 100).toFixed(1).padStart(5) + '%';
function show(title, r) {
  console.log(`\n=== ${title} (n = ${r.n}) ===`);
  console.log(`Accuracy (câu bỏ qua tính là sai): ${pct(r.accuracy)}   Macro-F1: ${pct(r.macroF1)}`);
  console.log(`Hệ thống trả lời ${r.n - r.abstain}/${r.n} câu (${pct(r.coverage)}); accuracy trên các câu đã trả lời: ${pct(r.accuracyAnswered)}`);
  const u = LABELS.map(l => r.cm[l][UNK]);
  if (r.abstain) {
    console.log(`Trong ${r.abstain} câu "Chưa đủ thông tin": ${u[1]} thật ra trung tính, ${u[0]} tích cực, ${u[2]} tiêu cực` +
      ` (${u[0] + u[2]} câu có cảm xúc mà hệ thống bỏ lỡ nhưng đã được gắn cờ thay vì kết luận sai).`);
  }
  const hi = r.errors.filter(e => e.pred !== UNK && e.conf >= 0.7);
  console.log(`Chấm SAI nhưng độ tin cậy cao (>= 0.7): ${hi.length} câu` + (hi.length ? ' (thường là mỉa mai hoặc từ "hay" nghĩa là "hoặc")' : ''));
  console.log('\nLớp          Precision  Recall    F1    Số mẫu');
  for (const l of LABELS) {
    const p = r.per[l];
    console.log(`${l.padEnd(12)} ${pct(p.precision)}   ${pct(p.recall)}  ${pct(p.f1)}   ${p.support}`);
  }
  console.log('\nMa trận nhầm lẫn (hàng = nhãn thật, cột = dự đoán):');
  console.log(''.padEnd(13) + COLS.map(l => l.padStart(18)).join(''));
  for (const a of LABELS) console.log(a.padEnd(13) + COLS.map(b => String(r.cm[a][b]).padStart(18)).join(''));
}

const rTest = evaluate(test), rAll = evaluate(data);
if (args.includes('--json')) {
  console.log(JSON.stringify({ seed: SEED, test: rTest, all: rAll }, null, 2));
} else {
  console.log(`Dữ liệu: ${file}\nTổng ${data.length} bình luận · huấn luyện ${train.length} · kiểm tra ${test.length} · seed ${SEED}`);
  show('TẬP KIỂM TRA', rTest);
  show('TOÀN BỘ DỮ LIỆU (tham khảo)', rAll);
  if (args.includes('--errors')) {
    console.log('\n--- Các câu chấm sai trên toàn bộ dữ liệu ---');
    rAll.errors.forEach(e => console.log(`[${e.gold} -> ${e.pred}, ${e.via}, tin cậy ${e.conf}] ${e.text}`));
  }
}
