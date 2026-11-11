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
  try {
    await api('/api/words/' + id, 'DELETE');
    const i = MINE.findIndex(w => String(w.id) === id);
    if (i >= 0) { delWord(MINE[i].word); MINE.splice(i, 1); }
    refreshAll();
  } catch (err) { $('lm').textContent = err.message; }
});

/* ---------- 2. Thanh tài khoản + hộp thoại ---------- */
function renderAcct() {
  const name = ME || 'Khách';
  $('acct').innerHTML = `<span class="av">${esc(name[0].toUpperCase())}</span><span class="who">${esc(name)}</span>` +
    (ME ? '<button id="lout">Đăng xuất</button>' : '<a class="btn" href="login.html">Đăng nhập</a>');
  $('who').innerHTML = `<b>${esc(name)}</b> | ${ME ? (ADMIN ? 'Quản trị' : 'Thành viên') : 'Chưa đăng nhập'}`;
  $('lm').textContent = ME
    ? 'Từ mới sẽ được lưu vào tài khoản của bạn.'
    : 'Chưa đăng nhập: từ mới chỉ có hiệu lực trong phiên hiện tại.';
}

$('acct').addEventListener('click', async e => {
  if (e.target.id === 'lout') { await api('/api/logout', 'POST').catch(() => {}); location.reload(); }
});

/* ---------- 2b. Thanh tổng quan ---------- */
async function renderOverview() {
  const box = $('ov');
  let s;
  try { s = await api('/api/stats'); } catch (e) { box.hidden = true; return; }
  const tile = (n, l, ic, c = '') => `<div class="stat ${c}"><span class="ic">${ic}</span><div><b>${n}</b><span>${l}</span></div></div>`;
  const m = s.me;
  let html;
  if (m) {
    const dn = m.pos + m.neu + m.neg;   // donut chỉ vẽ các lượt đã có kết luận
    const a = dn ? m.pos * 100 / dn : 0, b = dn ? a + m.neu * 100 / dn : 0;
    html = `<div class="ov-grid"><div class="donut ${dn ? '' : 'empty'}" style="--a:${a.toFixed(1)};--b:${b.toFixed(1)}" role="img" aria-label="Tỉ lệ cảm xúc"><div><b>${m.total}</b><span>lượt phân tích</span></div></div>` +
      '<div class="stats">' + tile(m.pos, 'Tích cực', '😊', 'p') + tile(m.neu, 'Trung tính', '😐', 'z') + tile(m.neg, 'Tiêu cực', '😞', 'n') + (m.unk ? tile(m.unk, 'Chưa đủ thông tin', '❔') : '') +
      tile(s.words, 'Từ trong từ điển', '📚') + tile(m.mine, 'Từ của bạn', '✍️') + tile(m.fb, 'Phản hồi đã gửi', '💬') + '</div></div>' +
      (m.total ? '' : '<p class="note">Bạn chưa có lượt phân tích nào. Bấm “Phân tích” ở bên dưới, kết quả sẽ được thống kê tại đây.</p>');
  } else {
    html = '<div class="stats">' + tile(s.words, 'Từ trong từ điển', '📚') + tile(s.rules, 'Luật ngữ cảnh', '🧭') + '</div>' +
      '<p class="note"><a href="login.html">Đăng nhập</a> để xem thống kê lịch sử phân tích của riêng bạn.</p>';
  }
  box.innerHTML = html;
  box.hidden = false;
}

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
  try {
    await api('/api/lexicon/' + id, 'DELETE');
    const i = LEXICON.findIndex(r => String(r.id) === id);
    if (i >= 0) { delWord(LEXICON[i].word); LEXICON.splice(i, 1); }
    MINE.forEach(w => setWord(w.word, { t: 's', v: w.score }, true));   // từ riêng của bạn vẫn được ưu tiên
    renderSlang(); refreshAll();
  } catch (err) { alert(err.message); }
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
  try {
    await api('/api/context/' + id, 'DELETE');
    CTXR = CTXR.filter(r => String(r.id) !== id);
    reloadCtx(); renderCtx(); refreshAll();
  } catch (err) { alert(err.message); }
});

