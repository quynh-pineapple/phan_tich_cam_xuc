/* =========================================================
   PHÂN TÍCH CẢM XÚC BÌNH LUẬN MẠNG XÃ HỘI TIẾNG VIỆT
   script.js  (phần chấm điểm chạy trên trình duyệt, dựa trên từ điển + luật)
   ========================================================= */
'use strict';

/* =========================================================
   PHẦN 1 · LÕI PHÂN TÍCH (không đụng tới DOM)
   ========================================================= */

/* ---------- 1.1 Tiện ích ---------- */

// Bỏ dấu tiếng Việt: "đẹp" -> "dep"
const strip = s =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

const esc = s =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// Ngưỡng phân loại: điểm trong khoảng [-0.15, 0.15] là trung tính
const THRESHOLD = 0.15;
const labelOf = v => (v > THRESHOLD ? 'Tích cực' : v < -THRESHOLD ? 'Tiêu cực' : 'Trung tính');
const tagOf   = v => (v > THRESHOLD ? 'p' : v < -THRESHOLD ? 'n' : 'z');        // class .tag.*
const clsOf   = l => (l === 'Tích cực' ? 'pos' : l === 'Tiêu cực' ? 'neg' : 'neu'); // class chữ màu

/* ---------- 1.2 Tách từ ----------
   - đưa về chữ thường, chuẩn hoá Unicode (NFC) để dấu không bị tách rời
   - bỏ ký tự biến thể emoji, bộ chỉnh màu da
   - rút gọn chữ kéo dài kiểu mạng xã hội: "đẹpppp" -> "đẹp", "quáaaa" -> "quá"
   - mỗi emoji / dấu câu là một token riêng                                   */
