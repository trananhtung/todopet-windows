# Batch 2: finishing the day's plan, and the pet's rewards (41 new lines)

`allDone` +7, `planComplete.next` +5, `planComplete` +3, `voice.cheer` +4, `combo` +4, `golden` +3, `levelUp` +3,
`streak` +5, `hungry` +5, `hungry.starving` +2.

When each is said:

- `allDone`: every task of today is done (the bubble has a "＋ Plan tomorrow" button).
- `planComplete.next` / `planComplete`: the plan reached today's target, with or without a next task to start.
- `voice.cheer`: said aloud (voice on) when the pet grows up or gets a golden treat. No emoji: it is spoken.
- `combo`, `golden`, `levelUp`: extra lines under the done line. `streak`: under the morning greeting.
- `hungry` / `hungry.starving`: the pet is hungry (starving under 10%); "Finish “{next}” and feed me 🥺" follows when
  there is a next task.

Filled in: `“{next}”` the next task, `{target}` today's target, `{n}` the combo or the streak's days, `{stage}` the
growth stage (Baby, Kid, Teen, Grown-up, Master / Em bé, Nhóc, Thiếu niên, Trưởng thành, Cao thủ). The extra lines
keep their leading icon (🔥, ✨, ⬆️) like the shipped ones, so they read as a list under the done line.

The shipped lines (option 1 of each key; options 1–2 of `voice.cheer`) stay as they are.

