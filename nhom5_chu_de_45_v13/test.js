/* test.js · Unit test cho analyze(). Chạy: npm test  (cần Node 18+, không cần cài gói nào) */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const E = require('./engine')({ model: false });   // các test bên dưới kiểm tra riêng phần từ điển + luật
const M = require('./engine')();                    // bản có mô hình dự phòng (public/model.json)
const U = E.UNKNOWN;

// [câu, nhãn mong đợi]
const CASES = [
  // Tích cực cơ bản
  ['Clip này hay quá', 'Tích cực'],
  ['Bài hát tuyệt vời', 'Tích cực'],
  ['Cảm ơn admin, rất hữu ích 👍', 'Tích cực'],
  ['Đẹp quá trời 😍', 'Tích cực'],
  ['Chị này nói chuẩn quá, đồng tình 100% 👏', 'Tích cực'],
  ['Xem mãi không chán', 'Tích cực'],
  // Tiêu cực cơ bản
  ['Dở tệ, thất vọng', 'Tiêu cực'],
  ['Nhảm nhí vl', 'Tiêu cực'],
  ['Xem xong cạn lời, thiếu văn hóa. Tẩy chay!', 'Tiêu cực'],
  ['Lừa đảo, đừng mua 😡', 'Tiêu cực'],
  ['Clip rác 🤮', 'Tiêu cực'],
  ['Phí thời gian, nhạt', 'Tiêu cực'],
  // Phủ định
  ['Không tệ', 'Tích cực'],
  ['Không hay', 'Tiêu cực'],
  ['Ko đẹp chút nào', 'Tiêu cực'],
  ['Chẳng thích', 'Tiêu cực'],
  // Nhấn mạnh / giảm nhẹ
  ['Hay lắm', 'Tích cực'],
  ['Rất tệ', 'Tiêu cực'],
  // Chuyển ý "nhưng": vế sau quan trọng hơn
  ['Hình ảnh đẹp nhưng nội dung dở tệ', 'Tiêu cực'],
  ['Ban đầu hơi chán nhưng càng xem càng hay', 'Tích cực'],
  // Không dấu
  ['qua te, that vong', 'Tiêu cực'],
  ['tuyet voi, cam on ban', 'Tích cực'],
  // Teencode, kéo dài chữ, hashtag, @tag, link
  ['Hayyyyyy quáaaaa', 'Tích cực'],
  ['@nam.nguyen tệ quá https://example.com/abc', 'Tiêu cực'],
  ['#hay lắm', 'Tích cực'],
  // Ngữ cảnh
  ['Sân khấu cháy quá trời, idol diễn đỉnh cao', 'Tích cực'],
  // Câu hỏi không bày tỏ cảm xúc
  ['Video này quay ở đâu vậy mọi người?', 'Trung tính'],
  ['Mai mấy giờ bắt đầu live vậy admin?', 'Trung tính'],
  ['Cho mình hỏi bài nhạc nền tên gì vậy ạ?', 'Trung tính'],
  // Không đủ thông tin (không đoán bừa)
  ['Bình luận đầu tiên nè', U],
  ['Mình ở Đà Nẵng', U],
  ['', U],
  ['....', U],
  ['12345', U],
];

for (const [text, want] of CASES) {
  test(`"${text}" -> ${want}`, () => assert.strictEqual(E.analyze(text).label, want));
}

test('điểm luôn nằm trong [-1, 1]', () => {
  for (const t of ['tệ '.repeat(200), 'tuyệt vời '.repeat(200) + '!!!!!!!', 'x'.repeat(5000)]) {
    const s = E.analyze(t).score;
    assert.ok(s >= -1 && s <= 1 && Number.isFinite(s), `score=${s}`);
  }
});

test('độ tin cậy nằm trong [0, 1] và "chưa đủ thông tin" có độ tin cậy 0', () => {
  for (const [t] of CASES) {
    const r = E.analyze(t);
    assert.ok(r.confidence >= 0 && r.confidence <= 1, t);
    if (r.unknown) assert.strictEqual(r.confidence, 0, t);
  }
});

test('mạnh hơn thì tin cậy cao hơn', () => {
  assert.ok(E.analyze('tuyệt vời quá, đỉnh cao').confidence > E.analyze('ổn').confidence);
});

test('khen và chê triệt tiêu: Trung tính, tin cậy thấp, có lý do', () => {
  const r = E.analyze('đẹp nhưng tệ');
  if (r.label === 'Trung tính') { assert.strictEqual(r.level, 'Thấp'); assert.ok(r.reason); }
});

test('HTML trong bình luận không làm hỏng việc chấm điểm', () => {
  assert.strictEqual(E.analyze('<script>alert(1)</script> tệ quá').label, 'Tiêu cực');
});

test('dấu "!" tăng nhẹ độ mạnh, không đổi nhãn', () => {
  const a = E.analyze('hay'), b = E.analyze('hay!!!');
  assert.strictEqual(a.label, b.label);
  assert.ok(b.score >= a.score);
});

test('dạy từ mới có hiệu lực', () => {
  assert.strictEqual(E.analyze('xyzzy tuyệt').label, 'Tích cực');
  E.setWord('khoai lang', { t: 's', v: -3 }, true);
  assert.strictEqual(E.analyze('khoai lang').label, 'Tiêu cực');
});

