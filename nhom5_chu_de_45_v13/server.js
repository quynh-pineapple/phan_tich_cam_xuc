/* =========================================================
   server.js · Express + SQLite
   Chạy: npm install && npm start  ->  http://localhost:3000
   ========================================================= */
'use strict';
const express = require('./mini-express');
const Database = require('./sqlite');
const bcrypt = require('./bcrypt-lite');
const crypto = require('crypto');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const loadEngine = require('./engine');

const PROD = process.env.NODE_ENV === 'production';
// Tài khoản quản trị riêng: được tạo sẵn khi server khởi động, KHÔNG phải người đăng ký đầu tiên.
// Đổi tên/mật khẩu bằng biến môi trường ADMIN_USER, ADMIN_PASSWORD (mặc định tên là "admin").
const ADMIN_USER = String(process.env.ADMIN_USER || 'admin').trim().toLowerCase();
const DEFAULT_ADMIN_PASSWORD = '123456';   // mật khẩu mặc định khi không đặt ADMIN_PASSWORD (chỉ nên dùng khi chạy thử trên máy)
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD);
// Chạy production mà vẫn dùng mật khẩu mặc định thì ai cũng đăng nhập được quản trị: dừng hẳn thay vì chỉ cảnh báo.
if (PROD && !process.env.ADMIN_PASSWORD) {
  console.error('Lỗi cấu hình: NODE_ENV=production nhưng chưa đặt ADMIN_PASSWORD (đang dùng mật khẩu mặc định).\n' +
    'Ví dụ (Windows PowerShell): $env:ADMIN_PASSWORD=\'mat_khau_manh\'; $env:NODE_ENV=\'production\'; npm start');
  process.exit(1);
}
if (!/^[a-z0-9_.]{3,20}$/.test(ADMIN_USER)) {
  console.error('Lỗi cấu hình: ADMIN_USER phải 3-20 ký tự: chữ không dấu, số, _ hoặc .');
  process.exit(1);
}
if (ADMIN_PASSWORD && ADMIN_PASSWORD.length < 6) {
  console.error('Lỗi cấu hình: ADMIN_PASSWORD tối thiểu 6 ký tự.');
  process.exit(1);
}

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
CREATE TABLE IF NOT EXISTS suggestions(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL, score REAL NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, word));
CREATE TABLE IF NOT EXISTS lexicon_log(
  id INTEGER PRIMARY KEY, at TEXT DEFAULT CURRENT_TIMESTAMP, admin_id INTEGER,
  kind TEXT NOT NULL,            -- 'word' (từ điển chung) hoặc 'ctx' (luật ngữ cảnh)
  action TEXT NOT NULL,          -- add | update | delete | undo
  via TEXT NOT NULL DEFAULT 'admin',   -- admin | suggestion | undo
  word TEXT NOT NULL, contexts TEXT,
  old_score REAL, new_score REAL, old_type TEXT, old_source TEXT,
  undone INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS context_rules(
  id INTEGER PRIMARY KEY, word TEXT NOT NULL, contexts TEXT NOT NULL, score REAL NOT NULL,
  UNIQUE(word, contexts));
`);

// Bản CSDL cũ chưa có cột trạng thái duyệt phản hồi: thêm vào, không mất dữ liệu cũ
if (!db.prepare("SELECT 1 FROM pragma_table_info('feedback') WHERE name = 'status'").get())
  db.exec("ALTER TABLE feedback ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");

/* ---------- 2. Nạp từ điển lóng + luật ngữ cảnh từ slang.js ----------
   Nạp khi CSDL còn trống, hoặc khi LEXICON_VERSION đổi (ví dụ vừa chuyển chủ đề sang bình luận
   mạng xã hội). Khi đổi phiên bản: xóa từ lóng nạp sẵn cũ (source = 'slang') và luật ngữ cảnh cũ
   rồi nạp lại. Từ do quản trị thêm (source = 'admin'), từ học máy (source = 'learned') và từ
   điển riêng của người dùng được giữ nguyên.                                              */
const LEXICON_VERSION = '2026-10-mxh-2';
db.exec('CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT)');
const metaGet = db.prepare("SELECT value FROM meta WHERE key = 'lexicon_version'");

if (!metaGet.get() || metaGet.get().value !== LEXICON_VERSION) {
  const S = vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, 'slang.js'), 'utf8') + ';({SLANG_POS,SLANG_NEG,SLANG_INT,SLANG_NOT,SLANG_CTX})');
  const insWord = db.prepare('INSERT OR IGNORE INTO lexicon(word,score,type) VALUES(?,?,?)');
  const insCtx = db.prepare('INSERT OR IGNORE INTO context_rules(word,contexts,score) VALUES(?,?,?)');
  db.transaction(() => {
    db.prepare("DELETE FROM lexicon WHERE source = 'slang'").run();
    db.prepare('DELETE FROM context_rules').run();
    for (const [list, type] of [[S.SLANG_POS, 's'], [S.SLANG_NEG, 's'], [S.SLANG_INT, 'i'], [S.SLANG_NOT, 'n']])
      list.split('|').forEach(p => { const [w, v] = p.split('='); insWord.run(w.trim(), v ? +v : 0, type); });
    S.SLANG_CTX.split('|').forEach(p => {
      const [left, sc] = p.split('=');
      const [w, c] = left.split('>');
      insCtx.run(w.trim(), c.split(',').map(x => x.trim()).join(','), +sc);
    });
    db.prepare("INSERT INTO meta(key,value) VALUES('lexicon_version',?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(LEXICON_VERSION);
  })();
  console.log('Đã nạp từ điển lóng và luật ngữ cảnh (bình luận mạng xã hội) vào CSDL.');
}

/* ---------- 2b. Bộ chấm điểm phía máy chủ ----------
   Máy chủ tự chấm lại mọi bình luận bằng đúng bộ chấm điểm và từ điển chung trong CSDL
   (cộng từ riêng của người dùng), không tin nhãn/điểm do trình duyệt gửi lên.
   Khi từ điển hoặc luật thay đổi thì gọi lexChanged() để lần chấm sau nạp lại.            */
let ENG = null;
const engine = () => ENG || (ENG = loadEngine({ rows: {
  lexicon: db.prepare('SELECT word, score, type FROM lexicon').all(),
  ctx: db.prepare('SELECT word, contexts, score FROM context_rules').all(),
} }));
const lexChanged = () => { ENG = null; };
engine();   // nạp thử ngay khi khởi động để báo lỗi sớm nếu có

// Nhật ký thay đổi từ điển chung: ai sửa, điểm cũ, điểm mới; cho phép hoàn tác
const logLex = e => db.prepare(`INSERT INTO lexicon_log(admin_id,kind,action,via,word,contexts,old_score,new_score,old_type,old_source)
  VALUES(@admin_id,@kind,@action,@via,@word,@contexts,@old_score,@new_score,@old_type,@old_source)`).run({
  contexts: null, old_score: null, new_score: null, old_type: null, old_source: null, via: 'admin', ...e });

// Thêm / sửa một từ trong từ điển chung và ghi nhật ký (dùng cho form quản trị và khi duyệt đề xuất)
function upsertLexWord(word, score, adminId, via) {
  const old = db.prepare('SELECT score, type, source FROM lexicon WHERE word = ?').get(word);
  db.prepare(`INSERT INTO lexicon(word,score,type,source) VALUES(?,?,'s','admin')
              ON CONFLICT(word) DO UPDATE SET score = excluded.score`).run(word, score);
  logLex({ admin_id: adminId, kind: 'word', action: old ? 'update' : 'add', via, word,
           old_score: old ? old.score : null, new_score: score, old_type: old ? old.type : null, old_source: old ? old.source : null });
  lexChanged();
}

/* ---------- 3. Tiện ích: cookie, phiên, giới hạn thử mật khẩu ---------- */
const app = express();
app.set('trust proxy', 1);   // đúng IP thật khi chạy sau proxy (Nginx, Render, Railway...)
app.disable('x-powered-by');

// Production: chuyển http -> https (dựa vào X-Forwarded-Proto do proxy gửi, vì trust proxy đã bật).
// Đặt FORCE_HTTPS=0 nếu chạy production nhưng chưa có HTTPS (ví dụ thử nội bộ).
if (PROD && process.env.FORCE_HTTPS !== '0') {
  app.use((req, res, next) => {
    if (req.secure) return next();
    if (req.method === 'GET' || req.method === 'HEAD') return res.redirect(301, 'https://' + req.headers.host + req.originalUrl);
    res.status(403).json({ error: 'Cần dùng HTTPS.' });
  });
}

// Header bảo mật (tương đương phần cốt lõi của helmet, không cần cài thêm gói).
// CSP: toàn bộ script và CSS đều nằm cùng máy chủ; 'unsafe-inline' chỉ cho style vì giao diện
// dùng thuộc tính style="width:..%" để vẽ thanh biểu đồ. Không cho script inline.
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
    "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (PROD && req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});

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
function startSession(res, userId, remember = true) {
  const token = crypto.randomBytes(32).toString('hex');
  const maxAge = 7 * 24 * 3600;
  // Không ghi nhớ: cookie phiên (tắt trình duyệt là hết), phía máy chủ vẫn hết hạn sau 1 ngày
  const life = remember ? maxAge : 24 * 3600;
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token, userId, Date.now() + life * 1000);
  const secure = PROD ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/${remember ? `; Max-Age=${maxAge}` : ''}${secure}`);
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
  if (name === ADMIN_USER) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại.' });
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
  startSession(res, id, req.body.remember !== false);
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
  startSession(res, u.id, req.body.remember !== false);
  res.json({ username: u.username });
});

