/* =========================================================
   auth.js · Trang đăng nhập / đăng ký (gọi /api/login, /api/register)
   ========================================================= */
'use strict';
const $ = id => document.getElementById(id);
let mode = 'login';
let busy = false;

function setMode(m) {
  mode = m;
  const reg = m === 'register';
  $('tlogin').setAttribute('aria-selected', !reg);
  $('treg').setAttribute('aria-selected', reg);
  $('pw2box').hidden = !reg;
  $('uhint').hidden = !reg;
  $('meter').hidden = !reg;
  $('ok').textContent = reg ? 'Tạo tài khoản' : 'Đăng nhập';
  $('ttl').textContent = reg ? 'Tạo tài khoản mới' : 'Chào mừng trở lại';
  $('tsub').textContent = reg ? 'Chỉ mất vài giây, không cần email.' : 'Đăng nhập để tiếp tục phân tích.';
  $('pw').autocomplete = reg ? 'new-password' : 'current-password';
  $('err').textContent = '';
  history.replaceState(null, '', reg ? '#register' : location.pathname);
}

// Độ mạnh mật khẩu: 0-4
function strength(p) {
  let s = 0;
  if (p.length >= 6) s++;
  if (p.length >= 10) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p) && /[^\p{L}\d]/u.test(p)) s++;
  return s;
}
$('pw').addEventListener('input', () => {
  const s = strength($('pw').value);
  const m = $('meter');
  m.dataset.s = $('pw').value ? Math.max(1, s) : 0;
});

$('tlogin').onclick = () => setMode('login');
$('treg').onclick = () => setMode('register');
$('eye').onclick = () => {
  const show = $('pw').type === 'password';
  $('pw').type = show ? 'text' : 'password';
  $('eye').textContent = show ? 'Ẩn' : 'Hiện';
  $('eye').setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
};

function validate() {
  const name = $('un').value.trim().toLowerCase();
  const pw = $('pw').value;
  if (!name) return 'Hãy nhập tên đăng nhập.';
  if (!pw) return 'Hãy nhập mật khẩu.';
  if (mode === 'register') {
    if (!/^[a-z0-9_.]{3,20}$/.test(name)) return 'Tên đăng nhập 3–20 ký tự: chữ không dấu, số, _ hoặc .';
    if (pw.length < 6) return 'Mật khẩu tối thiểu 6 ký tự.';
    if (pw !== $('pw2').value) return 'Hai mật khẩu chưa khớp.';
  }
  return '';
}

$('f').addEventListener('submit', async e => {
  e.preventDefault();
  if (busy) return;
  const bad = validate();
  if (bad) { $('err').textContent = bad; return; }
  busy = true; $('ok').disabled = true; $('err').textContent = '';
  try {
    const r = await fetch('/api/' + mode, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: $('un').value, password: $('pw').value, remember: $('rm').checked }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Lỗi máy chủ');
    location.href = 'index.html';
  } catch (err) {
    $('err').textContent = err instanceof TypeError ? 'Không kết nối được máy chủ. Hãy chạy npm start.' : err.message;
    busy = false; $('ok').disabled = false;
  }
});

// Đã đăng nhập thì quay về trang chính
fetch('/api/me').then(r => r.json()).then(d => { if (d.username) location.replace('index.html'); }).catch(() => {});
setMode(location.hash === '#register' ? 'register' : 'login');
$('un').focus();
