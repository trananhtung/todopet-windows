# Checklist: đo vòng lặp khung hình (#3) trên Windows thật

*Cho đề xuất #3 trong [research-pet-quality.md](research-pet-quality.md): pet ngừng vẽ khi không ai thấy, và đứng yên khi bật tiết kiệm pin. Code: `src/overlay/cadence.ts`, `src/overlay/App.tsx`, `src-tauri/src/system/power.rs`.*

## Mục tiêu

1. **Không ai thấy thì không vẽ.** Khoá máy, tắt màn hình, phiên Remote Desktop bị ngắt, pet bị ẩn hoặc đi phiêu lưu: pet vẽ 0 khung/giây.
2. **Tiết kiệm pin thì đứng yên.** Pet chỉ cử động khi bạn tương tác hoặc có chuyện xảy ra.
3. **Luôn tỉnh lại.** Không có trường hợp nào pet bị "đứng hình" mãi.
4. **Có số mốc.** Ghi CPU, GPU và RAM để so sánh với các bản sau.

## Code làm gì (để biết kết quả mong đợi)

| Tình huống | Pet vẽ | Phát hiện bằng | Độ trễ |
|---|---|---|---|
| Bình thường | 30 khung/giây | | |
| Vừa gõ phím (trong 20 s gần nhất), đang "vào guồng" (gõ đều 10 phút), đang họp, hoặc pet ngủ (với tuỳ chọn mặc định "đứng yên khi gõ") | 10 khung/giây | | |
| Khoá máy | 0 | `WTSQuerySessionInformationW`, đọc mỗi giây | ≤ 1 s |
| Phiên RDP bị ngắt kết nối | 0 | như trên (`WTSDisconnected`) | ≤ 1 s |
| Màn hình của phiên tắt (mờ vẫn tính là bật) | 0 | thông báo `GUID_SESSION_DISPLAY_STATUS` | ≤ 1 s |
| Pet bị ẩn (khay → Ẩn 1 giờ, ứng dụng toàn màn hình, đi phiêu lưu) | 0, trừ khoảng 1 s ở 10 khung/giây để đặt bong bóng khẩn hoặc biển báo | trạng thái của app | ngay |
| Tiết kiệm pin, pet đứng yên (không tự làm cử chỉ lúc rảnh) | 0 | `GetSystemPowerStatus().SystemStatusFlag`, đọc mỗi giây | ≤ 1 s |
| Tiết kiệm pin, con trỏ đến gần pet (khoảng 1,5 lần cỡ pet) | 10 (mắt theo con trỏ) | | |
| Tiết kiệm pin, bạn bấm, kéo hoặc vuốt pet | 30 cho tới khi xong | | |
| Tiết kiệm pin, pet ăn mừng hoặc đang đi, rơi | 30 (10 nếu bạn vừa gõ phím) cho tới khi xong | | |

**Nhịp tỉnh ngắn** (bình thường, không phải lỗi):
- Ở mọi dòng "0" trong bảng trên, mỗi khi app có thay đổi (lúc yên ổn là khoảng 15 giây một lần), vòng lặp tỉnh dậy khoảng 1 giây ở 10 khung/giây để đặt bong bóng, rồi ngủ lại.
- Nhờ vậy, nếu Windows báo nhầm là máy đang khoá, lời nhắc vẫn hiện đúng chỗ.
- Bộ đếm sẽ thấy những nhịp nhỏ, dưới 1 lần vẽ/giây tính trung bình. Chỉ khi thấy một chuỗi liên tục 10 hoặc 30 lần/giây thì mới là lỗi.

**Khi tiết kiệm pin**, pet không tự ngáp, gãi, vươn vai hay hắt xì. Nó chỉ đáp lại bạn: chào khi bạn quay lại, cười khi bị bấm, lắc mình khi được thả xuống.

**Những gì vẫn chạy khi pet ngừng vẽ** (bình thường, không phải lỗi): luồng lấy mẫu hệ thống (1 lần/giây), kiểm tra vùng bấm (10 lần/giây), bộ hẹn giờ của brain, và vòng lặp riêng của pet bạn bè khi đang ghé chơi. Vì vậy CPU của TodoPet sẽ gần 0 chứ không bằng đúng 0.

## Chuẩn bị

- [ ] **Máy thử.**
  - Ít nhất một laptop Windows 11 chạy pin, đã có **Energy saver** (Windows 11 24H2 trở lên).
  - Nếu có thể, thêm một máy Windows 10 (có **Battery saver**).
  - Với mỗi máy, ghi lại: số build (`winver`), CPU, GPU, độ phân giải và tỉ lệ scale của từng màn hình.
