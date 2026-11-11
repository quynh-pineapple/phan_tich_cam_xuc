/* engine.js · Nạp bộ chấm điểm (phần lõi của public/script.js + slang.js) để dùng ngoài trình duyệt.
   Dùng cho eval.js và test.js. Từ điển nạp giống hệt server nạp cho trình duyệt. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = function loadEngine(opts = {}) {
  const src = fs.readFileSync(path.join(__dirname, 'public', 'script.js'), 'utf8');
  const core = src.slice(0, src.indexOf('/* ==== HẾT PHẦN LÕI'));
  // withUserWords(words, fn): tạm thời nạp từ riêng của một người dùng, chạy fn, rồi trả từ điển về như cũ.
  // Cần để server chấm điểm đúng như người dùng thấy trên trình duyệt (trình duyệt nạp cả từ riêng).
  const extra = `
function withUserWords(words, fn) {
  const saved = words.map(w => { const key = tokenize(w.word).join(' '); const plain = strip(key);
    return { key, plain, lex: LEX[key], nd: LEX_ND[plain] }; });
  words.forEach(w => setWord(w.word, { t: 's', v: w.score }, true));
  try { return fn(); }
  finally {
    saved.reverse().forEach(s => {
      if (s.lex === undefined) delete LEX[s.key]; else LEX[s.key] = s.lex;
      if (s.nd === undefined) delete LEX_ND[s.plain]; else LEX_ND[s.plain] = s.nd;
    });
  }
}`;
  const engine = vm.runInNewContext(core + extra + ';({analyze,aspects,setWord,delWord,addCtx,tokenize,strip,UNKNOWN,nbTrain,setModel,withUserWords,setCorrections,addCorrection})');
  if (opts.rows) {
    // Từ điển lấy từ CSDL (server): { lexicon: [{word,score,type}], ctx: [{word,contexts,score}] }
    opts.rows.lexicon.forEach(r => engine.setWord(r.word, { t: r.type, v: r.score }));
    opts.rows.ctx.forEach(r => engine.addCtx(r.word, r.contexts.split(','), r.score));
  } else {
    const S = vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'slang.js'), 'utf8') +
      ';({SLANG_POS,SLANG_NEG,SLANG_INT,SLANG_NOT,SLANG_CTX})');
    for (const [list, type] of [[S.SLANG_POS, 's'], [S.SLANG_NEG, 's'], [S.SLANG_INT, 'i'], [S.SLANG_NOT, 'n']])
      list.split('|').forEach(p => { const [w, v] = p.split('='); engine.setWord(w.trim(), { t: type, v: v ? +v : 0 }); });
    S.SLANG_CTX.split('|').forEach(p => {
      const [left, sc] = p.split('=');
      const [w, c] = left.split('>');
      engine.addCtx(w.trim(), c.split(',').map(x => x.trim()), +sc);
    });
  }
  // Mô hình dự phòng: mặc định nạp public/model.json nếu có. opts.model = false để tắt, hoặc truyền sẵn đối tượng mô hình.
  if (opts.model && typeof opts.model === 'object') engine.setModel(opts.model);
  else if (opts.model !== false) {
    const f = path.join(__dirname, 'public', 'model.json');
    if (fs.existsSync(f)) engine.setModel(JSON.parse(fs.readFileSync(f, 'utf8')));
  }
  return engine;
};