app.post('/api/logout', (req, res) => {
  const t = cookieOf(req, 'sid');
  if (t) db.prepare('DELETE FROM sessions WHERE token = ?').run(t);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

// Quản trị được sửa từ điển chung. Tài khoản quản trị được tạo sẵn ở đây (xem ADMIN_USER / ADMIN_PASSWORD).
(function seedAdmin() {
  // Mỗi lần chạy, mật khẩu admin được đồng bộ với ADMIN_PASSWORD (mặc định 123456). Đổi mật khẩu bằng cách đặt biến này.
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  const row = db.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USER);
  if (row) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.id);
  else db.prepare('INSERT INTO users(username,password_hash) VALUES(?,?)').run(ADMIN_USER, hash);
  console.log('Tài khoản quản trị: ' + ADMIN_USER + (process.env.ADMIN_PASSWORD ? ' (mật khẩu lấy từ ADMIN_PASSWORD)' : ' / mật khẩu mặc định ' + DEFAULT_ADMIN_PASSWORD));
})();
const adminId = () => (db.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USER) || {}).id;
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
// Các câu đã được quản trị duyệt phản hồi: trình duyệt dùng để lấy nhãn đúng khi gặp lại đúng câu đó
app.get('/api/corrections', (req, res) => {
  res.json(db.prepare(`SELECT a.text, f.correct_label AS label FROM feedback f JOIN analyses a ON a.id = f.analysis_id
                       WHERE f.status = 'approved' ORDER BY f.id DESC LIMIT 2000`).all());
});

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
  upsertLexWord(word, score, req.user.id, 'admin');
  res.json({ id: db.prepare('SELECT id FROM lexicon WHERE word = ?').get(word).id, word });
});