const tokenize = text =>
  text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[\uFE0F\u200D\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/(?<!\p{L})([kh])\1{2,}(?!\p{L})/gu, 'haha')   // "kkk", "hhh" là tiếng cười, không phải phủ định
    .replace(/(\p{L})\1{2,}/gu, '$1')
    .match(/[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu) || [];

/* ---------- 1.3 Từ điển cảm xúc ----------
   Loại từ (t):
     s = từ mang cảm xúc (điểm âm/dương)     n = từ phủ định
     i = từ nhấn mạnh / giảm nhẹ (hệ số)     c = từ chuyển ý ("nhưng"...)   */

const MAX_NGRAM = 5;                       // cụm từ dài nhất trong từ điển (số token)
const LEX    = Object.create(null);        // từ điển có dấu
const LEX_ND = Object.create(null);        // từ điển không dấu (dùng cho bình luận gõ không dấu)

// Từ không dấu dễ nhầm với từ phổ biến khác nên không đưa vào từ điển không dấu:
// "do" (do/dở/dơ), "gia" (giá/giả), "dat" (đắt/đặt), "me" (mẹ/mê)
const ND_SKIP = new Set([
  'do', 'gia', 'dat', 'me', 'che', 'que', 'lo', 'nhat', 'xam', 'hong', 'dung',
  'toi', 'ban', 'thoi', 'kem', 'sach', 'tien', 'hay', 'tuc', 'buon', 'ngu', 'mau',
]);

function setWord(word, entry, override = false) {
  const key = tokenize(word).join(' ');
  if (!key) return null;
  LEX[key] = entry;
  const plain = strip(key);
  const allowed = !ND_SKIP.has(plain) || key === plain;   // người dùng tự gõ dạng không dấu thì cho phép
  if (allowed && (override || !(plain in LEX_ND))) LEX_ND[plain] = entry;
  return key;
}

// Nạp danh sách dạng "từ=điểm|từ=điểm"
const addWords = (type, list) =>
  list.split('|').forEach(p => {
    const [w, v] = p.split('=');
    setWord(w, { t: type, v: v ? +v : 0 });
  });

// Từ tích cực
addWords('s',
  'tốt=2|tuyệt vời=3|tuyệt=3|đỉnh=3|đỉnh cao=3|xịn=2|đẹp=2|ngon=2|thích=2|yêu=3|hay=2|hài lòng=2|ưng=2|' +
  'xuất sắc=3|nhanh=1.5|mê=2|ok=1|ổn=1|cảm ơn=1|đáng tiền=2|mượt=2|thân thiện=2|nhiệt tình=2|dễ thương=2|' +
  'hạnh phúc=3|vui=2|chất lượng=2|uy tín=2|hoàn hảo=3|tiện=1.5|rẻ=1|sạch=1.5|thơm=1.5|10 điểm=3|ủng hộ=1.5|' +
  'cute=2|good=2|tot=2|chuẩn=2|xinh=2|đáng yêu=2|phê=2|pro=1.5|chill=1.5|mlem=2');

// Emoji
addWords('s',
  '😍=2|❤=2|♥=2|👍=2|🥰=2|😊=1.5|🤩=2|😂=1|🤣=1|💯=2|🔥=1.5|😘=1.5|👏=2|😀=1.5|😁=1.5|🙏=1|' +
  '😡=-2|👎=-2|😤=-2|🤮=-3|😢=-1.5|😭=-1.5|😠=-2|💩=-2|😞=-2|😔=-1.5|😩=-1.5|😫=-1.5|💔=-2|🙄=-1.5|🤬=-3');

// Từ tiêu cực
addWords('s',
  'tệ=-3|dở=-2|rác=-3|chán=-2|kém=-2|lởm=-3|tồi=-3|thất vọng=-3|lừa đảo=-4|lừa=-3|ghét=-3|xấu=-2|' +
  'chậm=-1.5|đắt=-1|phí tiền=-3|hỏng=-3|lỗi=-2|bực=-2|tức=-2|khó chịu=-2|tệ hại=-3|thái độ=-1|dơ=-2|' +
  'bẩn=-2|hối hận=-3|buồn=-2|vô dụng=-3|cùi=-2|nhảm=-2|ngu=-3|đểu=-3|scam=-4|fake=-3|giả=-2|trễ=-1.5|' +
  'mất dạy=-4|thối=-2|nát=-2|phiền=-1.5|cạn lời=-3|vô duyên=-2|dỏm=-3|phèn=-2|bức xúc=-2|toang=-2|flop=-2');

// Từ phủ định (kể cả teencode)
addWords('n', 'không|ko|k|kg|khum|hok|hem|chẳng|chả|chưa|hông|đâu có');

// Từ nhấn mạnh (> 1) và giảm nhẹ (< 1)
addWords('i',
  'rất=1.5|quá=1.5|cực kỳ=1.6|vô cùng=1.6|siêu=1.5|lắm=1.4|thật sự=1.3|quá trời=1.6|hết sức=1.5|' +
  'vl=1.5|vcl=1.6|hơi=0.6|khá=0.8|tạm=0.6|hơi bị=1.3');

// Từ chuyển ý: vế sau quan trọng hơn vế trước
addWords('c', 'nhưng=1|nhưng mà=1|tuy nhiên=1|song=1');

/* ---------- 1.3b Luật ngữ cảnh ----------
   Từ nhiều nghĩa (cháy, nóng, khô...) được chấm theo từ đứng gần nó trong cùng một vế câu.
   Nếu có nhiều ngữ cảnh khớp thì lấy ngữ cảnh gần từ đó nhất.
   Luật ngữ cảnh được ưu tiên hơn điểm trong từ điển thường.                          */
const CTX    = Object.create(null);   // khóa có dấu
const CTX_ND = Object.create(null);   // khóa không dấu (cho bình luận gõ không dấu)
const CTX_WINDOW = 6;                 // xét tối đa 6 từ mỗi bên
const BOUND = new Set(['nhưng', 'nhung', 'tuy', 'song']);   // ranh giới vế câu

function addCtx(word, ctxList, v) {
  const t = tokenize(word);
  if (t.length !== 1) return;
  const rule = { v, ctx: ctxList.map(c => strip(tokenize(c).join(' ')).split(' ')).filter(c => c[0]) };
  (CTX[t[0]] = CTX[t[0]] || []).push(rule);
  const plain = strip(t[0]);
  if (!ND_SKIP.has(plain)) (CTX_ND[plain] = CTX_ND[plain] || []).push(rule);
}

function ctxScore(rules, tk, i) {
  const tp = tk.map(strip);
  let L = i, R = i;
  while (L > 0 && i - L < CTX_WINDOW && !BOUND.has(tk[L - 1]) && !PUNCT.test(tk[L - 1])) L--;
  while (R < tk.length - 1 && R - i < CTX_WINDOW && !BOUND.has(tk[R + 1]) && !PUNCT.test(tk[R + 1])) R++;
  let best = null;
  for (const r of rules) for (const c of r.ctx)
    for (let s = L; s + c.length - 1 <= R; s++) {
      if (s <= i && i <= s + c.length - 1) continue;
      if (!c.every((x, k) => tp[s + k] === x)) continue;
      const d = Math.min(Math.abs(s - i), Math.abs(s + c.length - 1 - i));
      if (!best || d < best.d || (d === best.d && Math.abs(r.v) > Math.abs(best.v)))
        best = { d, v: r.v, c: c.join(' ') };
    }
  return best;
}

// Từ lóng & trend được nạp từ CSDL qua account.js (GET /api/lexicon)

/* ---------- 1.4 Phân tích một bình luận ----------
   Quy trình:
   1. Tách token, dò từ điển theo cụm dài nhất (tối đa 3 từ)
   2. Với mỗi từ cảm xúc: đảo dấu nếu có phủ định trong 2 từ trước
      (dừng lại khi gặp dấu câu), nhân hệ số nếu có từ nhấn mạnh kề bên,
      nhân 1.5 nếu nằm sau "nhưng"
   3. Cộng điểm, tăng nhẹ theo số dấu "!", nén về [-1, 1] bằng tanh          */

const PUNCT = /^[.,!?;:…()"“”]$/;

function analyze(text) {
  const lower = text.toLowerCase().normalize('NFC');
  // Bình luận không dấu: có chữ cái nhưng không có dấu nào
  const noDia = /\p{L}/u.test(lower) && strip(lower) === lower;
  const lex = noDia ? LEX_ND : LEX;
  const tk = tokenize(lower);
  const items = [];

  for (let i = 0; i < tk.length; ) {
    let hit = null;
    for (let n = Math.min(MAX_NGRAM, tk.length - i); n >= 1 && !hit; n--) {
      const e = lex[tk.slice(i, i + n).join(' ')];
      if (e) hit = { e, n };
    }
    // Luật ngữ cảnh (chỉ khi không có cụm từ dài hơn khớp)
    if (!hit || hit.n === 1) {
      const rules = (noDia ? CTX_ND : CTX)[tk[i]];
      const c = rules && ctxScore(rules, tk, i);
      if (c) { items.push({ w: tk[i], t: 's', v: c.v, ctx: c.c }); i++; continue; }
    }
    if (hit) {
      items.push({ w: tk.slice(i, i + hit.n).join(' '), ...hit.e });
      i += hit.n;
    } else {
      items.push({ w: tk[i], t: 'w', v: 0 });
      i++;
    }
  }

  let sum = 0, afterContrast = false;
  items.forEach((it, k) => {
    if (it.t === 'c') afterContrast = true;
    if (it.t === 'w' && /^[.!?;…]$/.test(it.w)) afterContrast = false;   // hết câu thì hết hiệu lực "nhưng"
    if (it.t !== 's') { it.score = 0; return; }

    let v = it.v;

    // Phủ định: nhìn lùi tối đa 2 token, không vượt qua dấu câu
    for (let d = 1; d <= 2; d++) {
      const p = items[k - d];
      if (!p || (p.t === 'w' && PUNCT.test(p.w))) break;
      if (p.t === 'n') { v = -v * 0.8; it.negated = true; break; }
    }

    // Nhấn mạnh: từ ngay trước hoặc ngay sau
    const near = [items[k - 1], items[k + 1]].find(x => x && x.t === 'i');
    if (near) { v *= near.v; it.boost = near.w; }

    if (afterContrast) v *= 1.5;

    it.score = v;
    sum += v;
  });

  const exclaim = Math.min((text.match(/!/g) || []).length, 3);
  sum *= 1 + exclaim * 0.1;

  const score = Math.tanh(sum / 3);            // -1 .. +1
  return {
    items,
    score,
    label: labelOf(score),
    noDia,
    hasSignal: items.some(x => x.t === 's'),
  };
}

/* ---------- 1.5 Phân tích theo khía cạnh ----------
   Tách bình luận thành các vế (theo dấu câu, "nhưng", "tuy nhiên"),
   chấm điểm từng vế rồi gán vào khía cạnh có từ khoá tương ứng.             */

const ASPECT_WORDS = {
  'Sản phẩm': 'san pham|chat luong|chat lieu|thiet ke|dong goi|mau sac|size|ao|quan ao|giay|phim|mon|do an|vi|may|pin|hinh',
  'Giao hàng': 'giao|ship|shipper|van chuyen|nhan hang|dung hen',
  'Giá': 'gia|re|tien|khuyen mai|sale|gia tien',
  'Dịch vụ': 'shop|nhan vien|phuc vu|tu van|bao hanh|thai do|cskh',
};
const ASPECT_RE = Object.fromEntries(
  Object.entries(ASPECT_WORDS).map(([k, w]) => [k, new RegExp('(^|[^a-z])(' + w + ')([^a-z]|$)')])
);
const CLAUSE_SPLIT =
  /[.!?;,\n]+|(?<!\p{L})(?:nhưng mà|nhưng|nhung ma|nhung|tuy nhiên|tuy nhien)(?!\p{L})/giu;

function aspects(text) {
  const acc = {};
  text.split(CLAUSE_SPLIT).map(s => s.trim()).filter(Boolean).forEach(clause => {
    const r = analyze(clause);
    if (!r.hasSignal) return;
    const plain = strip(clause.toLowerCase());
    let keys = Object.keys(ASPECT_RE).filter(k => ASPECT_RE[k].test(plain));
    if (!keys.length) keys = ['Chung'];
    keys.forEach(k => (acc[k] = acc[k] || []).push(r.score));
  });
  const out = {};
  for (const k in acc) out[k] = mean(acc[k]);
  return out;
}

/* ==== HẾT PHẦN LÕI · PHẦN GIAO DIỆN BÊN DƯỚI ==== */

/* =========================================================
   PHẦN 2 · GIAO DIỆN
   ========================================================= */

const $ = id => document.getElementById(id);

const SAMPLES = [
  'Sản phẩm dùng rất tốt, giao hàng nhanh, shop nhiệt tình. Sẽ ủng hộ tiếp! 😍',
  'Hàng lởm, không giống hình. Thất vọng quá, phí tiền vl 😡',
  'Áo đẹp nhưng giao hàng hơi chậm.',
  'Quán này không ngon như quảng cáo, nhân viên thái độ.',
  'Phim hay vô cùng, diễn viên đỉnh cao 👍',
  'Shop giao đúng hẹn.',
  'khong the tin noi, qua te, lua dao ro rang',
  'Không tệ, giá ổn, dùng tạm được.',
];
const MAX_BATCH = 2000;
const BAR_COLOR = { 'Tích cực': 'var(--pos)', 'Trung tính': 'var(--neu)', 'Tiêu cực': 'var(--neg)' };

const scrollToTop = () =>
  window.scrollTo({
    top: 0,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });

/* ---------- 2.1 Kết quả một bình luận ---------- */

function tokenHtml(it) {
  const cls = it.t === 's' ? (it.score >= 0 ? 'p' : 'n')
            : (it.t === 'n' || it.t === 'i' || it.t === 'c') ? 'm' : '';
  if (!cls) return esc(it.w);
  const tip = it.t === 's'
    ? `<small>${fmtScore(it.score)}${it.negated ? ' · phủ định' : ''}${it.boost ? ' · nhấn mạnh' : ''}${it.ctx ? ' · ngữ cảnh “' + esc(it.ctx) + '”' : ''}</small>`
    : '';
  return `<span class="t ${cls}">${esc(it.w)}${tip}</span>`;
}
const fmtScore = v => (v > 0 ? '+' : '') + v.toFixed(1);

function render(text) {
  const out = $('out');
  if (!text.trim()) {
    out.innerHTML = '<p class="note">Nhập một bình luận rồi bấm “Phân tích”.</p>';
    return;
  }

  const r = analyze(text);

  // Ghép token, không chèn khoảng trắng trước dấu câu
  let html = '';
  r.items.forEach((it, i) => {
    const space = i === 0 || /^[.,!?;:…)”"]$/.test(it.w) ? '' : ' ';
    html += space + tokenHtml(it);
  });

  // Khía cạnh
  const asp = aspects(text);
  const aspKeys = Object.keys(asp);
  const aspHtml = aspKeys.length
    ? '<h2 class="asp-title">Theo từng khía cạnh</h2><div class="asp-tags">' +
      aspKeys.map(k => `<span class="tag ${tagOf(asp[k])}">${esc(k)}: ${labelOf(asp[k])}</span>`).join('') +
      '</div>'
    : '';

  out.innerHTML = `
    <div class="verdict">
      <span class="label ${clsOf(r.label)}">${r.label}</span>
      <span class="note flush">điểm ${(r.score * 100).toFixed(0)} / 100</span>
    </div>
    <div class="gauge"><i style="left:${(r.score + 1) / 2 * 100}%"></i></div>
    <div class="scale"><span>Tiêu cực</span><span>Trung tính</span><span>Tích cực</span></div>
    <div class="toks">${html}</div>
    <p class="note">${r.hasSignal ? '' : 'Chưa tìm thấy từ mang cảm xúc nào nên kết quả là trung tính. '}${r.noDia ? 'Đã nhận diện bình luận không dấu. ' : ''}Xanh lá: từ tích cực · Đỏ: từ tiêu cực · Tím: từ phủ định, nhấn mạnh hoặc chuyển ý.</p>
    ${aspHtml}`;
}

/* ---------- 2.2 Bình luận mẫu ---------- */

function renderSamples() {
  const res = SAMPLES.map(analyze);

  $('list').innerHTML = SAMPLES.map((s, i) =>
    `<div class="cm" data-i="${i}" tabindex="0" role="button"><span>${esc(s)}</span><span class="tag ${tagOf(res[i].score)}">${res[i].label}</span></div>`
  ).join('');

  const cnt = { 'Tích cực': 0, 'Trung tính': 0, 'Tiêu cực': 0 };
  res.forEach(r => cnt[r.label]++);
  $('bars').innerHTML = Object.keys(cnt).map(k =>
    `<div class="bar"><span>${k}</span><div><b style="width:${cnt[k] / SAMPLES.length * 100}%;background:${BAR_COLOR[k]}"></b></div><span>${cnt[k]}</span></div>`
  ).join('');
}

/* ---------- 2.3 Phân tích hàng loạt ---------- */

let BR = [];   // kết quả lô hiện tại

// Chống chèn công thức khi mở CSV bằng Excel / Google Sheets
const csvCell = s => {
  let v = String(s);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return '"' + v.replace(/"/g, '""') + '"';
};

function runBatch() {
  const all = $('bt').value.split('\n').map(s => s.trim()).filter(Boolean);
  const lines = all.slice(0, MAX_BATCH);
  BR = lines.map(s => ({ s, r: analyze(s), a: aspects(s) }));

  const c = { 'Tích cực': 0, 'Trung tính': 0, 'Tiêu cực': 0 };
  BR.forEach(x => c[x.r.label]++);
  const avg = mean(BR.map(x => x.r.score));

  $('bsum').innerHTML =
    `<p><b>${BR.length}</b> bình luận · điểm trung bình <b class="${clsOf(labelOf(avg))}">${(avg * 100).toFixed(0)}</b> · ` +
    `${c['Tích cực']} tích cực, ${c['Trung tính']} trung tính, ${c['Tiêu cực']} tiêu cực</p>` +
    (all.length > MAX_BATCH ? `<p class="note">Chỉ phân tích ${MAX_BATCH} dòng đầu tiên (bạn đã dán ${all.length} dòng).</p>` : '');

  // Điểm trung bình theo khía cạnh
  const ag = {};
  BR.forEach(x => { for (const k in x.a) (ag[k] = ag[k] || []).push(x.a[k]); });
  $('bag').innerHTML = Object.keys(ag).map(k => {
    const m = mean(ag[k]);
    return `<div class="bar w"><span>${esc(k)}</span><div><b style="width:${(m + 1) / 2 * 100}%;background:${BAR_COLOR[labelOf(m)]}"></b></div><span>${m > 0 ? '+' : ''}${(m * 100).toFixed(0)} (${ag[k].length})</span></div>`;
  }).join('');

  $('btb').innerHTML = BR.map((x, i) =>
    `<div class="cm" data-i="${i}" tabindex="0" role="button"><span>${esc(x.s)}</span><span class="tag ${tagOf(x.r.score)}">${x.r.label}</span></div>`
  ).join('');

  $('bcsv').value =
    'binh_luan,cam_xuc,diem\n' +
    BR.map(x => `${csvCell(x.s)},${x.r.label},${(x.r.score * 100).toFixed(0)}`).join('\n');
}

/* ---------- 2.4 Sự kiện ---------- */

// Bấm (hoặc Enter/Space) vào một bình luận trong danh sách để xem chi tiết
function bindPick(container, getText) {
  const pick = e => {
    const c = e.target.closest('.cm');
    if (!c) return;
    $('in').value = getText(+c.dataset.i);
    render($('in').value);
    scrollToTop();
  };
  container.addEventListener('click', pick);
  container.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e); }
  });
}
bindPick($('list'), i => SAMPLES[i]);
bindPick($('btb'), i => BR[i].s);

