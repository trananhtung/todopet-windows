# Batch 5: greetings, the morning line, and baths (36 new lines)

`greeting.{morning,midday,afternoon,evening}` +3 each, `morning.{plan,frogPicked,frog}` +5 each, `dirty` +4,
`cleaned` +3, `cleaned.clean` +2.

When each is said:

- `greeting.*`: the first greeting of the day, by the time: morning (before 11:00), midday (to 13:00), afternoon (to
  18:00), evening. Every line keeps its opening ("Chào buổi sáng!" / "Good morning!"…): it says what time of day it
  is, and a dozen tests check for it; only what follows varies.
- `morning.*`: follows the greeting on the same line. `plan`: today's plan is short of the target (always shows
  `{planned}/{target}`). `frogPicked`: the next task is the frog you picked when you wrapped up (always says you
  picked it). `frog`: the next task, as today's frog.
- `dirty`: under the greeting after missed days (finishing a task gives the pet a bath). `cleaned`: under a done
  line, a layer washed off; `cleaned.clean`: the last one.

Filled in: `{planned}` planned so far, `{target}` today's target, `{open}` tasks for today, `“{next}”` the next task,
`{dirt}` missed days ("13 ngày" / "13 missed days"; "1 missed day" for one).

| key | # | VI | EN | note |
|---|---|---|---|---|
| `greeting.morning` | 2 | Chào buổi sáng! Hôm nay mình cùng cố gắng nhé 🌅 | Good morning! Let's make today a good one 🌅 | mới |
| `greeting.morning` | 3 | Chào buổi sáng! Ngủ ngon không bạn? ☕ | Good morning! Did you sleep well? ☕ | mới |
| `greeting.morning` | 4 | Chào buổi sáng! Mình đợi bạn từ sớm đó 🐾 | Good morning! I've been waiting for you 🐾 | mới |
| `greeting.midday` | 2 | Chào buổi trưa! Ăn trưa chưa đó? 🍱 | Good day! Had lunch yet? 🍱 | mới |
| `greeting.midday` | 3 | Chào buổi trưa! Nửa ngày rồi, mình vẫn ở đây 🌤 | Good day! Halfway through, and I'm still here 🌤 | mới |
| `greeting.midday` | 4 | Chào buổi trưa! Nghỉ chút cho khoẻ nhé 😌 | Good day! Take a breather if you need one 😌 | mới |
| `greeting.afternoon` | 2 | Chào buổi chiều! Buổi chiều thong thả nha 🍵 | Good afternoon! Let's take the afternoon easy 🍵 | mới |
| `greeting.afternoon` | 3 | Chào buổi chiều! Mình nhớ bạn ghê 🌇 | Good afternoon! I missed you 🌇 | mới |
| `greeting.afternoon` | 4 | Chào buổi chiều! Còn cả buổi để làm điều hay 🌻 | Good afternoon! Plenty of day left for good things 🌻 | mới |
| `greeting.evening` | 2 | Chào buổi tối! Gặp bạn vui ghê 🌙 | Good evening! Glad to see you 🌙 | mới |
| `greeting.evening` | 3 | Chào buổi tối! Mình ở đây, nhẹ nhàng thôi nhé 🕯️ | Good evening! I'm here, let's keep it gentle 🕯️ | mới |
| `greeting.evening` | 4 | Chào buổi tối! Trời tối rồi, nhớ nghỉ ngơi nha ⭐ | Good evening! It's dark out, remember to rest ⭐ | mới |
| `morning.plan` | 2 | Hôm nay mình chọn {target} việc nhé? Đang có {planned}/{target} 📝 | Shall we pick {target} tasks today? {planned}/{target} so far 📝 | mới |
| `morning.plan` | 3 | Kế hoạch hôm nay: {planned}/{target} việc. Thêm vài việc nữa nha ✍️ | Today's plan: {planned}/{target} tasks. A few more to add ✍️ | mới |
| `morning.plan` | 4 | Mới lên {planned}/{target} việc thôi. Cùng chọn nốt nhé? 🗂️ | Just {planned}/{target} planned. Pick the rest together? 🗂️ | mới |
| `morning.plan` | 5 | Mình lên kế hoạch cho hôm nay nha: {planned}/{target} việc rồi 📋 | Let's plan today: {planned}/{target} tasks so far 📋 | mới |
| `morning.plan` | 6 | Hôm nay việc gì quan trọng nhất? Mới có {planned}/{target} việc 🤔 | What matters most today? {planned}/{target} planned 🤔 | mới |
| `morning.frogPicked` | 2 | Hôm nay có {open} việc. Bắt đầu với con ếch bạn đã chọn: “{next}” 🐸 | {open} tasks today. Start with the frog you picked: “{next}” 🐸 | mới |
| `morning.frogPicked` | 3 | Bạn đã chọn “{next}” làm con ếch hôm nay. Mình bắt đầu nhé? 🐸 | You picked “{next}” as today's frog. Shall we start? 🐸 | mới |
| `morning.frogPicked` | 4 | {open} việc đang chờ, mở màn bằng con ếch bạn chọn: “{next}” 🎬 | {open} tasks waiting, opening with the frog you picked: “{next}” 🎬 | mới |
| `morning.frogPicked` | 5 | Đúng như bạn đã chọn hôm trước: “{next}” đi đầu nha 🐸 | Just as you picked last time: “{next}” goes first 🐸 | mới |
| `morning.frogPicked` | 6 | Con ếch bạn tự chọn đang chờ: “{next}”. Ăn nó trước nha 🐸 | The frog you picked is waiting: “{next}”. Eat it first 🐸 | mới |
| `morning.frog` | 2 | Hôm nay có {open} việc. Con ếch hôm nay: “{next}” 🐸 | {open} tasks today. Today's frog: “{next}” 🐸 | mới |
| `morning.frog` | 3 | {open} việc cho hôm nay. Ếch trước: “{next}”, phần còn lại dễ thở hơn 🐸 | {open} tasks for today. Frog first: “{next}”, then the rest gets easier 🐸 | mới |
| `morning.frog` | 4 | Có {open} việc nè. Mình xử con ếch “{next}” trước nhé? 🐸 | {open} tasks here. Shall we tackle the frog, “{next}”, first? 🐸 | mới |
| `morning.frog` | 5 | Con ếch to nhất hôm nay là “{next}”. Bắt đầu từ nó nha 🐸 | Today's biggest frog is “{next}”. Let's start there 🐸 | mới |
| `morning.frog` | 6 | {open} việc hôm nay, ếch “{next}” đi đầu. Mình cổ vũ bạn 🐸 | {open} tasks today, with the frog “{next}” up first. I'm cheering for you 🐸 | mới |
| `dirty` | 2 | 🛁 Mình dính bụi {dirt} ngày rồi. Một việc xong là mình được tắm | 🛁 Dusty after {dirt}. One finished task and I'm in the bath | mới |
| `dirty` | 3 | 🛁 Lỡ {dirt} ngày nên mình hơi bẩn. Xong một việc là sạch ngay | 🛁 A bit grubby after {dirt}. One task and I'm clean again | mới |
| `dirty` | 4 | 🛁 Mình lấm lem sau {dirt} ngày nè. Xong một việc là tắm cho mình nhé? | 🛁 All smudgy after {dirt}. Finish a task to give me a bath? | mới |
| `dirty` | 5 | 🛁 {dirt} ngày chưa tắm rồi đó. Một việc nhỏ thôi là mình sạch | 🛁 {dirt} without a bath. One small task is all I need to get clean | mới |
| `cleaned` | 2 | 🛁 Bớt lấm lem rồi nè… | 🛁 Less smudgy now… | mới |
| `cleaned` | 3 | 🛁 Tráng sơ rồi, thêm vài việc nữa là sạch bong | 🛁 A quick rinse, a few more tasks and I'm spotless | mới |
| `cleaned` | 4 | 🛁 Cảm ơn bạn, mình sạch hơn rồi | 🛁 Thank you, I'm cleaner already | mới |
| `cleaned.clean` | 2 | 🛁 Sạch tinh tươm, thơm phức luôn! | 🛁 Spotless and smelling lovely! | mới |
| `cleaned.clean` | 3 | 🛁 Tắm xong rồi, cảm ơn bạn nhiều! | 🛁 All clean, thank you so much! | mới |
