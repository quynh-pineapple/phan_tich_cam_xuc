/* nav.js · Chuyển trang trong thanh menu bên trái (theo #hash) */
'use strict';
const VIEWS = { dashboard: 'Dashboard', analyze: 'Phân tích bình luận', batch: 'Phân tích hàng loạt', dict: 'Từ điển & từ lóng', rules: 'Luật ngữ cảnh', history: 'Lịch sử', review: 'Duyệt đóng góp', account: 'Tài khoản' };
function showView() {
  const h = location.hash.slice(1);
  const v = VIEWS[h] ? h : 'dashboard';
  document.querySelectorAll('.view').forEach(s => { s.hidden = s.dataset.view !== v; });
  document.querySelectorAll('#nav a').forEach(a => {
    if (a.getAttribute('href') === '#' + v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.getElementById('vt').textContent = VIEWS[v];
  window.scrollTo(0, 0);
  window.dispatchEvent(new CustomEvent('viewchange', { detail: v }));
}
window.addEventListener('hashchange', showView);
showView();