$('go').onclick  = () => render($('in').value);
$('clr').onclick = () => { $('in').value = ''; render(''); };
$('in').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) render($('in').value);
});

$('bgo').onclick = runBatch;
$('bcp').onclick = async () => {
  const m = $('bcm');
  try {
    await navigator.clipboard.writeText($('bcsv').value);
    m.textContent = 'Đã sao chép.';
  } catch (err) {
    m.textContent = 'Không sao chép được. Mở “Xem CSV” để tự sao chép.';
  }
};

// Dạy hệ thống từ mới (chỉ có hiệu lực trong phiên hiện tại)
function teachWord() {
  const msg = $('lm');
  const raw = $('lw').value.trim();
  const n = tokenize(raw).length;
  if (!n) { msg.textContent = 'Hãy nhập một từ hoặc cụm từ.'; return; }
  if (n > MAX_NGRAM) { msg.textContent = `Cụm từ tối đa ${MAX_NGRAM} từ.`; return; }

  const v = +$('lv').value;
  const key = setWord(raw, { t: 's', v }, true);
  const saved = typeof saveUserWord === 'function' && saveUserWord(key, v);
  msg.textContent = `Đã thêm “${key}” (${v > 0 ? '+' : ''}${v})` +
    (saved ? ' và lưu vào tài khoản.' : '. Đăng nhập để lưu lại cho lần sau.');
  $('lw').value = '';

  render($('in').value);
  renderSamples();
  runBatch();
  if (typeof renderMine === 'function') renderMine();
}
$('lx').onclick = teachWord;
$('lw').addEventListener('keydown', e => { if (e.key === 'Enter') teachWord(); });

/* ---------- 2.5 Khởi động ---------- */
$('bt').value = SAMPLES.join('\n');
renderSamples();
runBatch();
render($('in').value);
