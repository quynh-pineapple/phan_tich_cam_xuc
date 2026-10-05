/* =========================================================
   TỪ ĐIỂN TỪ LÓNG & TREND (Gen Z / mạng xã hội)
   Cập nhật: 10/2026. Từ lóng đổi rất nhanh, hãy rà lại định kỳ.
   Định dạng: "từ=điểm|từ=điểm"  (điểm từ -4 đến +4)
   ========================================================= */
'use strict';

// Từ lóng tích cực
const SLANG_POS =
  'xịn xò=2.5|xịn mịn=2.5|đỉnh nóc kịch trần=3|đỉnh của chóp=3|đỉnh chóp=3|đỉnh kout=3|nóc nhà=2.5|' +
  'hết nước chấm=3|hết sảy=3|bá cháy=3|bá đạo=2.5|cực phẩm=3|xuất sắc=3|slay=2.5|best=2|perfect=3|love=2.5|' +
  'xỉu up xỉu down=2.5|xinh xỉu=2.5|ngon xỉu=3|cưng xỉu=2.5|dễ thương xỉu=2.5|đã quá=2.5|mê tít=2.5|' +
  'ghiền=2|gây nghiện=2|nghiện=1.5|iu=2.5|mãi đỉnh=2.5|mãi mận=2|mãi yêu=2.5|lên hương=2|ngầu=2|lung linh=2|' +
  'ngon bổ rẻ=3|đáng đồng tiền bát gạo=2.5|vừa ý=2|ưng bụng=2|ưng ý=2|auto mua=2|chốt đơn=1.5|' +
  'chuẩn cơm mẹ nấu=3|green flag=2.5|gét gô=1.5|wow=1.5|chill phết=2|ngọt=1|mlem mlem=2.5|cháy phố=2|' +
  'đỉnh quá=3|ổn áp=2|xịn sò=2.5|đáng đồng tiền=2.5|có tâm=2|quá đã=2.5|vãi chưởng=2|đẳng cấp=2.5|' +
  'tuyệt cú mèo=3|chất lừ=2.5|chất phát ngất=2.5|nét căng=2.5|gọn gàng=1.5';

// Từ lóng tiêu cực
const SLANG_NEG =
  'cringe=-2.5|xàm=-2|xàm xí=-2|nhạt nhẽo=-2|nhạt=-1.5|dở ẹc=-3|chê=-2|chê chết=-3|toxic=-3|ê chề=-3|' +
  'cú lừa=-3|bể kèo=-2|bùng kèo=-2.5|bùng hàng=-3|bom hàng=-3|boom hàng=-3|hãm=-2|hãm lờ=-2.5|xạo=-2.5|' +
  'xạo ke=-3|mệt mỏi=-1.5|trầm cảm=-1.5|hết cứu=-3|hết thuốc chữa=-3|ảo ma=-2.5|ảo tưởng=-2|lố=-1.5|' +
  'quê=-2|quê xệ=-2.5|ngứa mắt=-2|tuột mood=-2|mất hứng=-2|bad=-2|lag=-1.5|đơ=-1.5|sập=-2|chán đời=-2.5|' +
  'bực mình=-2|tức xì khói=-2.5|ức chế=-2.5|mất mặt=-2|rởm=-3|đồ rởm=-3|thôi xong=-2|xong phim=-2|' +
  'xong đời=-2.5|tạch=-2|red flag=-2.5|khó đỡ=-1.5|dô diên=-2|ét o ét=-1.5|ná thở=-1.5|ăn hành=-1.5|' +
  'rén=-1|nản=-2|nản lòng=-2.5|đu trend lố=-1.5|làm màu=-1.5|sống ảo=-1.5|câu view=-2|câu like=-1.5|' +
  'drama=-1|lố bịch=-2.5|vô tri=-1|vớ vẩn=-2|dở hơi=-2|không có tâm=-2.5|ăn không ngồi rồi=-1.5';

// Từ nhấn mạnh kiểu mạng xã hội
const SLANG_INT =
  'dã man=1.6|kinh khủng=1.5|khủng khiếp=1.5|xỉu=1.4|phết=1.2|dữ dội=1.5|' +
  'cực=1.5|real=1.2|điên=1.4|tởm=1.4';

// Từ phủ định kiểu mạng xã hội
const SLANG_NOT = 'hổng|hong|đếch|đéo|ko có|chả có|đâu phải|không hề';

// Luật ngữ cảnh cho từ nhiều nghĩa. Định dạng: từ>ngữ cảnh 1,ngữ cảnh 2=điểm
// Từ nào đứng gần từ đó (cùng vế câu, cách tối đa 6 từ) thì quyết định điểm.
const SLANG_CTX =
  'cháy>áo,quần,váy,giày,outfit,set đồ,hàng,đơn,vé,phố,sân khấu,concert=2|' +
  'cháy>đồ ăn,món,bánh,cơm,thịt,cá,nướng,khét,nồi,bếp,gà=-2.5|' +
  'cháy>máy,pin,nhà,xe,điện,laptop,điện thoại,sạc=-3|' +
  'nóng>đồ ăn,món,canh,phở,cơm,bún,lẩu,trà,cà phê=1.5|' +
  'nóng>máy,phòng,trời,laptop,điện thoại,quạt,áo=-2|' +
  'khô>da,tóc,môi,họng,tay,vải,mặt=-1.5|' +
  'khô>cơm,gà,thịt,bánh,món,đồ ăn,bò=-2';
