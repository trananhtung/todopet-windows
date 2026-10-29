// The Friends sheet (SPEC v0.6 §5): my card, adding a friend's, the friends and their buddy streaks, and this week's boss.
// A pasted card is untrusted: it is parsed by the brain (`addFriendCard`) and only ever shown as plain text here.
import { useEffect, useId, useRef, useState } from "react";
import type { Brain, BrainState } from "../core/brain";
import { daysBetween, dayKey } from "../core/dates";
import { bossName, MAX_FRIENDS, VISIT_MAX_CARD_AGE_DAYS, type Boss, type Friend } from "../core/friends";
import { getLang, L, plural } from "../core/l10n";
import { stageName } from "../core/life";
import { speciesInfo } from "../pets";
import { Icon } from "../ui/icons";
import { localeTag } from "../ui/lang";
import { PetStill } from "../ui/PetArt";
import { Popover } from "./Popover";

/** "Card from today", "…yesterday", "…3 days ago", or its date; and what an old card means for visits. */
export function cardWhen(date: string, today: string): string {
  const n = daysBetween(date, today);
  const when =
    n <= 0
      ? L("hôm nay", "today")
      : n === 1
        ? L("hôm qua", "yesterday")
        : n <= 6
          ? L(`${n} ngày trước`, `${n} days ago`)
          : new Date(`${date}T12:00:00`).toLocaleDateString(localeTag(getLang()), { day: "numeric", month: "short" });
  return L(`Thẻ ${n > 6 ? "ngày " : ""}${when}`, `Card from ${when}`);
}

/** A small heading inside the sheet, like the wardrobe's groups. */
function Head({ id, title, count }: { id: string; title: string; count?: string }) {
  return (
    <div className="w-group-head">
      <h3 id={id}>{title}</h3>
      {count && <span className="count">{count}</span>}
    </div>
  );
}

/** Mine: the card as read-only text with Copy. Without the clipboard, the text is selected for Ctrl+C. */
function MyCard({ brain }: { brain: Brain }) {
  const head = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const [note, setNote] = useState<"copied" | "select" | null>(null);
  const text = brain.myCard();
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setNote("copied");
    } catch {
      // Not allowed or not there: select it, so Ctrl+C does the rest.
      area.current?.focus();
      area.current?.select();
      setNote("select");
    }
  };
  return (
    <section className="w-group friends-mine" aria-labelledby={head}>
      <Head id={head} title={L("Thẻ của mình", "My card")} />
      <textarea
        ref={area}
        className="field friends-card-text"
        readOnly
        rows={3}
        value={text}
        spellCheck={false}
        aria-label={L("Thẻ thú cưng của mình (chỉ đọc)", "My pet card (read only)")}
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="friends-row">
        <button type="button" className="btn small primary" onClick={() => void copy()}>
          <Icon name="copy" size={14} />
          {L("Chép thẻ", "Copy my card")}
        </button>
        <span className="friends-note" role="status">
          {note === "copied" && L("Đã chép ✔︎ Gửi cho bạn bè nhé.", "Copied ✔︎ Send it to a friend.")}
          {note === "select" && L("Chưa tự chép được. Thẻ đã được chọn: bấm Ctrl+C nhé.", "Couldn't copy by itself. The card is selected: press Ctrl+C.")}
        </span>
      </div>
    </section>
  );
}

/** Theirs: paste a card, then Add. A card that can't be read gets kind words and changes nothing. */
function AddFriend({ brain, area }: { brain: Brain; area: React.RefObject<HTMLTextAreaElement | null> }) {
  const head = useId();
  const field = useId();
  const errorId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const add = () => {
    if (value.trim() === "") return;
    const out = brain.addFriendCard(value);
    if (!out.ok) {
      setError(out.message);
      setDone(null);
      area.current?.focus();
      return;
    }
    setValue("");
    setError(null);
    setDone(out.replaced ? L(`Đã cập nhật thẻ của ${out.friend.name}.`, `Updated ${out.friend.name}'s card.`) : L(`Đã thêm ${out.friend.name}! 🎉`, `Added ${out.friend.name}! 🎉`));
  };
  return (
    <section className="w-group friends-add" aria-labelledby={head}>
      <Head id={head} title={L("Thêm bạn", "Add a friend")} />
      <label htmlFor={field} className="friends-label">
        {L("Dán thẻ của bạn bè vào đây", "Paste your friend's card here")}
      </label>
      <textarea
        id={field}
        ref={area}
        className="field friends-card-text"
        rows={2}
        value={value}
        maxLength={6000}
        spellCheck={false}
        autoComplete="off"
        placeholder="TODOPET1.…"
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            add();
          }
        }}
      />
      <div className="friends-row">
        <button type="button" className="btn small primary" disabled={value.trim() === ""} onClick={add}>
          <Icon name="plus" size={14} />
          {L("Thêm", "Add")}
        </button>
        <span className="friends-note" role="status">
          {done}
        </span>
      </div>
      {error && (
        <p id={errorId} className="friends-error" role="alert">
          <Icon name="warning" size={15} />
          <span>{error}</span>
        </p>
      )}
    </section>
  );
}

