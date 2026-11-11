/* =========================================================
   TỪ ĐIỂN TỪ LÓNG & TREND CỦA BÌNH LUẬN MẠNG XÃ HỘI (Facebook, YouTube, TikTok, Threads...)
   Cập nhật: 10/2026. Từ lóng đổi rất nhanh, hãy rà lại định kỳ.
   Định dạng: "từ=điểm|từ=điểm"  (điểm từ -4 đến +4)
   Đổi nội dung file này thì tăng LEXICON_VERSION trong server.js để CSDL cũ nạp lại.
   ========================================================= */
'use strict';

// Từ lóng tích cực: khen video, bài đăng, nghệ sĩ, người đăng
const SLANG_POS =
  'nhanh=1.5|nhanh chóng=2|chuyên nghiệp=2|giỏi=2|cẩn thận=1.5|xịn xò=2.5|xịn mịn=2.5|xịn sò=2.5|đỉnh nóc kịch trần=3|đỉnh của chóp=3|đỉnh chóp=3|đỉnh kout=3|nóc nhà=2.5|' +
  'hết nước chấm=3|hết sảy=3|bá cháy=3|bá đạo=2.5|cực phẩm=3|slay=2.5|best=2|perfect=3|love=2.5|' +
  'xỉu up xỉu down=2.5|xinh xỉu=2.5|cưng xỉu=2.5|dễ thương xỉu=2.5|cười xỉu=2.5|hài xỉu=2.5|đã quá=2.5|quá đã=2.5|mê tít=2.5|' +
  'ghiền=2|gây nghiện=2|nghiện=1.5|nghe nghiện=2.5|xem nghiện=2.5|iu=2.5|mãi đỉnh=2.5|mãi mận=2|mãi yêu=2.5|mãi bên nhau=2|' +
  'lên hương=2|ngầu=2|lung linh=2|chất lừ=2.5|chất phát ngất=2.5|nét căng=2.5|đẳng cấp=2.5|tuyệt cú mèo=3|' +
  'cười ná thở=2.5|cười sặc=2.5|cười đau bụng=2.5|cười bể bụng=2.5|cười rụng rốn=2.5|hài vãi=2.5|hài quá=2.5|' +
  'xem 10 lần vẫn cười=3|xem hoài không chán=3|nghe đi nghe lại=2.5|nghe hoài không chán=3|replay=2|' +
  'khóc ròng vì hay=2.5|rơi nước mắt=1.5|nổi da gà=2.5|nổi hết da gà=3|lạnh sống lưng vì hay=2|' +
  'ngọt=1|mlem=2|mlem mlem=2.5|chill phết=2|ổn áp=2|green flag=2.5|gét gô=1.5|wow=1.5|' +
  'cháy phố=2|đỉnh quá=3|đỉnh luôn=3|xuất sắc=3|' +
  'idol của tôi=2.5|chị đẹp=1.5|anh đẹp=1.5|nữ thần=2.5|thần tượng=2.5|thiên thần=2.5|visual đỉnh=3|visual đỉnh cao=3|' +
  'giọng hát đỉnh=3|giọng ca vàng=3|live đỉnh=3|live cực đỉnh=3|hát live đỉnh=3|' +
  'bùng nổ=2|bùng cháy=2|thăng hoa=2.5|phá đảo=2.5|làm nên chuyện=2|' +
  'chuẩn không cần chỉnh=3|không cần chỉnh=2.5|nói đúng tim đen=2.5|đúng ý tôi=2|nói hộ lòng tôi=2.5|nói hộ tui=2.5|' +
  'tâm lý=1.5|có tâm=2|có tầm=2|tử tế=2|đáng ngưỡng mộ=2.5|đáng nể=2.5|đáng khâm phục=3|' +
  'kênh hay=2.5|kênh chất lượng=2.5|bài viết hay=2.5|bài viết ý nghĩa=2.5|bài học hay=2.5|' +
  'đã sub=1.5|đã follow=1.5|đã theo dõi=1.5|đã đăng ký kênh=1.5|ủng hộ kênh=2.5|ủng hộ idol=2.5|' +
  'chúc mừng=2|bình yên quá=2.5|trong trẻo=2|thanh xuân=1.5|nhẹ lòng=2|chữa lành quá=3|' +
  'đúng chuẩn=2.5|chuẩn bài=2.5|chuẩn gu=2.5|chuẩn chỉnh=2|đúng gu=2.5|hợp gu=2|đỉnh cao nghệ thuật=3';

