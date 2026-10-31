# Batch 6: focus and breaks (38 new lines)

`focusStart.task` +5, `focusStart` +3, `focusEnd.task` +5, `focusEnd` +3, `breakStart` +4, `breakEnd` +4,
`backToWork` +5, `welcomeBack` +7, `voice.hungry` +2.

When each is said:

- `focusStart(.task)`: a focus session starts, on a task or not. The pet stays quiet during it.
- `focusEnd(.task)`: the session is over (buttons: ✓ Done, another round, a break). Every line says how long it was.
- `breakStart`: a break starts (every line says "N-minute break"). `breakEnd`: the break is over.
- `backToWork`: you start again after "done for today", and the pet wakes up.
- `welcomeBack`: you come back to the computer after a while away, with the next task. Every line opens with
  "Bạn về rồi!" / "Welcome back!": the tests check it shows up only when it should, by that opening.
- `voice.hungry`: said aloud when the pet is hungry. No "!" and no emoji.

Filled in: `{m}` minutes ("25 minutes", "1 minute" for one), `“{title}”` the task of the session, `“{next}”` the next
task.

| key | # | VI | EN | note |
|---|---|---|---|---|
| `focusStart.task` | 2 | {m} phút cho “{title}”, bắt đầu! Mình giữ yên lặng nha 🤫 | {m} minutes for “{title}”, go! I'll keep it quiet 🤫 | mới |
| `focusStart.task` | 3 | Tập trung vào “{title}” trong {m} phút nhé. Mình canh cửa cho 🚪 | Focus on “{title}” for {m} minutes. I'll guard the door 🚪 | mới |
| `focusStart.task` | 4 | Hẹn giờ {m} phút cho “{title}”. Mình im như tượng luôn 🗿 | Timer set: {m} minutes for “{title}”. I'll be still as a statue 🗿 | mới |
| `focusStart.task` | 5 | Bắt đầu nào: “{title}”, {m} phút. Mình ngồi đây cổ vũ thầm 🤍 | Here we go: “{title}”, {m} minutes. Cheering you on quietly 🤍 | mới |
| `focusStart.task` | 6 | {m} phút chỉ dành cho “{title}”. Mình không làm phiền đâu 🔕 | {m} minutes just for “{title}”. I won't interrupt 🔕 | mới |
| `focusStart` | 2 | {m} phút tập trung, bắt đầu! Mình giữ im lặng 🤫 | {m} minutes of focus, go! I'll stay quiet 🤫 | mới |
| `focusStart` | 3 | Hẹn giờ {m} phút rồi nhé. Mình không làm phiền đâu 🔕 | Timer set for {m} minutes. I won't interrupt 🔕 | mới |
| `focusStart` | 4 | Một phiên {m} phút cho bạn. Mình canh giờ giúp ⏳ | A session of {m} minutes for you. I'll keep time ⏳ | mới |
| `focusEnd.task` | 2 | Xong {m} phút rồi! “{title}” tới đâu rồi? ⏰ | {m} minutes done! How far did “{title}” get? ⏰ | mới |
| `focusEnd.task` | 3 | Hết {m} phút. Đánh dấu xong “{title}”, hay thêm một phiên nữa? 🔁 | That's {m} minutes. Mark “{title}” done, or another round? 🔁 | mới |
| `focusEnd.task` | 4 | Ting! {m} phút cho “{title}” đã xong. Nghỉ chút nhé? 🔔 | Ding! {m} minutes on “{title}”, complete. A short break? 🔔 | mới |
| `focusEnd.task` | 5 | Hết giờ rồi nè! Sau {m} phút, “{title}” xong chưa bạn? 🙂 | Time! After {m} minutes, is “{title}” done? 🙂 | mới |
| `focusEnd.task` | 6 | {m} phút trôi qua nhẹ nhàng. “{title}” ổn chưa? ✨ | {m} minutes flew by. How's “{title}” looking? ✨ | mới |
| `focusEnd` | 2 | Xong {m} phút tập trung! Nghỉ ngơi chút nhé ☕ | {m} minutes of focus done! Time for a breather ☕ | mới |
| `focusEnd` | 3 | Ting! Hết {m} phút rồi. Vươn vai cái nào 🙆 | Ding! {m} minutes, all done. Time to stretch 🙆 | mới |
| `focusEnd` | 4 | {m} phút tuyệt vời. Bạn muốn nghỉ hay làm tiếp? 🤔 | {m} minutes, nicely done. Break or keep going? 🤔 | mới |
| `breakStart` | 2 | Nghỉ {m} phút thôi nha. Hít thở sâu nào 🌿 | A {m}-minute break. Take a deep breath 🌿 | mới |
| `breakStart` | 3 | Giờ nghỉ {m} phút bắt đầu. Đứng dậy đi lại chút nhé 🚶 | Your {m}-minute break starts now. Get up and move a little 🚶 | mới |
| `breakStart` | 4 | {m} phút cho bạn thư giãn. Mình trông chừng mọi thứ 🛋️ | {m}-minute break, all yours. I'll keep an eye on things 🛋️ | mới |
| `breakStart` | 5 | Nghỉ {m} phút, nhìn ra xa cho mắt đỡ mỏi nha 👀 | {m}-minute break: look far away to rest your eyes 👀 | mới |
| `breakEnd` | 2 | Nghỉ xong rồi! Mình quay lại nhẹ nhàng nhé 🌱 | Break's done! Let's ease back in 🌱 | mới |
| `breakEnd` | 3 | Ting! Hết giờ nghỉ. Sẵn sàng chưa? 🔔 | Ding! Break time's over. Ready? 🔔 | mới |
| `breakEnd` | 4 | Nạp năng lượng xong rồi, mình tiếp tục thôi ⚡ | Recharged! Let's carry on ⚡ | mới |
| `breakEnd` | 5 | Hết giờ nghỉ rồi nè. Sẵn sàng cho việc tiếp chưa? 🙂 | That's the break. Ready for what's next? 🙂 | mới; sửa sau review: a break can end with no task left |
| `backToWork` | 2 | Ơ, bạn làm tiếp hả? Mình dậy liền nè ☀️ | Oh, back at it? I'm awake ☀️ | mới |
| `backToWork` | 3 | Mình thức rồi! Có gì cần cứ bảo mình nha 🙋 | I'm awake! Just tell me if you need anything 🙋 | mới |
| `backToWork` | 4 | *dụi mắt* Mình sẵn sàng rồi đây 😊 | *rubs eyes* I'm ready 😊 | mới |
| `backToWork` | 5 | Bạn quay lại rồi, mình cũng dậy luôn 🌤 | You're back, so I'm up too 🌤 | mới |
| `backToWork` | 6 | Chào lại nha! Mình ở đây nếu bạn cần 💛 | Hello again! I'm here if you need me 💛 | mới |
| `welcomeBack` | 2 | Bạn về rồi! Mình nhớ bạn đó. Làm tiếp “{next}” nha? 🥰 | Welcome back! I missed you. Back to “{next}”? 🥰 | mới |
| `welcomeBack` | 3 | Bạn về rồi! Mình giữ chỗ cho “{next}” nè 🪑 | Welcome back! I saved a spot for “{next}” 🪑 | mới |
| `welcomeBack` | 4 | Bạn về rồi! Nghỉ ngơi thoải mái chưa? “{next}” đang đợi 🙂 | Welcome back! Feeling rested? “{next}” is waiting 🙂 | mới |
| `welcomeBack` | 5 | Bạn về rồi! Mình làm tiếp từ “{next}” nhé? 🔄 | Welcome back! Pick up again with “{next}”? 🔄 | mới |
| `welcomeBack` | 6 | Bạn về rồi! Một phiên ngắn cho “{next}” không? ⏱ | Welcome back! A short session for “{next}”? ⏱ | mới |
| `welcomeBack` | 7 | Bạn về rồi! Chỗ bạn dừng là “{next}” đó 📍 | Welcome back! You left off at “{next}” 📍 | mới |
| `welcomeBack` | 8 | Bạn về rồi! Mình mừng ghê. Tiếp “{next}” nhé? 🐾 | Welcome back! So happy to see you. On with “{next}”? 🐾 | mới |
| `voice.hungry` | 2 | Bụng mình kêu rồi. | My tummy is rumbling. | mới |
| `voice.hungry` | 3 | Cho mình ăn một chút nhé? | Could you feed me a little? | mới |
