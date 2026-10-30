# Làm con pet "có hồn" hơn: chuyển động, cá tính, giọng nói và độ nhẹ

*Nghiên cứu ngày 30/10/2026 · khoảng 110 nguồn (bài báo, tài liệu chính thức, phỏng vấn người làm game và robot, dữ liệu Steam), kèm số đo trên code v0.7.0 · Độ tin cậy: trung bình. Ghi rõ chỗ nào chỉ có một nguồn hoặc là số tự suy ra.*

## Bối cảnh

- Hai đợt nghiên cứu trước ([độ dễ thương](research-cute-pets.md), [vui và không thể thiếu](research-fun-and-indispensable.md)) đã bàn về tỉ lệ khuôn mặt, chớp mắt, nghiêng đầu, vuốt ve, hoạt cảnh lúc rảnh, chuỗi ngày tha thứ, rương, phiêu lưu và bạn bè. Phần lớn đã được làm ở v0.3–v0.7. Đợt này không lặp lại các chủ đề đó.
- Đánh giá nội bộ chấm **"Pet craft" 7,5/10** ở cả v0.6 và v0.7. Mức 9–10 nghĩa là "dễ thương thật sự, muốn để nó trên thanh tác vụ" (`gan-harness/eval-rubric.md`).
- Người đánh giá đã chỉ ra:
  - v0.7: lúc tải bản cập nhật, pet "vẫn đi với gương mặt bình thường".
  - v0.6: pet khách và pet chủ "không bao giờ tương tác với nhau".
- Câu hỏi của đợt này: **cần gì để con pet đi từ 7,5 lên 9?**

## Tóm tắt