- [ ] **Bản build.** Cài bản release (`npm run tauri build`) và ghi lại commit.
- [ ] **Script đo.** Chép [`measure-todopet.ps1`](measure-todopet.ps1) vào máy. Mở PowerShell trong thư mục đó và cho phép chạy script trong phiên hiện tại:
  ```powershell
  Set-ExecutionPolicy -Scope Process Bypass
  ```
- [ ] **Bộ đếm khung hình (khuyên dùng).** Bộ đếm này cho biết pet có thật sự ngừng vẽ không, mà không phải đoán qua CPU.
  1. Thoát TodoPet (khay → Thoát).
  2. Mở lại với cổng gỡ lỗi của WebView2:
     ```powershell
     $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
     & "<đường dẫn tới TodoPet.exe>"
     ```
     Đường dẫn: chuột phải TodoPet trong Start → Open file location.
  3. Mở Edge, vào `edge://inspect`, bấm Configure, thêm `localhost:9222`.
  4. Bấm **inspect** ở trang `overlay.html`, rồi dán đoạn sau vào Console:
     ```js
     (() => {
       const host = document.querySelector(".pet > div");
       let n = 0, since = performance.now();
       new MutationObserver(() => n++).observe(host, { childList: true });
       window.__fps = [];
       setInterval(() => {
         const now = performance.now();
         __fps.push({ at: new Date().toLocaleTimeString(), fps: +(n / ((now - since) / 1000)).toFixed(1) });
         n = 0;
         since = now;
       }, 2000);
       return "Đang đếm số lần vẽ lại mỗi giây";
     })();
     ```
  5. Sau mỗi tình huống, xem lại bằng `console.table(__fps.slice(-40))`. Khi khoá máy hay tắt màn hình bạn không xem trực tiếp được, nên bảng này cho biết chuyện đã xảy ra lúc đó.
  6. **Thử xong thì thoát TodoPet và mở lại bình thường**, để đóng cổng 9222.
