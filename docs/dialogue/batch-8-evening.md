# Batch 8: the day's end, the week, trips, tips (43 new lines, 2 shortened)

`review` +5, `review.clear` +3, `review.empty` +2, `lateNight` +4, `newWeek.recap` +4, `newWeek` +2, `tripOffer` +4,
`tripStart` +3, `tripBack.{souvenir,stories,early}` +2 each, `tripStayed` +2, `tip` +8; `tripBack.souvenir` #1 and
`tripBack.stories` #1 shortened.

Written while the user's standing instruction was to finish without asking ("hãy làm cho đến khi hoàn thành đi không
cần hỏi tôi nữa"), so this table went into the code unreviewed; it is kept for the record and the pull request.

When each is said:

- `review`: near the end of the workday with tasks left (buttons: Wrap up, move them all). Every line keeps "end of
  day", "wrap up" and "move the remaining {left} to {day}?" (VI "tổng kết", "dời hết sang {day}?"), which the tests
  check. `review.clear`: nothing left to move; `review.empty`: nothing was planned.
- `lateNight`: working late at night. `newWeek(.recap)`: the first greeting of a week, with last week's wins.
- `tripOffer`: everything done, the pet asks to go on a trip (buttons: Go! / Stay). `tripStart`: it leaves, back at
  `{time}`. `tripBack.*`: it is back, with a souvenir, with stories (XP) when it had that souvenir already, or early.
  `tripStayed`: you said stay.
- `tip`: a productivity tip now and then.

Filled in: `{done}/{planned}` done of planned, `{left}` tasks left, `{day}` the day they would move to ("mai" /
"tomorrow", or a weekday), `{recap}` last week's wins ("13 tasks · 2 stickers"), `{time}` the time back (17:30),
`{place}` the trip's place, `{gift}` the souvenir, `{xp}` XP.

