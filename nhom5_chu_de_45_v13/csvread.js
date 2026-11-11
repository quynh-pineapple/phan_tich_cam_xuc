/* csvread.js · Đọc CSV có cột binh_luan, nhan (hỗ trợ ngoặc kép, dấu phẩy và xuống dòng trong ô) */
'use strict';
const fs = require('fs');
function parseCsv(txt) {
  const rows = []; let row = [], cell = '', q = false;
  txt = txt.replace(/^\uFEFF/, '');
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) {
      if (c === '"' && txt[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && txt[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const LABELS = ['Tích cực', 'Trung tính', 'Tiêu cực'];
function readCsv(file) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const head = rows.shift().map(h => h.trim().toLowerCase());
  const iT = head.indexOf('binh_luan'), iL = head.indexOf('nhan');
  if (iT < 0 || iL < 0) throw new Error(`${file}: cần có cột binh_luan và nhan`);
  return rows.map(r => ({ text: (r[iT] || '').trim(), gold: (r[iL] || '').trim() })).filter(d => d.text && LABELS.includes(d.gold));
}
module.exports = { parseCsv, readCsv, LABELS };