- [ ] **Log** (ở `%LOCALAPPDATA%\com.trananhtung.todopet\logs\`):
  - Ngay sau khi mở app, log phải có dòng `Display on`, và mỗi lần màn hình tắt hoặc bật thì có thêm `Display off` hoặc `Display on`.
  - Nếu không có dòng `Display on` nào, nghĩa là thông báo màn hình không tới, và các mục C sẽ không đạt. Hãy ghi lại số build Windows; khi đó cần đổi sang cách đăng ký nhận thông báo bằng cửa sổ ẩn.
  - Nếu có dòng `Display on/off detection is off`, nghĩa là đăng ký thông báo đã thất bại.

## Cách đo CPU, GPU, RAM

```powershell
.\measure-todopet.ps1 -Seconds 60 -Label "A1 rảnh"
.\measure-todopet.ps1 -Delay 15 -Seconds 120 -Label "B3 khoá máy"   # 15 s để bấm Win+L
```

- Script tìm tiến trình TodoPet cùng mọi tiến trình con của nó (các tiến trình WebView2 `msedgewebview2.exe`). Sau đó nó đo:
  - **CPU:** theo % của cả máy, như Task Manager, và theo % của một nhân.
  - **GPU:** engine 3D của các tiến trình đó, và GPU của `dwm.exe` (trình ghép cửa sổ của Windows).
  - **RAM:** working set và private bytes.
  - **Trạng thái nguồn:** cờ tiết kiệm pin mà Windows báo (`SystemStatusFlag`) và đang cắm sạc hay chạy pin.
- Mỗi lần đo thêm một dòng vào `todopet-measurements.csv` trên Desktop.
- Nếu Windows dùng ngôn ngữ hiển thị khác tiếng Anh, tên bộ đếm `\GPU Engine` bị dịch nên script ghi GPU là `n/a`. Khi đó, đọc cột GPU của Task Manager (thẻ Details, thêm cột GPU) cho các tiến trình `TodoPet.exe`, `msedgewebview2.exe` và `dwm.exe`.
- Với khoá máy và tắt màn hình, dùng `-Delay` để có thời gian thao tác. Script vẫn chạy khi máy đang khoá, và in kết quả khi bạn mở khoá.
- **Để so sánh công bằng:** đóng các app nặng, không di chuột, và đo mỗi tình huống ít nhất 60 s.

**Ngân sách tạm thời** (tự đặt trong báo cáo nghiên cứu, chưa có ngưỡng từ người dùng):

| Lúc | CPU (cả máy, trung bình) | GPU phát sinh | RAM |
|---|---|---|---|
| Rảnh, pet hiện | ≤ 1 % | ≤ khoảng 2 % | ≤ khoảng 150 MB |
| Khoá máy, tắt màn hình, bị ẩn | gần 0 (≤ 0,2 %) | gần 0 | không tăng |

## Các tình huống

Ghi kết quả vào bảng ở cuối file. "Vẽ" là số lần vẽ lại mỗi giây đọc từ bộ đếm.

### A. Mốc so sánh
- [ ] **A1. Rảnh, pet hiện.** Không gõ phím, con trỏ để xa pet. Đo 60 s. Mong đợi: vẽ khoảng 30.
- [ ] **A2. Đang gõ phím.** Gõ liên tục trong Notepad, đo 60 s. Mong đợi: vẽ khoảng 10.

### B. Khoá máy
- [ ] **B1.** Bấm Win+L, chờ 2 phút. Mong đợi: vẽ 0 sau tối đa khoảng 1 s.
- [ ] **B2.** Mở khoá. Mong đợi: pet cử động lại trong vòng khoảng 2 s, không nhảy chỗ, không kẹt.
- [ ] **B3.** Đo CPU khi khoá máy (`-Delay 15 -Seconds 120`). So sánh với A1.
- [ ] **B4.** Khoá máy hơn 6 phút rồi mở khoá. Mong đợi: pet vẫy tay chào. Đây là lời chào khi bạn quay lại sau hơn 5 phút vắng mặt, và nó phải còn hoạt động dù vòng lặp đã ngủ trong lúc đó.
- [ ] **B5.** Khoá máy, cho máy ngủ (Sleep), đánh thức, rồi mở khoá. Mong đợi như B2.

### C. Tắt màn hình (không khoá)
- [ ] **C1.** Tắt màn hình bằng một trong hai cách:
  - Đặt Settings → System → Power → Screen timeout = 1 phút, rồi để yên.
  - Hoặc chạy lệnh sau. Nếu màn hình không tắt, dùng cách đặt Screen timeout ở trên:
    ```powershell
    (Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern int PostMessage(int h, int m, int w, int l);' -Name Monitor -Namespace TodoPetTest -PassThru)::PostMessage(0xFFFF, 0x0112, 0xF170, 2)
    ```
  Mong đợi: vẽ 0.
- [ ] **C2.** Đo CPU khi màn hình tắt, bằng `-Delay`.
- [ ] **C3.** Lúc màn hình chỉ **mờ đi**, trước khi tắt hẳn, pet vẫn cử động.
- [ ] **C4.** Di chuột để bật màn hình lại. Mong đợi: pet cử động lại trong vòng khoảng 2 s.

### D. Tiết kiệm pin
- [ ] **D1. Windows 10 Battery saver:** rút sạc, rồi bật Battery saver. Mong đợi:
  - Pet thôi đi lang thang, đứng yên, và vẽ 0 sau khoảng 2 s.
  - Script báo `SaverFlag = 1`.
- [ ] **D2. Windows 11 Energy saver** (Settings → System → Power & battery → Energy saver → Turn on now). Thử cả khi **cắm sạc** và khi **chạy pin**. **Đây là điều chưa biết quan trọng nhất:**
  - Microsoft chỉ ghi `SystemStatusFlag` cho battery saver.
  - Nếu script báo `SaverFlag = 0` trong khi Energy saver đang bật, thì code hiện tại không nhận ra Energy saver. Khi đó hãy ghi lại số build, để đổi sang cách đọc khác.
- [ ] **D3. Khi đang tiết kiệm pin:**
  - Đưa con trỏ lại gần pet: mắt pet theo con trỏ, vẽ khoảng 10. Đưa ra xa: vẽ về 0.
  - Bấm pet 3 lần nhanh: pet cười khúc khích, mượt ở 30 khung/giây.
  - Kéo và thả pet: di chuyển mượt, rơi xuống đất, lắc mình.
- [ ] **D4.** Hoàn thành một việc trong Todoist khi đang tiết kiệm pin. Mong đợi:
  - Màn ăn mừng chạy trọn vẹn, rồi pet đứng yên lại.
  - Bong bóng hiện đúng chỗ cạnh pet.
- [ ] **D5.** Tắt tiết kiệm pin. Mong đợi: pet đi lại bình thường trong vòng khoảng 2 s.
- [ ] **D6.** Đo CPU khi tiết kiệm pin và pet đứng yên. So sánh với A1.

### E. Ẩn pet
- [ ] **E1.** Khay → Ẩn 1 giờ: vẽ 0. Khay → Hiện: pet hiện lại và được vẽ ngay.
- [ ] **E2. Toàn màn hình**, với tuỳ chọn ẩn khi toàn màn hình đang bật: thử trình duyệt F11, video YouTube toàn màn hình, và trình chiếu PowerPoint.
  - Mong đợi: vẽ 0.
  - Nếu có bong bóng khẩn (ví dụ nhắc họp), nó vẫn hiện đúng chỗ.
  - Thoát toàn màn hình thì pet quay lại.
- [ ] **E3. Đi phiêu lưu:**
  - Pet vắng mặt, biển báo đứng đúng chỗ, và vẽ 0.
  - Bấm biển báo gọi pet về: pet quay lại và được vẽ ngay.

### F. Nhiều màn hình
- [ ] **F1.** Hai màn hình, pet ở màn hình chính. Chỉ tắt (bằng nút nguồn) màn hình **phụ**. Mong đợi: pet vẫn cử động.
- [ ] **F2.** Thử lần lượt:
  - đổi màn hình chính;
  - rút màn hình ngoài;
  - đổi scale của màn hình chính từ 100 % sang 150 %.

  Mong đợi: overlay tự khớp lại, pet được vẽ đúng chỗ ở vị trí mới, không đứng hình.
- [ ] **F3.** Để cả hai màn hình tự tắt (Screen timeout). Mong đợi: vẽ 0. Bật lại thì pet cử động lại.

### G. Remote Desktop
Cần một máy khác để kết nối vào máy đang chạy TodoPet.

- [ ] **G1.** Kết nối RDP vào máy chạy TodoPet. Phiên của bạn sẽ chuyển sang cửa sổ RDP. Mong đợi: pet cử động trong cửa sổ RDP.
- [ ] **G2.** Trong lúc đang kết nối RDP, để **màn hình vật lý** của máy chạy TodoPet tự tắt. Mong đợi: pet vẫn cử động trong cửa sổ RDP. Code dùng trạng thái màn hình của *phiên* (`GUID_SESSION_DISPLAY_STATUS`) chứ không dùng màn hình vật lý, và đây là bước kiểm chứng điều đó.
- [ ] **G3.** Đóng cửa sổ RDP (ngắt kết nối, không sign out), đợi 1 phút. Đo CPU bằng cách chạy script với `-Delay` trước khi ngắt. Mong đợi: gần 0, vì phiên bị ngắt được tính là không ai thấy.
- [ ] **G4.** Kết nối lại. Mong đợi: pet cử động lại trong vòng khoảng 2 s.
- [ ] **G5.** Khoá máy *bên trong* phiên RDP (Start → tài khoản → Lock). Mong đợi: vẽ 0. Mở khoá thì pet cử động lại.

### H. Hồi quy chung
- [ ] **H1.** Sau mỗi tình huống ở trên, rê chuột, bấm và kéo pet. Pet phải phản hồi; không có tình huống nào pet đứng hình mãi.
- [ ] **H2.** Trong log không có lỗi mới.
- [ ] **H3.** Nếu pet đang diễu hành hoặc càu nhàu (lúc bạn ở trang xao nhãng) mà bạn khoá máy hoặc mở toàn màn hình, thì lúc quay lại pet **không** diễn tiếp màn đó. Màn diễn bị huỷ, giống như khi bạn ẩn pet.
- [ ] **H4.** Khi tiết kiệm pin, để pet yên 5 phút (chỉ dùng chuột ở xa pet). Pet không tự ngáp, gãi hay vươn vai, và bộ đếm không có chuỗi 30 lần/giây nào.

## Bảng kết quả

| Mục | Windows build | Mong đợi | Vẽ/giây | CPU % (máy) | GPU % | GPU dwm % | RAM (MB) | Đạt? | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|
| A1 | | khoảng 30 | | | | | | | |
| A2 | | khoảng 10 | | | | | | | |
| B3 | | 0 | | | | | | | |
| C2 | | 0 | | | | | | | |
| D2 | | 0, `SaverFlag = 1` | | | | | | | |
| D6 | | 0 | | | | | | | |
| G3 | | 0 | | | | | | | |

## Những gì checklist này không trả lời
- Có nên thu nhỏ cửa sổ trong suốt hay không (đề xuất #12). Muốn biết thì so sánh GPU của `dwm.exe` ở A1 giữa màn hình 1080p và 4K.
- Vẽ ở 30 khung/giây trên laptop yếu có đủ rẻ để bỏ chế độ 10 khung/giây hay không (câu hỏi của Architect trong phiên dev-team). Muốn biết thì so sánh A1 với A2 trên máy yếu nhất bạn có.
