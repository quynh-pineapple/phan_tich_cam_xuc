/* =========================================================
   server.js · Express + SQLite
   Chạy: npm install && npm start  ->  http://localhost:3000
   ========================================================= */
'use strict';
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const db = new Database(path.join(__dirname, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ---------- 1. Bảng dữ liệu ---------- */
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS lexicon(
  id INTEGER PRIMARY KEY, word TEXT UNIQUE NOT NULL, score REAL NOT NULL DEFAULT 0,
  type TEXT NOT NULL, source TEXT DEFAULT 'slang');
CREATE TABLE IF NOT EXISTS user_words(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL, score REAL NOT NULL, UNIQUE(user_id, word));
CREATE TABLE IF NOT EXISTS analyses(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL, label TEXT NOT NULL, score REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS feedback(
  id INTEGER PRIMARY KEY, analysis_id INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  correct_label TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS context_rules(
  id INTEGER PRIMARY KEY, word TEXT NOT NULL, contexts TEXT NOT NULL, score REAL NOT NULL,
  UNIQUE(word, contexts));
`);

/* ---------- 2. Nạp từ điển lóng từ slang.js lần đầu ---------- */
if (db.prepare('SELECT COUNT(*) c FROM lexicon').get().c === 0) {
  const code = fs.readFileSync(path.join(__dirname, 'slang.js'), 'utf8');
  const S = vm.runInNewContext(code + ';({SLANG_POS,SLANG_NEG,SLANG_INT,SLANG_NOT})');
  const ins = db.prepare('INSERT OR IGNORE INTO lexicon(word,score,type) VALUES(?,?,?)');
  db.transaction(() => {
    for (const [list, type] of [[S.SLANG_POS, 's'], [S.SLANG_NEG, 's'], [S.SLANG_INT, 'i'], [S.SLANG_NOT, 'n']])
      list.split('|').forEach(p => { const [w, v] = p.split('='); ins.run(w.trim(), v ? +v : 0, type); });
  })();
  console.log('Đã nạp từ điển lóng vào CSDL.');
}

/* Luật ngữ cảnh: nạp từ slang.js lần đầu khi bảng còn trống */
if (db.prepare('SELECT COUNT(*) c FROM context_rules').get().c === 0) {
  const S = vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'slang.js'), 'utf8') + ';({SLANG_CTX})');
  const ins = db.prepare('INSERT OR IGNORE INTO context_rules(word,contexts,score) VALUES(?,?,?)');
  db.transaction(() => S.SLANG_CTX.split('|').forEach(p => {
    const [left, sc] = p.split('=');
    const [w, c] = left.split('>');
    ins.run(w.trim(), c.split(',').map(x => x.trim()).join(','), +sc);
  }))();
  console.log('Đã nạp luật ngữ cảnh vào CSDL.');
}

/* ---------- 3. Tiện ích: cookie, phiên, giới hạn thử mật khẩu ---------- */
const app = express();
app.set('trust proxy', 1);   // đúng IP thật khi chạy sau proxy (Nginx, Render, Railway...)
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const cookieOf = (req, name) =>
  (req.headers.cookie || '').split(';').map(s => s.trim().split('=')).find(p => p[0] === name)?.[1];

function currentUser(req) {
  const t = cookieOf(req, 'sid');
  if (!t) return null;
  return db.prepare(`SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
                     WHERE s.token = ? AND s.expires > ?`).get(t, Date.now()) || null;
}
const needLogin = (req, res, next) => {
  req.user = currentUser(req);
  req.user ? next() : res.status(401).json({ error: 'Bạn chưa đăng nhập.' });
};
function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const maxAge = 7 * 24 * 3600;
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token, userId, Date.now() + maxAge * 1000);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`);
}

// Dọn phiên hết hạn và bộ đếm thử sai mỗi 10 phút
setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  for (const [ip, f] of fails) if (f.until < Date.now()) fails.delete(ip);
  for (const [ip, f] of regs) if (f.until < Date.now()) regs.delete(ip);
}, 10 * 60000).unref();

const fails = new Map();   // ip -> {n, until}
const regs = new Map();    // ip -> {n, until}: giới hạn số tài khoản tạo từ một IP (5 tài khoản / giờ)
const blocked = ip => { const f = fails.get(ip); return f && f.n >= 8 && f.until > Date.now(); };
const addFail = ip => {
  const f = fails.get(ip);
  fails.set(ip, f && f.until > Date.now() ? { n: f.n + 1, until: f.until } : { n: 1, until: Date.now() + 15 * 60000 });
};

