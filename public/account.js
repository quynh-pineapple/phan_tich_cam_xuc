/* =========================================================
   account.js · Đăng nhập + từ điển + phản hồi, gọi API của server.js
   ========================================================= */
'use strict';

const api = async (url, method = 'GET', body) => {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Lỗi máy chủ');
  return d;
};

let ME = null;        // tên người dùng đang đăng nhập
let ADMIN = false;    // true nếu là tài khoản quản trị
let LEXICON = [];     // từ điển chung từ CSDL
let CTXR = [];        // luật ngữ cảnh: {id, word, contexts, score}
let MINE = [];        // từ riêng: {id, word, score}

/* ---------- 1. Từ điển cá nhân ---------- */
// script.js gọi hàm này khi người dùng dạy từ mới
function saveUserWord(key, v) {
  if (!ME) return false;
  const old = MINE.find(w => w.word === key);
  const item = old || { id: null, word: key, score: v };
  item.score = v;
  if (!old) MINE.push(item);
  api('/api/words', 'POST', { word: key, score: v })
    .then(d => { item.id = d.id; renderMine(); })
    .catch(e => { $('lm').textContent = 'Không lưu được: ' + e.message; });
  return true;
}

function renderMine() {
  const box = $('mine');
  if (!ME) { box.innerHTML = ''; return; }
  box.innerHTML = MINE.length
    ? '<h2 class="asp-title">Từ điển của bạn</h2><div class="chips">' +
      MINE.map(w => `<span class="chip ${w.score > 0 ? 'p' : 'n'}">${esc(w.word)} (${w.score > 0 ? '+' : ''}${w.score})` +
        (w.id ? `<button data-id="${w.id}" aria-label="Xóa ${esc(w.word)}">×</button>` : '') + '</span>').join('') + '</div>'
    : '<p class="note">Bạn chưa dạy từ nào. Từ bạn thêm sẽ được lưu theo tài khoản.</p>';
}

$('mine').addEventListener('click', async e => {
  const id = e.target.dataset && e.target.dataset.id;
  if (!id) return;
  try { await api('/api/words/' + id, 'DELETE'); location.reload(); }
  catch (err) { $('lm').textContent = err.message; }
});

/* ---------- 2. Thanh tài khoản + hộp thoại ---------- */
let mode = 'login';

function renderAcct() {
  $('acct').innerHTML = ME
    ? `<span>Xin chào, <b>${esc(ME)}</b></span><button id="lout">Đăng xuất</button>`
    : '<span class="sm">Đăng nhập để lưu từ điển riêng và gửi phản hồi.</span><button class="primary" id="lin">Đăng nhập / Đăng ký</button>';
  $('lm').textContent = ME
    ? 'Từ mới sẽ được lưu vào tài khoản của bạn.'
    : 'Chưa đăng nhập: từ mới chỉ có hiệu lực trong phiên hiện tại.';
}

function setMode(m) {
  mode = m;
  $('dtitle').textContent = m === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';
  $('dsub').textContent = m === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập';
  $('dok').textContent = m === 'login' ? 'Đăng nhập' : 'Đăng ký';
  $('derr').textContent = '';
}

$('acct').addEventListener('click', async e => {
  if (e.target.id === 'lin') { setMode('login'); $('dlg').showModal(); $('un').focus(); }
  if (e.target.id === 'lout') { await api('/api/logout', 'POST').catch(() => {}); location.reload(); }
});
$('dsub').onclick = () => setMode(mode === 'login' ? 'register' : 'login');
$('dcancel').onclick = () => $('dlg').close();

async function submitAuth() {
  $('derr').textContent = '';
  try {
    await api('/api/' + mode, 'POST', { username: $('un').value, password: $('pw').value });
    location.reload();
  } catch (e) { $('derr').textContent = e.message; }
}
$('dok').onclick = submitAuth;
$('pw').addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });

/* ---------- 3. Danh sách từ lóng & trend (từ CSDL) ---------- */
function renderSlang() {
  const q = strip($('sq').value.trim().toLowerCase());
  const rows = LEXICON.filter(r => r.type === 's' && (!q || strip(r.word).includes(q)));
  $('sl').innerHTML = rows.length
    ? rows.map(r => `<span class="chip ${r.score > 0 ? 'p' : 'n'}">${esc(r.word)} (${r.score > 0 ? '+' : ''}${r.score})` +
        (ADMIN ? `<button data-lid="${r.id}" aria-label="Xóa ${esc(r.word)}">×</button>` : '') + '</span>').join('')
    : '<span class="sm">Không tìm thấy từ nào.</span>';
  $('sc').textContent = `${rows.length} từ`;
}
$('sq').addEventListener('input', renderSlang);

// Quản trị: xóa từ khỏi từ điển chung
$('sl').addEventListener('click', async e => {
  const id = e.target.dataset && e.target.dataset.lid;
  if (!id) return;
  try { await api('/api/lexicon/' + id, 'DELETE'); location.reload(); }
  catch (err) { alert(err.message); }
});