function setupCtxAdmin() {
  $('cl').insertAdjacentHTML('beforebegin',
    '<div class="row"><input id="cw" placeholder="Từ, ví dụ: cháy" style="width:110px" aria-label="Từ nhiều nghĩa">' +
    '<input id="cc" placeholder="Ngữ cảnh, cách nhau dấu phẩy: sân khấu, mv, show" style="flex:1;min-width:180px" aria-label="Các từ ngữ cảnh">' +
    '<input id="cs" type="number" min="-4" max="4" step="0.5" value="2" style="width:80px" aria-label="Điểm">' +
    '<button class="primary" id="cadd">Thêm luật</button><span class="sm" id="cmsg"></span></div>');
  $('cadd').onclick = async () => {
    const m = $('cmsg');
    if (tokenize($('cw').value).length !== 1) { m.textContent = 'Ô “Từ” chỉ nhập một từ.'; return; }
    try {
      const d = await api('/api/context', 'POST', { word: $('cw').value, contexts: $('cc').value, score: +$('cs').value });
      CTXR = CTXR.filter(r => r.id !== d.id).concat({ id: d.id, word: d.word, contexts: d.contexts, score: d.score });
      reloadCtx(); renderCtx(); refreshAll();
      $('cw').value = ''; $('cc').value = '';
      m.textContent = `Đã lưu luật cho “${d.word}”.`;
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
    renderOverview(); histStale = true;
    const box = document.createElement('div');
    box.className = 'fb';
    box.innerHTML = '<span class="sm">' + (r.unknown ? 'Theo bạn bình luận này là:' : 'Kết quả sai? Đúng phải là:') + '</span>' +
      ['Tích cực', 'Trung tính', 'Tiêu cực'].filter(l => l !== r.label)
        .map(l => `<button data-l="${l}">${l}</button>`).join('');
    box.addEventListener('click', async e => {
      const l = e.target.dataset && e.target.dataset.l;
      if (!l) return;
      try {
        const fb = await api('/api/feedback', 'POST', { analysis_id: id, correct_label: l });
        box.innerHTML = '<span class="sm">' + (fb.approved ? 'Đã ghi nhận và duyệt luôn, có trong file CSV phản hồi đã duyệt.' : 'Cảm ơn, đã ghi nhận phản hồi.') + '</span>'; histStale = true;
        if (fb.approved) { addCorrection(text, l); render($('in').value); $('out').appendChild(box); renderReview(); }
      } catch (err) { box.textContent = err.message; }
    });
    $('out').appendChild(box);
  } catch (e) { /* không lưu được lịch sử thì bỏ qua */ }
});

/* ---------- 4b. Làm mới giao diện sau khi từ điển đổi (không tải lại trang) ---------- */
function refreshAll() {
  render($('in').value); renderSamples(); runBatch(); renderMine(); renderOverview();
}
function reloadCtx() {
  resetCtx();
  CTXR.forEach(r => addCtx(r.word, r.contexts.split(','), r.score));
}

/* ---------- 4c. Lịch sử phân tích ---------- */
const tagOfLabel = l => (l === 'Tích cực' ? 'p' : l === 'Tiêu cực' ? 'n' : l === UNKNOWN ? 'u' : 'z');
const when = t => esc(String(t || '').slice(0, 16));
let histStale = true;

async function renderHistory() {
  const box = $('hl');
  if (!ME) {
    box.innerHTML = '<p class="note"><a href="login.html">Đăng nhập</a> để lưu và xem lịch sử phân tích.</p>';
    $('hc').textContent = ''; $('hclr').hidden = true; return;
  }
  try {
    const rows = await api('/api/history');
    histStale = false;
    $('hc').textContent = `${rows.length} lượt gần nhất`;
    $('hclr').hidden = !rows.length;
    box.innerHTML = rows.length
      ? rows.map(r => `<div class="hrow"><div><div class="tx">${esc(r.text)}</div>` +
          `<div class="meta">${when(r.created_at)}${r.fb ? ' · bạn báo đúng phải là: ' + esc(r.fb) : ''}</div></div>` +
          `<span class="tag ${tagOfLabel(r.label)}">${esc(r.label)}</span>` +
          `<span class="acts"><button data-h="${r.id}" aria-label="Phân tích lại">Xem</button></span></div>`).join('')
      : '<p class="note">Chưa có lượt phân tích nào. Bấm “Phân tích” ở màn hình Phân tích, kết quả sẽ hiện ở đây.</p>';
    HIST = rows;
  } catch (e) { box.innerHTML = '<p class="note">' + esc(e.message) + '</p>'; }
}
let HIST = [];
$('hl').addEventListener('click', e => {
  const id = e.target.dataset && e.target.dataset.h;
  const r = id && HIST.find(x => String(x.id) === id);
  if (!r) return;
  $('in').value = r.text; render(r.text);
  location.hash = '#analyze';
});
$('hclr').addEventListener('click', async () => {
  if (!confirm('Xóa toàn bộ lịch sử phân tích của bạn? Không thể hoàn tác.')) return;
  try { await api('/api/history', 'DELETE'); renderHistory(); renderOverview(); } catch (e) { alert(e.message); }
});