app.delete('/api/lexicon/:id', needAdmin, (req, res) => {
  const old = db.prepare('SELECT word, score, type, source FROM lexicon WHERE id = ?').get(+req.params.id);
  if (old) {
    db.prepare('DELETE FROM lexicon WHERE id = ?').run(+req.params.id);
    logLex({ admin_id: req.user.id, kind: 'word', action: 'delete', word: old.word,
             old_score: old.score, old_type: old.type, old_source: old.source });
    lexChanged();
  }
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
  const oldRule = db.prepare('SELECT score FROM context_rules WHERE word = ? AND contexts = ?').get(word, ctx.join(','));
  db.prepare(`INSERT INTO context_rules(word,contexts,score) VALUES(?,?,?)
              ON CONFLICT(word,contexts) DO UPDATE SET score = excluded.score`).run(word, ctx.join(','), score);
  logLex({ admin_id: req.user.id, kind: 'ctx', action: oldRule ? 'update' : 'add', word, contexts: ctx.join(','),
           old_score: oldRule ? oldRule.score : null, new_score: score });
  lexChanged();
  const row = db.prepare('SELECT id FROM context_rules WHERE word = ? AND contexts = ?').get(word, ctx.join(','));
  res.json({ ok: true, id: row.id, word, contexts: ctx.join(','), score });
});

