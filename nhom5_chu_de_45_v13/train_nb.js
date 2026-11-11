/* =========================================================
   train_nb.js · Huấn luyện mô hình dự phòng Naive Bayes -> public/model.json
   Chạy: node train_nb.js [data.csv ...]      (có thể thêm file phản hồi đã duyệt tải từ màn hình Duyệt đóng góp)
   Lưu ý: nếu muốn đo độ chính xác, KHÔNG huấn luyện trên chính tập kiểm tra.
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const { readCsv } = require('./csvread');
const E = require('./engine')({ model: false });

const files = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!files.length) files.push(path.join(__dirname, 'data.csv'));
const data = files.flatMap(f => readCsv(f));
const model = E.nbTrain(data, 2, 1);
fs.writeFileSync(path.join(__dirname, 'public', 'model.json'), JSON.stringify(model));
console.log(`Đã huấn luyện trên ${data.length} bình luận từ ${files.length} tệp, ${model.features} đặc trưng -> public/model.json`);
console.log('Số mẫu mỗi lớp:', JSON.stringify(model.n));