/* ---------- 4d. Quản trị: duyệt phản hồi và từ đề xuất ---------- */
const STATUS_VI = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Đã từ chối' };
const btns = (kind, id) => `<span class="acts"><button data-k="${kind}" data-id="${id}" data-s="approved">Duyệt</button>` +
  `<button data-k="${kind}" data-id="${id}" data-s="rejected">Từ chối</button></span>`;

async function renderReview() {
  if (!ADMIN) { $('rfl').innerHTML = '<p class="note">Chỉ tài khoản quản trị mới xem được mục này.</p>'; return; }
  try {
    const d = await api('/api/admin/review');
    const pf = d.feedback.filter(x => x.status === 'pending').length;
    const ps = d.suggestions.filter(x => x.status === 'pending').length;
    $('rfc').textContent = `${pf} chờ duyệt`;
    $('rsc').textContent = `${ps} chờ duyệt`;
    $('rfl').innerHTML = d.feedback.length ? d.feedback.map(f =>
      `<div class="hrow"><div><div class="tx">${esc(f.text)}</div>` +
      `<div class="meta">${esc(f.username)} · ${when(f.created_at)} · hệ thống: ${esc(f.label)} → người dùng cho là: <b>${esc(f.correct_label)}</b></div></div>` +
      (f.status === 'pending' ? btns('feedback', f.id) : `<span class="tag done ${f.status === 'approved' ? 'p' : 'n'}">${STATUS_VI[f.status]}</span>`) + '</div>').join('')
      : '<p class="note">Chưa có phản hồi nào.</p>';
    $('rsl').innerHTML = d.suggestions.length ? d.suggestions.map(x =>
      `<div class="hrow"><div><div class="tx"><b>${esc(x.word)}</b> (${x.score > 0 ? '+' : ''}${x.score})</div>` +
      `<div class="meta">${esc(x.username)} · ${when(x.created_at)}</div></div>` +
      (x.status === 'pending' ? btns('suggestions', x.id) : `<span class="tag done ${x.status === 'approved' ? 'p' : 'n'}">${STATUS_VI[x.status]}</span>`) + '</div>').join('')
      : '<p class="note">Chưa có từ đề xuất nào.</p>';
  } catch (e) { $('rfl').innerHTML = '<p class="note">' + esc(e.message) + '</p>'; }
  renderLog();
}

