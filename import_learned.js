/* =========================================================
   import_learned.js · Nạp learned_lexicon.csv (từ train_lexicon.py) vào từ điển
   Chạy: node import_learned.js [file.csv] [--replace]
     --replace  xóa các từ học máy nạp lần trước rồi nạp lại (dùng khi huấn luyện lại)
   Từ đã có trong từ điển (nhập tay hoặc từ slang.js) được giữ nguyên, không bị ghi đè.
   ========================================================= */
'use strict';
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const file = process.argv.slice(2).find(a => !a.startsWith('--')) || 'learned_lexicon.csv';
const replace = process.argv.includes('--replace');

const db = new Database(path.join(__dirname, 'app.db'));
if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='lexicon'").get()) {
  console.error('Chưa có bảng lexicon. Hãy chạy npm start một lần để tạo cơ sở dữ liệu rồi chạy lại.');
  process.exit(1);
}

const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(1).filter(Boolean);
const ins = db.prepare("INSERT OR IGNORE INTO lexicon(word,score,type,source) VALUES(?,?,'s','learned')");

let added = 0, kept = 0, bad = 0, removed = 0;
db.transaction(() => {
  if (replace) removed = db.prepare("DELETE FROM lexicon WHERE source = 'learned'").run().changes;
  for (const ln of lines) {
    const [w, s] = ln.split(',');
    const word = (w || '').trim().toLowerCase();
    const score = Number(s);
    if (!word || word.length > 40 || !(score >= -4 && score <= 4)) { bad++; continue; }
    ins.run(word, score).changes ? added++ : kept++;
  }
})();

console.log(`Đã thêm ${added} từ. ${kept} từ đã có sẵn nên giữ nguyên. ${bad} dòng không hợp lệ.` +
  (replace ? ` Đã xóa ${removed} từ học máy cũ.` : ''));
console.log('Tải lại trang web (Ctrl+F5) để dùng từ điển mới.');