// Từ lóng tiêu cực: chê, chửi, tranh cãi, drama
const SLANG_NEG =
  'đồ bỏ đi=-2.5|muốn đập=-2.5|chỉ muốn đập=-2.5|cringe=-2.5|xàm=-2|xàm xí=-2|xàm lờ=-2.5|nhạt nhẽo=-2|dở ẹc=-3|chê=-2|chê chết=-3|toxic=-3|ê chề=-3|' +
  'cú lừa=-3|bể kèo=-2|bùng kèo=-2.5|hãm=-2|hãm lờ=-2.5|xạo=-2.5|xạo ke=-3|nói xạo=-3|' +
  'mệt mỏi=-1.5|trầm cảm=-1.5|hết cứu=-3|hết thuốc chữa=-3|ảo ma=-2.5|ảo tưởng=-2|lố=-1.5|' +
  'quê=-2|quê xệ=-2.5|ngứa mắt=-2|chướng mắt=-2.5|tuột mood=-2|mất hứng=-2|bad=-2|lag=-1.5|đơ=-1.5|chán đời=-2.5|' +
  'bực mình=-2|tức xì khói=-2.5|ức chế=-2.5|mất mặt=-2|thôi xong=-2|xong phim=-2|xong đời=-2.5|' +
  'tạch=-2|red flag=-2.5|khó đỡ=-1.5|dô diên=-2|ét o ét=-1.5|ăn hành=-1.5|' +
  'rén=-1|nản=-2|nản lòng=-2.5|đu trend lố=-1.5|làm màu=-1.5|sống ảo=-1.5|câu view=-2|câu like=-1.5|câu tương tác=-2|' +
  'drama=-1|lố bịch=-2.5|vô tri=-1|vớ vẩn=-2|dở hơi=-2|' +
  'đú trend=-1.5|đu trend=-1|cố tình gây chú ý=-2.5|gây chú ý=-1|cà khịa=-1|' +
  'lùa gà=-3.5|lừa đảo livestream=-4|bán hàng đa cấp=-3|đa cấp=-2.5|kêu gọi từ thiện giả=-4|' +
  'to6=-2.5|phông bạt=-2|ra dẻ=-2|fishu=-2|ô dề=-1.5|ăn nói xà lơ=-2|báo thủ=-1.5|sus=-1.5|cạn phước=-1.5|' +
  'nhây=-1.5|nhây lầy=-1|bố đời=-2|trẩu tre=-1.5|dạy đời=-2.5|lên mặt dạy đời=-3|lên lớp=-2|' +
  'ăn theo=-1.5|bám fame=-2.5|bám váy=-2|hút máu=-3|bóc lột=-3|' +
  'thái độ lồi lõm=-2.5|chảnh=-2|chảnh chọe=-2.5|kiêu ngạo=-2.5|tự cao=-2|ra vẻ=-1.5|' +
  'nhạt như nước ốc=-2.5|nhạt toẹt=-2.5|dở tệ=-3|tệ nhất=-3.5|dở nhất=-3.5|chán ngắt=-2.5|' +
  'thôi đừng đăng nữa=-3|đừng đăng nữa=-2.5|xóa đi=-2|gỡ bài=-2|report=-2|đã report=-2.5|đã block=-2|' +
  'unsub=-2|đã unsub=-2.5|hủy theo dõi=-2|bỏ theo dõi=-2|unfollow=-2|' +
  'đẻ ra drama=-2.5|bao biện=-2|đổ thừa=-2|đổ lỗi=-2|chối tội=-2.5|ngụy biện=-2.5|' +
  'tiêu cực=-2|hại não=-2.5|nhức mắt=-2|nhức đầu=-2|điếc tai=-2|' +
  'tởm lợm=-3|đồ rác=-3|đồ rởm=-3|rởm=-3|đáng ghét=-3|đáng khinh=-3.5|đáng trách=-2';

// Từ nhấn mạnh kiểu mạng xã hội
const SLANG_INT =
  'dã man=1.6|kinh khủng=1.5|khủng khiếp=1.5|xỉu=1.4|phết=1.2|dữ dội=1.5|' +
  'cực=1.5|real=1.2|điên=1.4|tởm=1.4|vãi=1.5|vãi chưởng=1.6|vãi cả=1.5|thật sự=1.3|quá xá=1.5|ghê=1.3|' +
  'hết nấc=1.6|hết ý=1.5|ác=1.4';

