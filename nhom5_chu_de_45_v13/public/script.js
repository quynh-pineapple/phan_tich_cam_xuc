/* =========================================================
   PHÂN TÍCH CẢM XÚC BÌNH LUẬN MẠNG XÃ HỘI TIẾNG VIỆT
   script.js  (phần chấm điểm chạy trên trình duyệt, dựa trên từ điển + luật)
   ========================================================= */
'use strict';

/* =========================================================
   PHẦN 1 · LÕI PHÂN TÍCH (không đụng tới DOM)
   ========================================================= */

/* ---------- 1.1 Tiện ích ---------- */

// Bỏ dấu tiếng Việt: "đẹp" -> "dep"
const strip = s =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

const esc = s =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// Ngưỡng phân loại: điểm trong khoảng [-0.15, 0.15] là trung tính
const THRESHOLD = 0.15;
const labelOf = v => (v > THRESHOLD ? 'Tích cực' : v < -THRESHOLD ? 'Tiêu cực' : 'Trung tính');
const UNKNOWN = 'Chưa đủ thông tin';   // hệ thống không tìm thấy dấu hiệu cảm xúc nào, không đoán bừa
const tagOf   = v => (v > THRESHOLD ? 'p' : v < -THRESHOLD ? 'n' : 'z');        // class .tag.*
const clsOf   = l => (l === 'Tích cực' ? 'pos' : l === 'Tiêu cực' ? 'neg' : l === UNKNOWN ? 'unk' : 'neu'); // class chữ màu

/* ---------- 1.2 Tách từ ----------
   - đưa về chữ thường, chuẩn hoá Unicode (NFC) để dấu không bị tách rời
   - bỏ link, @tag, dấu # của hashtag (đặc trưng bình luận Facebook / YouTube / TikTok)
   - bỏ ký tự biến thể emoji, bộ chỉnh màu da
   - rút gọn chữ kéo dài kiểu mạng xã hội: "đẹpppp" -> "đẹp", "quáaaa" -> "quá"
   - mỗi emoji / dấu câu là một token riêng                                   */
