# Batch 4: planning the day, and distractions (36 new lines)

`plan.{normal,annoyed,angry}` +4 each, `distraction` +6, `distraction.angry` +3, `grumble` +4, `parade` +5, `block` +4,
`voice.block` +2.

When each is said:

- `plan.*`: today's plan has fewer tasks than the target, by the pet's mood (normal; annoyed = a little worried;
  angry = the day is slipping). Never a telling-off.
- `distraction`: you are on a distracting app or site. `distraction.angry`: the same, while the pet is grumpy and
  there is a next task.
- `grumble`, `parade`, `block`: the pet's stunts after a long time on a distracting app (a sigh; a parade with the
  next task on a sign; jumping in front of the screen, then "Shall we do “{next}” together?" follows). Playful is
  fine here; the tests forbid insults, "!!" and shouting in capitals.
- `voice.block`: said aloud. No "!" and no emoji.

Filled in: `{k}` tasks still to pick, `{planned}` planned so far, `{target}` today's target, `{app}` the app or site,
`{left}` tasks left today, `“{next}”` the next task. English says "1 task", "1 spot", "1 small task" for one.

| key | # | VI | EN | note |
|---|---|---|---|---|
| `plan.normal` | 3 | Hôm nay mới lên {planned}/{target} việc. Thêm {k} việc nữa cho đủ nhé 📋 | {planned}/{target} planned so far. {k} more to round out the day 📋 | mới |
| `plan.normal` | 4 | Cùng chọn {k} việc cho hôm nay nha? Mình đợi bạn ✍️ | Shall we pick {k} tasks for today? I'll wait ✍️ | mới |
| `plan.normal` | 5 | Kế hoạch hôm nay còn trống {k} chỗ. Việc nào đáng làm nhất? 🤔 | Today's plan has {k} open spots. What matters most? 🤔 | mới |
| `plan.normal` | 6 | Mục tiêu {target} việc, mới có {planned}. Thêm vài việc vào hôm nay nhé 🗂️ | Aiming for {target}, {planned} so far. Add a few to today? 🗂️ | mới |
| `plan.annoyed` | 3 | Mình hơi lo hôm nay chưa có kế hoạch rõ. Chọn {k} việc thôi là được 🌱 | I'm a bit worried today has no clear plan. Just {k} tasks will do 🌱 | mới |
| `plan.annoyed` | 4 | Chưa đủ {target} việc cho hôm nay ({planned}/{target}). Mình cùng chọn nhé? 🤝 | Not quite {target} for today yet ({planned}/{target}). Pick some together? 🤝 | mới |
| `plan.annoyed` | 5 | Không cần hoàn hảo đâu. Thêm {k} việc nhỏ là hôm nay ổn rồi 🍃 | No need to be perfect. {k} small tasks and today's set 🍃 | mới |
| `plan.annoyed` | 6 | Kế hoạch còn mỏng quá, mình lo nè. Chọn {k} việc cùng mình nha? 📝 | The plan's looking thin, and I'm a little worried. Choose {k} with me? 📝 | mới |
| `plan.angry` | 3 | Hôm nay mình làm lại từ đầu nhé: chọn {k} việc, bắt đầu từ việc dễ nhất 🔄 | Let's reset today: pick {k} tasks and start with the easiest 🔄 | mới |
| `plan.angry` | 4 | Mình muốn giúp bạn có một ngày tốt. Chỉ cần thêm {k} việc nữa thôi 🤗 | I want to help you have a good day. Just {k} more tasks 🤗 | mới |
| `plan.angry` | 5 | Còn {k} chỗ trong kế hoạch. Mình chọn cùng nhau, nhanh thôi ⏱️ | {k} spots left in the plan. Let's pick together, it's quick ⏱️ | mới |
| `plan.angry` | 6 | Ngày còn dài mà! Chọn {k} việc, mình đi cùng bạn 💪 | There's still plenty of day left! Pick {k}, and I'll go with you 💪 | mới |
| `distraction` | 3 | Ồ, {app} hả? Danh sách còn {left} việc đang chờ nè 👀 | Oh, {app}? Still {left} tasks on the list 👀 | mới |
| `distraction` | 4 | Mình thấy {app} rồi nha. Nghỉ xíu thôi rồi quay lại nhé? 😉 | Spotted {app}. A short break, then back to it? 😉 | mới |
| `distraction` | 5 | {app} vui ghê ha. Còn {left} việc, làm xong rồi xem tiếp nhé 🙂 | {app} is fun, huh. {left} tasks to go, then it's all yours 🙂 | mới |
| `distraction` | 6 | Psst… {app} đó hả? Mình giữ chỗ cho việc tiếp theo nha 🪑 | Psst… is that {app}? I'm saving a seat for your next task 🪑 | mới |
| `distraction` | 7 | Lạc sang {app} rồi kìa. Quay về với {left} việc của mình nhé? 🧭 | Drifted over to {app}? Let's head back to our {left} tasks 🧭 | mới |
| `distraction` | 8 | {app} sẽ vẫn ở đó lát nữa thôi. Việc trước nha? ⏸️ | {app} will still be there later. Task first? ⏸️ | mới |
| `distraction.angry` | 2 | Lại {app} rồi nè… “{next}” vẫn đợi bạn đó 😤 | {app} again… “{next}” is still waiting for you 😤 | mới |
| `distraction.angry` | 3 | Mình kéo nhẹ tay áo nè: rời {app}, sang “{next}” nhé? 🫳 | Gentle tug on your sleeve: leave {app}, over to “{next}”? 🫳 | mới |
| `distraction.angry` | 4 | {app} hấp dẫn thật, nhưng “{next}” cần bạn hơn đó 😤 | {app} is tempting, but “{next}” needs you more 😤 | mới |
| `grumble` | 3 | Hừm… “{next}” vẫn nằm đó chờ bạn kìa 🥱 | Hmm… “{next}” is still sitting there waiting 🥱 | mới |
| `grumble` | 4 | *phụng phịu* Mình nhớ “{next}” quá đi 😗 | *pouts* I really miss “{next}” 😗 | mới |
| `grumble` | 5 | Mình ngồi cạnh “{next}” chờ bạn nãy giờ nè 🪑 | I've been sitting next to “{next}”, waiting for you 🪑 | mới |
| `grumble` | 6 | *thở dài* Một chút “{next}” thôi cũng được mà 😮‍💨 | *sighs* Even a little bit of “{next}” would do 😮‍💨 | mới |
| `parade` | 2 | Một, hai! Một, hai! Biển ghi: “{next}” 🪧 | Left, right! Left, right! The sign says: “{next}” 🪧 | mới |
| `parade` | 3 | Đoàn diễu hành vì “{next}” xin đi qua nè 🥁 | The parade for “{next}” is coming through 🥁 | mới |
| `parade` | 4 | Mình cầm biển “{next}” đi vòng vòng tới khi bạn bắt đầu 🎺 | I'll carry the “{next}” sign around until you start 🎺 | mới |
| `parade` | 5 | Tùng tùng! Hôm nay là ngày của “{next}” 🎉 | Ba-dum! Today is “{next}” day 🎉 | mới |
| `parade` | 6 | Mình đi đều bước cổ vũ “{next}” đây 📣 | Marching in step to cheer on “{next}” 📣 | mới |
| `block` | 2 | *nhảy ra che màn hình* {app} nghỉ chút nha 🙈 | *jumps in front of the screen* Time out for {app} 🙈 | mới |
| `block` | 3 | Ối, mình đứng chắn {app} rồi. Xin lỗi nha 😇 | Oops, I'm standing in front of {app}. Sorry 😇 | mới |
| `block` | 4 | Tạm dừng {app} một chút, mình ở đây nè 🛑 | Pausing {app} for a bit, I'm right here 🛑 | mới |
| `block` | 5 | (｀・ω・´) Mình giữ {app} giúp bạn một lát | (｀・ω・´) I'll hold {app} for you for a bit | mới |
| `voice.block` | 2 | {app} chờ được mà, mình làm việc trước nhé? | {app} can wait, shall we do a task first? | mới |
| `voice.block` | 3 | Mình tạm cất {app} đi một lát nha. | Let's put {app} away for a little while. | mới |
