// The Friends sheet (SPEC v0.6 §5): my card, adding a friend's, the friends and their buddy streaks, and this week's boss.
// A pasted card is untrusted: it is parsed by the brain (`addFriendCard`) and only ever shown as plain text here.
import { useEffect, useId, useRef, useState } from "react";
import type { Brain, BrainState } from "../core/brain";
import { daysBetween, dayKey } from "../core/dates";
import { bossName, MAX_FRIENDS, VISIT_MAX_CARD_AGE_DAYS, type Boss, type Friend } from "../core/friends";
import { getLang, L, plural } from "../core/l10n";
import { stageName } from "../core/life";
import type { SpeciesId } from "../core/types";
import { speciesInfo } from "../pets";
import { Icon } from "../ui/icons";
import { localeTag } from "../ui/lang";
import { PetStill } from "../ui/PetArt";
import { FriendName, shownName } from "./FriendName";
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

/**
 * Mine: the card as read-only text with Copy. It is signed by the backend with this install's key (the secret never comes
 * here), so it is asked for, and asked for again when what is on the card changes. "Make a new card identity" is here
 * too, behind a question.
 */
function MyCard({ brain, s }: { brain: Brain; s: BrainState }) {
  const head = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const resetButton = useRef<HTMLButtonElement>(null);
  const [note, setNote] = useState<"copied" | "select" | "renewed" | null>(null);
  const [card, setCard] = useState<{ text: string } | { error: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  // What the card says changes with the pet and the day, and with the key: the signature is asked for again.
  const payload = brain.myCardPayload();
  useEffect(() => {
    let alive = true;
    brain.myCard().then(
      (text) => alive && setCard({ text }),
      (e: unknown) => alive && setCard({ error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [brain, payload, s.myKey]);
  const text = card && "text" in card ? card.text : "";
  const problem = card && "error" in card ? card.error : resetError;
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
  const renew = async () => {
    setAsking(false);
    setResetError(null);
    const out = await brain.resetCardKey();
    if (out.ok) setNote("renewed");
    else setResetError(out.message);
    resetButton.current?.focus({ preventScroll: true });
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
        <button type="button" className="btn small primary" disabled={text === ""} onClick={() => void copy()}>
          <Icon name="copy" size={14} />
          {L("Chép thẻ", "Copy my card")}
        </button>
        <span className="friends-note" role="status">
          {note === "copied" && L("Đã chép ✔︎ Gửi cho bạn bè nhé.", "Copied ✔︎ Send it to a friend.")}
          {note === "select" && L("Chưa tự chép được. Thẻ đã được chọn: bấm Ctrl+C nhé.", "Couldn't copy by itself. The card is selected: press Ctrl+C.")}
          {note === "renewed" && L("Xong! Thẻ từ giờ là của một danh tính thẻ mới.", "Done! Your cards are from a new card identity now.")}
        </span>
      </div>
      {problem && (
        <p className="friends-error" role="alert">
          <Icon name="warning" size={15} />
          <span>{problem}</span>
        </p>
      )}
      <div className="friends-row friends-identity">
        <button
          ref={resetButton}
          type="button"
          className="btn ghost small"
          data-reset-identity=""
          aria-haspopup="dialog"
          aria-expanded={asking}
          onClick={() => setAsking(true)}
        >
          <Icon name="refresh" size={14} />
          {L("Tạo danh tính thẻ mới", "Make a new card identity")}
        </button>
      </div>
      {asking && (
        <Popover
          anchor={resetButton}
          role="alertdialog"
          label={L("Tạo danh tính thẻ mới", "Make a new card identity")}
          className="confirm"
          onClose={(restoreFocus) => {
            setAsking(false);
            if (restoreFocus) resetButton.current?.focus({ preventScroll: true });
          }}
        >
          <p>
            {L(
              "Tạo danh tính thẻ mới? Bạn bè sẽ thấy bạn như một người mới và có thể xoá mục cũ của bạn khỏi danh sách của họ. Các thẻ bạn đã gửi không còn khớp với bạn nữa. Danh sách bạn bè của bạn vẫn còn nguyên.",
              "Make a new card identity? Friends will see you as a new person, and can remove your old entry from their list. Cards you already sent stop matching you. Your own friends list stays.",
            )}
          </p>
          <div className="pop-actions">
            <button
              type="button"
              className="btn small"
              data-autofocus
              onClick={() => {
                setAsking(false);
                resetButton.current?.focus({ preventScroll: true });
              }}
            >
              {L("Huỷ", "Cancel")}
            </button>
            <button type="button" className="btn small primary" onClick={() => void renew()}>
              <Icon name="refresh" size={14} />
              {L("Tạo danh tính mới", "Make a new identity")}
            </button>
          </div>
        </Popover>
      )}
    </section>
  );
}

/** Theirs: paste a card, then Add. A card that can't be read or doesn't check out gets kind words and changes nothing. */
function AddFriend({ brain, area, myPetName }: { brain: Brain; area: React.RefObject<HTMLTextAreaElement | null>; myPetName: string }) {
  const head = useId();
  const field = useId();
  const errorId = useId();
  // What was pasted and not yet added is kept in the brain, so that Escape back to the board doesn't lose it.
  const [value, setValue] = useState(brain.friendDraft);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; species: SpeciesId; replaced: boolean } | null>(null);
  const pending = useRef(false);
  const add = async () => {
    if (pending.current || value.trim() === "") return;
    pending.current = true;
    try {
      const out = await brain.addFriendCard(value);
      if (!out.ok) {
        setError(out.message);
        setDone(null);
        area.current?.focus();
        return;
      }
      setValue("");
      brain.friendDraft = "";
      setError(null);
      setDone({ name: out.friend.name, species: out.friend.species, replaced: out.replaced });
      // The Add button goes disabled with the box emptied: keep the keyboard in the box, ready for the next card.
      area.current?.focus();
    } finally {
      pending.current = false;
    }
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
          brain.friendDraft = e.target.value;
          if (error) setError(null);
          // "Added Mai!" was about the last card, not this one.
          setDone(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void add();
          }
        }}
      />
      <div className="friends-row">
        <button type="button" className="btn small primary" disabled={value.trim() === ""} onClick={() => void add()}>
          <Icon name="plus" size={14} />
          {L("Thêm", "Add")}
        </button>
        <span className="friends-note" role="status">
          {done &&
            (done.replaced ? (
              <>
                {L("Đã cập nhật thẻ của ", "Updated ")}
                <FriendName name={done.name} species={done.species} myPetName={myPetName} />
                {L(".", "'s card.")}
              </>
            ) : (
              <>
                {L("Đã thêm ", "Added ")}
                <FriendName name={done.name} species={done.species} myPetName={myPetName} />
                {L("! 🎉", "! 🎉")}
              </>
            ))}
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
function FriendRow({ friend, streak, today, myPetName, onRemove }: { friend: Friend; streak: number; today: string; myPetName: string; onRemove: () => void }) {
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
        idPrefix={`friend-${friend.pk}`}
        className="friend-pet"
        pose={{ mood: "happy", t: 0.6, stage: friend.stage, wearing: friend.accessories }}
      />
      <div className="friend-info">
        <b className="friend-name" title={friend.name}>
          <FriendName name={friend.name} species={friend.species} myPetName={myPetName} />
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
        aria-label={L(`Xoá ${shownName(friend.name, friend.species, myPetName)}`, `Remove ${shownName(friend.name, friend.species, myPetName)}`)}
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
            {L("Xoá ", "Remove ")}
            <FriendName name={friend.name} species={friend.species} myPetName={myPetName} />
            {L(
              " khỏi danh sách? Thẻ của bạn ấy sẽ mất khỏi máy này; bạn ấy gửi lại là thêm được ngay.",
              "? Their card leaves this PC; you can add it again whenever they send it.",
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

function FriendList({ brain, s, today, onRemoved }: { brain: Brain; s: BrainState; today: string; onRemoved: (index: number, name: string, species: SpeciesId) => void }) {
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
              key={f.pk}
              friend={f}
              streak={s.buddyStreaks[f.pk] ?? 0}
              today={today}
              myPetName={s.prefs.petName}
              onRemove={() => {
                if (brain.removeFriend(f.pk)) onRemoved(i, f.name, f.species);
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
            <b title={m.name}>
              <FriendName name={m.name} species={m.species} myPetName={s.prefs.petName} />
            </b>
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
            `${boss.waiting} thẻ bạn bè không phải của tuần này nên chưa tính. Xin thẻ mới để cùng đánh nhé.`,
            boss.waiting === 1
              ? "1 friend's card isn't from this week, so it isn't counted yet. A fresh card brings them in."
              : `${boss.waiting} friends' cards aren't from this week, so they aren't counted yet. A fresh card brings them in.`,
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
  const [after, setAfter] = useState<{ index: number; name: string; species: SpeciesId } | null>(null);
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
      <MyCard brain={brain} s={s} />
      <AddFriend brain={brain} area={area} myPetName={s.prefs.petName} />
      <FriendList brain={brain} s={s} today={today} onRemoved={(index, name, species) => setAfter({ index, name, species })} />
      <span className="sr-only" role="status">
        {after && (
          <>
            {L("Đã xoá ", "Removed ")}
            <FriendName name={after.name} species={after.species} myPetName={s.prefs.petName} />.
          </>
        )}
      </span>
      <WeekBoss s={s} />
      <p className="friends-privacy">
        <Icon name="shield" size={14} />
        <span>
          {L(
            "Thẻ có: tên, loài, phụ kiện và độ lớn của pet; số việc bạn xong tuần này; 28 ngày gần đây (đạt mục tiêu, nghỉ — ngày nghỉ cũng có thể là ngày lịch quá kín để tính —, hay chưa có gì); ngày làm thẻ; và khoá công khai của bạn, thứ nối các thẻ của bạn lại với nhau cho tới khi bạn tạo danh tính thẻ mới. Không bao giờ có tên việc, giờ giấc, tên ứng dụng hay tên bạn.",
            "A card holds your pet's name, species, accessories and stage; the number of tasks you finished this week; a 28-day record of goal days and rest days (a rest day can also be a day too packed with meetings to count), or nothing; the date it was made; and your public key, which links your cards together until you make a new card identity. Never task titles, times, app names or your name.",
          )}
        </span>
      </p>
    </div>
  );
}