/* ---------- 4. Tài khoản ---------- */
app.post('/api/register', (req, res) => {
  const name = String(req.body.username || '').trim().toLowerCase();
  const pw = String(req.body.password || '');
  if (!/^[a-z0-9_.]{3,20}$/.test(name)) return res.status(400).json({ error: 'Tên đăng nhập 3-20 ký tự: chữ không dấu, số, _ hoặc .' });
  if (pw.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự.' });
  const r = regs.get(req.ip);
  if (r && r.until > Date.now() && r.n >= 5)
    return res.status(429).json({ error: 'Tạo quá nhiều tài khoản, hãy thử lại sau.' });
  let id;
  try {
    id = db.prepare('INSERT INTO users(username,password_hash) VALUES(?,?)')
      .run(name, bcrypt.hashSync(pw, 10)).lastInsertRowid;
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT'))
      return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại.' });
    throw e;
  }
  regs.set(req.ip, r && r.until > Date.now() ? { n: r.n + 1, until: r.until } : { n: 1, until: Date.now() + 3600000 });
  startSession(res, id);
  res.json({ username: name });
});

app.post('/api/login', (req, res) => {
  if (blocked(req.ip)) return res.status(429).json({ error: 'Thử sai quá nhiều lần, hãy đợi 15 phút.' });
  const name = String(req.body.username || '').trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(name);
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.password_hash)) {
    addFail(req.ip);
    return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu.' });
  }
  startSession(res, u.id);
  res.json({ username: u.username });
});