/** One friend: their pet (a still), name, buddy streak, the date of their card, and Remove behind a confirmation. */
function FriendRow({ friend, streak, today, onRemove }: { friend: Friend; streak: number; today: string; onRemove: () => void }) {
  const [asking, setAsking] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const species = speciesInfo(friend.species);
  const stale = daysBetween(friend.date, today) > VISIT_MAX_CARD_AGE_DAYS;
  const buddy =
    streak > 0
      ? L(`🔥 Chuỗi bạn: ${plural(streak, "ngày", "day", "days")}`, `🔥 Buddy streak: ${plural(streak, "ngày", "day", "days")}`)
      : L("Chưa có chuỗi bạn", "No buddy streak yet");
  const buddyHelp = L("Số ngày liên tiếp cả hai cùng đạt mục tiêu. Ngày nghỉ không làm đứt chuỗi.", "Days in a row you both reached your goal. A day off doesn't break it.");
  return (
    <li className="friend">
      <PetStill
        species={friend.species}
        size={52}
        idPrefix={`friend-${friend.id}`}
        className="friend-pet"
        pose={{ mood: "happy", t: 0.6, stage: friend.stage, wearing: friend.accessories }}
      />
      <div className="friend-info">
        <b className="friend-name" title={friend.name}>
          {friend.name}
        </b>
        <small className="friend-kind">
          {species.emoji} {species.name[getLang()]} · {stageName(friend.stage)}
        </small>
        <span className={`friend-streak${streak > 0 ? " on" : ""}`} title={buddyHelp}>
          {buddy}
          <span className="sr-only">. {buddyHelp}</span>
        </span>
        <small className={`friend-date${stale ? " stale" : ""}`}>
          {cardWhen(friend.date, today)}
          {stale && L(" · thẻ mới thì pet mới ghé chơi", " · a fresh card brings visits again")}
        </small>
      </div>
      <button
        ref={button}
        type="button"
        className="btn ghost small friend-remove"
        data-friend-remove=""
        aria-label={L(`Xoá ${friend.name}`, `Remove ${friend.name}`)}
        aria-haspopup="dialog"
        aria-expanded={asking}
        onClick={() => setAsking(true)}
      >
        <Icon name="trash" size={14} />
        {L("Xoá", "Remove")}
      </button>
      {asking && (
        <Popover
          anchor={button}
          role="alertdialog"
          label={L("Xoá bạn", "Remove friend")}
          className="confirm"
          onClose={(restoreFocus) => {
            setAsking(false);
            if (restoreFocus) button.current?.focus({ preventScroll: true });
          }}
        >
          <p>
            {L(
              `Xoá ${friend.name} khỏi danh sách? Thẻ của bạn ấy sẽ mất khỏi máy này; bạn ấy gửi lại là thêm được ngay.`,
              `Remove ${friend.name}? Their card leaves this PC; you can add it again whenever they send it.`,
            )}
          </p>
          <div className="pop-actions">
            <button
              type="button"
              className="btn small"
              data-autofocus
              onClick={() => {
                setAsking(false);
                button.current?.focus({ preventScroll: true });
              }}
            >
              {L("Huỷ", "Cancel")}
            </button>
            <button
              type="button"
              className="btn small danger solid"
              onClick={() => {
                setAsking(false);
                onRemove();
              }}
            >
              <Icon name="trash" size={14} />
              {L("Xoá", "Remove")}
            </button>
          </div>
        </Popover>
      )}
    </li>
  );
}

