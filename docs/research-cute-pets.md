# Làm pet cực kỳ dễ thương: nghiên cứu và quy tắc vẽ

*Nghiên cứu ngày 29/10/2026 · khoảng 70 nguồn (nghiên cứu về "baby schema" và kawaii, phỏng vấn nhà thiết kế, hướng dẫn hoạt hình, robot thú cưng) · Đây là spec cho đợt nâng cấp giao diện pet*

## Tóm tắt

1. **Mắt đặt thấp quan trọng hơn mắt thật to.**
   - Mặt được chấm dễ thương nhất khi mắt và miệng nằm **thấp** trên khuôn mặt, cằm nhỏ ([Komori, Nittono 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9669709)).
   - Con non của các loài vượn người đều có "mắt to hơn, nằm thấp hơn", mặt tròn và ngắn ([Kawaguchi 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10060388/)).
   - Phóng mắt to thêm 15% **không** làm dễ thương hơn ([Yao 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8786738/)). Trẻ em cũng không thích phiên bản mắt ×1,5 ([Disney Research 2016](https://la.disneyresearch.com/wp-content/uploads/Designing-Animated-Characters-for-Children-of-Different-Ages-Paper.pdf)).
   - Vì vậy nên **hạ mắt xuống**, chỉ phóng to vừa phải.
2. **Miệng nhỏ, đặt sát mắt.** Mặt có mũi và miệng hẹp hơn được chấm dễ thương hơn ([Glocker 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC3260535/)). Mickey Mouse qua 50 năm có mắt từ 27% lên 42% chiều dài đầu, đầu từ 42,7% lên 48,1% chiều dài thân ([Gould](https://www.cognitionandculture.net/wp-content/uploads/Mickey-mouse-meets-konrad-lorenz.pdf)).
3. **Nghiêng đầu 10–20° làm tăng độ dễ thương** ([Mara & Appel 2015](https://www.rlp-forschung.de/public/facilities/333/publications/79948)). Vật đang **được chạm, vuốt** cũng được chấm dễ thương hơn, ở cả Nhật và Mỹ ([Ohashi & Nittono 2026](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0340903)).
4. **Nhân vật được yêu nhất đều yếu đuối và có tật nhỏ.** Chiikawa hay khóc, hay chạy trốn. Mỗi bạn Sumikko Gurashi đều có một nỗi tự ti ([Wikipedia](https://en.wikipedia.org/wiki/Sumikko_Gurashi)). Robot cố tình mắc lỗi được thích hơn mà không bị cho là kém thông minh ([Mirnig 2017](https://www.frontiersin.org/articles/10.3389/frobt.2017.00021/pdf)). Pet nên **tủi chứ không cáu**, và thỉnh thoảng hậu đậu.
5. **"Sống" là nhờ những cử động nhỏ.**
   - Thở, chớp mắt **ngẫu nhiên** (không đều đặn) theo cụm ([Nomura 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC6207319/)).
   - "Ngẫm nửa nhịp" trước khi phản ứng: Animal Crossing cố ý cho dân làng dừng lại suy nghĩ, vì chuyển ngay lập tức trông như máy ([Siliconera](https://www.siliconera.com/nintendo-on-how-animal-crossing-new-horizons-lovable-villagers-were-created/)).
   - Có đời sống riêng khi bạn vắng mặt (Neko Atsume, Finch).

## So sánh với pet hiện tại

| Hạng mục | Hiện tại | Quy tắc | Hướng sửa |
|---|---|---|---|
| Vị trí mắt | 39–50% chiều cao thân (tính từ đỉnh) | 52–60% | Hạ mắt xuống, nhưng không lệch quá 25% so với hiện tại mỗi bước |
| Cỡ mắt | khoảng 16–17% chiều cao | 16–22% | Tăng nhẹ lên khoảng 19% |
| Đốm sáng | 1 đốm | 1 lớn trên-trái (35–40% bề rộng mắt) + 1 nhỏ dưới-phải (15–20%) | Thêm đốm phụ ở tâm trạng bình thường và vui |
| Miệng | Chữ "w" rộng khoảng 1,4 lần bề rộng mắt | ≤ khoảng 0,8 lần, sát dưới mắt | Thu nhỏ, kéo lên gần mắt |
| Má hồng | Elip phẳng | Gradient mềm, ngang đáy mắt, độ đậm 40–55% | Đổi sang gradient tròn, thêm 2–3 vạch chéo nhỏ khi vui hoặc được vuốt |
| Chớp mắt | Đều đặn mỗi 4,3 giây | Ngẫu nhiên 1,5–8 s (trung vị khoảng 3,5 s), 12% chớp đôi | Dùng nhịp giả ngẫu nhiên tất định theo t |
| Nghiêng đầu | Không có | 10–15° khi tò mò, vui, được vuốt | Thêm vào tư thế |
| Viền | Màu tối theo màu thân, 2,4 px | Tông màu thân, nét ngoài dày hơn nét trong | Giữ, làm nét trong mảnh hơn (1,5–1,7 px) |
| Tâm trạng tệ nhất | Nhăn nhó, khoanh tay | Tủi, lo lắng | Lông mày nhướng ở giữa, tay buông, giọt mồ hôi |

## Quy tắc vẽ (spec)

Các tỉ lệ tính theo khung thân (W × H), đo từ đỉnh thân.

### Tĩnh
1. **Mắt:** tâm mắt ở 50–58% H (hạ dần, giữ nhận diện từng loài). Chiều cao mắt 18–20% H. Tỉ lệ cao/rộng 1,0–1,2.
2. **Đốm sáng:** đốm chính 35–40% bề rộng mắt, lệch lên-trái 25%. Đốm phụ 15–20%, ở dưới-phải. Hai mắt dùng cùng một độ lệch. Thêm "lấp lánh" chỉ khi ăn mừng.
3. **Miệng:** rộng ≤ 0,8 lần bề rộng mắt, tâm miệng cách đáy mắt ≤ 0,8 lần chiều cao mắt, nằm giữa hai mắt.
4. **Má:** gradient tròn, bán kính ngang khoảng 0,7 lần bề rộng mắt, ngang đáy mắt, ngay ngoài mép mắt. Không viền. Khi vui hoặc được vuốt thì thêm 2–3 vạch chéo nhỏ.
5. **Nét:** viền ngoài 2,4 px. Nét trong (tay, chân, sọc, chi tiết) mảnh hơn. Không dùng màu đen.
6. **Bóng dáng:** mỗi loài vẫn nhận ra khi tô đen hết ở cỡ khoảng 48 px. Không có đầu nhọn sắc hơn bán kính 3 px.

### Chuyển động
7. **Chớp mắt** ngẫu nhiên theo cụm: khoảng cách 1,5–8 s, khép 80 ms, nhắm 60 ms, mở 150 ms, 12% chớp đôi. Ngủ gà: chớp chậm 300–600 ms.
8. **Thở:** 0,25–0,33 Hz khi thức, khoảng 0,15 Hz khi ngủ, chân giữ cố định.
9. **Nhún và lò xo:** khi tiếp đất, ép xuống còn khoảng 0,82 chiều cao và giãn 1,22 chiều ngang, rồi bật lại vượt khoảng 10%. Luôn giữ thể tích (scaleX = 1/scaleY).
10. **Nghiêng đầu** 10–15° trong khoảng 0,5 s khi chuột dừng gần pet hơn 0,6 s, khi có việc mới, hoặc trước khi ăn mừng ("ngẫm nửa nhịp" 0,4 s).

### Tương tác
11. **Vuốt ve:** di chuột qua lại trên pet (lớn hơn khoảng 40 px/s trong 0,3 s) thì pet nheo mắt ^ ^, nghiêng người về phía chuột, đỏ má, vẫy đuôi nhanh hơn. Sau khoảng 2 s thì "chớp chậm kiểu mèo".
12. **Bấm liên tục:** 3 lần trong 2 s thì pet uốn éo cười khúc khích. 6 lần trong 4 s thì chóng mặt (mắt xoáy 1,2 s), rồi phụng phịu 2 s. Có thời gian nghỉ 10 s giữa hai lần.
13. **Nhấc lên và thả xuống:** khi bị nhấc, pet giãn người và tròn mắt. Khi thả, tiếp đất, lắc mình 3 cái rồi nhìn người dùng.
14. **Chào khi bạn quay lại**, mạnh dần theo thời gian vắng (tối đa khoảng 2 giờ): vẫy tay, rồi nhảy và vẫy đuôi, rồi nhún liên tục. Không bao giờ dỗi.
15. **Hoạt cảnh lúc rảnh:** sau 15 s không có tương tác, cứ 8–30 s pet làm một cử chỉ nhỏ ngẫu nhiên, không lặp lại liền: nhìn quanh, đánh hơi, gãi, vươn vai. Sau 3–5 phút rảnh thì ngủ gà: chớp chậm, gật gù, ngáp rồi ngủ.
16. **Hậu đậu:** hắt xì hoặc vấp chân, tối đa một lần mỗi giờ. Không bao giờ diễn ra khi người dùng đang gõ phím, tập trung hoặc đang họp.

### Cách kiểm chứng
- Mỗi thông số không thay đổi quá khoảng 15–25% trong một lần chỉnh, vì phóng đại quá thì hết tác dụng (Yao, Carter).
- So sánh trước và sau từng loài, ở cỡ 64 px và 160 px.

## Nguồn chính
- **Tỉ lệ khuôn mặt:** [Glocker 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC3260535/), [Komori & Nittono 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9669709), [Kawaguchi 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10060388/), [Yao 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8786738/), [Disney Research 2016](https://la.disneyresearch.com/wp-content/uploads/Designing-Animated-Characters-for-Children-of-Different-Ages-Paper.pdf), [Gould về Mickey](https://www.cognitionandculture.net/wp-content/uploads/Mickey-mouse-meets-konrad-lorenz.pdf)
- **Nghiêng đầu và chạm:** [Mara & Appel 2015](https://www.rlp-forschung.de/public/facilities/333/publications/79948), [Ohashi & Nittono 2026](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0340903)
- **Hậu đậu:** [Mirnig 2017](https://www.frontiersin.org/articles/10.3389/frobt.2017.00021/pdf)
- **Chuyển động:** [Nomura 2018 (chớp mắt)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6207319/), [Apple WWDC23 (lò xo)](https://developer.apple.com/videos/play/wwdc2023/10158/), [Tremoulet & Feldman 2000 (cảm giác sống động)](https://journals.sagepub.com/doi/10.1068/p3101)
- **Nhân vật:** [Chiikawa](https://en.wikipedia.org/wiki/Chiikawa), [Animal Crossing (Siliconera)](https://www.siliconera.com/nintendo-on-how-animal-crossing-new-horizons-lovable-villagers-were-created/), [Duolingo shape language](https://blog.duolingo.com/shape-language-duolingos-art-style/), [Focus Friend (NBC)](https://www.nbcnews.com/tech/tech-news/hank-green-focus-friend-app-rcna225967), [Clip Studio – vẽ nhân vật dễ thương](https://tips.clip-studio.com/en-us/articles/2941)
- **Giới hạn của nghiên cứu:**
  - Phát hiện "màu tươi và bão hoà dễ thương hơn" (Komatsu & Ohkura 2011) chỉ đến từ một phòng lab và mâu thuẫn với lời khuyên dùng màu pastel. Mình giữ bảng màu hiện tại.
  - Không có nghiên cứu đo lường nào về má hồng hay đốm sáng trong mắt; hai quy tắc đó dựa trên kinh nghiệm của họa sĩ.
