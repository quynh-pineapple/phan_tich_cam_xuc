# Cập nhật theo bảng ưu tiên khắc phục

## 1. Đánh giá mô hình (`node eval.js`)
- `npm run eval`: chia `data.csv` 80/20 theo tỉ lệ nhãn (seed 42), in accuracy, precision/recall/F1 từng lớp, macro-F1 và ma trận nhầm lẫn.
- `npm run eval:indep`: chạy trên `test_independent.csv` (72 câu viết mới, không nhìn từ điển khi viết) kèm danh sách câu sai.
- Kết quả đã chạy nằm trong `ket_qua_danh_gia.txt`.
- **Lưu ý khi đưa vào báo cáo:** từ điển hiện là từ điển tay nên không có rò rỉ dữ liệu, nhưng nó được xây dựng trên cùng kiểu câu với `data.csv`
  nên con số trên `data.csv` cao hơn thực tế. Bộ độc lập phản ánh sát hơn; nó chỉ có 72 câu nên sai số lớn (khoảng ±10 điểm %).
- Nếu sau này dùng `train_lexicon.py`, chỉ huấn luyện trên tập train, tránh số liệu kiểm tra cao giả.

## 2. Trạng thái "Chưa đủ thông tin" + độ tin cậy
- `analyze()` trả thêm `unknown`, `confidence`, `level`, `reason`.
- Không có từ/emoji cảm xúc nào: nếu là câu hỏi thì Trung tính (tin cậy vừa), còn lại là "Chưa đủ thông tin" (không đoán bừa).
- Có tín hiệu: độ tin cậy tăng theo |điểm|; khen chê triệt tiêu nhau thì tin cậy thấp kèm lý do.
- Giao diện: thanh tin cậy, dòng giải thích, thẻ xám; thống kê batch có mục riêng; CSV thêm cột `do_tin_cay`.
- Câu "Chưa đủ thông tin" vẫn được lưu lịch sử và cho phép gửi phản hồi nhãn đúng.

## 3. Bảo mật khi chạy production
- `NODE_ENV=production` mà thiếu `ADMIN_USER`: server dừng với thông báo rõ ràng (trước đây người đăng ký đầu tiên trở thành quản trị).
- Production tự chuyển http sang https (đọc `X-Forwarded-Proto`; đặt `FORCE_HTTPS=0` để tắt khi thử nội bộ), cookie `Secure`, thêm HSTS.
- Thêm header bảo mật (CSP, nosniff, X-Frame-Options, Referrer-Policy, COOP/CORP, Permissions-Policy), tắt `X-Powered-By`, API không cache.
  Viết tay thay vì cài `helmet` để không thêm phụ thuộc; muốn dùng helmet thì `npm i helmet` và thay khối header trong `server.js`.

## 4. Lịch sử, duyệt phản hồi, từ đóng góp
- Màn hình **Lịch sử** (người dùng): 200 lượt gần nhất, nhãn hệ thống, nhãn đúng đã báo; bấm "Xem" để phân tích lại; nút xóa toàn bộ.
- Màn hình **Duyệt đóng góp** (chỉ quản trị): duyệt/từ chối phản hồi "kết quả sai" và từ đề xuất. Từ đề xuất được duyệt vào từ điển chung ngay.
- Nút **Tải CSV phản hồi đã duyệt** (`binh_luan,nhan`) để đưa vào `eval.js` hoặc `train_lexicon.py`.
- Ở màn hình Từ điển có ô "Đề xuất từ này cho từ điển chung".
- CSDL cũ tự thêm cột/bảng mới, không mất dữ liệu. Câu đã có phản hồi không còn bị dọn khi vượt 500 lượt.

## 5. Unit test
- `npm test`: 42 test đạt cho `analyze()` (từ khen/chê, phủ định, "nhưng", không dấu, teencode, @tag/link, ngữ cảnh, câu hỏi, câu không đủ thông tin, giới hạn điểm, độ tin cậy).
- 2 test đánh dấu `todo` là lỗi đã biết: mỉa mai và từ "hay" nghĩa "hoặc".

## 6. Tải CSV, đổi mật khẩu, bỏ reload
- Hàng loạt: nút **Tải tệp lên** (.csv/.txt, tối đa 2 MB, 2000 dòng; nhận cột `binh_luan`/`comment`/... hoặc cột đầu) và **Tải CSV về**.
- Màn hình **Tài khoản**: đổi mật khẩu (phải đúng mật khẩu cũ, các thiết bị khác bị đăng xuất, có giới hạn thử sai).
- Xóa từ riêng, xóa từ chung, thêm/xóa luật ngữ cảnh không còn `location.reload()`: cập nhật tại chỗ.

## 7. Nâng cấp phương pháp: mô hình dự phòng Naive Bayes
Không dùng được PhoBERT/thư viện tách từ (cần tải từ mạng và đủ dữ liệu), nên làm bản nhẹ, không cần cài gói:
- Khi từ điển không tìm thấy từ cảm xúc nào và không phải câu hỏi, `analyze()` hỏi mô hình Naive Bayes (từ đơn + cặp từ liền kề).
  Chỉ nhận khi xác suất >= 0,6; còn lại vẫn "Chưa đủ thông tin". Kết quả từ mô hình có độ tin cậy tối đa 65% và ghi rõ "do mô hình học máy".
  Mô hình không bao giờ ghi đè kết quả của từ điển.