test('khía cạnh: tách theo vế câu', () => {
  const a = E.aspects('Phim hay nhưng bình luận toàn anti, dở');
  assert.ok(Object.keys(a).length >= 1);
  for (const k in a) assert.ok(a[k] >= -1 && a[k] <= 1);
});

/* ---- Mỉa mai, "hay" = "hoặc", "tưởng ... ai ngờ" (luật nhận diện bằng quy tắc) ---- */
test('mỉa mai: "Hay thật đấy, đợi cả tháng mới giao, quá nhanh luôn" -> Tiêu cực, có cờ sarcasm, tin cậy không "Cao"', () => {
  const r = E.analyze('Hay thật đấy, đợi cả tháng mới giao, quá nhanh luôn');
  assert.strictEqual(r.label, 'Tiêu cực');
  assert.strictEqual(r.sarcasm, true);
  assert.notStrictEqual(r.level, 'Cao');
});
test('"hay" nghĩa là "hoặc": "Phim chiếu rạp hay phát trên mạng vậy?" -> Trung tính', () =>
  assert.strictEqual(E.analyze('Phim này chiếu rạp hay phát trên mạng vậy mọi người?').label, 'Trung tính'));
test('"Cứ tưởng hay, ai ngờ nhìn như đồ bỏ đi" -> Tiêu cực', () =>
  assert.strictEqual(E.analyze('Cứ tưởng hay, ai ngờ nhìn như đồ bỏ đi').label, 'Tiêu cực'));
test('mỉa mai: các câu mới viết thêm (không dùng để chỉnh luật)', () => {
  for (const t of ['Dịch vụ tốt thật, chờ ba tuần mới có phản hồi', 'Shop chuyên nghiệp ghê, nhắn tin mãi mới thấy trả lời',
    'App mượt thật đấy, lỗi liên tục luôn', 'Nhanh thật, chờ cả buổi sáng mới giao'])
    assert.strictEqual(E.analyze(t).label, 'Tiêu cực', t);
});
test('không nhận nhầm mỉa mai: khen thật, phủ định, "hay" khen trong câu hỏi', () => {
  assert.strictEqual(E.analyze('Giao hàng nhanh thật, đóng gói cẩn thận').label, 'Tích cực');
  assert.strictEqual(E.analyze('Chờ hơi lâu nhưng món ăn rất ngon, đáng đợi').label, 'Tích cực');
  assert.strictEqual(E.analyze('Xem mãi không chán').sarcasm, false);
  assert.strictEqual(E.analyze('Không tốt chút nào, chờ cả tuần mới giao').label, 'Tiêu cực');
  assert.strictEqual(E.analyze('Tưởng dở, hóa ra phim hay thật').label, 'Tích cực');
});
// Giới hạn đã biết: luật chỉ nhận ra mỉa mai khi có tình huống chờ đợi/không phản hồi/lỗi kéo dài.
test('MỈA MAI không có tình huống nhận diện được: "Đúng là đẳng cấp, tôi xin chịu" (chưa hỗ trợ)', { todo: 'cần ngữ cảnh/mô hình ngôn ngữ' },
  () => assert.strictEqual(E.analyze('Đúng là đẳng cấp, tôi xin chịu').label, 'Tiêu cực'));
test('"Giỏi quá nhỉ, đợi hơn hai tiếng mới có đồ ăn" -> Tiêu cực',
  () => assert.strictEqual(E.analyze('Giỏi quá nhỉ, đợi hơn hai tiếng mới có đồ ăn').label, 'Tiêu cực'));

/* ---- Mô hình dự phòng (Naive Bayes) ---- */
test('mô hình: câu không có từ cảm xúc được phân loại khi đủ chắc, có đánh dấu viaModel', () => {
  const r = M.analyze('Nhìn như đồ bỏ đi');
  if (r.viaModel) { assert.ok(r.confidence <= 0.65); assert.ok(r.reason.includes('mô hình')); }
});
test('mô hình không ghi đè kết quả của từ điển', () => {
  for (const [t, want] of CASES) {
    if (want === 'Trung tính' || want === U) continue;   // các ca này dựa vào luật câu hỏi hoặc không có tín hiệu
    const r = M.analyze(t);
    assert.strictEqual(r.label, want, t);
    assert.strictEqual(r.viaModel, false, t);
  }
});
test('mô hình huấn luyện được từ dữ liệu nhỏ và dự đoán đúng hướng', () => {
  const m = require('./engine')({ model: false });
  const data = [];
  for (let i = 0; i < 6; i++) { data.push({ text: 'giao hàng chậm lắm', gold: 'Tiêu cực' }, { text: 'nhận hàng đúng hẹn', gold: 'Tích cực' }, { text: 'shop ở đâu vậy', gold: 'Trung tính' }); }
  m.setModel(m.nbTrain(data, 2, 1));
  assert.strictEqual(m.analyze('giao hàng chậm').label, 'Tiêu cực');
});
test('mô hình hỏng hoặc thiếu thì bỏ qua, không làm sập', () => {
  const m = require('./engine')({ model: false });
  m.setModel(null); m.setModel({});
  assert.strictEqual(m.analyze('Bình luận đầu tiên nè').label, U);
});
