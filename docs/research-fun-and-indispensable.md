# TodoPet: vui hơn, "game" hơn và không thể thiếu khi làm việc

*Nghiên cứu ngày 29/10/2026 · khoảng 90 nguồn (nghiên cứu khoa học, dữ liệu công bố của sản phẩm, báo chí, đánh giá của người dùng) · Độ tin cậy: trung bình–cao, ghi rõ chỗ nào chỉ có một nguồn*

## Tóm tắt

1. **Điểm số và cấp độ chỉ tạo hiệu ứng nhỏ và phai dần.** Một meta-analysis cho thấy hiệu ứng lên hành vi chỉ g=0,25 và kém ổn định ở các nghiên cứu chặt chẽ ([Sailer & Homner 2020](https://opus.bibliothek.uni-augsburg.de/opus4/frontdoor/index/index/docId/109056)). Pokémon Go hay "thưởng audiobook khi đi tập" đều mạnh lúc đầu rồi giảm ([Althoff 2016](https://arxiv.org/abs/1610.02085), [Milkman 2014](https://pubmed.ncbi.nlm.nih.gov/25843979/)). Vì vậy TodoPet muốn "không thể thiếu" thì phải **giúp việc thật**; phần game là lớp làm cho việc đó vui.
2. **Sản phẩm thắng lớn đều có một sinh vật cần bạn, luôn nằm trong tầm mắt, và tha thứ khi bạn trượt.** Đó là Finch, Focus Friend (#1 App Store 8/2025, Google Play App of the Year), Bongo Cat (194.508 người chơi cùng lúc). Người dùng khen "không bị phạt"; họ giận khi mất chuỗi ngày ([Appbot – Finch](https://appbot.co/blog/finch-app-reviews-emotional-attachment-user-retention-product-loyalty/), [Appbot – Focus Friend](https://appbot.co/blog/how-hank-greens-focus-riend-app-winning-hearts-ratings/)).
3. **Phạt thì phản tác dụng.** Trong nghiên cứu thực địa với Habitica, mọi người dùng đều gặp tác dụng ngược, nhiều nhất là bị phạt đúng lúc đang làm việc hiệu quả ([Diefenbach & Müssig 2019](https://epub.ub.uni-muenchen.de/77668), một nguồn). Chuỗi ngày bị gãy làm giảm động lực, nhất là khi người dùng tự trách mình ([Silverman & Barasch 2023](https://udspace.udel.edu/handle/19716/34160)).
4. **TodoPet đang làm ngược với bằng chứng ở một chỗ.** `closeDay` trong `src/core/life.ts` đặt chuỗi về 0 khi lỡ một ngày làm việc, và tính cả **ngày tắt máy** (nghỉ phép, ốm) là ngày lười: pet bẩn thêm, chuỗi về 0. Đây là việc nên sửa đầu tiên.
5. **Tính năng "không thể thiếu" có bằng chứng mạnh nhất là giúp quay lại việc dang dở.** 27% việc bị gián đoạn mất hơn 2 giờ mới được làm tiếp ([Iqbal & Horvitz 2007](https://www.erichorvitz.com/CHI_2007_Iqbal_Horvitz.pdf)). Một ghi chú "làm tiếp từ đâu" dài 1 phút giúp đầu óc rời việc cũ dễ hơn ([Leroy & Glomb 2018](https://www.washington.edu/news/2018/01/16/task-interrupted-a-plan-for-returning-helps-you-move-on/)). TodoPet đã biết ứng dụng và URL đang mở, nên làm được việc này mà công cụ khác không làm được.

## Lộ trình đề xuất

| # | Đề xuất | Loại | Bằng chứng | Công sức |
|---|---|---|---|---|
| 1 | Chuỗi ngày biết tha thứ | Giữ chân | Mạnh | Nhỏ |
| 2 | Tâm trạng tử tế: "lo lắng rồi giúp" thay vì "cáu" | Giữ chân | Trung bình | Nhỏ |
| 3 | Ngân sách nhắc nhở tự lùi | Không làm phiền | Mạnh | Nhỏ–vừa |
| 4 | Thẻ "Mình đang làm dở gì nhỉ?" | Không thể thiếu | Mạnh | Vừa |
| 5 | Kẹp hai đầu cuộc họp | Không thể thiếu | Trung bình | Vừa |
| 6 | Nghi thức đóng ngày | Không thể thiếu | Trung bình | Nhỏ |
| 7 | Cảnh báo ngày quá tải và dải thời gian | Không thể thiếu | Sản phẩm thực tế | Vừa |
| 8 | Hẹn "nếu… thì bắt đầu" theo sự kiện | Không thể thiếu | Mạnh | Vừa |
| 9 | Pet đan len khi bạn tập trung, trang trí nhà | Game | Sản phẩm thực tế | Vừa |
| 10 | Pet đi phiêu lưu khi xong kế hoạch | Game | Sản phẩm thực tế | Vừa |
| 11 | Rương quà, bộ sưu tập theo mùa, công khai tỉ lệ | Game | Trung bình | Vừa |
| 12 | Bộ sưu tập có sẵn tiến độ, chương truyện hằng tuần | Game | Mạnh | Nhỏ |
| 13 | Bạn bè: thăm pet, chuỗi đôi, boss hợp tác | Xã hội | Trung bình | Lớn (cần máy chủ) |

**Thứ tự gợi ý:**
- **v0.3 "Tử tế":** #1, #2, #3, #12.
- **v0.4 "Không thể thiếu":** #4, #5, #6, #7, #8.
- **v0.5 "Game":** #9, #10, #11, kèm một sự kiện Tết đầu tiên.
- **v0.6 "Bạn bè":** #13. Đã chọn cách không cần máy chủ: thẻ pet được ký số, gửi cho nhau qua app chat (xem SPEC v0.6).

## Chi tiết từng đề xuất

### 1. Chuỗi ngày biết tha thứ
- **Làm gì:**
  - Ngày máy tắt và ngày nghỉ (chế độ nghỉ phép hoặc ốm) không bị tính là lười.
  - "Túi đồ ăn vặt" tự đóng băng chuỗi, giữ tối đa 2 túi và kiếm thêm bằng cách hoàn thành việc.
  - Lỡ chuỗi thì có nhiệm vụ "sửa chuỗi": hôm sau xong 2 việc là chuỗi được nối lại.
  - Ngày họp kín lịch (đọc từ ICS) được tự động miễn.
  - Chỉ cần xong ít nhất 1 việc trong kế hoạch là giữ chuỗi; "ngày hoàn hảo" vẫn là mục tiêu cao hơn.
- **Vì sao:**
  - Duolingo hạ ngưỡng giữ chuỗi xuống 1 bài thì giữ chân ngày 14 tăng 3,3%, số người có chuỗi 7+ ngày tăng 40%. Cho 2 lần đóng băng thì người dùng hoạt động hằng ngày tăng 0,38% mà không bỏ ngày nhiều hơn. Số liệu do Duolingo tự công bố ([2020](https://blog.duolingo.com/improving-the-streak), [2024](https://blog.duolingo.com/duolingo-streak-research/)).
  - Mục tiêu có "ngày dự phòng" giúp người ta tiếp tục sau khi trượt ([Sharif & Shu](https://anderson-review.ucla.edu/emergency-reserves/)).
  - Lỡ một ngày không làm hỏng việc hình thành thói quen ([Lally 2010](https://www.ucl.ac.uk/news/2009/aug/how-long-does-it-take-form-habit)).
- **Rủi ro:** quá dễ dãi thì chuỗi mất ý nghĩa, nên chỉ tính việc nằm trong kế hoạch 3 việc.

### 2. Tâm trạng tử tế
- **Làm gì:**
  - Khi việc quá hạn: pet **lo lắng**, rồi đề nghị giúp ("Dời sang mai nhé?", "Chia nhỏ nhé?", nút "Bắt đầu lại từ đầu" để dời hết một lần).
  - Trò nghịch (diễu hành, lật bàn) chỉ dùng cho **xao nhãng trong giờ làm** và là tuỳ chọn. Không bao giờ nghịch sau một ngày trượt.
- **Vì sao:**
  - Chú cá ảo buồn trong Fish'n'Steps khiến một số người tránh mở app ([tổng quan](https://arxiv.org/pdf/1509.05238)).
  - Cảm giác tội lỗi là lý do phổ biến khiến người ta bỏ công cụ theo dõi ([Epstein 2016](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5428074/)).
  - Người ADHD mô tả việc quản lý công việc là chuyện cảm xúc ([Chen, CSCW 2026](https://arxiv.org/abs/2603.17258)).
- **Rủi ro:** không còn gì để mất thì pet bớt sức hút. Giữ chút buồn nhẹ nhưng luôn có cách sửa.

### 3. Ngân sách nhắc nhở tự lùi
- **Làm gì:**
  - Chỉ nhắc khẩn (họp sắp bắt đầu, việc có giờ) mới hiện ngay.
  - Nhắc khác dồn lại tới lúc nghỉ tự nhiên, hoặc tới 3 lần "điểm danh" trong ngày.
  - Người dùng bỏ qua nhiều thì pet tự bớt nhắc, và hiện "hôm nay còn N lần nhắc".
- **Vì sao:**
  - RCT với 237 người: gom thông báo 3 lần/ngày giúp tập trung và năng suất hơn; gom mỗi giờ thì gần như không tác dụng ([Fitz 2019](https://communities.springernature.com/posts/batching-notifications-can-improve-attention-well-being-and-productivity)).
  - Chờ đến điểm nghỉ tự nhiên giảm bực bội ([Iqbal & Bailey 2008](https://www.interruptions.net/literature/Iqbal-CHI08.pdf)).
  - Clippy bị ghét chủ yếu vì tự bật lên ([Crimson](https://www.thecrimson.com/article/2005/4/28/what-not-to-do-with-a/)).
- **Ghi chú:** TodoPet đã giãn bong bóng 15 phút và chờ lúc ngừng gõ; đây là bước tiếp theo của hướng đó.

### 4. Thẻ "Mình đang làm dở gì nhỉ?" (đề xuất "không thể thiếu" mạnh nhất)
- **Làm gì:**
  - Khi bạn rời một việc (đi họp, khoá máy, bị kéo sang trang xao nhãng), pet nhớ việc đang làm, ứng dụng và URL đang mở, kèm một dòng "bước tiếp theo" nếu bạn muốn gõ.
  - Khi bạn quay lại sau 5 phút trở lên, pet giơ biển "Bạn đang làm: …", và một cú bấm mở lại đúng chỗ.
- **Vì sao:**
  - Mỗi lần chuyển việc vì thông báo tốn khoảng 10 phút, cộng 10–15 phút nữa mới quay lại; 27% việc bị treo hơn 2 giờ ([Iqbal & Horvitz 2007](https://www.erichorvitz.com/CHI_2007_Iqbal_Horvitz.pdf)).
  - Gợi ý quay lại phải **rõ ràng**: mũi tên đỏ có tác dụng, gợi ý mờ nhạt thì không ([Trafton 2005](https://www.interruptions.net/literature/Trafton-HFES05.pdf)).
  - Ghi chú "làm tiếp từ đâu" 1 phút giúp đầu óc rời việc cũ ([Leroy & Glomb 2018](https://www.washington.edu/news/2018/01/16/task-interrupted-a-plan-for-returning-helps-you-move-on/)).
- **Lợi thế riêng:** TodoPet đã đọc ứng dụng và URL đang mở qua UI Automation, nên chỉ cần thêm lưu và mở lại. Dữ liệu chỉ nằm trên máy.

### 5. Kẹp hai đầu cuộc họp
- **Làm gì:**
  - 2 phút trước họp: thẻ chuẩn bị gồm tiêu đề, link vào họp, các việc Todoist có tên người hoặc dự án liên quan.
  - Sau họp: ô 30 giây "Việc tiếp theo là gì?" ghi thẳng vào Todoist, và gợi ý nghỉ 10 phút nếu họp liên tiếp.
- **Vì sao:**
  - 55% người được hỏi nói không rõ việc tiếp theo sau họp ([Work Trend Index 2023](https://www.microsoft.com/en-us/worklab/work-trend-index/will-ai-fix-work), 31.000 người).
  - Căng thẳng tích luỹ khi họp liền nhau nhưng giữ phẳng nếu nghỉ 10 phút ([Microsoft EEG](https://www.microsoft.com/en-us/worklab/work-trend-index/brain-research), 14 người).

### 6. Nghi thức đóng ngày
- **Làm gì:**
  - Nâng cấp phần tổng kết cuối ngày: với mỗi việc quan trọng còn dở, ghi một dòng "ở đâu, lúc nào, làm thế nào".
  - Chọn "con ếch" của ngày mai và điểm lại những việc đã xong.
  - Sau đó pet đi ngủ. Tối đa 3 phút, bỏ qua được.
- **Vì sao:**
  - Lên kế hoạch cho việc dở vào cuối ngày giúp 103 nhân viên dứt khỏi công việc tốt hơn ([Smit 2016](https://bps.org.uk/research-digest/heres-simple-way-improve-your-worklife-boundaries)).
  - Cảm giác "có tiến triển" là động lực lớn nhất trong khoảng 12.000 nhật ký công việc ([Amabile](https://hbswk.hbs.edu/item/6685.html)).
  - Nghi thức đóng ngày của Sunsama được khen nhiều nhất ([Asian Efficiency](https://www.asianefficiency.com/schedule-management/sunsama-review/)).

### 7. Cảnh báo ngày quá tải và dải thời gian
- **Làm gì:**
  - Sáng ra, cộng thời lượng ước tính của các việc với thời gian họp. Quá giờ làm thì pet lo lắng và đề nghị dời bớt.
  - Tuỳ chọn: một dải thời gian mỏng ở mép màn hình hiện các cuộc họp và khối việc. Khi Claude chia nhỏ việc, mỗi bước kèm thời lượng ước tính.
- **Vì sao:** Sunsama cảnh báo khi kế hoạch vượt khoảng 5,5 giờ và được khen vì điều đó ([Carly](https://www.usecarly.com/blog/sunsama-review/)). Tiimo, iPhone App of the Year 2025, nổi tiếng nhờ chia việc thành từng bước có thời lượng ([Apple](https://www.apple.com/newsroom/2025/12/apple-unveils-the-winners-of-the-2025-app-store-awards/)).

### 8. Hẹn "nếu… thì bắt đầu" theo sự kiện
- **Làm gì:**
  - Lúc lên kế hoạch 3 việc, hỏi "bắt đầu khi nào?" với lựa chọn nhanh: "sau cuộc họp standup", "khi mở Figma", "sau bữa trưa".
  - Pet nhắc đúng lúc sự kiện đó xảy ra, thay vì theo giờ cố định.
  - Với việc đã dời 2 lần: Claude gợi ý một bước khởi động 2 phút, kèm đồng hồ mini.
- **Vì sao:**
  - Lập kế hoạch "nếu… thì" có hiệu ứng d=0,65 trên 94 thử nghiệm ([Gollwitzer & Sheeran 2006](https://cancercontrol.cancer.gov/brp/research/constructs/implementation-intentions)).
  - Hình thức tương tác hiệu quả hơn giấy viết: g=0,47 so với 0,28 ([Wang 2021](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.565202/full)).
  - Việc càng ngại thì càng dễ trì hoãn ([Steel 2007](https://prism.ucalgary.ca/handle/1880/47914)). Đã bắt đầu thì người ta thường quay lại làm tiếp ([Ghibellini & Meier 2025](https://ideas.repec.org/a/pal/palcom/v12y2025i1d10.1057_s41599-025-05000-w.html)).
  - Riêng "bước 2 phút" là giả thuyết, chưa có thử nghiệm.

### 9. Pet làm đồ thủ công khi bạn tập trung, trang trí nhà
- **Làm gì:**
  - Trong lúc hẹn giờ tập trung, pet đan len, nặn đất hoặc xếp gạch tuỳ loài (ong làm mật, hải ly xây đập…).
  - Mở trang xao nhãng thì **tuột vài mũi**, không mất cả món.
  - Đồ làm ra dùng để trang trí "nhà" của pet: một góc nhỏ trên thanh tác vụ.
- **Vì sao:** đây là cơ chế cốt lõi của Focus Friend, ứng dụng #1 App Store 8/2025. Người dùng khen nó "tử tế", và hơn 70 đánh giá nhắc tới ADHD ([TechCrunch](https://techcrunch.com/2025/11/18/hank-greens-focus-friend-is-google-plays-app-of-the-year), [Appbot](https://appbot.co/blog/how-hank-greens-focus-riend-app-winning-hearts-ratings/)). Forest thì bị chê vì "giết cây" gây tội lỗi ([kottke](https://kottke.org/25/06/0046973-want-to-use-your-phone)), nên chỉ nên làm tuột vài mũi, không phá huỷ.

### 10. Pet đi phiêu lưu khi xong kế hoạch
- **Làm gì:**
  - Xong 3 việc đã lên kế hoạch, pet xách balo đi chơi 2–3 giờ.
  - Lúc về, pet mang theo một món quà lưu niệm và một trang nhật ký kèm "bưu thiếp".
- **Vì sao:** Finch dùng chuyến phiêu lưu 6 giờ để người dùng quay lại vào buổi tối, và có hơn 10 triệu lượt tải ([DoF](https://www.deconstructoroffun.com/blog/x0hd2ssr80y5n7gv0w967pg7hwd7tl), [Google](https://android-developers.googleblog.com/2025/07/weareplay-app-game-founders-across-the-us.html)).
- **Lợi ích phụ:** pet vắng mặt đúng lúc bạn cần làm sâu, nên bớt gây xao nhãng.

### 11. Rương quà và bộ sưu tập theo mùa
- **Làm gì:**
  - Mỗi 30 phút làm việc thật thì có một rương, mở bằng cách hoàn thành một việc.
  - **Công khai tỉ lệ rơi đồ.**
  - Có bộ đồ theo mùa có hạn: Tết (áo dài, bao lì xì), Trung Thu (đèn ông sao), Halloween, Giáng sinh.
  - Chỉ là đồ trang trí, không bao giờ bán lợi thế.
- **Vì sao:**
  - Bongo Cat tặng một rương mỗi 30 phút và có đồ theo mùa; đỉnh 194.508 người chơi cùng lúc ([Steambase](https://steambase.io/games/bongo-cat/steam-charts)).
  - Phần thưởng ngẫu nhiên thúc đẩy hoàn thành mạnh hơn phần thưởng chắc chắn ([Shen, Fishbach & Hsee 2015](https://www.chicagobooth.edu/review/uncertainty-can-improve-motivation)).
- **Rủi ro:** phần thưởng vật chất được hứa trước làm giảm hứng thú tự thân (d=−0,36 đến −0,40), còn lời khen cụ thể thì làm tăng (d=+0,33) ([Deci, Koestner & Ryan 1999](https://home.ubalt.edu/ntygmitc/642/Articles%20syllabus/Deci%20Koestner%20Ryan%20meta%20IM%20psy%20bull%2099.pdf)). Vì vậy màn ăn mừng nên nói rõ bạn vừa làm được gì, và giới hạn số rương mỗi ngày.

### 12. Bộ sưu tập có sẵn tiến độ, chương truyện hằng tuần
- **Làm gì:**
  - Mỗi trang sticker mới bắt đầu với 2 ô đã dán, và các bộ hiện "3/5" để thấy mình sắp xong.
  - Nhật ký pet kể theo "chương" mỗi tuần, và thứ Hai là "trang mới".
- **Vì sao:**
  - Thẻ tích điểm tặng sẵn 2 dấu: 34% người hoàn thành, so với 19% ở thẻ trắng ([Nunes & Drèze 2006](https://knowledge.wharton.upenn.edu/?p=5630)).
  - Người ta tăng tốc khi gần đích ([Kivetz 2006](https://business.columbia.edu/faculty/research/goal-gradient-hypothesis-resurrected-purchase-acceleration-illusionary-goal)).
  - Hiệu ứng "khởi đầu mới" ([Dai et al.](https://chibe.upenn.edu/publications/the-fresh-start-effect-breaking-points-in-life-motivate-virtuous-behavior/)).

### 13. Bạn bè (đã làm ở v0.6, không cần máy chủ)
- **Làm gì:**
  - Kết bạn bằng mã; pet sang thăm thanh tác vụ nhà bạn.
  - "Chuỗi đôi": cả hai cùng xong kế hoạch 3 việc thì chuỗi tăng. Chỉ chia sẻ con số, không chia sẻ tên việc.
  - Boss hằng tuần đánh bằng số việc cả nhóm hoàn thành, và không bao giờ phạt bạn bè.
- **Vì sao:**
  - Người có chuỗi chung với bạn có khả năng hoàn thành bài hằng ngày cao hơn 22% (tương quan, số liệu Duolingo, [blog](https://blog.duolingo.com/product-lessons-friend-streak/)).
  - Kết hợp hợp tác với cạnh tranh hiệu quả hơn chỉ cạnh tranh ([Sailer & Homner](https://opus.bibliothek.uni-augsburg.de/opus4/frontdoor/index/index/docId/109056)).
  - Habitica đóng khu cộng đồng năm 2023 và bị phản đối dữ dội ([Wikipedia](https://en.wikipedia.org/wiki/Habitica)).
- **Cần quyết định trước:** máy chủ, quyền riêng tư, chống lạm dụng.

## Những điều không nên làm
- Không phạt khi người dùng trượt: không mất pet, không xoá tiến độ, không gửi thông báo "chuỗi của bạn đã gãy".
- Không bán lợi thế. Nếu muốn có thu nhập thì bán gói trang trí hoặc "gói ủng hộ": 11% người chơi Rusty's Retirement mua gói ủng hộ 4 USD ([GameDiscoverCo](https://newsletter.gamediscover.co/p/how-rustys-retirement-idle-farmed)).
- Không dùng 20-20-20 dạng popup: bằng chứng yếu, tác dụng mất sau 1 tuần ([Talens-Estarelles 2023](https://research.aston.ac.uk/en/publications/the-effects-of-breaks-on-digital-eye-strain-dry-eye-and-binocular/)). Nếu có thì để pet tự vươn vai làm gợi ý.

## Giới hạn của nghiên cứu
- Chưa có thử nghiệm đối chứng tốt nào về việc "chăm thú ảo làm tăng động lực". Nghiên cứu hay được trích (Byrne 2011) có đồng tác giả Brian Wansink, người đã bị rút 17 bài báo ([Retraction Watch](https://retractionwatch.com/2018/12/05/the-joy-of-cooking-vindicated-journal-retracts-two-more-brian-wansink-papers)). Vòng lặp cốt lõi của TodoPet dựa trên lý thuyết cơ chế, chưa có bằng chứng trực tiếp.
- Số liệu Duolingo và Sensor Tower là do công ty tự công bố hoặc ước tính.
- Không có RCT nào về body doubling hay đồng hồ trực quan cho ADHD; chỉ có một nghiên cứu thử nghiệm VR với 12 người ([Ara 2025](https://arxiv.org/html/2509.12153v1)).
- Một vài số liệu (Mark 2008, FlowLight giảm 46% gián đoạn, Smit 2016) chỉ đọc qua phần tóm tắt, chưa đọc toàn văn.

## Phương pháp
Ba hướng nghiên cứu chạy song song:
1. Bằng chứng về cơ chế game và rủi ro.
2. Các sản phẩm thú cưng, game nhàn rỗi và lập kế hoạch giai đoạn 2024–2026.
3. Can thiệp có bằng chứng cho người làm việc trí óc, và cách giúp mà không làm phiền.

Tổng cộng khoảng 200 lượt tìm kiếm và đọc trang. Ưu tiên meta-analysis và RCT, rồi đến dữ liệu công bố của sản phẩm, cuối cùng là đánh giá của người dùng. Đề xuất được đối chiếu với code hiện tại (`src/core/life.ts`, `src/core/brain.ts`) để tránh trùng tính năng đã có.