const cleanSocial = text =>
  text
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')          // bỏ đường link
    .replace(/@[\p{L}\p{N}_.]+/gu, ' ')                  // bỏ @tag người khác ("@nam.nguyen ơi")
    .replace(/#(?=[\p{L}\p{N}])/gu, ' ');               // "#hay" -> "hay" (giữ chữ, bỏ dấu #)

const tokenize = text =>
  cleanSocial(text)
    .toLowerCase()
    .normalize('NFC')
    .replace(/[\uFE0F\u200D\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/(?<!\p{L})([kh])\1{2,}(?!\p{L})/gu, 'haha')   // "kkk", "hhh" là tiếng cười, không phải phủ định
    .replace(/(\p{L})\1{2,}/gu, '$1')
    .match(/[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu) || [];

/* ---------- 1.3 Từ điển cảm xúc ----------
   Loại từ (t):
     s = từ mang cảm xúc (điểm âm/dương)     n = từ phủ định
     i = từ nhấn mạnh / giảm nhẹ (hệ số)     c = từ chuyển ý ("nhưng"...)   */

const MAX_NGRAM = 5;                       // cụm từ dài nhất trong từ điển (số token)
const LEX    = Object.create(null);        // từ điển có dấu
const LEX_ND = Object.create(null);        // từ điển không dấu (dùng cho bình luận gõ không dấu)

// Từ không dấu dễ nhầm với từ phổ biến khác nên không đưa vào từ điển không dấu:
// "do" (do/dở/dơ), "gia" (giá/giả), "dat" (đắt/đặt), "me" (mẹ/mê)
const ND_SKIP = new Set([
  'do', 'gia', 'dat', 'me', 'che', 'que', 'lo', 'nhat', 'xam', 'hong', 'dung',
  'toi', 'ban', 'thoi', 'kem', 'sach', 'tien', 'hay', 'tuc', 'buon', 'ngu', 'mau', 'xin', 'phe', 'chat',
]);

function setWord(word, entry, override = false) {
  const key = tokenize(word).join(' ');
  if (!key) return null;
  LEX[key] = entry;
  const plain = strip(key);
  const allowed = !ND_SKIP.has(plain) || key === plain;   // người dùng tự gõ dạng không dấu thì cho phép
  if (allowed && (override || !(plain in LEX_ND))) LEX_ND[plain] = entry;
  return key;
}

// Xóa một từ khỏi bộ chấm điểm (không cần tải lại trang)
function delWord(word) {
  const key = tokenize(word).join(' ');
  delete LEX[key];
  const plain = strip(key);
  delete LEX_ND[plain];
  for (const k in LEX)   // còn từ có dạng không dấu giống vậy thì giữ lại cho bản không dấu
    if (strip(k) === plain && (!ND_SKIP.has(plain) || k === plain)) { LEX_ND[plain] = LEX[k]; break; }
}

// Nạp danh sách dạng "từ=điểm|từ=điểm"
const addWords = (type, list) =>
  list.split('|').forEach(p => {
    const [w, v] = p.split('=');
    setWord(w, { t: type, v: v ? +v : 0 });
  });

// Từ tích cực (dùng chung cho bình luận về video, bài đăng, người nổi tiếng, tin tức...)
addWords('s',
  'tốt=2|tuyệt vời=3|tuyệt=3|đỉnh=3|đỉnh cao=3|xịn=2|đẹp=2|ngon=1.5|thích=2|yêu=3|hay=2|hài lòng=2|ưng=2|' +
  'xuất sắc=3|mê=2|ok=1|ổn=1|cảm ơn=1|mượt=2|thân thiện=2|dễ thương=2|' +
  'hạnh phúc=3|vui=2|hoàn hảo=3|ủng hộ=2|' +
  'cute=2|good=2|tot=2|chuẩn=2|xinh=2|đáng yêu=2|phê=2|pro=1.5|chill=1.5|' +
  'hài hước=2|vui nhộn=2|duyên dáng=2|cảm động=2.5|xúc động=2|ý nghĩa=2|truyền cảm hứng=2.5|' +
  'đồng tình=2|đồng ý=1.5|chí lý=2.5|đúng rồi=2|quá đúng=2.5|nói chuẩn=2.5|ngưỡng mộ=2.5|nể=2|' +
  'tự hào=2.5|cảm phục=2.5|biết ơn=2|trân trọng=2|tử tế=2|chân thật=2|chân thành=2|dễ gần=2|' +
  'đáng xem=2|xứng đáng=2|đáng chờ=2|đáng đợi=2|đáng nghe=2|đáng theo dõi=2|nghe mãi không chán=3|xem mãi không chán=3|cuốn=2|hấp dẫn=2|' +
  'cố lên=1.5|chúc mừng=2|tự tin=1.5|bình yên=2|chữa lành=2.5|nhẹ nhàng=1.5|thư giãn=1.5|' +
  'sáng tạo=2|chất=2|đỉnh của đỉnh=3|tuyệt phẩm=3|siêu phẩm=3|kiệt tác=3|hâm mộ=2|respect=2.5|cảm ơn bạn=1.5|' +
  'thả tim=2|thương=1.5');

// Emoji
addWords('s',
  '😍=2|❤=2|♥=2|👍=2|🥰=2|😊=1.5|🤩=2|😂=1|🤣=1|💯=2|🔥=1.5|😘=1.5|👏=2|😀=1.5|😁=1.5|🙏=1|' +
  '💖=2|💕=2|💗=2|🫶=2|🥹=1.5|😆=1.5|😹=1|😻=2|🤝=1|🌹=1|✨=1|💪=1.5|😎=1.5|' +
  '😡=-2|👎=-2|😤=-2|🤮=-3|😢=-1.5|😭=-1.5|😠=-2|💩=-2|😞=-2|😔=-1.5|😩=-1.5|😫=-1.5|💔=-2|🙄=-1.5|🤬=-3|' +
  '🤡=-2|😒=-1.5|🤦=-1.5|🙃=-1|😑=-1|😐=-0.5|🤢=-2.5|😱=-1');

// Từ tiêu cực
addWords('s',
  'tệ=-3|dở=-2|rác=-3|chán=-2|kém=-2|tồi=-3|thất vọng=-3|lừa đảo=-4|lừa=-3|ghét=-3|xấu=-2|' +
  'bực=-2|tức=-2|khó chịu=-2|tệ hại=-3|thái độ=-1|' +
  'hối hận=-3|buồn=-2|vô dụng=-3|cùi=-2|nhảm=-2|nhảm nhí=-3|ngu=-3|ngu ngốc=-3|đểu=-3|scam=-4|fake=-3|hàng giả=-3|đồ giả=-3|' +
  'mất dạy=-4|thối=-2|phiền=-1.5|cạn lời=-3|vô duyên=-2|bức xúc=-2|toang=-2|flop=-2|' +
  'vô văn hóa=-3.5|thiếu văn hóa=-3|vô học=-3.5|mất lịch sự=-2.5|láo=-3|bố láo=-3.5|hỗn=-3|xấc xược=-3|' +
  'giả tạo=-3|giả trân=-2.5|thảo mai=-2.5|diễn sâu=-2|diễn lố=-2.5|trà xanh=-1.5|' +
  'phản cảm=-3|dung tục=-3|lố lăng=-3|kệch cỡm=-2.5|kém duyên=-2|đáng xấu hổ=-3|xấu hổ=-2|nhục=-3|' +
  'đạo nhái=-3|đạo văn=-3|ăn cắp=-3|ăn cắp ý tưởng=-3.5|tin giả=-3.5|fake news=-3.5|' +
  'bôi nhọ=-3.5|nói xấu=-3|ném đá=-2.5|dìm hàng=-2.5|miệt thị=-3.5|body shaming=-3.5|chửi=-2.5|' +
  'tẩy chay=-3|anti=-2|phốt=-2|bóc phốt=-2|bênh vực sai=-2|thất bại=-2|sai sự thật=-3|' +
  'thiếu tôn trọng=-3|vô cảm=-2.5|ích kỷ=-2.5|hèn=-2.5|đê tiện=-3.5|khinh=-2.5|kinh tởm=-3.5|ghê tởm=-3.5|' +
  'đau lòng=-2|đáng tiếc=-1.5|thương tâm=-2|sốc=-1.5|tức giận=-2.5|phẫn nộ=-3|lên án=-2.5|' +
  'phí thời gian=-2.5|mất thời gian=-2|tốn thời gian=-1.5|nhạt=-1.5|lê thê=-2|dài dòng=-1.5|câu giờ=-2|nhàm chán=-2.5|khó xem=-2|không đáng xem=-3');

// Từ phủ định (kể cả teencode)
addWords('n', 'không|ko|k|kg|kh|khg|hk|khum|hok|hem|chẳng|chả|chưa|hông|đâu có');

// Từ nhấn mạnh (> 1) và giảm nhẹ (< 1)
addWords('i',
  'rất=1.5|quá=1.5|cực kỳ=1.6|vô cùng=1.6|siêu=1.5|lắm=1.4|thật sự=1.3|quá trời=1.6|hết sức=1.5|' +
  'vl=1.5|vcl=1.6|hơi=0.6|khá=0.8|tạm=0.6|hơi bị=1.3|thật=1.2');

// Từ chuyển ý: vế sau quan trọng hơn vế trước
addWords('c', 'nhưng=1|nhưng mà=1|tuy nhiên=1|song=1');

/* ---------- 1.3b Luật ngữ cảnh ----------
   Từ nhiều nghĩa (cháy, nóng, khô...) được chấm theo từ đứng gần nó trong cùng một vế câu.
   Nếu có nhiều ngữ cảnh khớp thì lấy ngữ cảnh gần từ đó nhất.
   Luật ngữ cảnh được ưu tiên hơn điểm trong từ điển thường.                          */
const CTX    = Object.create(null);   // khóa có dấu
const CTX_ND = Object.create(null);   // khóa không dấu (cho bình luận gõ không dấu)
const CTX_WINDOW = 6;                 // xét tối đa 6 từ mỗi bên
const BOUND = new Set(['nhưng', 'nhung', 'tuy', 'song']);   // ranh giới vế câu

function addCtx(word, ctxList, v) {
  const t = tokenize(word);
  if (t.length !== 1) return;
  const rule = { v, ctx: ctxList.map(c => strip(tokenize(c).join(' ')).split(' ')).filter(c => c[0]) };
  (CTX[t[0]] = CTX[t[0]] || []).push(rule);
  const plain = strip(t[0]);
  if (!ND_SKIP.has(plain)) (CTX_ND[plain] = CTX_ND[plain] || []).push(rule);
}

// Xóa hết luật ngữ cảnh đã nạp (để nạp lại sau khi quản trị xóa / thêm luật)
function resetCtx() {
  for (const k of Object.keys(CTX)) delete CTX[k];
  for (const k of Object.keys(CTX_ND)) delete CTX_ND[k];
}

function ctxScore(rules, tk, i) {
  const tp = tk.map(strip);
  let L = i, R = i;
  while (L > 0 && i - L < CTX_WINDOW && !BOUND.has(tk[L - 1]) && !PUNCT.test(tk[L - 1])) L--;
  while (R < tk.length - 1 && R - i < CTX_WINDOW && !BOUND.has(tk[R + 1]) && !PUNCT.test(tk[R + 1])) R++;
  let best = null;
  for (const r of rules) for (const c of r.ctx)
    for (let s = L; s + c.length - 1 <= R; s++) {
      if (s <= i && i <= s + c.length - 1) continue;
      if (!c.every((x, k) => tp[s + k] === x)) continue;
      const d = Math.min(Math.abs(s - i), Math.abs(s + c.length - 1 - i));
      if (!best || d < best.d || (d === best.d && Math.abs(r.v) > Math.abs(best.v)))
        best = { d, v: r.v, c: c.join(' ') };
    }
  return best;
}

// Từ lóng & trend được nạp từ CSDL qua account.js (GET /api/lexicon)

/* ---------- 1.4 Phân tích một bình luận ----------
   Quy trình:
   1. Tách token, dò từ điển theo cụm dài nhất (tối đa 3 từ)
   2. Với mỗi từ cảm xúc: đảo dấu nếu có phủ định trong 2 từ trước
      (dừng lại khi gặp dấu câu), nhân hệ số nếu có từ nhấn mạnh kề bên,
      nhân 1.5 nếu nằm sau "nhưng"
   3. Cộng điểm, tăng nhẹ theo số dấu "!", nén về [-1, 1] bằng tanh          */

const PUNCT = /^[.,!?;:…()"“”]$/;

/* ---------- 1.3c Hai trường hợp khó của từ điển ----------
   1) "hay" nghĩa là "hoặc" trong câu hỏi lựa chọn: "chiếu rạp hay phát trên mạng vậy?" -> không phải khen.
   2) Mỉa mai kiểu "Hay thật đấy, đợi cả tháng mới giao": có lời khen nhưng kèm tình huống tiêu cực
      (chờ lâu, mãi mới, không ai trả lời...) và không có từ chê nào.
   3) "Cứ tưởng hay, ai ngờ ...": phần sau "tưởng" là điều đã kỳ vọng, không phải lời đánh giá.
   Đây là luật nhận diện bằng quy tắc (không phải mô hình), nên kết quả mỉa mai luôn có độ tin cậy "Trung bình".  */
const HAY_END = new Set(['không', 'ko', 'k', 'chưa', 'sao', 'nhỉ', 'nhé', 'nha', 'ạ', 'vậy', 'thế', 'chứ', 'hả']);
const SARCASM_SITUATION = [
  /(?:đợi|chờ)[^.!?,;]{0,14}?(?:cả|mấy|hơn|gần|nửa|\d+|một|hai|ba|bốn|sáu|bảy|tám|chín|mười)(?:\s*(?:\d+|một|hai|ba|bốn|sáu|bảy|tám|chín|mười))?\s*(?:tuần|tháng|ngày|buổi|năm|tiếng|giờ)/u,
  /(?:cả|mấy|hơn|gần)\s*(?:tuần|tháng|ngày|năm)\s*(?:mới|rồi|vẫn chưa|chưa)/u,
  /mãi\s*(?:mới|chưa)/u,
  /mới\s*(?:giao|trả lời|phản hồi|có|xong|duyệt)/u,
  /(?:vẫn|còn)\s*chưa\s*(?:thấy|nhận|giao|có|trả lời|phản hồi)/u,
  /(?:lỗi|treo|đứng hình|crash|lag)\s*(?:suốt|liên tục|hoài|mãi)/u,
  /(?:bơ|làm ngơ|lơ)\s*(?:luôn|đi|tin nhắn|mình)/u,
  // Hậu quả cho thấy người xem không hề thích: buồn ngủ, bỏ giữa chừng, phí thời gian, đòi dừng làm
  /buồn ngủ|ngủ gật|ngáp|thuốc ngủ|ru ngủ|hơn cả ngủ/u,
  /(?:tắt|thoát|tua|lướt qua|bỏ)\s*(?:liền|luôn|ngay|ra|đi|giữa chừng|qua|dở)/u,
  /(?:phải|muốn|chỉ muốn)\s*(?:tắt|thoát|tua|lướt|bỏ)/u,
  /(?:phí|tốn|mất)\s*(?:thời gian|\d+\s*(?:phút|tiếng|giờ)|cả\s*(?:buổi|ngày|tiếng))|vô ích|uổng/u,
  /đừng\s*(?:làm|đăng|ra|quay|up)\b|lần sau đừng|khỏi cần (?:làm|đăng)/u,
  /(?:chẳng|không|chả)\s*(?:hiểu gì|cười|khóc|cảm động|rung động)/u,
  // Chất lượng kém đi kèm lời khen
  /(?:quảng cáo|ads?)\s*nhiều hơn|nhiều hơn (?:nội dung|phim|clip)/u,
  /giật lag|bị giật|toàn (?:bị )?(?:lỗi|giật|lag)|chưa (?:tải|load) xong|tải[^.!?,;]{0,12}chưa xong/u,
  /(?:một|1)\s*(?:năm|tháng|quý)\s*(?:mới\s*)?(?:đăng|ra|up)\s*(?:đúng\s*)?(?:một|1)\b/u,
  /như [^.!?,;]{0,15}\d+\s*năm trước|thùng thiếc|sách giáo khoa/u,
];
const SARCASM_GUARD = /mà vẫn|vẫn đáng|đáng (?:đợi|chờ|xem|giá|tiền)|xứng đáng|không phải mỉa|không (?:phí|uổng)/u;   // "chờ lâu mà vẫn đáng": khen thật
// Từ phủ định ngay trước chỗ khớp ("xem không ngủ gật được"): tình huống bị phủ định thì không còn là hậu quả xấu
const NEG_BEFORE = /(?:không|chẳng|chả|chưa|đâu)\s+(?:bị\s+|hề\s+|phải\s+|còn\s+|bao giờ\s+|thể\s+|cần\s+|muốn\s+|được\s+)?$/u;
const hasSarcasmSituation = text => {
  const t = text.toLowerCase().normalize('NFC');
  if (SARCASM_GUARD.test(t)) return '';
  for (const re of SARCASM_SITUATION) {
    const m = re.exec(t);
    if (!m) continue;
    const before = t.slice(0, m.index).split(/[.,!?;]/).pop();
    if (!NEG_BEFORE.test(before)) {
      // trả về cả vế câu chứa chỗ khớp: các từ chê nằm trong vế này là hậu quả được mô tả, không tính là "có từ chê"
      const rest = t.slice(m.index).split(/[.,!?;]/)[0];
      return before + rest;
    }
  }
  return '';
};

function analyze(text) {
  const lower = cleanSocial(text).toLowerCase().normalize('NFC');
  // Bình luận không dấu: có chữ cái nhưng không có dấu nào
  const noDia = /\p{L}/u.test(lower) && strip(lower) === lower;
  const lex = noDia ? LEX_ND : LEX;
  const tk = tokenize(lower);
  const items = [];

  for (let i = 0; i < tk.length; ) {
    let hit = null;
    for (let n = Math.min(MAX_NGRAM, tk.length - i); n >= 1 && !hit; n--) {
      const e = lex[tk.slice(i, i + n).join(' ')];
      if (e) hit = { e, n };
    }
    // Luật ngữ cảnh (chỉ khi không có cụm từ dài hơn khớp)
    if (!hit || hit.n === 1) {
      const rules = (noDia ? CTX_ND : CTX)[tk[i]];
      const c = rules && ctxScore(rules, tk, i);
      if (c) { items.push({ w: tk[i], t: 's', v: c.v, ctx: c.c }); i++; continue; }
    }
    if (hit) {
      items.push({ w: tk.slice(i, i + hit.n).join(' '), ...hit.e });
      i += hit.n;
    } else {
      items.push({ w: tk[i], t: 'w', v: 0 });
      i++;
    }
  }

  const q0 = isQuestion(text);

  // (1) "hay" = "hoặc" trong câu hỏi lựa chọn
  if (q0) items.forEach((it, k) => {
    if (it.w !== 'hay' || it.t !== 's') return;
    const prev = items[k - 1], next = items[k + 1];
    if (prev && next && prev.t !== 'n' && prev.t !== 'i' && !PUNCT.test(prev.w) &&
        next.t === 'w' && !PUNCT.test(next.w) && !HAY_END.has(next.w)) {
      it.t = 'w'; it.v = 0; it.conj = true;
    }
  });

  // (3) "tưởng ... ai ngờ/hóa ra": điều kỳ vọng, không tính vào điểm
  const iT = items.findIndex(x => x.w === 'tưởng');
  if (iT >= 0) {
    const iE = items.findIndex((x, k) => k > iT && (/(?:^|\s)(?:ngờ|dè)$/u.test(x.w) || x.w === 'hóa'));
    if (iE > iT) for (let k = iT + 1; k < iE; k++)
      if (items[k].t === 's') { items[k].t = 'w'; items[k].v = 0; items[k].expect = true; }
  }

  // (2) Mỉa mai: có khen, có tình huống tiêu cực, không có từ chê, không có phủ định
  const anyPos = items.some(x => x.t === 's' && x.v > 0);
  const sarcSit = /\?/.test(text) ? '' : hasSarcasmSituation(text);
  // Từ chê nằm ngay trong tình huống mỉa mai ("buồn ngủ", "giật lag") chính là hậu quả được mô tả, không phải lời chê trực tiếp
  const anyNeg = items.some(x => x.t === 's' && x.v < 0 && !(sarcSit && sarcSit.includes(x.w)));
  // chỉ coi là "bị phủ định" khi từ phủ định đứng ngay trước lời khen ("không tốt"), không tính "vẫn chưa nhận được"
  const negatedPos = items.some((x, k) => x.t === 's' && x.v > 0 && [items[k - 1], items[k - 2]].some(p => p && p.t === 'n'));
  const sarcasm = anyPos && !anyNeg && !negatedPos && !!sarcSit;

  let sum = 0, afterContrast = false;
  items.forEach((it, k) => {
    if (it.t === 'c') afterContrast = true;
    if (it.t === 'w' && /^[.!?;…]$/.test(it.w)) afterContrast = false;   // hết câu thì hết hiệu lực "nhưng"
    if (it.t !== 's') { it.score = 0; return; }

    let v = it.v;

    // Phủ định: nhìn lùi tối đa 2 token, không vượt qua dấu câu
    for (let d = 1; d <= 2; d++) {
      const p = items[k - d];
      if (!p || (p.t === 'w' && PUNCT.test(p.w))) break;
      if (p.t === 'n') { v = -v * 0.8; it.negated = true; break; }
    }

    // Nhấn mạnh: từ ngay trước hoặc ngay sau
    const near = [items[k - 1], items[k + 1]].find(x => x && x.t === 'i');
    if (near) { v *= near.v; it.boost = near.w; }

    if (afterContrast) v *= 1.5;
    if (sarcasm && v > 0) { v = -v * 0.6; it.ironic = true; }   // lời khen mỉa mai: đảo thành chê

    it.score = v;
    sum += v;
  });

  const exclaim = Math.min((text.match(/!/g) || []).length, 3);
  sum *= 1 + exclaim * 0.1;

  const score = Math.tanh(sum / 3);            // -1 .. +1
  const hasSignal = items.some(x => x.t === 's');
  const q = isQuestion(text);

  // Không có từ cảm xúc nào: không khẳng định "trung tính" bừa.
  //  - Là câu hỏi / xin thông tin -> trung tính (độ tin cậy vừa)
  //  - Còn lại -> "Chưa đủ thông tin"
  let label = labelOf(score), conf, reason;
  let viaModel = false;
  if (!hasSignal) {
    if (q) { label = 'Trung tính'; conf = 0.6; reason = 'Câu hỏi hoặc xin thông tin, không thấy từ bày tỏ cảm xúc.'; }
    else {
      // Từ điển không có gì để dựa vào: hỏi mô hình học máy nhẹ (Naive Bayes). Chỉ nhận khi đủ chắc.
      const m = nbPredict(text);
      if (m && m.p >= NB_MIN_P) {
        viaModel = true; label = m.label;
        conf = Math.min(0.65, 0.3 + 0.7 * (m.p - NB_MIN_P));   // mô hình yếu hơn từ điển nên tin cậy tối đa ở mức "Trung bình"
        reason = `Không có từ cảm xúc trong từ điển. Nhãn do mô hình học từ dữ liệu ước lượng (độ chắc ${Math.round(m.p * 100)}%), nên kém chắc hơn kết quả dựa trên từ điển.`;
      } else {
        label = UNKNOWN; conf = 0;
        reason = 'Không có từ, emoji nào trong từ điển mang cảm xúc và mô hình học máy cũng không đủ chắc. Có thể là cách nói mới hoặc ý nằm ngầm; hãy dạy từ mới hoặc gửi phản hồi.';
      }
    }
  } else if (label === 'Trung tính') {
    const pos = items.some(x => x.t === 's' && x.score > 0), neg = items.some(x => x.t === 's' && x.score < 0);
    conf = 0.4;
    reason = pos && neg ? 'Có cả từ khen lẫn chê, điểm triệt tiêu nhau.' : 'Chỉ có tín hiệu cảm xúc rất nhẹ.';
  } else {
    conf = Math.min(0.98, 0.35 + 0.75 * Math.abs(score));
    reason = '';
  }
  if (sarcasm && hasSignal) {
    conf = Math.min(conf, 0.6);   // luật suy đoán: không bao giờ báo "Cao"
    reason = 'Có dấu hiệu mỉa mai: lời khen đi kèm tình huống tiêu cực (chờ lâu, không được phản hồi...). Kết quả dựa trên luật nên kém chắc chắn.';
  }

  return applyCorrection(text, {
    items,
    score,
    label,
    noDia,
    hasSignal,
    unknown: label === UNKNOWN,
    viaModel,
    isQuestion: q,
    sarcasm,
    confidence: conf,
    level: confLevel(conf),
    reason,
  });
}

/* ---------- 1.4a Sửa theo phản hồi đã duyệt ----------
   Câu nào quản trị đã duyệt phản hồi (nhãn đúng) thì lần sau gặp lại đúng câu đó sẽ lấy nhãn đã duyệt,
   không dùng điểm từ điển. Chỉ khớp nguyên câu (bỏ hoa/thường, dấu câu, khoảng trắng). */
let CORR = Object.create(null);
const corrKey = t => String(t).toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function setCorrections(rows) {
  CORR = Object.create(null);
  (rows || []).forEach(r => { CORR[corrKey(r.text)] = r.label; });
}
function addCorrection(text, label) { CORR[corrKey(text)] = label; }
function applyCorrection(text, r) {
  const l = CORR[corrKey(text)];
  if (!l) return r;
  return { ...r, label: l, score: l === 'Tích cực' ? 0.6 : l === 'Tiêu cực' ? -0.6 : 0, unknown: false, viaModel: false,
    corrected: true, confidence: 0.95, level: confLevel(0.95),
    reason: 'Câu này đã được quản trị duyệt phản hồi, nên hệ thống lấy nhãn đã duyệt thay vì chấm theo từ điển.' };
}

// Câu hỏi: có dấu ? hoặc cụm hỏi thường gặp (\p{L} thay cho \b vì \b không hiểu chữ có dấu)
const Q_RE = new RegExp('(?<!\\p{L})(?:ở đâu|bao giờ|mấy giờ|bao lâu|bao nhiêu|khi nào|là gì|tên gì|ai biết|cho (?:mình |em |tôi )?(?:hỏi|xin)|không ạ|chưa ạ|vậy ạ|thế ạ|thế bạn|thế nhỉ|nhỉ|đúng không|phải không|được không|có không|hay không|vậy mọi người|vậy bạn|vậy admin|vậy shop|o dau|bao gio|may gio|khi nao)(?!\\p{L})', 'iu');
const isQuestion = t => /\?/.test(t) || Q_RE.test(t.toLowerCase().normalize('NFC'));

const confLevel = c => (c >= 0.7 ? 'Cao' : c >= 0.45 ? 'Trung bình' : 'Thấp');

/* ---------- 1.4b Mô hình dự phòng: Naive Bayes ----------
   Dùng khi từ điển không tìm thấy từ cảm xúc nào (điểm yếu lớn nhất của cách làm dựa trên từ điển).
   Học từ data.csv bằng train_nb.js, lưu ở public/model.json. Đặc trưng: từ đơn + cặp từ liền kề, đếm có/không.
   Chỉ nhận kết quả khi xác suất >= NB_MIN_P, còn lại vẫn là "Chưa đủ thông tin".                      */
const NB_LABELS = ['Tích cực', 'Trung tính', 'Tiêu cực'];
const NB_MIN_P = 0.6;
let NB = null;

function nbFeats(text) {
  const k = tokenize(text).filter(x => /[\p{L}\p{N}]/u.test(x) || /\p{Extended_Pictographic}/u.test(x));
  const f = new Set(k);
  for (let i = 0; i < k.length - 1; i++) f.add(k[i] + ' ' + k[i + 1]);
  return [...f];
}

// data: [{text, gold}]  ->  mô hình có thể lưu JSON
function nbTrain(data, minDf = 2, alpha = 1) {
  const df = {}, cnt = {}, n = {};
  NB_LABELS.forEach(l => { cnt[l] = {}; n[l] = 0; });
  for (const d of data) {
    if (!NB_LABELS.includes(d.gold)) continue;
    n[d.gold]++;
    for (const f of nbFeats(d.text)) { df[f] = (df[f] || 0) + 1; cnt[d.gold][f] = (cnt[d.gold][f] || 0) + 1; }
  }
  const keep = new Set(Object.keys(df).filter(f => df[f] >= minDf));
  for (const l of NB_LABELS) for (const f of Object.keys(cnt[l])) if (!keep.has(f)) delete cnt[l][f];
  return { alpha, n, cnt, features: keep.size };
}

function setModel(m) {
  if (!m || !m.cnt || !m.n) { NB = null; return; }
  const v = new Set();
  for (const l of NB_LABELS) for (const f of Object.keys(m.cnt[l] || {})) v.add(f);
  NB = { ...m, v };
}

function nbPredict(text) {
  if (!NB) return null;
  const f = nbFeats(text).filter(x => NB.v.has(x));
  if (!f.length) return null;                      // không có đặc trưng nào mô hình biết
  const sc = NB_LABELS.map(l => {
    let s = Math.log(1 / 3);
    for (const x of f) s += Math.log(((NB.cnt[l][x] || 0) + NB.alpha) / (NB.n[l] + 2 * NB.alpha));
    return s;
  });
  const mx = Math.max(...sc), ex = sc.map(x => Math.exp(x - mx)), z = ex.reduce((a, b) => a + b, 0);
  const p = ex.map(e => e / z), i = p.indexOf(Math.max(...p));
  return { label: NB_LABELS[i], p: p[i] };
}

/* ---------- 1.5 Phân tích theo khía cạnh ----------
   Tách bình luận thành các vế (theo dấu câu, "nhưng", "tuy nhiên"),
   chấm điểm từng vế rồi gán vào khía cạnh có từ khoá tương ứng.             */

const ASPECT_WORDS = {
  'Nội dung': 'video|clip|bai viet|bai dang|bai nay|phim|tap nay|tap phim|noi dung|status|story|reel|livestream|live|tin tuc|tin nay|chu de|kich ban|thong diep|bai hat|ca khuc|mv|album|chuong trinh|podcast|review|tieu de|thumbnail',
  'Nhân vật': 'ca si|nghe si|dien vien|idol|streamer|youtuber|tiktoker|kol|koc|chu kenh|admin|nguoi dang|mc|host|dien gia|nguoi noi tieng|cau thu|doi tuyen|hlv|huan luyen vien|anh ay|chi ay|co ay|ban ay|nhan vat|chu bai|tac gia|ban nay|anh nay|chi nay|co nay',
  'Hình thức': 'hinh anh|giong hat|giong noi|nhac nen|beat|loi bai hat|vu dao|dance|choreo|dien xuat|bien tap|dung phim|edit|quay phim|am thanh|phu de|sub|outfit|trang phuc|makeup|trang diem|phoi khi|hieu ung',
  'Cộng đồng': 'binh luan|comment|cmt|fan|antifan|anti|netizen|cdm|cong dong|dan mang|mn|moi nguoi|ae|anh em|nguoi xem|khan gia|nguoi ta|ban nao|troll|tranh cai|drama|ban luan|hater',
};
const ASPECT_RE = Object.fromEntries(
  Object.entries(ASPECT_WORDS).map(([k, w]) => [k, new RegExp('(^|[^a-z])(' + w + ')([^a-z]|$)')])
);
const CLAUSE_SPLIT =
  /[.!?;,\n]+|(?<!\p{L})(?:nhưng mà|nhưng|nhung ma|nhung|tuy nhiên|tuy nhien)(?!\p{L})/giu;

function aspects(text) {
  const acc = {};
  text.split(CLAUSE_SPLIT).map(s => s.trim()).filter(Boolean).forEach(clause => {
    const r = analyze(clause);
    if (!r.hasSignal) return;
    const plain = strip(clause.toLowerCase());
    let keys = Object.keys(ASPECT_RE).filter(k => ASPECT_RE[k].test(plain));
    if (!keys.length) keys = ['Chung'];
    keys.forEach(k => (acc[k] = acc[k] || []).push(r.score));
  });
  const out = {};
  for (const k in acc) out[k] = mean(acc[k]);
  return out;
}

/* ==== HẾT PHẦN LÕI · PHẦN GIAO DIỆN BÊN DƯỚI ==== */

/* =========================================================
   PHẦN 2 · GIAO DIỆN
   ========================================================= */

const $ = id => document.getElementById(id);

const SAMPLES = [
  'Clip này hay quá, xem mà thấy ấm lòng luôn 😍 Cảm ơn kênh nhiều!',
  'Nhảm nhí vl, câu view rõ ràng. Đúng là trà xanh 🙄',
  'Bài hát hay nhưng MV dựng hơi dài dòng.',
  'Chị này nói chuẩn quá, đồng tình 100% 👏',
  'Xem xong cạn lời, thiếu văn hóa hết sức. Tẩy chay!',
  'Cho mình hỏi bài nhạc nền đầu clip tên gì vậy ạ?',
  'khong the tin noi, qua te, drama nua roi',
  'Không tệ, nội dung ổn, xem giải trí được.',
  'Sân khấu cháy quá trời, idol diễn đỉnh cao 🔥 mãi yêu',
  '@nam.nguyen Tin giả đó, đừng share bậy bạ nữa.',
];
const MAX_BATCH = 2000;
const BAR_COLOR = { 'Tích cực': 'var(--pos)', 'Trung tính': 'var(--neu)', 'Tiêu cực': 'var(--neg)', [UNKNOWN]: 'var(--mute)' };
const tagOfR = r => (r.unknown ? 'u' : tagOf(r.score));   // class thẻ cho một kết quả phân tích
const confText = r => (r.unknown ? '' : `độ tin cậy ${r.level.toLowerCase()} (${Math.round(r.confidence * 100)}%)`);

const scrollToTop = () =>
  window.scrollTo({
    top: 0,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });

/* ---------- 2.1 Kết quả một bình luận ---------- */

function tokenHtml(it) {
  const cls = it.t === 's' ? (it.score >= 0 ? 'p' : 'n')
            : (it.t === 'n' || it.t === 'i' || it.t === 'c') ? 'm' : '';
  if (!cls) return esc(it.w);
  const tip = it.t === 's'
    ? `<small>${fmtScore(it.score)}${it.negated ? ' · phủ định' : ''}${it.boost ? ' · nhấn mạnh' : ''}${it.ctx ? ' · ngữ cảnh “' + esc(it.ctx) + '”' : ''}</small>`
    : '';
  return `<span class="t ${cls}">${esc(it.w)}${tip}</span>`;
}
const fmtScore = v => (v > 0 ? '+' : '') + v.toFixed(1);

function render(text) {
  const out = $('out');
  if (!text.trim()) {
    out.innerHTML = '<p class="note">Nhập một bình luận rồi bấm “Phân tích”.</p>';
    return;
  }

  const r = analyze(text);

  // Ghép token, không chèn khoảng trắng trước dấu câu
  let html = '';
  r.items.forEach((it, i) => {
    const space = i === 0 || /^[.,!?;:…)”"]$/.test(it.w) ? '' : ' ';
    html += space + tokenHtml(it);
  });

  // Khía cạnh
  const asp = aspects(text);
  const aspKeys = Object.keys(asp);
  const aspHtml = aspKeys.length
    ? '<h2 class="asp-title">Theo từng khía cạnh</h2><div class="asp-tags">' +
      aspKeys.map(k => `<span class="tag ${tagOf(asp[k])}">${esc(k)}: ${labelOf(asp[k])}</span>`).join('') +
      '</div>'
    : '';

  // Chỉ hiện nhãn kết quả (Tích cực / Trung tính / Tiêu cực / Chưa đủ thông tin), không kèm điểm, độ tin cậy hay lời giải thích
  const verdict = `<div class="verdict"><span class="label ${r.unknown ? 'unk' : clsOf(r.label)}">${r.unknown ? UNKNOWN : r.label}</span></div>`;

  out.innerHTML = `
    ${verdict}
    <div class="toks">${html}</div>
    <p class="note">${r.noDia ? 'Đã nhận diện bình luận không dấu. ' : ''}Xanh lá: từ tích cực · Đỏ: từ tiêu cực · Tím: từ phủ định, nhấn mạnh hoặc chuyển ý.</p>
    ${aspHtml}`;
}

/* ---------- 2.2 Bình luận mẫu ---------- */

function renderSamples() {
  const res = SAMPLES.map(analyze);

  $('list').innerHTML = SAMPLES.map((s, i) =>
    `<div class="cm" data-i="${i}" tabindex="0" role="button"><span>${esc(s)}</span><span class="tag ${tagOfR(res[i])}">${res[i].label}</span></div>`
  ).join('');

  const cnt = { 'Tích cực': 0, 'Trung tính': 0, 'Tiêu cực': 0, [UNKNOWN]: 0 };
  res.forEach(r => cnt[r.label]++);
  $('bars').innerHTML = Object.keys(cnt).map(k =>
    `<div class="bar"><span>${k}</span><div><b style="width:${cnt[k] / SAMPLES.length * 100}%;background:${BAR_COLOR[k]}"></b></div><span>${cnt[k]}</span></div>`
  ).join('');
}

/* ---------- 2.3 Phân tích hàng loạt ---------- */

let BR = [];   // kết quả lô hiện tại

// Chống chèn công thức khi mở CSV bằng Excel / Google Sheets
const csvCell = s => {
  let v = String(s);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return '"' + v.replace(/"/g, '""') + '"';
};

function runBatch() {
  const all = $('bt').value.split('\n').map(s => s.trim()).filter(Boolean);
  const lines = all.slice(0, MAX_BATCH);
  BR = lines.map(s => ({ s, r: analyze(s), a: aspects(s) }));

  const c = { 'Tích cực': 0, 'Trung tính': 0, 'Tiêu cực': 0, [UNKNOWN]: 0 };
  BR.forEach(x => c[x.r.label]++);
  const avg = mean(BR.filter(x => !x.r.unknown).map(x => x.r.score));   // câu "chưa đủ thông tin" không kéo điểm trung bình về 0

  $('bsum').innerHTML =
    `<p><b>${BR.length}</b> bình luận · điểm trung bình <b class="${clsOf(labelOf(avg))}">${(avg * 100).toFixed(0)}</b> · ` +
    `${c['Tích cực']} tích cực, ${c['Trung tính']} trung tính, ${c['Tiêu cực']} tiêu cực` +
    (c[UNKNOWN] ? `, <b>${c[UNKNOWN]}</b> chưa đủ thông tin (${(c[UNKNOWN] * 100 / BR.length).toFixed(0)}%)` : '') + '</p>' +
    (all.length > MAX_BATCH ? `<p class="note">Chỉ phân tích ${MAX_BATCH} dòng đầu tiên (bạn đã dán ${all.length} dòng).</p>` : '');

  // Điểm trung bình theo khía cạnh
  const ag = {};
  BR.forEach(x => { for (const k in x.a) (ag[k] = ag[k] || []).push(x.a[k]); });
  $('bag').innerHTML = Object.keys(ag).map(k => {
    const m = mean(ag[k]);
    return `<div class="bar w"><span>${esc(k)}</span><div><b style="width:${(m + 1) / 2 * 100}%;background:${BAR_COLOR[labelOf(m)]}"></b></div><span>${m > 0 ? '+' : ''}${(m * 100).toFixed(0)} (${ag[k].length})</span></div>`;
  }).join('');

  $('btb').innerHTML = BR.map((x, i) =>
    `<div class="cm" data-i="${i}" tabindex="0" role="button"><span>${esc(x.s)}</span><span class="tag ${tagOfR(x.r)}">${x.r.label}</span></div>`
  ).join('');

  $('bcsv').value =
    'binh_luan,cam_xuc,diem,do_tin_cay\n' +
    BR.map(x => `${csvCell(x.s)},${x.r.label},${x.r.unknown || x.r.viaModel ? '' : (x.r.score * 100).toFixed(0)},${(x.r.confidence * 100).toFixed(0)}`).join('\n');
}

/* ---------- 2.4 Sự kiện ---------- */

// Bấm (hoặc Enter/Space) vào một bình luận trong danh sách để xem chi tiết
function bindPick(container, getText) {
  const pick = e => {
    const c = e.target.closest('.cm');
    if (!c) return;
    $('in').value = getText(+c.dataset.i);
    render($('in').value);
    scrollToTop();
  };
  container.addEventListener('click', pick);
  container.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e); }
  });
}
bindPick($('list'), i => SAMPLES[i]);
bindPick($('btb'), i => BR[i].s);

$('go').onclick  = () => render($('in').value);
$('clr').onclick = () => { $('in').value = ''; render(''); };
$('in').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) render($('in').value);
});