1. **Thứ thiếu nhất là "một cá thể", không phải thêm nội dung.**
   - 25 loài dùng chung một bộ hành vi, tâm trạng, hoạt cảnh và khoảng 170 câu thoại.
   - Mỗi tình huống chỉ có 2–4 câu, chọn bằng `Math.random` (`src/core/l10n.ts:33`), nên có thể lặp ngay lần sau.
   - Nghiên cứu robot dài hạn: hứng thú giảm mạnh sau 1–2 tuần. Thứ giữ được người dùng là **nhớ người dùng, không lặp lại, và hành vi mới đến dần** ([Leite](https://scazlab.yale.edu/sites/default/files/files/IolandaLeite_PhD_Dissertation.pdf)).
   - Trong một nghiên cứu 30 ngày, đa số người dùng vẫn thấy agent lặp lại dù đã có "nhiều biến thể" ([Bickmore & Picard](https://courses.media.mit.edu/2004spring/mas630/Articles/BP-TOCHI.pdf)).
2. **Chuyển động chưa có quán tính.**
   - Đuôi và tai đang là một sóng sin cộng góc theo tâm trạng (ví dụ `src/pets/species/cat.ts`), nên không phản ứng khi pet dừng, đáp đất hay bị kéo.
   - "Phần đi sau" (follow-through) là nguyên lý hoạt hình cơ bản ([SIGGRAPH](https://education.siggraph.org/static/HyperGraph/animation/character_animation/principles/follow_through.htm)).
   - Spine và Live2D, hai công cụ chuẩn cho nhân vật 2D, đều có sẵn vật lý cho phần này.
3. **Ánh mắt chỉ đi theo con trỏ** (`src/overlay/App.tsx:418`).
   - Ánh mắt *phản hồi* lại người dùng làm robot được thấy tự nhiên và chú ý hơn so với nhìn chằm chằm hay nhìn ngẫu nhiên ([Admoni & Scassellati 2017](https://scazlab.yale.edu/sites/default/files/files/273-2310-1-PB.pdf)).
   - Pet đã biết ứng dụng nào vừa mở và khi nào có cuộc họp, nhưng đôi mắt chưa dùng tới những thông tin đó.
4. **Mọi loài kêu giống nhau, và giọng đọc người lớn của Windows phát ra từ một con mèo bé.**
   - Celeste và Animal Crossing cho mỗi nhân vật một giọng "bập bẹ" riêng.
   - Giọng càng giống máy càng bị chấm kém dễ thương ([CHI 2025](https://arxiv.org/html/2507.06235v1); đây là tương quan, không phải thử nghiệm).
   - Robot Vector tự im lặng khi chủ đang làm việc.
5. **Phần JavaScript đã đủ nhẹ. Vấn đề là pet vẫn chạy khi không ai nhìn, trong một cửa sổ trong suốt rất lớn.**
   - Đo được: 0,3–0,4 ms mỗi khung hình trên luồng chính, khoảng 1% của một nhân CPU.
   - Nhưng cửa sổ overlay phủ toàn bộ vùng làm việc của màn hình (`src-tauri/src/overlay.rs:1`).
   - Khi bị ẩn, vòng lặp vẫn chạy 10 khung/giây, và app chưa xử lý khoá máy, tắt màn hình hay tiết kiệm pin.
   - Lời chê phổ biến nhất về desktop pet, sau chuyện tiền, là **tốn máy** ([Gigazine](https://gigazine.net/gsc_news/en/20250108-desktop-mate), [ctrl.blog](https://www.ctrl.blog/entry/macos-runcat/)).

## Lộ trình đề xuất

| # | Đề xuất | Nhóm | Bằng chứng | Công sức |
|---|---|---|---|---|
| 1 | Thoại không lặp: xáo bài và chọn câu theo ngữ cảnh | Gắn bó | Trung bình | Nhỏ (code), lớn (viết câu) |
| 2 | Lò xo cho đuôi, tai, má | Chuyển động | Mạnh về nguyên lý, chưa thử trên pet | Vừa |
| 3 | Ngừng chạy khi không ai thấy | Độ nhẹ | Mạnh (tài liệu Microsoft) | Nhỏ |
| 4 | Ánh mắt tò mò | Chuyển động | Trung bình | Vừa |
| 5 | Phá vòng lặp: thở lệch nhịp, thở dài, sin trộn nhiễu | Chuyển động | Trung bình | Nhỏ |
| 6 | Tốc độ khung hình thích ứng | Chuyển động, độ nhẹ | Thấp–trung bình | Nhỏ |
| 7 | Tính cách riêng cho từng con | Gắn bó | Trung bình | Vừa |
| 8 | Giọng bập bẹ riêng từng loài | Giọng | Trung bình | Vừa |
| 9 | Pet nhớ bạn: kỷ niệm, trang "Mình nhớ gì" | Gắn bó | Trung bình | Vừa |
| 10 | Chuyển cảnh có chuẩn bị và diễn theo tầng | Chuyển động | Trung bình | Vừa |
| 11 | Hành vi mới mở dần theo tuần | Gắn bó | Trung bình | Nhỏ–vừa |
| 12 | Thu nhỏ cửa sổ trong suốt | Độ nhẹ | Trung bình (chưa đo trên Windows) | Lớn |
| 13 | (Tuỳ chọn) Ngồi trên thanh tiêu đề cửa sổ | Vui | Thấp | Lớn |

**Thứ tự gợi ý:**
- **v0.8 "Có hồn":** #1, #2, #3, #4, #5, #6. Phần lớn là việc nhỏ, và đánh thẳng vào điểm "Pet craft".
- **v0.9 "Cá tính":** #7, #8, #9, #10, #11.
- **Sau đó:** #12 (đo trước rồi mới quyết), #13.

## Chi tiết từng đề xuất

### 1. Thoại không lặp
- **Hiện tại:**
  - `done()` trong `src/core/lines.ts` (câu khi xong việc) có 4 câu. `nudge()` có 2 câu cho mỗi tâm trạng.
  - Ai xong 5 việc một ngày chắc chắn gặp câu lặp ngay trong ngày (4 câu cho 5 lần). Mỗi lần còn có 1/4 khả năng trùng đúng câu vừa nói.
- **Làm gì:**
  - **Túi xáo bài** cho từng tình huống, lưu trong `LifeState`: không lặp lại câu nào cho tới khi đã dùng ít nhất 80% túi, và không nói lại một câu trong vòng 48 giờ.
  - **Câu theo ngữ cảnh, quy tắc cụ thể nhất thắng:** "xong việc + là con ếch", "xong việc sau 3 lần dời", "xong việc trước 9 giờ", "xong việc chiều thứ Sáu"…
  - **15–25% số lần xong việc chỉ diễn hoạt cảnh,** không hiện bong bóng.
  - **Số câu cho mỗi ngôn ngữ:**
    - Ít nhất 15 câu cho sự kiện xảy ra nhiều lần một ngày.
    - Ít nhất 8 câu cho sự kiện hằng ngày (lời chào).
    - 3–5 câu cho sự kiện hiếm.
    - Tổng cộng khoảng 400 câu, so với khoảng 170 hiện nay.
- **Vì sao:**
  - Trong nghiên cứu agent 30 ngày với 101 người, đa số vẫn thấy lặp, và với một số người điều đó làm giảm động lực ([Bickmore & Picard](https://courses.media.mit.edu/2004spring/mas630/Articles/BP-TOCHI.pdf)).
  - Một robot pha cà phê chạy 6 tuần: 29% người dùng phàn nàn chuyện lặp, dù chủ đề đã được xoay vòng ([Lim 2023](https://ar5iv.labs.arxiv.org/html/2309.02942)).
  - Hệ thống thoại của Valve (Half-Life 2, Left 4 Dead):
    - Mặc định không lặp lại câu nào trong một nhóm cho tới khi đã dùng hết nhóm. Có thêm cờ chặn lặp theo thời gian, cờ "chỉ nói một lần", và tỉ lệ im lặng ([Valve wiki](https://developer.valvesoftware.com/wiki/Response_System), [tóm tắt bài GDC của Ruskin](https://emshort.blog/2012/03/16/gdc-2012-talk-on-dynamic-dialogue/)).
    - Lần kiểm tra lại không mở được trang wiki, nên đây là điều chưa kiểm chứng lại.
  - Hades không lặp câu cho tới khi hết kho ([nguồn thứ cấp](https://www.christi-kerr.com/post/how-the-dialogue-system-in-hades-rewards-failure)).
  - Windows cũng xoay vòng 4 biến thể của âm thanh focus để khỏi đơn điệu ([Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/design/style/sound)).
- **Rủi ro:**
  - Số câu cho mỗi tình huống là kinh nghiệm của người viết thoại game (2–10, có nơi 8–20+), chưa có thử nghiệm nào ([Beaulieu](https://sarah-beaulieu.com/en/writing-barks-for-video-games)).
  - Viết khoảng 230 câu mới cho mỗi ngôn ngữ là việc nội dung lớn. Có thể nhờ Claude soạn nháp rồi duyệt tay.

### 2. Lò xo cho đuôi, tai, má
- **Hiện tại:**
  - Đuôi mèo được tính bằng góc theo tâm trạng cộng `sin(t·2.2)·5`.
  - Hàm vẽ là hàm thuần của thời gian (`src/pets/render.ts`), nên không có quán tính.
- **Làm gì:**
  - Tính lò xo trong overlay. `PetMotion` vốn đã giữ trạng thái, nên đặt ở đây là hợp. Truyền độ lệch vào `PetPose` (ví dụ `sway: { tail, earL, earR, jiggle }`). Hàm vẽ vẫn giữ được tính thuần.
  - Mỗi phần phụ là một con lắc treo vào thân: θ'' = −k(θ−θ_nghỉ) − cθ' − a/L. Trong đó a là gia tốc của thân, L là độ dài phần phụ, θ_nghỉ là góc theo tâm trạng cộng sóng sin hiện có.
  - Tham số khởi điểm (tự suy ra, cần chỉnh bằng mắt):

    | Phần | Tần số | Độ cản | Ghi chú |
    |---|---|---|---|
    | Đuôi | f ≈ 3 Hz | ζ ≈ 0,5 | Vượt khoảng 16%, lắng trong khoảng 0,4 s |
    | Tai mềm (thỏ, shiba) | f ≈ 4 Hz | ζ ≈ 0,3 | 2–3 nhịp rung |
    | Tai cứng (mèo) | f ≈ 6 Hz | ζ ≈ 0,5 | |
    | Má, bụng | f ≈ 5 Hz | | Co giãn 2–4% |

    Kẹp mọi góc lệch trong ±35°.
  - **Nguồn kích thích:** đáp đất, dừng bước, quay đầu, và nhất là **khi người dùng kéo pet**. Lúc kéo, độ trễ lớn nhất và vui mắt nhất.
  - **Cách tích phân:** dùng nghiệm chính xác hoặc chia bước con 120 Hz. Ở 10 khung/giây, phương pháp Euler bán ẩn mất ổn định khi ω·dt > 2, và tai 4 Hz có ω·dt ≈ 2,5 (tự tính).
- **Vì sao:**
  - "Khi phần dẫn dừng, phần kéo theo vẫn chuyển động", và phần nặng hơn trễ lâu hơn ([SIGGRAPH](https://education.siggraph.org/static/HyperGraph/animation/character_animation/principles/follow_through.htm)).
  - Một nghiên cứu đếm 86 chuyển động phụ trong phim 2D: 43 rung, 37 đung đưa, 6 kéo theo, phần lớn ở đuôi, tai và tóc ([Willett et al., UIST 2017](https://gfx.cs.princeton.edu/pubs/Willett_2017_SMF/paper.pdf), một nguồn).
  - [Spine](https://esotericsoftware.com/spine-physics-constraints) và [Live2D](https://docs.live2d.com/en/cubism-editor-manual/physics-operation/) đều có vật lý lò xo cho phần phụ. Cả hai khuyên tính ở 30–60 khung/giây, vì thấp hơn thì trông giật.
  - Công thức lò xo không phụ thuộc tốc độ khung hình: [Holden, "Spring-It-On"](https://theorangeduck.com/page/spring-roll-call). Apple khuyên độ nảy không quá khoảng 0,4, vì cao hơn trông quá đà ([WWDC23](https://developer.apple.com/videos/play/wwdc2023/10158/)).
- **Rủi ro:** chưa có thử nghiệm nào đo xem chuyển động phụ có làm một pet 2D nhỏ dễ thương hơn hay không. Nguyên lý thì mạnh, nhưng hiệu quả vẫn là giả thuyết. Giữ quy tắc cũ: mỗi lần chỉnh không đổi quá 15–25%, và so sánh trước/sau ở cỡ 64 px và 160 px.

### 3. Ngừng chạy khi không ai thấy
- **Hiện tại:**
  - Overlay là một cửa sổ trong suốt phủ toàn vùng làm việc của màn hình chính (`src-tauri/src/overlay.rs:1`).
  - Khi ẩn (ứng dụng toàn màn hình, pet đi phiêu lưu), vòng lặp vẫn chạy 10 khung/giây (`src/overlay/App.tsx:27`).
  - Phần Rust chưa theo dõi khoá máy, tắt màn hình hay tiết kiệm pin.
- **Số đo của mình:** trên Linux với Chromium (không phải WebView2), dùng `renderPet` thật, 25 loài.

  | Bước | Thời gian mỗi khung |
  |---|---|
  | Tạo chuỗi SVG | 0,02–0,07 ms |
  | Gán `innerHTML` | 0,10–0,14 ms |
  | Tính style và bố cục | 0,13–0,18 ms |

  - Mỗi khung hình có 39–68 phần tử, và 92–100% số khung tạo ra chuỗi khác khung trước. Vì vậy phép so "chỉ cập nhật khi đổi" gần như không tiết kiệm được gì.
  - Tổng cộng khoảng 1% của một nhân ở 30 khung/giây. **Chưa tính** bước vẽ ra pixel và bước ghép cửa sổ của Windows.
- **Làm gì:**
  - Khi ẩn, khoá máy, màn hình tắt, hoặc pin yếu kèm tiết kiệm pin: **dừng hẳn vòng lặp** (0 khung/giây) và ẩn webview. Brain thức tối đa 1 lần mỗi giây.
  - Phía Rust:
    - Đăng ký nhận thông báo trạng thái màn hình và tiết kiệm pin ([Power setting GUIDs](https://learn.microsoft.com/en-us/windows/win32/power/power-setting-guids); mục "energy saver" còn đánh dấu prerelease, cần kiểm lại trong SDK) và sự kiện khoá phiên.
    - Bật EcoQoS cho tiến trình ([Microsoft QoS](https://learn.microsoft.com/en-us/windows/win32/procthread/quality-of-service)).
  - WebView2: đặt `MemoryUsageTargetLevel=Low` và gọi `TrySuspendAsync` khi rảnh ([tài liệu hiệu năng WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance)). Cần kiểm Tauri có cho gọi tới không.
  - **Ngân sách đề xuất** (tự đặt; không tìm thấy ngưỡng nào do người dùng nêu), đo trên laptop 4 nhân lúc rảnh:
    - CPU tổng của Tauri cộng các tiến trình `msedgewebview2` không quá 1%, tính trung bình 60 giây.
    - GPU phát sinh không quá khoảng 2%.
    - RAM không quá khoảng 150 MB.
- **Vì sao:**
  - Desktop Mate dùng khoảng 15% CPU, 50% GPU và 500 MB trên laptop i7-1065G7 ([Gigazine](https://gigazine.net/gsc_news/en/20250108-desktop-mate)).
  - RunCat bị chê hao pin vì thức 4 lần mỗi giây ([ctrl.blog](https://www.ctrl.blog/entry/macos-runcat/)).
  - Theo các bản tóm tắt review, Rusty's Retirement bị chê làm quạt kêu khi chạy nền, còn Bongo Cat và VPet được khen là "nhẹ" ([Vaporlens](https://vaporlens.app/app/2666510/rustys_retirement.md)). Đây là tóm tắt bằng AI nên độ tin thấp–trung bình.
  - Windows chỉ hạ mức ưu tiên của cửa sổ khi nó bị thu nhỏ hoặc bị che hết. Pet luôn nổi trên cùng nên hầu như không được hạ ([Microsoft QoS](https://learn.microsoft.com/en-us/windows/win32/procthread/quality-of-service)).
  - Chromium tự ngừng vẽ cửa sổ bị che và khi khoá máy ([Chromium](https://chromium.googlesource.com/chromium/src/+/master/docs/windows_native_window_occlusion_tracking.md)), nhưng đó là cho cửa sổ của chính Chrome. Không nên trông vào nó với WebView2 trong Tauri (suy luận).

### 4. Ánh mắt tò mò
- **Hiện tại:** mắt đi theo con trỏ trong phạm vi 320 px, hoặc nhìn thẳng ra người dùng (`src/overlay/App.tsx:418`).
- **Làm gì:**
  - **"Điểm tò mò" có quen dần:**
    - Sự kiện kích thích: một ứng dụng hoặc cửa sổ mới lên phía trước, một bong bóng hay cuộc họp sắp tới, con trỏ đi vào gần trong khoảng 250 px.
    - Pet liếc qua trong khoảng 300 ms, giữ 1,5–2 s rồi quay lại.
    - Sự kiện lặp lại thì bớt hứng thú, với nửa đời khoảng 20 s.
  - **Mắt đi trước, đầu theo sau.** Mắt nhảy trong một khung hình (khoảng 30 ms) và hơi vượt đích. Con trỏ đi chậm thì mắt theo mượt.
  - **Nhìn người dùng 2–5 s, rồi nhìn đi chỗ khác 1–3 s.** Khi đổi hướng nhìn lớn hơn nửa tầm mắt thì kèm một cái chớp.
  - Chỉ dùng sự kiện "có cửa sổ mới", không đọc nội dung của cửa sổ.
- **Vì sao:**
  - Robot tập trung vào người đối diện nhưng thỉnh thoảng liếc chuyển động phía sau được chấm tự nhiên và chú ý hơn robot chỉ nhìn chằm chằm hoặc nhìn ngẫu nhiên ([Admoni & Scassellati 2017](https://scazlab.yale.edu/sites/default/files/files/273-2310-1-PB.pdf)).
  - Trẻ 12 tháng chỉ dõi theo "ánh nhìn" của một vật không có mặt sau khi vật đó đã phản hồi lại chúng ([Johnson et al. 1998](https://www.harvardlds.org/wp-content/uploads/2018/05/Johnson-Whose-gaze-would-infants-follow-The-elicitation-of-gaze-following-in-12-month-olds.pdf)). Chính việc phản hồi làm ta thấy nó là một "tác nhân".
  - Thời lượng nhìn vào mắt thấy thoải mái trung bình là 3,3 s ([Binetti 2016](https://eprints.nottingham.ac.uk/34694)). Một cú liếc mắt mất 20–30 ms cộng 2–2,7 ms cho mỗi độ ([Eyes Alive](https://www.cis.upenn.edu/~badler/papers/EyesAlive.pdf)).
  - Disney Research làm ánh mắt cho animatronic theo nhiều lớp (đọc, liếc, chú ý, ghi nhận) và có cơ chế quen dần ([Disney Research](https://la.disneyresearch.com/publication/realistic-and-interactive-robot-gaze/)).
- **Rủi ro:** nghiên cứu chủ yếu làm trên người và robot hình người. Ánh mắt giống người quá có thể phản tác dụng với nhân vật đơn giản (Garau 2003, dẫn qua Admoni; một nguồn).

### 5. Phá vòng lặp
- **Làm gì:**
  - Chu kỳ thở lệch ngẫu nhiên ±10–15%, và cứ 1–4 phút có một **cái thở dài** với biên độ gấp đôi.
  - Đuôi và tai: thay một sóng sin bằng 2–3 sóng sin có tỉ lệ tần số không tròn, cộng nhiễu 0,1–0,3 Hz làm biên độ đổi ±25%. Dùng nhiễu có hạt giống cố định để hàm vẽ vẫn thuần, như cách chớp mắt đang làm.
  - Hoạt cảnh bắt đầu từ tư thế hiện tại và hoà ra mượt (nửa đời khoảng 0,15 s), **không giật về tư thế gốc**.
  - Thỉnh thoảng pet tự dừng lại hoặc đổi tốc độ giữa đường.
- **Vì sao:**
  - Theo Loyall, nhân vật đáng tin không quay về một tư thế nghỉ giữa các hành vi, và những hành động pet tự khởi xướng được người xem "tôn trọng hơn" ([Loyall 1997](https://www.cs.tufts.edu/~nr/cs257/archive/bryan-loyall/CMU-CS-97-123.pdf)).
  - Đổi tốc độ hoặc hướng mà không thấy nguyên nhân tạo cảm giác "sống" ([Tremoulet & Feldman 2000](https://journals.sagepub.com/doi/10.1068/p3101)).
  - Khi robot QRIO bị cài nhảy liên tục, trẻ nhỏ bỏ qua nó ([IEEE Spectrum](https://spectrum.ieee.org/why-toddlers-love-robots)). Một con mèo robot lặp chu kỳ cố định thì "mất sức hút" ([Abendschein 2022](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2022.733078/pdf), nghiên cứu định tính với 9 người).
  - Người lớn tự thở dài vài lần mỗi giờ ([Li et al. 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC4852886)).

### 6. Tốc độ khung hình thích ứng
- **Hiện tại:**
  - 30 khung/giây, hoặc 10 khung/giây khi pet ngủ, ẩn hay ở chế độ "yên".
  - Chế độ "yên" bật mỗi khi người dùng vừa gõ phím trong 20 giây gần nhất, đang tập trung, hoặc đang họp (`src/core/brain.ts:1046`). Nghĩa là **phần lớn ngày làm việc pet chạy ở 10 khung/giây**.
- **Làm gì:**
  - Quy tắc: mỗi khung hình không dịch chuyển quá khoảng 1 px.
  - Ở 10 khung/giây, bật lên 30 khung trong 300–600 ms quanh những chuyển động nhanh: chớp mắt, liếc mắt, lò xo đang lắng.
  - Giữ nguyên tư thế giữa các khung, không nội suy.
  - Tuỳ chọn: làm tròn các giá trị thở và nhìn, để các khung liền nhau ra cùng một chuỗi SVG và bỏ qua được bước cập nhật DOM.
- **Vì sao** (các con số tự tính):
  - Ở 10 khung/giây, nhịp thở khi ngủ với biên độ khoảng 1,3 px dịch dưới 0,3 px mỗi khung, nên mắt không thấy giật.
  - Nhưng một cái vẫy đuôi biên độ 5 px ở 1,5 Hz dịch khoảng 4,7 px mỗi khung, nên **sẽ giật**.
  - Một cái chớp mắt 150 ms chỉ còn một khung hình, thành một cái "bụp".
  - Unreal Engine cũng giảm tốc độ cập nhật animation cho nhân vật nhỏ hoặc ít được nhìn thấy ([Unreal](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/Engine/FAnimUpdateRateParameters)).

### 7. Tính cách riêng cho từng con
- **Hiện tại:** các loài khác nhau ở thân, dáng đi và tiếng kêu ("meow" trong câu thoại). Mọi thứ còn lại là dùng chung.
- **Làm gì:**
  - **Khi nhận nuôi,** mỗi pet được:
    - 3 thanh từ 0 tới 1: năng lượng, tình cảm, gan dạ. Giá trị đầu là mức mặc định của loài ±0,2 ngẫu nhiên.
    - 2 sở thích (một món ăn, một đồ chơi hoặc chỗ yêu thích).
    - 1 câu cửa miệng.
  - **Các thanh quyết định:**
    - Pet hay làm hoạt cảnh rảnh nào (nhiều năng lượng thì hay nhảy và nhìn quanh, ít thì hay ngáp và ngồi).
    - Tốc độ đi, và mức độ chủ động lại gần con trỏ.
    - Biến thể giọng điệu nào của câu thoại được chọn.
  - **Thể hiện rõ ràng,** vì khác biệt nhỏ thì người dùng không nhận ra.
  - **Trôi chậm theo cách dùng:** tối đa 0,03 mỗi tuần, tổng cộng không quá ±0,25, và không bao giờ đặt lại. Ví dụ, người hay làm đêm sẽ có một pet "cú đêm".
  - Hiện nhãn tính cách trên bảng, ví dụ "Hay làm nũng" hay "Gan lì", giống aibo.
- **Vì sao:**
  - Nintendogs cố ý cho các chú chó cùng giống khác nhau về tính cách để "bạn cảm thấy rõ hơn đâu là con của mình" ([Iwata Asks](https://iwataasks.nintendo.com/interviews/3ds/how-nintendo-3ds-made/3/1)). Đây là trường hợp giống TodoPet nhất.
  - aibo hiện nhãn tính cách, thay đổi theo cách chủ đối xử ([Sony](https://helpguide.sony.net/aibo/ers1000/v1/en/contents/TP0001970096.html)). LOVOT và Moflin quảng cáo rằng "không con nào giống con nào", nhưng đó là lời nhà sản xuất.
  - Animal Crossing có 8 kiểu tính cách dùng chung một kho thoại, và người chơi hay chê là lặp. Cá tính của từng dân làng đến từ câu cửa miệng và sở thích ([Nookipedia](https://nookipedia.com/wiki/Personality)).
  - Người dùng thường chỉ nhận ra khác biệt tính cách của robot khi nó được thể hiện mạnh ([Robert et al.](https://arxiv.org/pdf/2001.11777)).
  - Khi một bản cập nhật Replika làm người dùng thấy bạn đồng hành "thành người khác", họ tiếc nuối và đánh giá thấp phiên bản mới ([De Freitas 2024](https://arxiv.org/abs/2412.14190)). Vì vậy tính cách phải ổn định.
- **Rủi ro:**
  - Số thanh và tốc độ trôi là phỏng đoán thiết kế.
  - The Sims đã bỏ thanh trượt, chuyển sang vài nét tính cách có tên (3 nét ở Sims 4). Nên cân nhắc dùng nét có tên thay cho thanh số.

### 8. Giọng bập bẹ riêng từng loài
- **Hiện tại:** `src/overlay/sound.ts` có 5 tiếng chuông dùng chung, cộng giọng đọc Windows đẩy cao độ lên 1,35.
- **Làm gì:**
  - **Tổng hợp bằng WebAudio, không cần file âm thanh.**
    - Sóng tam giác, hoặc răng cưa qua bộ lọc thấp 3,5 kHz, rồi qua 2 bộ lọc dải ở formant F1/F2 cao gấp 1,2–1,4 lần giọng người lớn.
    - Đường bao: lên trong 8 ms, tắt trong 40 ms. Mỗi âm tiết 60–90 ms, lướt cao độ 30 ms.
  - **Cao độ theo cỡ thân:**

    | Cỡ | Ví dụ | Cao độ gốc |
    |---|---|---|
    | Tí hon | vịt, ếch | 700–900 Hz |
    | Nhỏ | mèo, thỏ, chim cánh cụt | 500–700 Hz |
    | Vừa | shiba | 400–500 Hz |
    | To | rồng | 250–350 Hz, formant thấp |

    Mỗi con lệch thêm một khoảng cố định trong ±1 nửa cung, theo id của nó, để không con nào giống hệt con nào.
  - **Ngữ điệu:**
    - 12–16 âm tiết mỗi giây, mỗi âm tiết lệch ngẫu nhiên ±0,8 nửa cung.
    - Câu kể đi xuống 1–2 nửa cung, câu hỏi lên 3–4, câu cảm thêm 2.
  - **Theo tâm trạng:**
    - Vui: cao hơn 2–3 nửa cung, dải rộng, nhanh hơn 15%, kết bằng quãng ba trưởng.
    - Lo lắng: thấp hơn 2–3 nửa cung, dải hẹp, chậm hơn 20%, kết bằng quãng ba thứ.
  - **Độ dài:** tối đa 10 âm tiết hoặc 1,2 s, cộng một âm kết. Với tiếng Việt, mỗi âm tiết một tiếng. Ánh xạ 6 thanh điệu sang đường cao độ là ý tưởng chưa ai thử.
  - **Khi nào phát:**
    - Chỉ khi người dùng gây ra (bấm, vuốt, cho ăn) và khi ăn mừng xong việc.
    - Bong bóng tự hiện thì im, hoặc tối đa 1 lần mỗi 15 phút.
    - 3 phút không tương tác thì chỉ còn tiếng nhỏ, rồi im hẳn.
    - Im khi đang toàn màn hình, trình chiếu hoặc bật Không làm phiền ([SHQueryUserNotificationState](https://learn.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-shqueryusernotificationstate); cần kiểm nó có phản ánh Không làm phiền của Windows 11 không), và khi micro đang dùng.
    - Có nút tắt một chạm trên khay.
  - **Âm lượng:** đỉnh khoảng −24 dBFS, nhỏ hơn tiếng chuông khoảng 6 dB. Đây là phỏng đoán, vì không có chuẩn cho tiếng UI.
  - **Giọng đọc Windows** chuyển thành tuỳ chọn trợ năng "đọc to bong bóng", không còn là giọng của pet, và không bao giờ phát cùng lúc với tiếng bập bẹ.
- **Vì sao:**
  - **Celeste** (tài liệu FMOD chính thức và chuỗi bài của người thiết kế âm thanh; độ tin cao): mỗi nhân vật có một tông tổng hợp riêng. Mỗi cảm xúc có khoảng 20 âm tiết thường, 10 âm tiết nhấn và 10 âm kết, phát ngẫu nhiên và không lặp liền ([FMOD](https://www.fmod.com/docs/2.03/studio/appendix-a-celeste.html), [Regamey](https://threadreaderapp.com/scrolly/1416483583053602816)).
  - **Animal Crossing:** con vật nhỏ có giọng cao hơn, vui thì cao lên, buồn thì thấp xuống ([Nookipedia](https://nookipedia.com/wiki/Animalese); wiki của người chơi).
  - **Âm cao và trong nghe nhỏ bé, thân thiện; âm thấp và rè nghe to lớn, thù địch** ([Morton 1977](https://repository.si.edu/handle/10088/11626)). Một meta-analysis ủng hộ điều này nhưng có ngoại lệ ([Winter](https://pmc.ncbi.nlm.nih.gov/articles/PMC8558772/)).
  - **Người thiết kế âm thanh cho robot** ([phỏng vấn](https://media.springernature.com/original/springer-static/esm/art%3A10.1007%2Fs12369-022-00891-0/MediaObjects/12369_2022_891_MOESM1_ESM.pdf)):
    - Cozmo nhóm âm thanh theo tâm trạng và độ dài, mỗi nhóm 5–10 biến thể, vì "nếu mọi chuyển động đều phát âm thanh thì sẽ rất phiền".
    - Vector không phát âm cảm xúc khi mức kích thích thấp hơn 0,8, vì "khi họ muốn làm việc thì nó cần im lặng".
  - **Giọng giống máy kém dễ thương:** trong nghiên cứu CHI 2025, giọng càng giống máy càng bị chấm kém dễ thương (r = −0,39, tương quan). Nâng cao độ chỉ giúp với một số giọng, và có giới hạn ([Super Kawaii Vocalics](https://arxiv.org/html/2507.06235v1)). Vì vậy chỉ đẩy cao giọng Windows lên là không đủ.
  - **Âm thanh trong giờ làm có giá:**
    - Thông báo làm giảm sự chú ý ngay cả khi bị bỏ qua ([Stothart 2015](https://www.psychologicalscience.org/news/motr/youre-distracted-even-when-you-ignore-that-text.html)).
    - Âm thanh thay đổi liên tục, như tiếng bập bẹ, làm nhiễu các việc cần nhớ thứ tự ([Kattner 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9569014)).
    - Vì vậy phải hạn chế phát khi pet tự lên tiếng.
- **Rủi ro:** chưa có nghiên cứu nào về âm thanh của desktop pet trong giờ làm. Các tham số lấy từ bản làm lại mã nguồn mở của Animalese ([crate `animalese`](https://docs.rs/animalese/latest/src/animalese/lib.rs.html)) và từ suy luận.

### 9. Pet nhớ bạn
- **Hiện tại:** `LifeState` chỉ có bộ đếm (chuỗi ngày, chuỗi dài nhất, combo cao nhất, tổng việc xong) và không lưu ngày nhận nuôi.
- **Làm gì:**
  - Lưu **tối đa 30 "kỷ niệm"** trên máy:
    - ngày đầu tiên gặp nhau;
    - ngày xong nhiều việc nhất, chuỗi dài nhất;
    - giờ hay xong việc;
    - dự án hay làm nhất (chỉ đếm, không tên việc);
    - lần vắng mặt lâu nhất;
    - các mốc 7, 30, 100 và 365 ngày.
  - **Tối đa một lần nhắc kỷ niệm mỗi ngày,** và chỉ nói những gì chắc chắn đúng: "Hôm nay tròn 30 ngày mình ở cùng bạn", "Thứ Ba tuần trước bạn xong 7 việc, kỷ lục đó!".
  - Có trang **"Mình nhớ gì"** trên bảng, kèm nút Quên.
  - Giữ đúng chính sách riêng tư hiện nay: không tên việc, chỉ lưu trên máy.
- **Vì sao:**
  - **iCat** (robot bạn chơi cờ, 5 tuần): phiên bản biết đồng cảm và nhớ các phiên trước giữ nguyên được cảm giác hiện diện và mức gắn kết; phiên bản không có thì giảm dần ([Leite](https://scazlab.yale.edu/sites/default/files/files/IolandaLeite_PhD_Dissertation.pdf)).
  - **Snackbot** (4 tháng): robot nhớ món ăn vặt và thói quen của từng người tạo được sự thân thiết, hợp tác và gắn kết hơn ([Lee 2012](https://minlee.ischool.utexas.edu/materials/Publication/2012-HRI-personalization.pdf)). Lần kiểm tra lại không mở được tệp PDF.
  - **Nhớ đúng** làm tăng sự thích thú và độ đáng tin. Quên thì vẫn chấp nhận được. **Nhớ sai là tệ nhất** ([Richards & Bransky](https://researchers.mq.edu.au/en/publications/forgetmenot-what-and-how-users-expect-intelligent-virtual-agents-/)).
  - **Kể chuyện về chính mình:** agent kể chuyện ở ngôi thứ nhất được người dùng đăng nhập nhiều hơn trong một tháng so với agent kể cùng câu chuyện về người khác ([Bickmore & Battaglino](https://distantreader.org/stacks/journals-ojs/aiide/aiide-12832.pdf)). Nhật ký và bưu thiếp hiện có là chỗ để nối vào.
- **Rủi ro:** một số người thấy như bị theo dõi (Snackbot, [Jo 2024](https://arxiv.org/abs/2402.11353)). Phải minh bạch và luôn có nút Quên.

### 10. Chuyển cảnh có chuẩn bị và diễn theo tầng
- **Hiện tại:** màu và tư thế đổi tâm trạng cùng lúc, theo một hệ số `k` (`src/pets/render.ts:136`).
- **Làm gì:**
  - **Bắt đầu và dừng:** trước khi đi, pet ngả ngược nhẹ một chút; khi dừng, vượt quá khoảng 5–10% bước chân rồi về.
    - Có thể dùng bộ lọc Cartoon Animation Filter với A ≈ 2–3 và σ ≈ 80–120 ms. Quỹ đạo của pet đã biết trước, nên bộ lọc dùng được.
    - Hoặc dùng một bộ bám bậc hai có r < 0.
  - **Quay đầu:** mắt quay trước khoảng 80 ms, rồi tới đầu, rồi thân lật kèm ép dẹt 3–5%, cuối cùng là đuôi theo lò xo.
  - **Đổi tâm trạng:**
    - Một nhịp "nhận ra" 150–300 ms: mắt và lông mày đổi trước.
    - Tai theo sau 60–120 ms.
    - Tư thế thân đổi trong 300–500 ms.
    - Đuôi đổi cuối cùng.
  - **Phản ứng theo sự kiện** cho những chỗ người đánh giá đã chỉ ra:
    - "Bê hộp" khi đang tải bản cập nhật, "vươn vai khởi động lại" khi đã cài xong.
    - Pet chủ quay đầu và vẫy lại khi pet bạn tới thăm.
- **Vì sao:**
  - Động tác chuẩn bị (anticipation) báo cho người xem biết sắp nhìn vào đâu ([SIGGRAPH](https://education.siggraph.org/static/HyperGraph/animation/character_animation/principles/anticipation.htm)).
  - Thời lượng quyết định ý nghĩa: cùng một cú quay đầu, nhanh thì đọc là "bị đánh", chậm thì đọc là "đang nghĩ" ([SIGGRAPH](https://education.siggraph.org/static/HyperGraph/animation/character_animation/principles/timing.htm)).
  - Bộ lọc Cartoon Animation Filter tự tạo ra chuẩn bị và vượt đà từ một chuyển động trơn ([Wang et al., SIGGRAPH 2006](https://grail.cs.washington.edu/wp-content/uploads/2015/08/wang-2006-tca.pdf)).
  - Theo Thomas & Johnston, "mỗi suy nghĩ có một biểu cảm chính" (dẫn trong [Loyall 1997](https://www.cs.tufts.edu/~nr/cs257/archive/bryan-loyall/CMU-CS-97-123.pdf)).

### 11. Hành vi mới mở dần theo tuần
- **Làm gì:**
  - Trong 10 tuần đầu, mỗi tuần mở một gói nhỏ: một hoạt cảnh rảnh mới, vài câu thoại, một phản ứng mới. Sau đó mỗi tháng một gói.
  - Nối vào "chương truyện hằng tuần" và các giai đoạn lớn lên đã có.
  - Một vài câu chỉ mở khi pet đã thân với người dùng.
- **Vì sao:**
  - Robot Robovie mất hứng thú của phần lớn trẻ sau tuần đầu. Phiên bản "giả lớn lên", mở hành vi mới cho trẻ tương tác nhiều và tự kể về mình, giữ được trẻ qua tuần thứ hai ([Leite](https://scazlab.yale.edu/sites/default/files/files/IolandaLeite_PhD_Dissertation.pdf)).
  - Con thỏ biết nói Karotz chạy 6 tháng trong 70 gia đình: điểm đánh giá giảm rồi tăng trở lại. Sự hữu ích, cảm giác hiện diện và niềm vui là những yếu tố báo trước việc người dùng giữ nó lâu dài ([de Graaf et al.](https://research.utwente.nl/en/publications/0cc258fb-888c-4d65-a582-f2b015e79028)).

### 12. Thu nhỏ cửa sổ trong suốt
- **Làm gì:**
  - **Đo trước** trên Windows: GPU của `dwm.exe` và WebView2 ở 1080p và 4K với overlay hiện tại.
  - Nếu con số đáng kể: chỉ dùng một dải cao vừa đủ cho pet và bong bóng, nới rộng khi mở bảng; hoặc tách pet ra cửa sổ riêng. Xác định vùng bấm theo độ trong suốt của từng điểm ảnh.
- **Vì sao:**
  - Trong Electron, khi một cửa sổ có 4 video 480p trên màn hình 2160p không còn bị đánh dấu trong suốt, GPU của DWM giảm từ 16–18% xuống dưới 1% ([electron#39895](https://github.com/electron/electron/pull/39895)).
  - Đó là số liệu tác giả PR tự đo với tải video, không phải tải của một pet.
  - Overlay của TodoPet phủ toàn vùng làm việc.
- **Rủi ro:** việc lớn, vì bong bóng, bảng, góc nhà và việc kéo pet ra ngoài dải đều phải làm lại. Chưa có số đo trên Windows, nên phải đo trước khi quyết định.

### 13. (Tuỳ chọn) Ngồi trên thanh tiêu đề cửa sổ
- **Làm gì:**
  - Chỉ bật khi người dùng chọn.
  - Duyệt cửa sổ từ trên xuống bằng `EnumWindows`, bỏ qua cửa sổ bị ẩn (cloaked), thu nhỏ hoặc phóng to.
  - Lấy khung cửa sổ bằng `DWMWA_EXTENDED_FRAME_BOUNDS` ở chế độ Per-Monitor DPI v2, và theo dõi cửa sổ bằng `SetWinEventHook` thay vì hỏi liên tục ([Old New Thing](https://devblogs.microsoft.com/oldnewthing/20210104-00/?p=104656), [mã nguồn Shimeji](https://github.com/DalekCraft2/Shimeji-Desktop)).
- **Vì sao:** Desktop Mate, Mate Engine và Shimeji đều quảng bá việc ngồi trên hoặc leo cửa sổ ([Notebookcheck](https://www.notebookcheck.net/This-free-software-tops-the-Steam-charts-but-it-s-not-a-game.945113.0.html), [Mate Engine](https://github.com/shinyflvre/Mate-Engine)). Tuy vậy, **không tìm thấy bằng chứng nào cho thấy tính năng này làm tăng đánh giá**, nên để ưu tiên thấp.
- **Rủi ro:** che nội dung là lời chê phổ biến (VPet, Desktop Mate). Đa màn hình và DPI dễ gây lỗi.

## Những điều không nên làm
- Không phát âm thanh cho mọi bong bóng tự hiện (Cozmo: "rất phiền"; Vector im lặng khi chủ làm việc).
- Không đổi tính cách đột ngột qua một bản cập nhật (Replika).
- Không "nhớ" bằng cách đoán; chỉ nói những gì chắc chắn đúng (Richards & Bransky).
- Không đẩy thông số nào quá 15–25% trong một lần chỉnh. Quy tắc này từ đợt nghiên cứu trước vẫn đúng với biên độ lò xo và độ vượt.

## Cách kiểm chứng
- **Chuyển động:** so sánh trước và sau ở cỡ 64 px và 160 px, **ở cả 30 và 10 khung/giây**, vì pet chạy 10 khung/giây suốt lúc người dùng gõ phím.
- **Thoại:** viết test bằng đồng hồ giả. 10 lần xong việc trong một ngày phải ra 10 câu khác nhau, và không câu nào lặp lại trong 48 giờ.
- **Hiệu năng:** đo trên Windows bằng Task Manager hoặc WPR (CPU tổng, GPU của `dwm.exe`, RAM) ở 1080p và 4K, trước và sau #3 và #12.
- **Rubric "Pet craft":** thêm hai tiêu chí, "phản ứng đúng với sự kiện" và "không lặp thoại trong một ngày".

## Giới hạn của nghiên cứu
- **Chưa có thử nghiệm nào trên chính desktop pet.** Bằng chứng đến từ robot xã hội, nhân vật game và agent hội thoại. Các nghiên cứu robot dài hạn đều nhỏ.
- **Nhiều con số là quy ước nghề hoặc tự suy ra,** đã ghi rõ ở từng chỗ: tham số lò xo, giọng, số câu, tốc độ trôi tính cách, ngân sách hiệu năng.
- **Số liệu Steam** lấy từ trang theo dõi của bên thứ ba. Phần khen và chê theo Vaporlens là tóm tắt review bằng AI.
- **Kiểm tra lại bốn nguồn then chốt:**
  - Số liệu GPU trong PR của Electron đúng, nhưng là tải video.
  - Nghiên cứu CHI 2025 đúng, nhưng là tương quan, và hiệu ứng của việc nâng cao độ có giới hạn.
  - Trang wiki Valve (lỗi 403) và PDF Snackbot (lỗi chứng chỉ) không mở lại được.
- **Số đo hiệu năng của mình** chạy trên Linux với Chromium, không phải WebView2 trên Windows, và chưa gồm bước vẽ ra pixel và ghép cửa sổ.
- **Không có tài liệu kỹ thuật chính thức** cho giọng của Animal Crossing, Undertale, Kirby hay A Short Hike. Các số liệu lấy từ bản làm lại mã nguồn mở và một devlog.
- **Một trang chứa lời nhắn gửi cho AI:** một phản hồi API của OpenAlex bảo agent gửi yêu cầu để lấy API key. Mình đã bỏ qua.

## Phương pháp
- Bốn hướng nghiên cứu chạy song song:
  1. Kỹ thuật hoạt hình và độ tin của nhân vật.
  2. Tính cách và sự gắn bó lâu dài.
  3. Thể loại desktop pet và hiệu năng trên Windows.
  4. Giọng nói và âm thanh.
- Tổng cộng khoảng 400 lượt tìm kiếm và đọc trang. Ưu tiên bài báo, tài liệu chính thức và phỏng vấn người làm sản phẩm, rồi tới dữ liệu công bố, cuối cùng là tóm tắt review.
- Đối chiếu với code v0.7.0: `src/pets/*`, `src/overlay/App.tsx`, `src/overlay/sound.ts`, `src/core/lines.ts`, `src/core/l10n.ts`, `src/core/life.ts`, `src/core/brain.ts`, `src-tauri/src/overlay.rs`.
- Đo thời gian vẽ của cả 25 loài bằng `renderPet` thật, trong Node và trong Chromium.