// Từ phủ định kiểu mạng xã hội
const SLANG_NOT = 'hổng|hong|đếch|đéo|ko có|chả có|đâu phải|không hề|chẳng hề|có đâu|làm gì có';

// Luật ngữ cảnh cho từ nhiều nghĩa. Định dạng: từ>ngữ cảnh 1,ngữ cảnh 2=điểm
// Từ nào đứng gần từ đó (cùng vế câu, cách tối đa 6 từ) thì quyết định điểm.
const SLANG_CTX =
  // "cháy": diễn cháy = khen; cháy nhà, cháy xe = tin buồn; cháy hàng/cháy vé = hot
  'cháy>sân khấu,show,concert,live,mv,bài hát,bài nhạc,nhạc,beat,rap,vũ đạo,dance,cover,fan,đêm nhạc,biểu diễn,màn trình diễn,idol,ca sĩ,diễn,hát=2.5|' +
  'cháy>nhà,chung cư,xe,rừng,chợ,đám cháy,hỏa hoạn,nổ,điện,tòa nhà,khách sạn,xưởng,kho,tàu,nạn nhân,thiệt hại=-3|' +
  'cháy>máy,pin,laptop,điện thoại,sạc,bếp=-3|' +
  'cháy>vé,suất,slot,ticket=1.5|' +
  // "nóng": drama nóng = tranh cãi; bỏng mắt = quyến rũ; trời nóng = khó chịu
  'nóng>tranh luận,tranh cãi,cãi nhau,bình luận,comment,cmt,đầu,mặt,máu,tính,nảy lửa,drama,phốt,mạng xã hội,dân mạng=-2|' +
  'nóng>bỏng,body,vũ đạo,bài hát,mv,clip,hit,trend,sân khấu,tiết mục=1.5|' +
  'nóng>trời,thời tiết,mùa hè,nắng,phòng,quạt,máy=-1.5|' +
  // "khô": diễn khô, kịch bản khô = chán
  'khô>khan,diễn xuất,nội dung,kịch bản,phim,clip,video,bài,nhạc,cảm xúc,diễn,tập này,tập,chương trình=-2|' +
  'khô>da,tóc,môi,họng,tay,mặt=-1.5|' +
  // "ác": hay ác = khen; ác ghê, ác độc = chê
  'ác>hay,đỉnh,chất,ngon,đẹp,xịn,nhạc,beat,diễn,hát,live=2|' +
  'ác>người,tâm,miệng,độc,lời nói,hành động,bình luận,comment=-3|' +
  // "sốc": sốc vì hay vs sốc vì phốt
  'sốc>hay,đẹp,đỉnh,giọng,visual,tài năng,bất ngờ thú vị,quá hay=1.5|' +
  'sốc>phốt,tin,vụ việc,scandal,drama,bê bối,nạn nhân,hành vi,thái độ,phát ngôn=-2.5|' +
  // "khóc": khóc vì xúc động vs khóc vì buồn/bị đối xử tệ
  'khóc>hay,xúc động,cảm động,ý nghĩa,phim,bài hát,mv,lời bài hát,ca khúc=1.5|' +
  'khóc>thương,tội,nạn nhân,oan,bị bắt nạt,đau lòng=-2|' +
  // "dài": dài dòng, lê thê
  'dài>dòng,lê thê,vô tận=-1.5|' +
  // "đỉnh": đỉnh điểm của drama = chê, còn "đỉnh" một mình là khen
  'đỉnh>điểm=-1.5|' +
  // "quê" (hơi quê, quê xệ = chê) và "phê" (cà phê) là nghĩa thường ngày, không phải cảm xúc
  'quê>cùng,hương,về,ở,đâu,nhà,quê ở=0|' +
  'phê>cà,cafe=0|' +
  // "thương": thương vs thương hại / thương tâm
  'thương>hại,tâm=-1.5|' +
  // "trend / viral": hay hay dở tùy từ đi kèm
  'trend>độc hại,nhảm,phản cảm,lố,nguy hiểm=-2.5|' +
  'trend>hay,đẹp,vui,ý nghĩa,dễ thương,chill,mới=1.5|' +
  'viral>nhảm,phản cảm,ép,giả,dàn dựng=-2|' +
  'viral>nhờ hay,vì hay,xứng đáng,xứng tầm=2';