| key | # | VI | EN | note |
|---|---|---|---|---|
| `review` | 2 | Gần hết giờ làm rồi: xong {done}/{planned}, còn {left} việc. Tổng kết ngày, hay dời hết sang {day}? 🌇 | Nearly end of day: {done}/{planned} done. Wrap up the day, or move the remaining {left} to {day}? 🌇 | mới |
| `review` | 3 | Cuối ngày rồi nè! Hôm nay {done}/{planned} việc, còn {left}. Tổng kết, hay dời hết sang {day}? 🌙 | Nearly the end of day! {done}/{planned} today. Wrap up, or move the remaining {left} to {day}? 🌙 | mới |
| `review` | 4 | Ngày sắp khép lại ({done}/{planned}), còn {left} việc. Tổng kết ngày, hay dời hết sang {day}? ✨ | The end of day is close ({done}/{planned}). Wrap up the day, or move the remaining {left} to {day}? ✨ | mới |
| `review` | 5 | Sắp hết giờ làm, bạn đã xong {done}/{planned}! Còn {left} việc: tổng kết, hay dời hết sang {day}? 👏 | Almost end of day, and {done}/{planned} done! Wrap up, or move the remaining {left} to {day}? 👏 | mới |
| `review` | 6 | Giờ làm sắp hết. {done}/{planned} xong, còn {left}. Mình tổng kết ngày, hay dời hết sang {day}? 🍵 | Soon it's end of day: {done}/{planned} done. Wrap up, or move the remaining {left} to {day}? 🍵 | mới |
| `review.clear` | 2 | Sắp hết giờ làm, xong {done}/{planned} việc rồi. Tổng kết ngày nhé? 🎉 | Almost end of day, {done}/{planned} done. Shall we wrap up? 🎉 | mới |
| `review.clear` | 3 | Hôm nay gọn gàng ghê: {done}/{planned} việc. Mình tổng kết ngày nha? 🌇 | A tidy day: {done}/{planned} done. Wrap up the day? 🌇 | mới |
| `review.clear` | 4 | Xong {done}/{planned} việc, không còn gì phải dời. Tổng kết ngày thôi nào 🌙 | {done}/{planned} done, nothing left to move. Time to wrap up the day 🌙 | mới |
| `review.empty` | 2 | Gần hết giờ làm, danh sách hôm nay trống rồi. Tổng kết ngày nhẹ nhàng nhé? 🌙 | Nearly end of day, and the list is empty. A gentle wrap-up? 🌙 | mới |
| `review.empty` | 3 | Hết giờ làm rồi, không còn việc nào chờ. Mình tổng kết ngày nha 🍃 | Workday's nearly over, nothing waiting. Let's wrap up the day 🍃 | mới |
| `lateNight` | 2 | Khuya lắm rồi, mai mình làm tiếp nhé. Ngủ ngon 🌙 | It's very late, let's continue tomorrow. Sleep well 🌙 | mới |
| `lateNight` | 3 | Mình díp mắt rồi… bạn cũng nghỉ đi nha 😪 | My eyes are closing… you should rest too 😪 | mới |
| `lateNight` | 4 | Đêm rồi đó. Việc còn lại để mai, sức khoẻ trước nha 🛌 | It's night now. The rest can wait for tomorrow, health first 🛌 | mới |
| `lateNight` | 5 | Trăng lên cao rồi. Tắt máy đi ngủ thôi bạn ơi ⭐ | The moon is high. Time to switch off and sleep ⭐ | mới |
| `newWeek.recap` | 2 | 🌱 Tuần mới tới rồi! Tuần trước bạn có: {recap}. | 🌱 A new week is here! Last week you had: {recap}. | mới |
| `newWeek.recap` | 3 | 🌱 Chào tuần mới! Nhìn lại tuần trước: {recap}. | 🌱 Hello, new week! Looking back: {recap}. | mới |
| `newWeek.recap` | 4 | 🌱 Tuần trước thật đáng nhớ: {recap}. Tuần này mình đi tiếp nha | 🌱 Last week to remember: {recap}. On we go this week | mới |
| `newWeek.recap` | 5 | 🌱 Trang mới cho tuần mới. Tuần qua: {recap} | 🌱 A fresh page for a fresh week. Last week: {recap} | mới |
| `newWeek` | 2 | 🌱 Tuần mới rồi! Mình bắt đầu từ từ, từng việc một nhé | 🌱 A new week! Let's start slowly, one task at a time | mới |
| `newWeek` | 3 | 🌱 Chào tuần mới tinh. Mình ở đây cùng bạn nè | 🌱 Hello, brand-new week. I'm right here with you | mới |
| `tripOffer` | 2 | Hôm nay xong hết rồi! Mình đi dạo một chuyến được không? {time} mình về 🎒 | All done for today! May I wander off for a bit? Back at {time} 🎒 | mới |
| `tripOffer` | 3 | Kế hoạch hôm nay gọn rồi, cho mình đi chơi tí nha? {time} mình về 🧳 | Today's plan is done, can I go out for a bit? Back at {time} 🧳 | mới |
| `tripOffer` | 4 | Bạn làm hết việc rồi, mình được đi du lịch chưa? Hẹn {time} gặp lại 🗺️ | You've finished everything. Can I go on a trip? See you at {time} 🗺️ | mới |
| `tripOffer` | 5 | Ngày tuyệt quá! Mình xin đi khám phá một chút, {time} về nha 🌍 | What a day! Mind if I go exploring? Back by {time} 🌍 | mới |
| `tripStart` | 2 | Đi {place} thôi! Mình về lúc {time}. Bấm tấm biển nếu cần mình nhé 🧭 | Off I go to {place}! Back at {time}. Click the sign if you need me 🧭 | mới |
| `tripStart` | 3 | Tạm biệt nha, mình tới {place} chơi. Gặp lại lúc {time} 👋 | Bye for now, I'm visiting {place}. See you at {time} 👋 | mới |
| `tripStart` | 4 | Hành lý xong, {place} thẳng tiến! {time} mình về, có gì bấm vào biển nhé 🧳 | Bags packed, next stop {place}! Back at {time}, click my sign if needed 🧳 | mới |
| `tripBack.souvenir` | 1 | Mình về rồi nè! Quà từ {place} cho bạn: {gift}. Bưu thiếp ở trong nhật ký 💌 | Back from {place}! Your souvenir: {gift}. A postcard is in the diary 💌 | sửa (cũ: "Mình về rồi nè! 🥰 Quà từ {place} cho bạn: {gift}. Có bưu thiếp trong nhật ký đó 💌" / "I'm back from {place}! 🥰 Here's your souvenir: {gift}. There's a postcard waiting in the diary 💌") |
| `tripBack.souvenir` | 2 | Mình đi {place} về, có quà nè: {gift} 🎁 | Home from {place}, with a gift: {gift} 🎁 | mới |
| `tripBack.souvenir` | 3 | Về tới nhà rồi! {gift} từ {place} là dành cho bạn đó 🥰 | I'm home! This {gift} from {place} is for you 🥰 | mới |
| `tripBack.stories` | 1 | Mình đi {place} về rồi! Quà ở đó có rồi, nên mang về chuyện vui: +{xp} XP 💌 | Back from {place}! I had its souvenir, so I brought stories: +{xp} XP 💌 | sửa (cũ: "Mình đi {place} về rồi! 🥰 Quà ở đó mình có rồi, nên mang về toàn chuyện vui: +{xp} XP 💌" / "I'm back from {place}! 🥰 I already had its souvenir, so I brought back stories instead: +{xp} XP 💌") |
| `tripBack.stories` | 2 | Về rồi nè! {place} vui lắm, mình kể bạn nghe nha: +{xp} XP 📖 | I'm back! {place} was fun, let me tell you all about it: +{xp} XP 📖 | mới |
| `tripBack.stories` | 3 | {place} lần này toàn chuyện hay, +{xp} XP cho mình 🌟 | {place} was full of stories this time, +{xp} XP for me 🌟 | mới |
| `tripBack.early` | 2 | Mình về sớm hơn dự định, nhớ bạn quá nên quay về 🥰 | I came back early, I missed you too much 🥰 | mới |
| `tripBack.early` | 3 | Đi chưa xa đã muốn về rồi. Ở nhà với bạn vẫn vui nhất 🏡 | I didn't get far before wanting to come home. Being with you is the best 🏡 | mới |
| `tripStayed` | 2 | Được thôi, mình ở đây với bạn nha 🤗 | Okay, I'll stay here with you 🤗 | mới |
| `tripStayed` | 3 | Ở nhà cũng vui mà, mình ngồi cạnh bạn nè 🛋️ | Staying home is fun too, I'll sit right next to you 🛋️ | mới |
| `tip` | 7 | Mẹo: chọn việc theo năng lượng — việc khó lúc tỉnh táo, việc nhẹ lúc mệt 🔋 | Tip: match tasks to your energy: hard ones when fresh, light ones when tired 🔋 | mới |
| `tip` | 8 | Mẹo: ghi lại chỗ bạn dừng trước khi nghỉ, lúc quay lại sẽ vào việc nhanh hơn 📌 | Tip: note where you stopped before a break; getting back in is quicker 📌 | mới |
| `tip` | 9 | Mẹo: không biết bắt đầu từ đâu? Thử 2 phút thôi, phần khó nhất là mở đầu ⏱ | Tip: not sure where to start? Try 2 minutes; starting is the hardest part ⏱ | mới |
| `tip` | 10 | Mẹo: khi bí, nói to bước tiếp theo ra thành lời, đầu óc sẽ thông hơn 🗣️ | Tip: stuck? Say the next step out loud; it often unblocks your head 🗣️ | mới |
| `tip` | 11 | Mẹo: gom các việc nhỏ (email, tin nhắn) làm một lượt cho đỡ bị cắt ngang 📥 | Tip: batch small tasks (email, messages) in one go, so they interrupt less 📥 | mới |
| `tip` | 12 | Mẹo: viết việc bắt đầu bằng động từ (“Gọi…”, “Viết…”) để dễ hành động hơn ✍️ | Tip: start tasks with a verb (“Call…”, “Write…”); they get easier to act on ✍️ | mới |
| `tip` | 13 | Mẹo: 3 việc quan trọng mỗi ngày là tốt lắm rồi, không cần ôm hết 🎯 | Tip: 3 important tasks a day is plenty; you don't need to do it all 🎯 | mới |
| `tip` | 14 | Mẹo: xong việc thì gạch ngay, cảm giác tiến bộ giúp bạn có đà làm tiếp ✅ | Tip: tick tasks off right away; feeling progress keeps you going ✅ | mới |
