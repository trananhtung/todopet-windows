# Batch 7: two-minute starters, postponed tasks, meetings (33 new lines)

`starterStart.task` +3, `starterStart` +2, `starterEnd.task` +3, `starterEnd` +2, `starterGone` +2, `starterEnough` +3,
`stuck` +4, `stuck.angry` +3, `splitDone` +2, `soon` +3, `dueNow` +3, `meetingOver` +3.

Written while the user's standing instruction was to finish without asking ("hãy làm cho đến khi hoàn thành đi không
cần hỏi tôi nữa"), so this table went into the code unreviewed; it is kept for the record and the pull request.

Every English meeting line says "“{meeting}” is over" and every starter start says "{m} minutes": the tests tell those
bubbles apart by it.

When each is said:

- `starterStart(.task)`: "Try 2 minutes" starts a short warm-up. `starterEnd(.task)`: it is over (buttons: a full
  session, or stop). `starterGone`: the task got done meanwhile. `starterEnough`: you chose to stop there.
- `stuck` / `stuck.angry`: a task postponed for days (buttons: split it into steps, Try 2 minutes). `splitDone`: it
  was split; the first step is named.
- `soon` / `dueNow`: a task with a time is coming up / due now.
- `meetingOver`: a meeting just ended ("a 5-minute breather first?" follows when another one comes next).

Filled in: `{m}` minutes, `“{title}”` the task, `{days}` days postponed, `{count}` steps, `“{first}”` the first
step, `“{meeting}”` the meeting.

