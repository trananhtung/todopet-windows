# Batch 3: nudges and overdue tasks (39 new lines, 2 shortened)

`nudge.{normal,happy,annoyed,angry}` +6 each, `overdue` +5, `overdue.worried` +3, `overdue.repeating` +2,
`voice.grumble` +2, `voice.angry` +3; `overdue.worried` #1 and `overdue.repeating` #1 shortened.

When each is said:

- `nudge.*`: a reminder of the next task, by the pet's mood: happy (things are going well), normal, annoyed (a
  little worried), angry (no task done for hours; `{h}` is how many). Buttons: ▶ Focus, ✓ Done, Later.
- `overdue` / `overdue.worried`: overdue tasks that can move (worried: when the pet's mood is low). Buttons: "Dời vào
  hôm nay / Move to today", "Bắt đầu lại / Fresh start" (all to tomorrow), "Xem / Show". Every line offers the fresh
  start, in those words, as the tests ask.
- `overdue.repeating`: only repeating tasks are overdue, so nothing can move (only Show). These lines never offer to
  move them.
- `voice.grumble`, `voice.angry`: said aloud. No "!" and no emoji (the tests ask that spoken lines invite, never order).

Filled in: `“{next}”` the next task, `{h}` hours without a finished task, `{n}` how many tasks, `{title}` the task
said aloud (no quotes). In English "{n} overdue tasks" / "{n} repeating tasks" say "1 overdue task", and "them"
becomes "it", for one task.

| key | # | VI | EN | note |
|---|---|---|---|---|
| `nudge.normal` | 3 | “{next}” đang đợi bạn đó. Bắt đầu nhẹ nhàng nhé? 🌿 | “{next}” is waiting for you. Ease into it? 🌿 | mới |
| `nudge.normal` | 4 | Hay mình làm “{next}” một chút nhỉ? ⏱ | How about a little time on “{next}”? ⏱ | mới |
| `nudge.normal` | 5 | Tiếp theo trong danh sách: “{next}”. Mình cùng làm nha 🙌 | Next on the list: “{next}”. Let's do it together 🙌 | mới |
| `nudge.normal` | 6 | Một phiên tập trung cho “{next}” không? Mình ngồi canh 🛡️ | A focus session for “{next}”? I'll keep watch 🛡️ | mới |
| `nudge.normal` | 7 | Bước kế tiếp: “{next}”. Chỉ cần mở ra xem thôi cũng được 👀 | Next step: “{next}”. Even just opening it counts 👀 | mới |
| `nudge.normal` | 8 | Mình nghĩ giờ hợp để làm “{next}” đó ✍️ | Feels like a good moment for “{next}” ✍️ | mới |
| `nudge.happy` | 3 | Bạn đang vào guồng rồi! “{next}” tiếp nhé 🚀 | You've got a rhythm going! “{next}” next? 🚀 | mới; sửa sau review: "the zone" is flow in this app, when no nudge shows |
| `nudge.happy` | 4 | Nhịp đẹp quá! Nhân tiện xử luôn “{next}” nha 😎 | Great rhythm! Might as well take on “{next}” 😎 | mới |
| `nudge.happy` | 5 | Đà này mà làm “{next}” là chuẩn luôn ✨ | With this momentum, “{next}” is perfect timing ✨ | mới |
| `nudge.happy` | 6 | Vui ghê! Mình đi tiếp với “{next}” nhé 🎶 | This is fun! On to “{next}” 🎶 | mới |
| `nudge.happy` | 7 | Năng lượng đang tốt, “{next}” chờ bạn đó 🌞 | Energy's good, “{next}” is waiting for you 🌞 | mới |
| `nudge.happy` | 8 | Cứ thế mà tiến! Tiếp theo: “{next}” 🏃 | Keep it going! Next: “{next}” 🏃 | mới |
| `nudge.annoyed` | 3 | “{next}” trông hơi to nhỉ? Chia nhỏ ra, làm phần dễ nhất trước nhé 🧩 | “{next}” looks big? Break it down and start with the easiest bit 🧩 | mới |
| `nudge.annoyed` | 4 | Mình ở đây nè. Thử 5 phút với “{next}” thôi, không cần xong ngay 🌱 | I'm right here. Just 5 minutes on “{next}”, no need to finish 🌱 | mới |
| `nudge.annoyed` | 5 | Có vẻ hơi khó bắt đầu. Mở “{next}” ra xem trước nhé? 👀 | Hard to get started? Just open “{next}” and have a look 👀 | mới |
| `nudge.annoyed` | 6 | Không sao đâu. Một bước nhỏ với “{next}” là đủ cho lúc này 🤍 | It's okay. One small step on “{next}” is all it takes for now 🤍 | mới |
| `nudge.annoyed` | 7 | Mình hơi lo nè. Cùng làm “{next}” 10 phút, mình canh giờ cho 🕙 | I'm a bit worried. Let's do 10 minutes of “{next}”, I'll time it 🕙 | mới |
| `nudge.annoyed` | 8 | Bắt đầu từ chỗ dễ nhất của “{next}” nhé, mình tin bạn 💛 | Start with the easiest part of “{next}”, I believe in you 💛 | mới |
| `nudge.angry` | 3 | {h} tiếng trôi qua rồi. Mình thử 10 phút với “{next}” nhé? ⏳ | {h}h have gone by. Shall we try 10 minutes of “{next}”? ⏳ | mới |
| `nudge.angry` | 4 | Mình đứng đây chờ “{next}” với bạn nè. Bắt đầu thôi? 🙋 | I'm standing by for “{next}” with you. Shall we start? 🙋 | mới |
| `nudge.angry` | 5 | Lâu rồi chưa có việc nào xong. Bước nhỏ nhất của “{next}” là gì nhỉ? 🔎 | It's been a while since a win. What's the tiniest step of “{next}”? 🔎 | mới |
| `nudge.angry` | 6 | Mình nhớ cảm giác gạch việc lắm! Cùng làm “{next}” nha? 🥺 | I miss ticking things off! Shall we do “{next}” together? 🥺 | mới |
| `nudge.angry` | 7 | {h} tiếng rồi đó. Mình bật đồng hồ cho “{next}” nhé, chỉ 15 phút 🕒 | It's been {h}h. Let me start a timer for “{next}”, just 15 minutes 🕒 | mới |
| `nudge.angry` | 8 | Không trách bạn đâu, mình chỉ muốn giúp. “{next}” trước nhé? 🤝 | No blame here, I just want to help. “{next}” first? 🤝 | mới |
| `overdue` | 2 | {n} việc đã quá hạn. Dời vào hôm nay, hay sang mai bắt đầu lại? 🗓️ | {n} overdue tasks. Today, or a fresh start tomorrow? 🗓️ | mới |
| `overdue` | 3 | Còn {n} việc quá hạn nè. Xử lý hôm nay, hay để mai bắt đầu lại cho nhẹ? 🌤️ | {n} overdue tasks left. Handle them today, or a fresh start tomorrow? 🌤️ | mới |
| `overdue` | 4 | {n} việc lỡ hẹn rồi, không sao đâu. Dời vào hôm nay hay sang mai bắt đầu lại? 🙂 | {n} overdue tasks, and that's okay. Today, or a fresh start tomorrow? 🙂 | mới |
| `overdue` | 5 | Có {n} việc quá hạn. Bạn chọn nhé: hôm nay, hoặc dời sang mai để bắt đầu lại 📅 | {n} overdue tasks. Your call: today, or move them for a fresh start tomorrow 📅 | mới |
| `overdue` | 6 | {n} việc quá hạn đang đợi. Gom vào hôm nay, hay sang mai bắt đầu lại nhẹ nhàng? 🍃 | {n} overdue tasks waiting. Fold them into today, or a gentle fresh start tomorrow? 🍃 | mới |
| `overdue.worried` | 1 | {n} việc quá hạn đang chờ. Mình giúp nhé: dời vào hôm nay, hay sang mai bắt đầu lại? 😟 | {n} overdue tasks waiting. I can help: move them to today, or a fresh start tomorrow? 😟 | sửa (cũ: "{n} việc quá hạn đang chờ… 😟 Để mình giúp: dời vào hôm nay, hoặc dời hết sang mai để bắt đầu lại." / "{n} overdue tasks waiting… 😟 Let me help: move them to today, or clear them to tomorrow for a fresh start.") |
| `overdue.worried` | 2 | {n} việc quá hạn làm mình hơi lo. Sang mai bắt đầu lại cho nhẹ nhé? 😟 | {n} overdue tasks have (has, for one) me a bit worried. A fresh start tomorrow, maybe? 😟 | mới |
| `overdue.worried` | 3 | Mình thấy {n} việc quá hạn. Đừng lo: làm hôm nay, hoặc sang mai bắt đầu lại 🤝 | I see {n} overdue tasks. Don't worry: today, or a fresh start tomorrow 🤝 | mới |
| `overdue.worried` | 4 | {n} việc quá hạn đang chờ. Sang mai bắt đầu lại cũng là lựa chọn hay đó 🌱 | {n} overdue tasks waiting. A fresh start tomorrow is a fine choice too 🌱 | mới |
| `overdue.repeating` | 1 | {n} việc lặp lại đang quá hạn. Chúng tự quay lại theo lịch, nên cứ thong thả 🔁 | {n} repeating tasks are overdue. They come back on schedule, so no rush 🔁 | sửa (cũ: "{n} việc lặp lại đang quá hạn 🔁 Chúng tự quay lại theo lịch, nên xong lần này khi bạn rảnh là được." / "{n} repeating tasks are overdue 🔁 They come back on their own schedule, so just tick this one off when you can.") |
| `overdue.repeating` | 2 | Quá hạn: {n} việc lặp lại. Không sao, lịch sẽ mang lượt sau đến 🔁 | Overdue: {n} repeating tasks. No stress, the schedule will bring the next round 🔁 | mới |
| `overdue.repeating` | 3 | {n} việc lặp lại đang trễ một chút. Xong khi nào tiện là được nha 🔁 | {n} repeating tasks running a bit late. Tick off whenever it suits you 🔁 | mới |
| `voice.grumble` | 3 | Mình làm cùng nhau một chút nhé? | Want to do a little together? | mới |
| `voice.grumble` | 4 | Một bước nhỏ thôi cũng được mà. | Even one small step is fine. | mới |
| `voice.angry` | 2 | Thử {title} vài phút nhé? Mình ngồi đây với bạn. | Try {title} for a few minutes? I'm right here. | mới |
| `voice.angry` | 3 | Mình cùng bắt đầu {title} nha. | Let's start {title} together. | mới |
| `voice.angry` | 4 | Bước nhỏ đầu tiên của {title} là gì nhỉ? | What's the first small step of {title}? | mới |