app.post('/api/logout', (req, res) => {
  const t = cookieOf(req, 'sid');
  if (t) db.prepare('DELETE FROM sessions WHERE token = ?').run(t);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

// Quản trị được sửa từ điển chung. Đặt biến môi trường ADMIN_USER=tên_đăng_nhập để chỉ định.
// Nếu không đặt, tài khoản đăng ký đầu tiên là quản trị (chỉ nên dùng khi chạy thử trên máy).
const ADMIN_USER = String(process.env.ADMIN_USER || '').trim().toLowerCase();
if (!ADMIN_USER) console.warn('Chưa đặt ADMIN_USER: tài khoản đăng ký đầu tiên sẽ là quản trị.');
const adminId = () => ADMIN_USER
  ? (db.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USER) || {}).id
  : db.prepare('SELECT MIN(id) m FROM users').get().m;
const needAdmin = (req, res, next) => {
  req.user = currentUser(req);
  if (!req.user) return res.status(401).json({ error: 'Bạn chưa đăng nhập.' });
  if (req.user.id !== adminId()) return res.status(403).json({ error: 'Chỉ tài khoản quản trị mới sửa được từ điển chung.' });
  next();
};

app.get('/api/me', (req, res) => {
  const u = currentUser(req);
  res.json({ username: u ? u.username : null, admin: !!u && u.id === adminId() });
});

/* ---------- 5. Từ điển ---------- */
app.get('/api/lexicon', (req, res) => {
  const u = currentUser(req);
  res.json({
    lexicon: db.prepare('SELECT id, word, score, type FROM lexicon ORDER BY id').all(),
    ctx: db.prepare('SELECT id, word, contexts, score FROM context_rules ORDER BY id').all(),
    mine: u ? db.prepare('SELECT id, word, score FROM user_words WHERE user_id = ? ORDER BY id').all(u.id) : [],
  });
});

app.post('/api/words', needLogin, (req, res) => {
  const word = String(req.body.word || '').trim().toLowerCase();
  const score = Number(req.body.score);
  if (!word || word.length > 40 || !(score >= -4 && score <= 4))
    return res.status(400).json({ error: 'Từ hoặc điểm không hợp lệ.' });
  const mine = db.prepare('SELECT COUNT(*) c FROM user_words WHERE user_id = ?').get(req.user.id).c;
  const exists = db.prepare('SELECT 1 FROM user_words WHERE user_id = ? AND word = ?').get(req.user.id, word);
  if (!exists && mine >= 500) return res.status(400).json({ error: 'Từ điển riêng tối đa 500 từ.' });
  db.prepare(`INSERT INTO user_words(user_id,word,score) VALUES(?,?,?)
              ON CONFLICT(user_id,word) DO UPDATE SET score = excluded.score`).run(req.user.id, word, score);
  const row = db.prepare('SELECT id FROM user_words WHERE user_id = ? AND word = ?').get(req.user.id, word);
  res.json({ id: row.id });
});

app.delete('/api/words/:id', needLogin, (req, res) => {
  db.prepare('DELETE FROM user_words WHERE id = ? AND user_id = ?').run(+req.params.id, req.user.id);
  res.json({ ok: true });
});

// Quản trị: thêm / sửa / xóa từ trong từ điển chung
app.post('/api/lexicon', needAdmin, (req, res) => {
  const word = String(req.body.word || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const score = Number(req.body.score);
  if (!/[\p{L}\p{N}]/u.test(word) || word.length > 40 || word.split(' ').length > 5 || !(score >= -4 && score <= 4))
    return res.status(400).json({ error: 'Từ (tối đa 5 tiếng) hoặc điểm (-4 đến 4) không hợp lệ.' });
  db.prepare(`INSERT INTO lexicon(word,score,type,source) VALUES(?,?,'s','admin')
              ON CONFLICT(word) DO UPDATE SET score = excluded.score`).run(word, score);
  res.json({ id: db.prepare('SELECT id FROM lexicon WHERE word = ?').get(word).id, word });
});

app.delete('/api/lexicon/:id', needAdmin, (req, res) => {
  db.prepare('DELETE FROM lexicon WHERE id = ?').run(+req.params.id);
  res.json({ ok: true });
});

// Quản trị: luật ngữ cảnh
app.post('/api/context', needAdmin, (req, res) => {
  const word = String(req.body.word || '').trim().toLowerCase();
  const ctx = String(req.body.contexts || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const score = Number(req.body.score);
  if (!word || /\s/.test(word) || word.length > 20 || !ctx.length || ctx.length > 20 ||
      ctx.some(x => x.length > 30) || !(score >= -4 && score <= 4))
    return res.status(400).json({ error: 'Cần 1 từ (không có dấu cách), 1-20 ngữ cảnh ngăn cách bằng dấu phẩy, điểm -4 đến 4.' });
  db.prepare(`INSERT INTO context_rules(word,contexts,score) VALUES(?,?,?)
              ON CONFLICT(word,contexts) DO UPDATE SET score = excluded.score`).run(word, ctx.join(','), score);
  res.json({ ok: true });
});

app.delete('/api/context/:id', needAdmin, (req, res) => {
  db.prepare('DELETE FROM context_rules WHERE id = ?').run(+req.params.id);
  res.json({ ok: true });
});

/* ---------- 6. Lịch sử và phản hồi ---------- */
const LABELS = ['Tích cực', 'Trung tính', 'Tiêu cực'];

app.post('/api/analyses', needLogin, (req, res) => {
  const text = String(req.body.text || '').slice(0, 2000);
  const score = Number(req.body.score);
  if (!text || !LABELS.includes(req.body.label) || !(score >= -1 && score <= 1))
    return res.status(400).json({ error: 'Dữ liệu không hợp lệ.' });
  const id = db.prepare('INSERT INTO analyses(user_id,text,label,score) VALUES(?,?,?,?)')
    .run(req.user.id, text, req.body.label, score).lastInsertRowid;
  // Chỉ giữ 500 lượt phân tích gần nhất của mỗi người dùng
  db.prepare(`DELETE FROM analyses WHERE user_id = ? AND id NOT IN
              (SELECT id FROM analyses WHERE user_id = ? ORDER BY id DESC LIMIT 500)`).run(req.user.id, req.user.id);
  res.json({ id });
});

app.post('/api/feedback', needLogin, (req, res) => {
  const a = db.prepare('SELECT id FROM analyses WHERE id = ? AND user_id = ?').get(+req.body.analysis_id, req.user.id);
  if (!a || !LABELS.includes(req.body.correct_label)) return res.status(400).json({ error: 'Dữ liệu không hợp lệ.' });
  db.prepare('INSERT INTO feedback(analysis_id,user_id,correct_label) VALUES(?,?,?)')
    .run(a.id, req.user.id, req.body.correct_label);
  res.json({ ok: true });
});

// Bắt mọi lỗi còn sót, không để lộ chi tiết ra ngoài
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ.' });
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Chạy tại http://localhost:${PORT}`));