| key | # | VI | EN | note |
|---|---|---|---|---|
| `starterStart.task` | 2 | Thử {m} phút với “{title}” thôi, không cần làm xong 🌱 | Just try {m} minutes on “{title}”, no need to finish 🌱 | mới |
| `starterStart.task` | 3 | {m} phút khởi động cho “{title}”. Mở ra là đã thắng rồi 🚪 | A warm-up of {m} minutes for “{title}”. Opening it is already a win 🚪 | mới |
| `starterStart.task` | 4 | Chỉ {m} phút với “{title}”, rồi mình tính tiếp nha ⏱ | Only {m} minutes with “{title}”, then we'll see ⏱ | mới |
| `starterStart` | 2 | {m} phút khởi động thôi. Bắt đầu nhỏ xíu cũng được 🌱 | Just {m} minutes to warm up. Tiny starts count 🌱 | mới |
| `starterStart` | 3 | Hẹn {m} phút nhé, chỉ cần bắt đầu là được ⏱ | {m} minutes, that's all. Starting is the whole job ⏱ | mới |
| `starterEnd.task` | 2 | Bạn đã bắt đầu “{title}” rồi đó! Làm tiếp một phiên, hay dừng ở đây? 🌱 | You've started “{title}”! Another full session, or stop here? 🌱 | mới |
| `starterEnd.task` | 3 | Khởi động xong! “{title}” đã nhúc nhích rồi. Đi tiếp không? 🚀 | Warm-up done! “{title}” is moving. Keep going? 🚀 | mới |
| `starterEnd.task` | 4 | Bước khó nhất với “{title}” qua rồi. Tiếp hay nghỉ, tuỳ bạn nhé 🙂 | The hardest step on “{title}” is behind you. Go on or stop, your call 🙂 | mới |
| `starterEnd` | 2 | Bạn đã bắt đầu rồi đó! Làm tiếp một phiên, hay dừng ở đây? 🌱 | You've started! Another full session, or stop here? 🌱 | mới |
| `starterEnd` | 3 | Khởi động xong rồi! Đi tiếp hay nghỉ, tuỳ bạn 🙂 | Warm-up done! Go on or stop, your call 🙂 | mới |
| `starterGone` | 2 | Ồ, “{title}” xong luôn rồi kìa! Khởi động hiệu quả ghê 🎉 | Oh, “{title}” is already done! What a warm-up 🎉 | mới |
| `starterGone` | 3 | Hết giờ khởi động, mà “{title}” đã xong luôn rồi. Tuyệt quá 🌟 | Warm-up over, and “{title}” is already done. Amazing 🌟 | mới |
| `starterEnough` | 2 | Bắt đầu được là giỏi rồi. Lần sau mình làm tiếp nha 🌱 | Getting started is already great. We'll pick it up next time 🌱 | mới |
| `starterEnough` | 3 | Dừng ở đây cũng tốt. Bạn đã bắt đầu, phá băng rồi đó 🧊 | Stopping here is fine. You started, and that broke the ice 🧊 | mới |
| `starterEnough` | 4 | Một khởi đầu nhỏ vẫn là khởi đầu. Mình tự hào về bạn 💛 | A small start is still a start. I'm proud of you 💛 | mới |
| `stuck` | 3 | “{title}” đã chờ {days} ngày rồi. Mình chia nhỏ ra cho dễ nhé? ✂️ | “{title}” has waited {days} days. Shall we break it into small steps? ✂️ | mới |
| `stuck` | 4 | Dời “{title}” {days} ngày rồi, chắc nó hơi khó nhằn. Bước đầu tiên là gì nhỉ? 🧩 | “{title}” has been moved for {days} days, it must be tricky. What's the first step? 🧩 | mới |
| `stuck` | 5 | “{title}” cứ trôi mãi ({days} ngày). Thử 2 phút xem sao? 🌱 | “{title}” keeps drifting ({days} days). How about trying it for 2 minutes? 🌱 | mới |
| `stuck` | 6 | Mình thấy “{title}” bị dời {days} ngày. Không sao, mình cùng gỡ nó ra nhé 🤝 | I see “{title}” has been put off for {days} days. That's okay, let's untangle it together 🤝 | mới |
| `stuck.angry` | 2 | “{title}” đợi {days} ngày rồi. Mình giúp chia thành bước tí hon nhé? ✂️ | “{title}” has waited {days} days. Let me help break it into tiny steps? ✂️ | mới |
| `stuck.angry` | 3 | {days} ngày rồi “{title}” vẫn chưa động. Bước nhỏ nhất là gì, mình làm cùng nhé? 🧩 | {days} days and “{title}” hasn't budged. What's the smallest step? Let's do it together 🧩 | mới |
| `stuck.angry` | 4 | Mình lo cho “{title}” quá ({days} ngày). Chia nhỏ ra là dễ thở hơn liền 🌬️ | I'm worried about “{title}” ({days} days). Splitting it up makes it much easier 🌬️ | mới |
| `splitDone` | 2 | Xong, {count} bước nhỏ. Bước đầu tiên: “{first}”, nhẹ nhàng thôi ✂️ | Done: {count} small steps. First up: “{first}”, nice and easy ✂️ | mới |
| `splitDone` | 3 | Đã chia {count} bước. “{first}” chỉ cần 15–30 phút thôi 🌱 | Split into {count} steps. “{first}” takes just 15–30 minutes 🌱 | mới |
| `soon` | 2 | ⏰ Còn {m} phút nữa là tới “{title}” | ⏰ “{title}” in {m} min | mới |
| `soon` | 3 | ⏰ Sắp tới giờ “{title}”: còn {m} phút | ⏰ Coming up: “{title}” in {m} min | mới |
| `soon` | 4 | ⏰ {m} phút nữa có “{title}”, chuẩn bị dần nhé | ⏰ “{title}” in {m} min, time to get ready | mới |
| `dueNow` | 2 | ⏰ Tới giờ “{title}” rồi nè | ⏰ Time for “{title}” | mới |
| `dueNow` | 3 | ⏰ Bây giờ là lúc làm “{title}” | ⏰ Now's the time for “{title}” | mới |
| `dueNow` | 4 | ⏰ “{title}” đến giờ rồi, mình cổ vũ nha | ⏰ It's “{title}” time, I'm cheering for you | mới |
| `meetingOver` | 2 | “{meeting}” kết thúc rồi. Có việc gì mới cần thêm không? 📝 | “{meeting}” is over. Any new tasks to add? 📝 | mới |
| `meetingOver` | 3 | Họp xong “{meeting}” rồi. Ghi nhanh vài ý trước khi quên nhé ✍️ | “{meeting}” is over. Jot down a few notes before they fade ✍️ | mới |
| `meetingOver` | 4 | Hết “{meeting}” rồi, thở phào nào. Có gì cần nhớ không? 🫶 | “{meeting}” is over, deep breath. Anything to remember? 🫶 | mới |