$('bgo').onclick = runBatch;
$('bcp').onclick = async () => {
  const m = $('bcm');
  try {
    await navigator.clipboard.writeText($('bcsv').value);
    m.textContent = 'Đã sao chép.';
  } catch (err) {
    m.textContent = 'Không sao chép được. Mở “Xem CSV” để tự sao chép.';
  }
};

// Đọc CSV (có ngoặc kép, dấu phẩy và xuống dòng trong ô)
function parseCsvText(txt) {
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
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some(x => x.trim() !== '')) rows.push(row); }
  return rows;
}

$('bup').onclick = () => $('bfile').click();
$('bfile').onchange = async e => {
  const f = e.target.files[0], m = $('bcm');
  e.target.value = '';
  if (!f) return;
  if (f.size > 2 * 1024 * 1024) { m.textContent = 'Tệp quá lớn (tối đa 2 MB).'; return; }
  try {
    const txt = await f.text();
    let lines;
    if (/\.csv$/i.test(f.name)) {
      const rows = parseCsvText(txt);
      const HEAD = /^(binh_luan|binh luan|comment|noi_dung|noi dung|text|content)$/i;
      const hi = rows.length ? rows[0].findIndex(h => HEAD.test(strip(h.trim()))) : -1;
      const col = hi >= 0 ? hi : 0;
      lines = (hi >= 0 ? rows.slice(1) : rows).map(r => (r[col] || '').replace(/\s+/g, ' ').trim());
    } else {
      lines = txt.split(/\r?\n/).map(x => x.trim());
    }
    lines = lines.filter(Boolean);
    if (!lines.length) { m.textContent = 'Không tìm thấy bình luận nào trong tệp.'; return; }
    $('bt').value = lines.join('\n');
    runBatch();
    m.textContent = `Đã nạp ${Math.min(lines.length, MAX_BATCH)} bình luận từ “${f.name}”.`;
  } catch (err) { m.textContent = 'Không đọc được tệp.'; }
};
$('bdl').onclick = () => {
  if (!BR.length) { $('bcm').textContent = 'Chưa có kết quả để tải.'; return; }
  const url = URL.createObjectURL(new Blob(['\uFEFF' + $('bcsv').value], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'ket_qua_phan_tich.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Dạy hệ thống từ mới (chỉ có hiệu lực trong phiên hiện tại)
function teachWord() {
  const msg = $('lm');
  const raw = $('lw').value.trim();
  const n = tokenize(raw).length;
  if (!n) { msg.textContent = 'Hãy nhập một từ hoặc cụm từ.'; return; }
  if (n > MAX_NGRAM) { msg.textContent = `Cụm từ tối đa ${MAX_NGRAM} từ.`; return; }

  const v = +$('lv').value;
  const key = setWord(raw, { t: 's', v }, true);
  const saved = typeof saveUserWord === 'function' && saveUserWord(key, v);
  msg.textContent = `Đã thêm “${key}” (${v > 0 ? '+' : ''}${v})` +
    (saved ? ' và lưu vào tài khoản.' : '. Đăng nhập để lưu lại cho lần sau.');
  $('lw').value = '';
  if ($('lsug').checked && typeof suggestWord === 'function') suggestWord(key, v);

  render($('in').value);
  renderSamples();
  runBatch();
  if (typeof renderMine === 'function') renderMine();
}
$('lx').onclick = teachWord;
$('lw').addEventListener('keydown', e => { if (e.key === 'Enter') teachWord(); });

/* ---------- 2.5 Khởi động ---------- */
$('bt').value = SAMPLES.join('\n');
renderSamples();
runBatch();
render($('in').value);