/* ---------- 4d2. Quản trị: nhật ký thay đổi từ điển + hoàn tác ---------- */
const ACTION_VI = { add: 'thêm', update: 'sửa', delete: 'xóa', undo: 'hoàn tác' };
const VIA_VI = { suggestion: ' (từ đề xuất)', undo: '' , admin: '' };
const sgn = v => (v == null ? '–' : (v > 0 ? '+' : '') + v);
async function renderLog() {
  try {
    const rows = await api('/api/admin/log');
    $('rlc').textContent = rows.length ? `${rows.length} thay đổi gần nhất` : '';
    $('rll').innerHTML = rows.length ? rows.map(l =>
      `<div class="hrow"><div><div class="tx"><b>${esc(l.word)}</b>${l.kind === 'ctx' ? ' <span class="sm">(luật: ' + esc((l.contexts || '').split(',').join(', ')) + ')</span>' : ''}` +
      ` · ${ACTION_VI[l.action] || esc(l.action)}${VIA_VI[l.via] || ''}: ${sgn(l.old_score)} → ${l.action === 'delete' ? 'đã xóa' : sgn(l.new_score)}</div>` +
      `<div class="meta">${esc(l.username)} · ${when(l.at)}</div></div>` +
      (l.undone ? '<span class="tag done z">Đã hoàn tác</span>'
        : l.action === 'undo' ? ''
        : `<span class="acts"><button data-undo="${l.id}">Hoàn tác</button></span>`) + '</div>').join('')
      : '<p class="note">Chưa có thay đổi nào.</p>';
  } catch (e) { $('rll').innerHTML = '<p class="note">' + esc(e.message) + '</p>'; }
}
$('rll').addEventListener('click', async e => {
  const id = e.target.dataset && e.target.dataset.undo;
  if (!id) return;
  if (!confirm('Hoàn tác thay đổi này? Từ điển chung sẽ trở về giá trị trước đó cho mọi người dùng.')) return;
  try { await api(`/api/admin/log/${id}/undo`, 'POST'); location.reload(); }
  catch (err) { alert(err.message); }
});
document.querySelector('[data-view="review"]').addEventListener('click', async e => {
  const b = e.target.closest('button[data-k]');
  if (!b) return;
  try {
    const d = await api(`/api/admin/${b.dataset.k}/${b.dataset.id}`, 'POST', { status: b.dataset.s });
    if (d.lexicon) {   // từ vừa duyệt có hiệu lực ngay
      const l = d.lexicon, old = LEXICON.find(r => r.id === l.id);
      setWord(l.word, { t: l.type, v: l.score }, true);
      if (old) old.score = l.score; else LEXICON.push(l);
      renderSlang(); refreshAll();
    }
    renderReview();
    if (b.dataset.k === 'feedback') loadCorrections();
  } catch (err) { alert(err.message); }
});

/* ---------- 4e. Đề xuất từ cho từ điển chung ---------- */
function suggestWord(key, v) {
  if (!ME) { $('lm').textContent += ' (Cần đăng nhập để đề xuất cho từ điển chung.)'; return; }
  api('/api/suggestions', 'POST', { word: key, score: v })
    .then(() => { $('lm').textContent += ' Đã gửi đề xuất cho quản trị.'; })
    .catch(e => { $('lm').textContent += ' Không gửi được đề xuất: ' + e.message; });
}

/* ---------- 4f. Đổi mật khẩu ---------- */
$('pwgo').addEventListener('click', async () => {
  const m = $('pwm');
  if (!$('pwo').value || !$('pwn').value) { m.textContent = 'Hãy nhập đủ mật khẩu hiện tại và mật khẩu mới.'; return; }
  if ($('pwn').value !== $('pwn2').value) { m.textContent = 'Hai mật khẩu mới chưa khớp.'; return; }
  try {
    await api('/api/password', 'POST', { old_password: $('pwo').value, new_password: $('pwn').value });
    m.textContent = 'Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.';
    $('pwo').value = $('pwn').value = $('pwn2').value = '';
  } catch (e) { m.textContent = e.message; }
});

window.addEventListener('viewchange', e => {
  if (e.detail === 'history' && histStale) renderHistory();
  if (e.detail === 'review') renderReview();
});

async function loadCorrections() {
  try { setCorrections(await api('/api/corrections')); render($('in').value); } catch (e) { /* không có thì thôi */ }
}

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
  try { const r = await fetch('/model.json'); if (r.ok) setModel(await r.json()); } catch (e) { /* không có mô hình thì chỉ dùng từ điển */ }
  await loadCorrections();
  LEXICON.forEach(r => setWord(r.word, { t: r.type, v: r.score }));
  CTXR.forEach(r => addCtx(r.word, r.contexts.split(','), r.score));
  MINE.forEach(w => setWord(w.word, { t: 's', v: w.score }, true));
  renderAcct();
  renderOverview();
  renderMine();
  renderSlang();
  renderCtx();
  if (ADMIN) { setupAdmin(); setupCtxAdmin(); $('navreview').hidden = false; }
  $('pwbox').hidden = !ME; $('pwlogin').hidden = !!ME;
  if (location.hash === '#history') renderHistory();
  if (location.hash === '#review') renderReview();
  render($('in').value);
  renderSamples();
  runBatch();
})();