| key | # | VI | EN | note |
|---|---|---|---|---|
| `allDone` | 2 | Danh sách hôm nay trống trơn rồi! Phần còn lại của ngày là của bạn 🎉 | Today's list is all clear! The rest of the day is yours 🎉 | mới |
| `allDone` | 3 | Xong sạch! Mình tự hào về bạn lắm. Nghỉ chút nhé ☕ | All done! I'm so proud of you. Take a little break ☕ | mới |
| `allDone` | 4 | Hết việc rồi nè! Muốn chọn sẵn việc cho mai thì bấm nút dưới nhé 📝 | Nothing left! Want to line up tomorrow? The button's right below 📝 | mới |
| `allDone` | 5 | Một ngày trọn vẹn! Hôm nay bạn đã làm rất tốt 🌟 | A full day! You did really well today 🌟 | mới |
| `allDone` | 6 | Xong hết rồi, giờ mình được chơi với bạn rồi phải không? 🥰 | All done, so now we get to hang out, right? 🥰 | mới |
| `allDone` | 7 | Không còn việc nào hôm nay. Thư giãn đi, bạn xứng đáng mà 🛋️ | No tasks left today. Relax, you've earned it 🛋️ | mới |
| `allDone` | 8 | Hôm nay xong rồi! Lần sau mình lại cùng nhau tiếp nhé 🌙 | Today's done! We'll pick it up together next time 🌙 | mới |
| `planComplete.next` | 2 | Kế hoạch {target} việc xong rồi! Mở đầu bằng “{next}” nhé 🐸 | Your {target} tasks are set! Open with “{next}” 🐸 | mới |
| `planComplete.next` | 3 | Đủ {target} việc, kế hoạch gọn gàng. Bắt đầu từ “{next}” thôi 🚀 | {target} tasks, a tidy plan. Let's start with “{next}” 🚀 | mới |
| `planComplete.next` | 4 | Lên kế hoạch xong! Việc đầu tiên: “{next}” 🎯 | Plan done! First up: “{next}” 🎯 | mới |
| `planComplete.next` | 5 | {target} việc đã vào hàng. “{next}” đứng đầu nè 🐸 | {target} tasks lined up. “{next}” goes first 🐸 | mới |
| `planComplete.next` | 6 | Tuyệt, có kế hoạch rồi! Thử bắt tay vào “{next}” nhé 💪 | Great, the plan's ready! Try getting into “{next}” 💪 | mới |
| `planComplete` | 2 | Kế hoạch {target} việc cho hôm nay đã sẵn sàng 📋 | Today's plan of {target} tasks is ready 📋 | mới |
| `planComplete` | 3 | Đủ {target} việc rồi! Mình sẵn sàng cùng bạn 💪 | {target} tasks planned! I'm ready when you are 💪 | mới |
| `planComplete` | 4 | Kế hoạch xong xuôi. Từng việc một thôi nhé 🌱 | Plan all set. One task at a time 🌱 | mới |
| `voice.cheer` | 3 | Giỏi quá! | Well done! | mới |
| `voice.cheer` | 4 | Hay lắm luôn! | That's amazing! | mới |
| `voice.cheer` | 5 | Tuyệt quá đi! | So great! | mới |
| `voice.cheer` | 6 | Đỉnh thật! | Brilliant! | mới |
| `combo` | 2 | 🔥 ×{n} liền tay! | 🔥 ×{n} in a row! | mới |
| `combo` | 3 | 🔥 Combo ×{n}! Đà đang lên rồi | 🔥 Combo ×{n}! You've got momentum | mới |
| `combo` | 4 | 🔥 {n} việc liên tiếp, nóng tay quá! | 🔥 {n} in a row, you're on a roll! | mới |
| `combo` | 5 | 🔥 Combo ×{n}, mình theo không kịp luôn! | 🔥 Combo ×{n}, I can barely keep up! | mới |
| `golden` | 2 | ✨ Bánh vàng hiếm xuất hiện! Hôm nay may mắn ghê | ✨ A rare golden treat appeared! Lucky day | mới |
| `golden` | 3 | ✨ Ôi, bánh vàng! Mình chia bạn một nửa nha | ✨ Ooh, a golden treat! Half of it is yours | mới |
| `golden` | 4 | ✨ Trúng bánh vàng hiếm, thêm XP thưởng nè | ✨ Rare golden treat, bonus XP! | mới |
| `levelUp` | 2 | ⬆️ Mình vừa lớn thêm một chút. Giai đoạn mới: {stage}! | ⬆️ I just grew a little. New stage: {stage}! | mới |
| `levelUp` | 3 | ⬆️ Nhìn mình nè: {stage} rồi! Cảm ơn bạn đã chăm mình | ⬆️ Look at me now: {stage}! Thanks for looking after me | mới |
| `levelUp` | 4 | ⬆️ Lên cấp! Giờ mình là {stage} | ⬆️ Level up! Stage: {stage} | mới |
| `streak` | 2 | 🔥 {n} ngày liền rồi, mình nhớ từng ngày đó! | 🔥 {n} days in a row, and I remember every one! | mới |
| `streak` | 3 | 🔥 Chuỗi {n} ngày, đều đặn ghê | 🔥 A {n}-day streak, so steady | mới |
| `streak` | 4 | 🔥 {n} ngày liên tiếp rồi. Hôm nay mình thêm một ngày nhé? | 🔥 {n} days in a row. Shall we add today? | mới; sửa sau review: today doesn't count yet |
| `streak` | 5 | 🔥 {n} ngày không đứt quãng, bạn kiên trì thật | 🔥 {n} days without a break, you really stick with it | mới |
| `streak` | 6 | 🔥 {n} ngày rồi! Mình vui vì được đồng hành cùng bạn | 🔥 {n} days! I'm glad to be on this with you | mới |
| `hungry` | 2 | Mình hơi đói rồi 🍪 | I'm getting a bit hungry 🍪 | mới |
| `hungry` | 3 | Bụng mình kêu ọc ọc nè 🥨 | My tummy is grumbling 🥨 | mới |
| `hungry` | 4 | Có ai cho mình ăn không ta? 🍜 | Anyone got a snack for me? 🍜 | mới |
| `hungry` | 5 | Mình thèm một bữa ngon quá 🍱 | I'm craving something tasty 🍱 | mới |
| `hungry` | 6 | Đói đói rồi, nhưng mình vẫn ổn 🙂 | A little peckish, but I'm okay 🙂 | mới |
| `hungry.starving` | 2 | Mình đói muốn xỉu luôn… 😵 | So hungry I could faint… 😵 | mới |
| `hungry.starving` | 3 | Bụng rỗng tuếch rồi… 🫠 | Totally empty tummy… 🫠 | mới |