// Quản trị: form thêm / sửa từ
function setupAdmin() {
  $('sl').insertAdjacentHTML('beforebegin',
    '<div class="row"><input id="aw" placeholder="Từ lóng mới, ví dụ: u là trời" aria-label="Từ lóng mới">' +
    '<input id="as" type="number" min="-4" max="4" step="0.5" value="2" style="width:80px" aria-label="Điểm từ -4 đến 4">' +
    '<button class="primary" id="aadd">Thêm / sửa từ</button><span class="sm" id="amsg"></span></div>');
  const add = async () => {
    const word = $('aw').value.trim(), score = +$('as').value, m = $('amsg');
    if (!tokenize(word).length) { m.textContent = 'Hãy nhập một từ.'; return; }
    if (tokenize(word).length > MAX_NGRAM) { m.textContent = `Cụm từ tối đa ${MAX_NGRAM} từ.`; return; }
    try {
      const d = await api('/api/lexicon', 'POST', { word, score });
      setWord(word, { t: 's', v: score }, true);
      const old = LEXICON.find(r => r.word === d.word);
      if (old) old.score = score; else LEXICON.push({ id: d.id, word: d.word, score, type: 's' });
      m.textContent = `Đã lưu “${d.word}” (${score > 0 ? '+' : ''}${score}).`;
      $('aw').value = '';
      renderSlang(); render($('in').value); renderSamples(); runBatch();
    } catch (e) { m.textContent = e.message; }
  };
  $('aadd').onclick = add;
  $('aw').addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
}

/* ---------- 3b. Luật ngữ cảnh ---------- */
function renderCtx() {
  $('cl').innerHTML = CTXR.length
    ? CTXR.map(r => `<div class="cr"><b>${esc(r.word)}</b>` +
        `<span class="chip ${r.score > 0 ? 'p' : 'n'}">${r.score > 0 ? '+' : ''}${r.score}</span>` +
        `<span class="sm">khi đi cùng: ${esc(r.contexts.split(',').join(', '))}</span>` +
        (ADMIN ? `<button data-cid="${r.id}" aria-label="Xóa luật">×</button>` : '') + '</div>').join('')
    : '<span class="sm">Chưa có luật nào.</span>';
}

$('cl').addEventListener('click', async e => {
  const id = e.target.dataset && e.target.dataset.cid;
  if (!id) return;
  try { await api('/api/context/' + id, 'DELETE'); location.reload(); }
  catch (err) { alert(err.message); }
});

function setupCtxAdmin() {
  $('cl').insertAdjacentHTML('beforebegin',
    '<div class="row"><input id="cw" placeholder="Từ, ví dụ: cháy" style="width:110px" aria-label="Từ nhiều nghĩa">' +
    '<input id="cc" placeholder="Ngữ cảnh, cách nhau dấu phẩy: áo, quần, váy" style="flex:1;min-width:180px" aria-label="Các từ ngữ cảnh">' +
    '<input id="cs" type="number" min="-4" max="4" step="0.5" value="2" style="width:80px" aria-label="Điểm">' +
    '<button class="primary" id="cadd">Thêm luật</button><span class="sm" id="cmsg"></span></div>');
  $('cadd').onclick = async () => {
    const m = $('cmsg');
    if (tokenize($('cw').value).length !== 1) { m.textContent = 'Ô “Từ” chỉ nhập một từ.'; return; }
    try {
      await api('/api/context', 'POST', { word: $('cw').value, contexts: $('cc').value, score: +$('cs').value });
      location.reload();
    } catch (e) { m.textContent = e.message; }
  };
}

/* ---------- 4. Lưu lịch sử + nút "Kết quả sai?" ---------- */
$('go').addEventListener('click', async () => {
  const text = $('in').value;
  if (!ME || !text.trim()) return;
  const r = analyze(text);
  try {
    const { id } = await api('/api/analyses', 'POST', { text, label: r.label, score: r.score });
    const box = document.createElement('div');
    box.className = 'fb';
    box.innerHTML = '<span class="sm">Kết quả sai? Đúng phải là:</span>' +
      ['Tích cực', 'Trung tính', 'Tiêu cực'].filter(l => l !== r.label)
        .map(l => `<button data-l="${l}">${l}</button>`).join('');
    box.addEventListener('click', async e => {
      const l = e.target.dataset && e.target.dataset.l;
      if (!l) return;
      try {
        await api('/api/feedback', 'POST', { analysis_id: id, correct_label: l });
        box.innerHTML = '<span class="sm">Cảm ơn, đã ghi nhận phản hồi.</span>';
      } catch (err) { box.textContent = err.message; }
    });
    $('out').appendChild(box);
  } catch (e) { /* không lưu được lịch sử thì bỏ qua */ }
});

/* ---------- 5. Khởi động ---------- */
(async function init() {
  try {
    const me = await api('/api/me');
    ME = me.username;
    ADMIN = me.admin;
    const d = await api('/api/lexicon');
    LEXICON = d.lexicon;
    MINE = d.mine;
    CTXR = d.ctx || [];
  } catch (e) {
    $('acct').innerHTML = '<span class="note flush">Không kết nối được máy chủ. Hãy chạy <code>npm start</code> rồi mở http://localhost:3000</span>';
    return;
  }
  LEXICON.forEach(r => setWord(r.word, { t: r.type, v: r.score }));
  CTXR.forEach(r => addCtx(r.word, r.contexts.split(','), r.score));
  MINE.forEach(w => setWord(w.word, { t: 's', v: w.score }, true));
  renderAcct();
  renderMine();
  renderSlang();
  renderCtx();
  if (ADMIN) { setupAdmin(); setupCtxAdmin(); }
  render($('in').value);
  renderSamples();
  runBatch();
})();