app.delete('/api/context/:id', needAdmin, (req, res) => {
  const old = db.prepare('SELECT word, contexts, score FROM context_rules WHERE id = ?').get(+req.params.id);
  if (old) {
    db.prepare('DELETE FROM context_rules WHERE id = ?').run(+req.params.id);
    logLex({ admin_id: req.user.id, kind: 'ctx', action: 'delete', word: old.word, contexts: old.contexts, old_score: old.score });
    lexChanged();
  }
  res.json({ ok: true });
});

/* ---------- 6. Lịch sử và phản hồi ---------- */
const LABELS = ['Tích cực', 'Trung tính', 'Tiêu cực'];            // nhãn người dùng được chọn khi gửi phản hồi
const ANALYSIS_LABELS = [...LABELS, 'Chưa đủ thông tin'];           // nhãn hệ thống có thể trả ra

app.post('/api/analyses', needLogin, (req, res) => {
  const text = String(req.body.text || '').slice(0, 2000);
  if (!text.trim()) return res.status(400).json({ error: 'Dữ liệu không hợp lệ.' });
  // Máy chủ tự chấm lại, bỏ qua nhãn/điểm do trình duyệt gửi (tránh số liệu và dữ liệu duyệt bị làm giả)
  const eng = engine();
  const mine = db.prepare('SELECT word, score FROM user_words WHERE user_id = ?').all(req.user.id);
  const r = eng.withUserWords(mine, () => eng.analyze(text));
  const id = db.prepare('INSERT INTO analyses(user_id,text,label,score) VALUES(?,?,?,?)')
    .run(req.user.id, text, r.label, r.score).lastInsertRowid;
  // Chỉ giữ 500 lượt phân tích gần nhất của mỗi người dùng
  db.prepare(`DELETE FROM analyses WHERE user_id = ? AND id NOT IN
              (SELECT id FROM analyses WHERE user_id = ? ORDER BY id DESC LIMIT 500)
              AND id NOT IN (SELECT analysis_id FROM feedback)`).run(req.user.id, req.user.id);   // giữ lại câu đã có phản hồi
  res.json({ id, label: r.label, score: r.score });
});

app.post('/api/feedback', needLogin, (req, res) => {
  const a = db.prepare('SELECT id FROM analyses WHERE id = ? AND user_id = ?').get(+req.body.analysis_id, req.user.id);
  if (!a || !LABELS.includes(req.body.correct_label)) return res.status(400).json({ error: 'Dữ liệu không hợp lệ.' });
  // Quản trị góp ý thì duyệt luôn (không cần tự duyệt lại ở mục "Duyệt đóng góp")
  const approved = req.user.id === adminId();
  db.prepare('INSERT INTO feedback(analysis_id,user_id,correct_label,status) VALUES(?,?,?,?)')
    .run(a.id, req.user.id, req.body.correct_label, approved ? 'approved' : 'pending');
  res.json({ ok: true, approved });
});

/* ---------- 6b. Lịch sử, duyệt phản hồi, từ đóng góp, đổi mật khẩu ---------- */
app.get('/api/history', needLogin, (req, res) => {
  res.json(db.prepare(`SELECT a.id, a.text, a.label, a.score, a.created_at,
      (SELECT correct_label FROM feedback f WHERE f.analysis_id = a.id ORDER BY f.id DESC LIMIT 1) AS fb
    FROM analyses a WHERE a.user_id = ? ORDER BY a.id DESC LIMIT 200`).all(req.user.id));
});