function FriendList({ brain, s, today, onRemoved }: { brain: Brain; s: BrainState; today: string; onRemoved: (index: number, name: string) => void }) {
  const head = useId();
  return (
    <section className="w-group" aria-labelledby={head}>
      <Head id={head} title={L("Bạn bè", "Friends")} count={`${s.friends.length}/${MAX_FRIENDS}`} />
      {s.friends.length === 0 ? (
        <p className="friends-empty">{L("Chưa có bạn nào. Dán thẻ của một người bạn ở trên để thêm nhé.", "No friends yet. Paste a friend's card above to add one.")}</p>
      ) : (
        <ul className="friend-list">
          {s.friends.map((f, i) => (
            <FriendRow
              key={f.id}
              friend={f}
              streak={s.buddyStreaks[f.id] ?? 0}
              today={today}
              onRemove={() => {
                if (brain.removeFriend(f.id)) onRemoved(i, f.name);
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** This week's Procrastination Blob 👾: an HP bar and who has helped. */
function WeekBoss({ s }: { s: BrainState }) {
  const head = useId();
  const boss: Boss = s.boss;
  const medal = s.life.bossWins.includes(boss.week);
  const together = boss.members.length > 1;
  const pct = boss.maxHp > 0 ? Math.round((boss.hp / boss.maxHp) * 100) : 0;
  const hpText = L(`Còn ${boss.hp} trên ${boss.maxHp} HP`, `${boss.hp} of ${boss.maxHp} HP left`);
  return (
    <section className="w-group friends-boss" aria-labelledby={head}>
      <Head id={head} title={L("Tuần này", "This week")} count={boss.week} />
      <div className={`boss${boss.defeated ? " beaten" : ""}`}>
        <span className="boss-blob" aria-hidden>
          {boss.defeated ? "💫" : "👾"}
        </span>
        <div className="boss-main">
          <b className="boss-name">{bossName()}</b>
          <div className="boss-bar" role="progressbar" aria-label={L(`Máu của ${bossName()}`, `${bossName()} health`)} aria-valuemin={0} aria-valuemax={boss.maxHp} aria-valuenow={boss.hp} aria-valuetext={hpText}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <span className="boss-hp" aria-hidden>
            HP {boss.hp}/{boss.maxHp}
          </span>
        </div>
      </div>
      <p className="friends-sub" role="status">
        {boss.defeated
          ? medal
            ? L("Hạ gục rồi! 🏅 Cả nhóm cùng thắng; sticker đã nằm trong sổ sticker.", "Beaten! 🏅 Everyone wins, and the sticker is in your sticker book.")
            : L("Hạ gục rồi! 🏅 Cả nhóm cùng thắng.", "Beaten! 🏅 Everyone wins.")
          : L(
              "Mỗi việc bạn và bạn bè xong trong tuần đều làm nó đau. Không thua, không phạt; thứ Hai nó lại hồi sinh.",
              "Every task you and your friends finish this week hurts it. No losing, no penalties; it's back on Monday.",
            )}
      </p>
      <ul className="boss-who" aria-label={L("Ai đã ra tay", "Who has helped")}>
        {boss.members.map((m) => (
          <li key={m.id} className={m.me ? "me" : undefined}>
            <b title={m.name}>{m.name}</b>
            <span>
              {m.done}
              <span className="sr-only">{L(" việc", m.done === 1 ? " task" : " tasks")}</span>
            </span>
          </li>
        ))}
      </ul>
      {!together && !boss.defeated && (
        <p className="friends-sub">{L("Một mình thì nó có 15 HP; mỗi bạn thêm vào, nó thêm 15 HP nhưng cả nhóm cùng đánh.", "Alone it has 15 HP; each friend adds 15 more, and you fight it together.")}</p>
      )}
      {boss.waiting > 0 && (
        <p className="friends-sub">
          {L(
            `${boss.waiting} thẻ bạn bè cũ hơn tuần này nên chưa tính. Xin thẻ mới để cùng đánh nhé.`,
            `${plural(boss.waiting, "", "friend's card is", "friends' cards are").trim()} older than this week, so not counted yet. A fresh card brings them in.`,
          )}
        </p>
      )}
    </section>
  );
}

/** Board → Friends. */
export function FriendsSheet({ brain, s, onBack }: { brain: Brain; s: BrainState; onBack: () => void }) {
  const area = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  // The keyboard lands on the heading when the sheet opens (a mouse click leaves it nowhere), so Escape goes back to the list.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  const today = dayKey(new Date(brain.clockNow()));
  // After a removal the keyboard goes to the next friend's Remove (or the one before it), else to the paste box.
  const [after, setAfter] = useState<{ index: number; name: string } | null>(null);
  useEffect(() => {
    if (!after) return;
    const buttons = root.current?.querySelectorAll<HTMLElement>("[data-friend-remove]");
    const next = buttons && buttons.length > 0 ? buttons[Math.min(after.index, buttons.length - 1)] : area.current;
    next?.focus({ preventScroll: true });
  }, [after]);
  return (
    <div className="sheet friends" ref={root}>
      <div className="sheet-nav">
        <button type="button" className="btn ghost small" onClick={onBack}>
          <Icon name="arrowLeft" size={14} /> {L("Quay lại", "Back")}
        </button>
      </div>
      <h2 ref={heading} tabIndex={-1}>
        <Icon name="users" size={18} /> {L("Bạn bè", "Friends")}
      </h2>
      <p className="sheet-lead">
        {L(
          "Trao đổi thẻ thú cưng với bạn bè qua bất kỳ app chat nào. Không có máy chủ nào cả: thẻ chỉ là một dòng chữ do chính bạn gửi.",
          "Swap pet cards with friends over any chat app. There is no server: a card is one line of text that you send yourself.",
        )}
      </p>
      <MyCard brain={brain} />
      <AddFriend brain={brain} area={area} />
      <FriendList brain={brain} s={s} today={today} onRemoved={(index, name) => setAfter({ index, name })} />
      <span className="sr-only" role="status">
        {after && L(`Đã xoá ${after.name}.`, `Removed ${after.name}.`)}
      </span>
      <WeekBoss s={s} />
      <p className="friends-privacy">
        <Icon name="shield" size={14} />
        <span>
          {L(
            "Thẻ chỉ có tên, loài, phụ kiện và độ lớn của pet, chuỗi ngày, số việc xong tuần này và 28 ngày gần đây (đạt mục tiêu, có làm, hay nghỉ). Không bao giờ có tên việc, giờ giấc, tên ứng dụng hay tên bạn.",
            "A card holds your pet's name, species, accessories and stage, your streaks, this week's finished-task count and a 28-day record of goal, kept and rest days. Never task titles, times, app names or your name.",
          )}
        </span>
      </p>
    </div>
  );
}
