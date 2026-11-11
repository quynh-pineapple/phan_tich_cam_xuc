/* =========================================================
   mini-express.js · Máy chủ web tối giản chỉ dùng module có sẵn của Node (http, fs, path).
   Cung cấp đúng phần API express mà server.js dùng: app.use/get/post/delete, express.json,
   express.static, req.body/params/ip/secure/path/originalUrl, res.status/json/send/redirect.
   => không cần npm install.
   ========================================================= */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function express() {
  const stack = [];      // { method, re, keys, fn } hoặc { fn } (middleware)
  const settings = {};
  const app = (req, res) => handle(req, res);

  app.set = (k, v) => { settings[k] = v; return app; };
  app.disable = k => { settings[k] = false; return app; };
  app.use = fn => { stack.push({ fn }); return app; };
  for (const m of ['get', 'post', 'put', 'delete']) {
    app[m] = (p, ...fns) => {
      const keys = [];
      const re = new RegExp('^' + p.replace(/\/:([A-Za-z_]\w*)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
      fns.forEach(fn => stack.push({ method: m.toUpperCase(), re, keys, fn }));
      return app;
    };
  }

  function decorate(req, res) {
    const url = new URL(req.url, 'http://x');
    req.originalUrl = req.url;
    req.path = decodeURIComponent(url.pathname);
    req.query = Object.fromEntries(url.searchParams);
    req.params = {};
    const trust = !!settings['trust proxy'];
    const fwd = trust && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    req.ip = fwd || (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    req.secure = !!req.socket.encrypted || (trust && req.headers['x-forwarded-proto'] === 'https');
    res.status = c => { res.statusCode = c; return res; };
    res.json = o => {
      const body = JSON.stringify(o);
      if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(body);
      return res;
    };
    res.send = b => {
      if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', typeof b === 'string' ? 'text/html; charset=utf-8' : 'application/octet-stream');
      res.end(b);
      return res;
    };
    res.redirect = (c, u) => { if (u === undefined) { u = c; c = 302; } res.statusCode = c; res.setHeader('Location', u); res.end(); };
  }

  function handle(req, res) {
    decorate(req, res);
    let i = 0;
    const fail = err => {
      for (; i < stack.length; i++) {
        if (stack[i].fn.length === 4) { const l = stack[i++]; return l.fn(err, req, res, next); }
      }
      console.error(err);
      if (!res.headersSent) res.status(500).end('Lỗi máy chủ.');
    };
    const next = err => {
      if (err) return fail(err);
      while (i < stack.length) {
        const l = stack[i++];
        if (l.fn.length === 4) continue;            // chỉ chạy khi có lỗi
        if (l.re) {
          if (l.method !== req.method) continue;
          const m = l.re.exec(req.path);
          if (!m) continue;
          req.params = {};
          l.keys.forEach((k, n) => { req.params[k] = decodeURIComponent(m[n + 1]); });
        }
        try { return l.fn(req, res, next); } catch (e) { return fail(e); }
      }
      if (!res.headersSent) {
        res.status(404);
        if (req.path.startsWith('/api/')) res.json({ error: 'Không tìm thấy.' });
        else res.setHeader('Content-Type', 'text/plain; charset=utf-8'), res.end('Không tìm thấy.');
      }
    };
    next();
  }

  app.listen = (port, cb) => http.createServer(app).listen(port, cb);
  return app;
}

express.json = (opts = {}) => {
  const limit = typeof opts.limit === 'number' ? opts.limit : parseInt(opts.limit, 10) * (/kb/i.test(opts.limit) ? 1024 : /mb/i.test(opts.limit) ? 1048576 : 1) || 102400;
  return (req, res, next) => {
    req.body = {};
    if (!/^(POST|PUT|PATCH|DELETE)$/.test(req.method)) return next();
    if (!/json/i.test(req.headers['content-type'] || '')) return next();
    const chunks = []; let size = 0, dead = false;
    req.on('data', c => {
      if (dead) return;
      size += c.length;
      if (size > limit) { dead = true; const e = new Error('Dữ liệu quá lớn'); e.type = 'entity.too.large'; e.status = 413; next(e); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (dead) return;
      const txt = Buffer.concat(chunks).toString('utf8');
      if (!txt.trim()) return next();
      try { req.body = JSON.parse(txt); next(); }
      catch (_) { const e = new Error('JSON không hợp lệ'); e.type = 'entity.parse.failed'; next(e); }
    });
    req.on('error', next);
  };
};

express.static = root => (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let rel = req.path === '/' ? '/index.html' : req.path;
  const file = path.join(root, path.normalize(rel));
  if (file !== root && !file.startsWith(root + path.sep)) return next();   // chặn ../
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return next();
    res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Content-Length', st.size);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.end()).pipe(res);
  });
};

module.exports = express;