- Huấn luyện: `npm run train` (đọc `data.csv`, ghi `public/model.json`). Có thể thêm CSV phản hồi đã duyệt:
  `node train_nb.js data.csv phan_hoi_da_duyet.csv`.
- Đo: `npm run eval` và `npm run eval:indep` tự huấn luyện mô hình đúng cách (trên `data.csv` chỉ dùng phần train); thêm `--no-model` để so sánh với bản chỉ từ điển.

Kết quả trên bộ độc lập 72 câu (huấn luyện chỉ trên `data.csv`):

| | Chỉ từ điển | Từ điển + mô hình |
|---|---|---|
| Accuracy (câu bỏ qua tính là sai) | 69,4% | 83,3% |
| Macro-F1 | 76,7% | 86,1% |
| Câu hệ thống dám trả lời | 77,8% | 93,1% |
| Accuracy trên câu đã trả lời | 89,3% | 89,6% |

Lưu ý trung thực: ngưỡng 0,6 được chọn sau khi đã xem bộ độc lập này nên con số hơi lạc quan; bộ chỉ có 72 câu (sai số khoảng ±9 điểm %).
Trong 11 câu dùng mô hình thì 10 câu đúng. Mô hình học từ 230 câu nên sẽ yếu với chủ đề lạ; hãy gom thêm dữ liệu qua màn hình phản hồi rồi huấn luyện lại.
Vẫn chưa xử lý được mỉa mai và từ "hay" nghĩa "hoặc" (2 test `todo`).

## 8. Chạy được ngay bằng `npm start`, không cần `npm install`
- Bỏ cả 3 thư viện ngoài (`better-sqlite3` lỗi biên dịch trên Node 24, `express`, `bcryptjs`).
- `sqlite.js`: bọc `node:sqlite` có sẵn trong Node >= 22.13, giữ nguyên cách gọi `prepare/get/all/run/transaction`.
- `mini-express.js`: máy chủ web tối giản (http, fs) có đúng phần API express mà `server.js` dùng.
- `bcrypt-lite.js`: băm mật khẩu bằng scrypt của Node, thay `bcryptjs`.
- Không cần mạng, không cần Visual Studio. Node in một dòng "ExperimentalWarning: SQLite" là bình thường.
- Lưu ý: mật khẩu lưu bằng bcrypt trong `app.db` cũ sẽ không đăng nhập được; xóa `app.db` rồi đăng ký lại.


## Tài khoản quản trị riêng
- Server tự tạo tài khoản `admin` khi khởi động (đổi tên bằng `ADMIN_USER`). Không còn chuyện người đăng ký đầu tiên thành quản trị.
- Mật khẩu: đặt bằng `ADMIN_PASSWORD`; nếu không đặt, lần chạy đầu sẽ sinh mật khẩu ngẫu nhiên và in ra console một lần. Có đặt `ADMIN_PASSWORD` thì mỗi lần chạy mật khẩu admin được đồng bộ lại (dùng để lấy lại khi quên).
- Trang đăng ký không cho tạo tên trùng tên quản trị.


## Cải tiến nhận diện mỉa mai (v11)
- Mở rộng luật tình huống tiêu cực đi kèm lời khen: buồn ngủ/ngáp, tắt/tua/thoát giữa chừng, phí thời gian, "đừng làm nữa", giật lag, chưa tải xong, quảng cáo nhiều hơn nội dung, v.v. (`SARCASM_SITUATION` trong `public/script.js`).
- Luật phủ định ("xem không ngủ gật được", "không thể tắt giữa chừng") và từ bảo vệ ("xứng đáng", "đáng chờ") để tránh nhầm khen thật thành mỉa mai. Thêm từ khen: xứng đáng, đáng chờ, đáng đợi.
- Từ chê nằm ngay trong vế mô tả hậu quả (vd "lag", "buồn ngủ") không còn chặn nhận diện mỉa mai.
- `data.csv` thêm 34 câu có nhãn (mỉa mai, khen thật có từ dễ nhầm, trung tính); `public/model.json` huấn luyện lại.
- Tập kiểm tra mới: `test_sarcasm.csv` (`npm run eval:sarcasm`) và `test_holdout.csv` (`npm run eval:holdout`). Bộ holdout viết sau khi chỉnh luật nên đáng tin hơn; số liệu trước/sau trong `ket_qua_danh_gia.txt`.
- Đã thử cho mô hình Naive Bayes hỗ trợ khi từ điển yếu: không cải thiện nên không đưa vào.
- Chưa làm: mô hình học sâu (PhoBERT...). Môi trường làm việc không tải được mô hình từ Hugging Face và không có PyTorch; cần máy có mạng và GPU/CPU đủ mạnh.


## Mật khẩu admin mặc định (v13)
- Không đặt `ADMIN_PASSWORD` thì tài khoản `admin` có mật khẩu mặc định `123456` (mỗi lần chạy được đồng bộ lại). Đổi bằng cách đặt `ADMIN_PASSWORD`.
- Chạy `NODE_ENV=production` mà chưa đặt `ADMIN_PASSWORD`: server dừng với thông báo, tránh dùng mật khẩu mặc định khi đưa lên mạng.
