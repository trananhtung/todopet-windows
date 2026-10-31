# Batch 1: finishing a task, by context (49 new lines)

`done` +16, `done.target` +5, and the new `done.stuck` 6, `done.frog` 6, `done.first` 6, `done.early` 5, `done.friday` 5.

The bubble says the first of these that applies:

| Priority | Key | When |
|---|---|---|
| 1 | `done.target` | this task reaches today's target |
| 2 | `done.stuck` | the task was on the "postponed" list |
| 3 | `done.frog` | it was today's frog |
| 4 | `done.first` | the first task finished today |
| 5 | `done.early` | from 5:00 to 8:59 |
| 6 | `done.friday` | Friday from 15:00 |
| 7 | `done` | everything else |

Filled in when the pet says it: `“{title}”` the task, `{done}` tasks finished today, `{target}` today's target,
`{sound}` the pet's own voice ("meow", "gâu gâu"). At most 60 characters before the title, one emoji at the end. The
bubble keeps its Undo button and the extra lines (golden treat, combo, growing up) below.

Options 1–4 of `done` and option 1 of `done.target` are the lines already shipped; they stay as they are.

| key | # | VI | EN | note |
|---|---|---|---|---|
| `done` | 5 | Xong rồi! “{title}” đã gạch khỏi danh sách ✨ | Done! “{title}” is off the list ✨ | mới |
| `done` | 6 | Một việc nữa xong rồi nè ({done}/{target}) 🌟 | One more down ({done}/{target}) 🌟 | mới |
| `done` | 7 | {sound}! “{title}” xong rồi, mình mừng ghê 🎉 | {sound}! “{title}” is done, I'm so glad 🎉 | mới |
| `done` | 8 | Gọn gàng ghê! “{title}” ✔︎ | Neat! “{title}” ✔︎ | mới |
| `done` | 9 | Bạn làm được rồi đó! ({done}/{target}) 💪 | You did it! ({done}/{target}) 💪 | mới |
| `done` | 10 | Thêm một việc xong, thêm một nụ cười cho mình 😊 | Another one done, another smile for me 😊 | mới |
| `done` | 11 | Xong “{title}”. Nhẹ cả người luôn 🍃 | “{title}” done. Feels lighter already 🍃 | mới |
| `done` | 12 | {done} việc rồi đó, đều tay ghê 👏 | That's {done} now, nice and steady 👏 | mới |
| `done` | 13 | Mình ghi công cho bạn: “{title}” ✅ | Credit to you: “{title}” ✅ | mới |
| `done` | 14 | {sound} {sound}! Xong thêm một việc rồi 🥳 | {sound} {sound}! Another one done 🥳 | mới |
| `done` | 15 | Yay, “{title}” xong! Mình nhảy một điệu nha 💃 | Yay, “{title}” is done! Time for a little dance 💃 | mới |
| `done` | 16 | Từng bước một, bạn đang làm rất tốt 🌱 | Step by step, you're doing great 🌱 | mới |
| `done` | 17 | Tích! “{title}” xong rồi. Việc tiếp theo nào? 🎯 | Tick! “{title}” is done. What's next? 🎯 | mới |
| `done` | 18 | Ngon lành! ({done}/{target}) 😋 | Smooth! ({done}/{target}) 😋 | mới |
| `done` | 19 | Bạn vừa làm mình vui cả ngày đó 🥰 | You just made my day 🥰 | mới |
| `done` | 20 | Xong “{title}”! Đập tay cái nào ✋ | “{title}” done! High five ✋ | mới |
| `done.target` | 2 | Chạm mốc {target} việc hôm nay rồi! Tự hào về bạn ghê 🏆 | {target} tasks today, target hit! So proud of you 🏆 | mới |
| `done.target` | 3 | {sound}! Đủ chỉ tiêu {target} việc rồi nè 🎊 | {sound}! That's the {target}-task goal, done 🎊 | mới |
| `done.target` | 4 | Mục tiêu {target} việc: xong! Thêm nữa là thưởng thôi 🌟 | Goal of {target}: done! Anything more is a bonus 🌟 | mới |
| `done.target` | 5 | Đủ {target} việc! Hôm nay thắng rồi nha 🌈 | All {target} done! Today's a win 🌈 | mới |
| `done.target` | 6 | {target}/{target}! Giờ làm gì cũng là thêm, nhẹ nhàng thôi nhé 🍵 | {target}/{target}! The rest is extra, take it easy 🍵 | mới |
| `done.stuck` | 1 | Cuối cùng cũng xong “{title}” rồi! 🎉 | “{title}” is finally done! 🎉 | mới |
| `done.stuck` | 2 | “{title}” chờ lâu lắm rồi, và bạn đã làm được 💪 | “{title}” waited a long time, and you did it 💪 | mới |
| `done.stuck` | 3 | Việc bạn cứ dời mãi đã xong rồi. Nhẹ hẳn người nhỉ? 🪶 | The one you kept putting off is done. Lighter now? 🪶 | mới |
| `done.stuck` | 4 | Hết dời rồi nhé! “{title}” xong rồi ✅ | No more postponing! “{title}” is done ✅ | mới |
| `done.stuck` | 5 | Mình biết việc này khó bắt đầu lắm. Bạn giỏi thật 🌟 | I know this one was hard to start. Well done 🌟 | mới |
| `done.stuck` | 6 | {sound}! “{title}” không còn phải chờ nữa 🥳 | {sound}! “{title}” doesn't have to wait anymore 🥳 | mới |
| `done.frog` | 1 | Ăn xong con ếch “{title}” rồi! 🐸 | Frog eaten: “{title}”! 🐸 | mới |
| `done.frog` | 2 | Việc khó nhất hôm nay xong rồi. Phần còn lại nhẹ hơn nhiều 🐸 | Today's hardest task is done. The rest will feel easier 🐸 | mới |
| `done.frog` | 3 | Đúng con ếch bạn chọn từ trước: “{title}” xong! 🎯 | The frog you picked before you left: “{title}”, done! 🎯 | mới |
| `done.frog` | 4 | {sound}! Con ếch hết đường chạy rồi 🐸 | {sound}! That frog didn't stand a chance 🐸 | mới |
| `done.frog` | 5 | Xong con ếch rồi, cả ngày còn lại nhẹ tênh 🍃 | Frog done, the rest of the day feels light 🍃 | mới |
| `done.frog` | 6 | Bạn giữ lời với chính mình rồi đó: “{title}” ✅ | You kept your word to yourself: “{title}” ✅ | mới |
| `done.first` | 1 | Việc đầu tiên hôm nay xong rồi! Khởi động ngon lành 🚀 | First one of the day, done! Great start 🚀 | mới |
| `done.first` | 2 | Mở hàng rồi nè: “{title}” ✅ | First of the day: “{title}” ✅ | mới |
| `done.first` | 3 | 1/{target}! Bước đầu luôn khó nhất, và bạn đã qua 💪 | 1/{target}! The first step is the hardest, and it's done 💪 | mới |
| `done.first` | 4 | {sound}! Một ngày tốt bắt đầu từ đây 🌞 | {sound}! A good day starts here 🌞 | mới |
| `done.first` | 5 | Xong việc đầu tiên, mình bắt đầu thấy hào hứng rồi 😄 | First task done, I'm getting excited 😄 | mới |
| `done.first` | 6 | Đà có rồi đó! Giữ nhịp nhẹ nhàng thôi nhé 🌱 | Momentum! Let's keep a gentle pace 🌱 | mới |
| `done.early` | 1 | Mới sáng sớm đã xong “{title}”, ghê thật 🌅 | “{title}” done this early? Impressive 🌅 | mới |
| `done.early` | 2 | Dậy sớm làm việc, mình nể bạn ghê ☕ | Up early and getting things done, respect ☕ | mới |
| `done.early` | 3 | Buổi sáng hiệu quả quá! ({done}/{target}) 🌄 | What a productive morning! ({done}/{target}) 🌄 | mới |
| `done.early` | 4 | {sound}! Chim dậy sớm có… việc xong sớm 🐦 | {sound}! The early bird gets… things done 🐦 | mới |
| `done.early` | 5 | Xong việc trước 9 giờ, cả ngày rộng rãi hẳn 🌤️ | Done before 9, the whole day opens up 🌤️ | mới |
| `done.friday` | 1 | Chiều thứ Sáu mà vẫn xong việc, bạn đỉnh thật 🎉 | Friday afternoon and still getting it done, wow 🎉 | mới |
| `done.friday` | 2 | Xong “{title}”! Cuối tuần đang vẫy tay kìa 👋 | “{title}” done! The weekend is waving at you 👋 | mới |
| `done.friday` | 3 | Thứ Sáu khép lại đẹp quá ({done}/{target}) 🌇 | A lovely way to wrap up Friday ({done}/{target}) 🌇 | mới |
| `done.friday` | 4 | {sound}! Một việc nữa trước cuối tuần 🍹 | {sound}! One more before the weekend 🍹 | mới |
| `done.friday` | 5 | Tuần này bạn làm tốt lắm. Nghỉ ngơi xứng đáng nhé 🌴 | You did great this week. You've earned the rest 🌴 | mới |