app.delete('/api/history', needLogin, (req, res) => {
  db.prepare('DELETE FROM analyses WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

// Người dùng đề xuất từ cho từ điển chung; quản trị duyệt
app.post('/api/suggestions', needLogin, (req, res) => {
  const word = String(req.body.word || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const score = Number(req.body.score);
  if (!/[\p{L}\p{N}]/u.test(word) || word.length > 40 || word.split(' ').length > 5 || !(score >= -4 && score <= 4))
    return res.status(400).json({ error: 'Từ hoặc điểm không hợp lệ.' });
  const pending = db.prepare("SELECT COUNT(*) c FROM suggestions WHERE user_id = ? AND status = 'pending'").get(req.user.id).c;
  if (pending >= 50) return res.status(400).json({ error: 'Bạn đang có quá nhiều đề xuất chờ duyệt (tối đa 50).' });
  db.prepare(`INSERT INTO suggestions(user_id,word,score) VALUES(?,?,?)
              ON CONFLICT(user_id,word) DO UPDATE SET score = excluded.score, status = 'pending'`).run(req.user.id, word, score);
  res.json({ ok: true });
});

app.get('/api/admin/review', needAdmin, (req, res) => {
  res.json({
    feedback: db.prepare(`SELECT f.id, f.correct_label, f.status, f.created_at, a.text, a.label, u.username
      FROM feedback f JOIN analyses a ON a.id = f.analysis_id JOIN users u ON u.id = f.user_id
      ORDER BY (f.status = 'pending') DESC, f.id DESC LIMIT 200`).all(),
    suggestions: db.prepare(`SELECT s.id, s.word, s.score, s.status, s.created_at, u.username
      FROM suggestions s JOIN users u ON u.id = s.user_id
      ORDER BY (s.status = 'pending') DESC, s.id DESC LIMIT 200`).all(),
  });
});

const REVIEW = ['approved', 'rejected'];
app.post('/api/admin/feedback/:id', needAdmin, (req, res) => {
  if (!REVIEW.includes(req.body.status)) return res.status(400).json({ error: 'Trạng thái không hợp lệ.' });
  const r = db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(req.body.status, +req.params.id);
  r.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'Không tìm thấy phản hồi.' });
});

app.post('/api/admin/suggestions/:id', needAdmin, (req, res) => {
  if (!REVIEW.includes(req.body.status)) return res.status(400).json({ error: 'Trạng thái không hợp lệ.' });
  const s = db.prepare('SELECT * FROM suggestions WHERE id = ?').get(+req.params.id);
  if (!s) return res.status(404).json({ error: 'Không tìm thấy đề xuất.' });
  let lex = null;
  db.transaction(() => {
    db.prepare('UPDATE suggestions SET status = ? WHERE id = ?').run(req.body.status, s.id);
    if (req.body.status === 'approved') {
      upsertLexWord(s.word, s.score, req.user.id, 'suggestion');
      lex = db.prepare('SELECT id, word, score, type FROM lexicon WHERE word = ?').get(s.word);
    }
  })();
  res.json({ ok: true, lexicon: lex });
});

// Nhật ký thay đổi từ điển chung + hoàn tác
app.get('/api/admin/log', needAdmin, (req, res) => {
  res.json(db.prepare(`SELECT l.id, l.at, l.kind, l.action, l.via, l.word, l.contexts, l.old_score, l.new_score, l.undone,
      COALESCE(u.username, '?') AS username
    FROM lexicon_log l LEFT JOIN users u ON u.id = l.admin_id ORDER BY l.id DESC LIMIT 100`).all());
});

app.post('/api/admin/log/:id/undo', needAdmin, (req, res) => {
  const e = db.prepare('SELECT * FROM lexicon_log WHERE id = ?').get(+req.params.id);
  if (!e) return res.status(404).json({ error: 'Không tìm thấy mục nhật ký.' });
  if (e.undone || e.action === 'undo') return res.status(400).json({ error: 'Mục này đã hoàn tác hoặc không thể hoàn tác.' });
  db.transaction(() => {
    let before = null, after = null;   // điểm trước và sau khi hoàn tác, để ghi nhật ký
    if (e.kind === 'word') {
      const cur = db.prepare('SELECT score FROM lexicon WHERE word = ?').get(e.word);
      before = cur ? cur.score : null;
      if (e.action === 'add') db.prepare('DELETE FROM lexicon WHERE word = ?').run(e.word);
      else {
        db.prepare(`INSERT INTO lexicon(word,score,type,source) VALUES(?,?,?,?)
                    ON CONFLICT(word) DO UPDATE SET score = excluded.score`).run(e.word, e.old_score, e.old_type || 's', e.old_source || 'admin');
        after = e.old_score;
      }
    } else {
      const cur = db.prepare('SELECT score FROM context_rules WHERE word = ? AND contexts = ?').get(e.word, e.contexts);
      before = cur ? cur.score : null;
      if (e.action === 'add') db.prepare('DELETE FROM context_rules WHERE word = ? AND contexts = ?').run(e.word, e.contexts);
      else {
        db.prepare(`INSERT INTO context_rules(word,contexts,score) VALUES(?,?,?)
                    ON CONFLICT(word,contexts) DO UPDATE SET score = excluded.score`).run(e.word, e.contexts, e.old_score);
        after = e.old_score;
      }
    }
    db.prepare('UPDATE lexicon_log SET undone = 1 WHERE id = ?').run(e.id);
    logLex({ admin_id: req.user.id, kind: e.kind, action: 'undo', via: 'undo', word: e.word, contexts: e.contexts,
             old_score: before, new_score: after });
  })();
  lexChanged();
  res.json({ ok: true });
});

// Xuất các phản hồi đã duyệt thành CSV (binh_luan,nhan) để dùng lại với train_lexicon.py hoặc eval.js
app.get('/api/admin/feedback.csv', needAdmin, (req, res) => {
  const cell = v => { v = String(v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
  const rows = db.prepare(`SELECT a.text, f.correct_label FROM feedback f JOIN analyses a ON a.id = f.analysis_id
                           WHERE f.status = 'approved' ORDER BY f.id`).all();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="phan_hoi_da_duyet.csv"');
  res.send('\uFEFF"binh_luan","nhan"\r\n' + rows.map(r => cell(r.text) + ',' + cell(r.correct_label)).join('\r\n') + '\r\n');
});

// Đổi mật khẩu: phải nhập đúng mật khẩu cũ; đăng xuất mọi thiết bị khác
app.post('/api/password', needLogin, (req, res) => {
  if (blocked(req.ip)) return res.status(429).json({ error: 'Thử sai quá nhiều lần, hãy đợi 15 phút.' });
  const oldPw = String(req.body.old_password || ''), newPw = String(req.body.new_password || '');
  if (newPw.length < 6) return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 6 ký tự.' });
  if (newPw.length > 72) return res.status(400).json({ error: 'Mật khẩu mới tối đa 72 ký tự.' });
  const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(oldPw, u.password_hash)) {
    addFail(req.ip);
    return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng.' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPw, 10), req.user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, cookieOf(req, 'sid'));
  res.json({ ok: true });
});

/* ---------- 7. Thống kê tổng quan ---------- */
app.get('/api/stats', (req, res) => {
  const one = (sql, ...a) => db.prepare(sql).get(...a).c;
  const out = {
    words: one("SELECT COUNT(*) c FROM lexicon WHERE type = 's'"),
    rules: one('SELECT COUNT(*) c FROM context_rules'),
    me: null,
  };
  const u = currentUser(req);
  if (u) {
    const by = { 'Tích cực': 0, 'Trung tính': 0, 'Tiêu cực': 0, 'Chưa đủ thông tin': 0 };
    db.prepare('SELECT label, COUNT(*) c FROM analyses WHERE user_id = ? GROUP BY label').all(u.id)
      .forEach(r => { by[r.label] = r.c; });
    out.me = {
      total: by['Tích cực'] + by['Trung tính'] + by['Tiêu cực'] + by['Chưa đủ thông tin'],
      pos: by['Tích cực'], neu: by['Trung tính'], neg: by['Tiêu cực'], unk: by['Chưa đủ thông tin'],
      mine: one('SELECT COUNT(*) c FROM user_words WHERE user_id = ?', u.id),
      fb: one('SELECT COUNT(*) c FROM feedback WHERE user_id = ?', u.id),
    };
  }
  res.json(out);
});

// Bắt mọi lỗi còn sót, không để lộ chi tiết ra ngoài
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Dữ liệu gửi lên quá lớn.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ.' });
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Chạy tại http://localhost:${PORT}`));
