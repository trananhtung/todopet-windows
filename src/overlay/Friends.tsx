// The Friends sheet (SPEC v0.6 §5): the friends and their buddy streaks first, then this week's boss, then my card and adding
// a friend's as two compact rows (the card's text and the paste box open on a click), then what a card holds.
// A pasted card is untrusted: it is parsed by the brain (`addFriendCard`) and only ever shown as plain text here.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Brain, BrainState } from "../core/brain";
import { daysBetween, dayKey } from "../core/dates";
import { bossAloneText, bossHelpText, bossName, MAX_FRIENDS, sameNameTags, VISIT_MAX_CARD_AGE_DAYS, withTag, type Boss, type Friend } from "../core/friends";
import { getLang, L, plural } from "../core/l10n";
import { stageName } from "../core/life";
import type { SpeciesId } from "../core/types";
import { speciesInfo } from "../pets";
import { Icon } from "../ui/icons";
import { localeTag } from "../ui/lang";
import { PetStill } from "../ui/PetArt";
import { BossBlob } from "./BossBlob";
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
 * Mine, as one compact row: **Copy my card**, and a small **Show** for the text. The text (read-only) and "Make a new card
 * identity" (which asks first) are behind Show, so the first screen of the sheet is the friends. The card is signed by the
 * backend with this install's key (the secret never comes here), so it is asked for, and asked for again when what is on the
 * card changes: a "Copied" note is about the card it copied, so it goes when the card changes, and Copy waits for the new one.
 */
function MyCard({ brain, s }: { brain: Brain; s: BrainState }) {
  const head = useId();
  const panel = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const resetButton = useRef<HTMLButtonElement>(null);
  const [note, setNote] = useState<"copied" | "select" | "renewed" | null>(null);
  // The signed text, and the payload it was signed for (it is stale once the card has moved on).
  const [card, setCard] = useState<{ text: string; payload: string | null } | { error: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  // Show the text and select it, because the clipboard wouldn't take it.
  const [selectIt, setSelectIt] = useState(0);
  // What the card says changes with the pet and the day, and with the key: the signature is asked for again.
  const payload = brain.myCardPayload();
  useEffect(() => {
    // What was copied (or selected) is the card as it was: it is not on the clipboard any more once the card changes.
    setNote((n) => (n === "copied" || n === "select" ? null : n));
    let alive = true;
    brain.myCard().then(
      (text) => alive && setCard({ text, payload }),
      (e: unknown) => alive && setCard({ error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [brain, payload, s.myKey]);
  const text = card && "text" in card ? card.text : "";
  // Signed for the card as it is now? Copy waits for that, so it never puts yesterday's card on the clipboard.
  const fresh = card !== null && "text" in card && card.payload === payload;
  const problem = card && "error" in card ? card.error : resetError;
  useEffect(() => {
    if (selectIt === 0) return;
    area.current?.focus();
    area.current?.select();
  }, [selectIt]);
  const copy = async () => {
    if (!fresh) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setNote("copied");
    } catch {
      // Not allowed or not there: show it and select it, so Ctrl+C does the rest.
      setShown(true);
      setSelectIt((n) => n + 1);
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
      <span id={head} className="sr-only">
        {L("Thẻ của mình", "My card")}
      </span>
      <div className="friends-row">
        <button type="button" className="btn small primary" disabled={!fresh} onClick={() => void copy()}>
          <Icon name="copy" size={14} />
          {L("Chép thẻ", "Copy my card")}
        </button>
        <button
          type="button"
          className="friends-toggle"
          aria-expanded={shown}
          aria-controls={panel}
          aria-label={shown ? L("Ẩn chữ của thẻ", "Hide the card's text") : L("Xem chữ của thẻ", "Show the card's text")}
          onClick={() => setShown(!shown)}
        >
          {shown ? L("Ẩn", "Hide") : L("Xem", "Show")}
          <Icon name="chevronDown" size={13} className="chev" />
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
      <div id={panel} hidden={!shown}>
        {shown && (
          <div className="friends-panel">
            <textarea
              ref={area}
              className="field friends-card-text"
              readOnly
              rows={6}
              value={text}
              spellCheck={false}
              aria-label={L("Thẻ thú cưng của mình (chỉ đọc)", "My pet card (read only)")}
              onFocus={(e) => e.currentTarget.select()}
            />
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
          </div>
        )}
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

/**
 * Theirs, as one compact row: **Add a friend** opens the paste box (and puts the keyboard in it), then Add. A card that can't
 * be read or doesn't check out gets kind words and changes nothing. A draft already in the box keeps it open.
 */
function AddFriend({
  brain,
  area,
  myPetName,
  tags,
  open,
  focusTick,
  onToggle,
}: {
  brain: Brain;
  area: React.RefObject<HTMLTextAreaElement | null>;
  myPetName: string;
  tags: Record<string, string>;
  open: boolean;
  /** Bumped when the box is opened for typing: the keyboard goes into it. */
  focusTick: number;
  onToggle: () => void;
}) {
  const head = useId();
  const field = useId();
  const errorId = useId();
  const panel = useId();
  // What was pasted and not yet added is kept in the brain, so that Escape back to the board doesn't lose it.
  const [value, setValue] = useState(brain.friendDraft);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ pk: string; name: string; species: SpeciesId; replaced: boolean } | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    if (focusTick > 0) area.current?.focus();
  }, [focusTick, area]);
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
      setDone({ pk: out.friend.pk, name: out.friend.name, species: out.friend.species, replaced: out.replaced });
      // The Add button goes disabled with the box emptied: keep the keyboard in the box, ready for the next card.
      area.current?.focus();
    } finally {
      pending.current = false;
    }
  };
  // The tag is the friend's as the list is now: two of one name are told apart in this line too.
  const tag = done ? (tags[done.pk] ?? null) : null;
  return (
    <section className="w-group friends-add" aria-labelledby={head}>
      <div className="friends-row">
        <button id={head} type="button" className="btn small friends-add-toggle" aria-expanded={open} aria-controls={panel} onClick={onToggle}>
          <Icon name="plus" size={14} />
          {L("Thêm bạn", "Add a friend")}
          <Icon name="chevronDown" size={13} className="chev" />
        </button>
      </div>
      <div id={panel} hidden={!open}>
        {open && (
          <div className="friends-panel">
            <label htmlFor={field} className="friends-label">
              {L("Dán thẻ của bạn bè vào đây", "Paste your friend's card here")}
            </label>
            <textarea
              id={field}
              ref={area}
              className="field friends-card-text"
              rows={3}
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
                      <FriendName name={done.name} species={done.species} myPetName={myPetName} tag={tag} />
                      {L(".", "'s card.")}
                    </>
                  ) : (
                    <>
                      {L("Đã thêm ", "Added ")}
                      <FriendName name={done.name} species={done.species} myPetName={myPetName} tag={tag} />
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
          </div>
        )}
      </div>
    </section>
  );
}

/** One friend: their pet (a still), name, buddy streak, the date of their card, and Remove behind a confirmation. */
function FriendRow({ friend, streak, tag, today, myPetName, onRemove }: { friend: Friend; streak: number; tag: string | null; today: string; myPetName: string; onRemove: () => void }) {
  const [asking, setAsking] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const species = speciesInfo(friend.species);
  const stale = daysBetween(friend.date, today) > VISIT_MAX_CARD_AGE_DAYS;
  const buddy =
    streak > 0
      ? L(`🔥 Chuỗi bạn: ${plural(streak, "ngày", "day", "days")}`, `🔥 Buddy streak: ${plural(streak, "ngày", "day", "days")}`)
      : L("Chưa có chuỗi bạn", "No buddy streak yet");
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
        <b className="friend-name" title={shownName(friend.name, friend.species, myPetName, tag)}>
          <FriendName name={friend.name} species={friend.species} myPetName={myPetName} tag={tag} />
        </b>
        {/* What the streak means is said once, above the list (`friends-help`), not on every row. */}
        <span className={`friend-streak${streak > 0 ? " on" : ""}`}>{buddy}</span>
        <small className="friend-meta">
          <span className="friend-kind">
            {species.emoji} {species.name[getLang()]} · {stageName(friend.stage)}
          </span>
          <span className={`friend-date${stale ? " stale" : ""}`}>
            {cardWhen(friend.date, today)}
            {stale && L(" · chưa ghé chơi cho tới khi có thẻ mới", " · no visits until a fresh card")}
          </span>
        </small>
      </div>
      <button
        ref={button}
        type="button"
        className="btn ghost small friend-remove"
        data-friend-remove=""
        aria-label={L(`Xoá ${shownName(friend.name, friend.species, myPetName, tag)}`, `Remove ${shownName(friend.name, friend.species, myPetName, tag)}`)}
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
            <FriendName name={friend.name} species={friend.species} myPetName={myPetName} tag={tag} />
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

function FriendList({
  brain,
  s,
  tags,
  today,
  onRemoved,
}: {
  brain: Brain;
  s: BrainState;
  tags: Record<string, string>;
  today: string;
  onRemoved: (index: number, name: string, species: SpeciesId, tag: string | null) => void;
}) {
  const head = useId();
  const help = useId();
  return (
    <section className="w-group friends-list" aria-labelledby={head}>
      <Head id={head} title={L("Bạn bè", "Friends")} count={`${s.friends.length}/${MAX_FRIENDS}`} />
      {s.friends.length === 0 ? (
        <p className="friends-empty">
          {L(
            "Chưa có bạn nào. Gửi thẻ của bạn cho một người bạn, hoặc dán thẻ của họ ở mục “Thêm bạn” bên dưới nhé.",
            "No friends yet. Send a friend your card, or paste theirs under “Add a friend” below.",
          )}
        </p>
      ) : (
        <>
          {/* The rule of the buddy streak, once for the whole list (the list refers to it), instead of in a tooltip and on every row. */}
          <p id={help} className="friends-sub friends-help">
            {L("Chuỗi bạn: số ngày liên tiếp cả hai cùng đạt mục tiêu. Ngày nghỉ không làm đứt chuỗi.", "Buddy streak: days in a row you both reached your goal. A day off doesn't break it.")}
          </p>
          <ul className="friend-list" aria-describedby={help}>
            {s.friends.map((f, i) => (
              <FriendRow
                key={f.pk}
                friend={f}
                streak={s.buddyStreaks[f.pk] ?? 0}
                tag={tags[f.pk] ?? null}
                today={today}
                myPetName={s.prefs.petName}
                onRemove={() => {
                  if (brain.removeFriend(f.pk)) onRemoved(i, f.name, f.species, tags[f.pk] ?? null);
                }}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** This week's Procrastination Blob: an HP bar and who has helped. */
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
          <BossBlob beaten={boss.defeated} />
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
          : bossHelpText()}
      </p>
      <ul className="boss-who" aria-label={L("Ai đã ra tay", "Who has helped")}>
        {boss.members.map((m) => (
          <li key={m.id} className={m.me ? "me" : undefined}>
            <b title={withTag(m.name, m.tag)}>
              <FriendName name={m.name} species={m.species} myPetName={s.prefs.petName} tag={m.tag} />
            </b>
            <span>
              {m.done}
              <span className="sr-only">{L(" việc", m.done === 1 ? " task" : " tasks")}</span>
            </span>
          </li>
        ))}
      </ul>
      {!together && !boss.defeated && <p className="friends-sub">{bossAloneText()}</p>}
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

/** What a card holds, in a row that opens on a click (it was a wall of text at the foot of the sheet). */
function CardNote() {
  return (
    <details className="friends-privacy">
      <summary>
        <Icon name="shield" size={14} />
        <span>{L("Trên thẻ có gì?", "What's on a card?")}</span>
        <Icon name="chevronDown" size={13} className="chev" />
      </summary>
      <div className="friends-privacy-body">
        <p>{L("Một tấm thẻ có:", "A card holds:")}</p>
        <ul>
          <li>{L("Tên, loài, phụ kiện và độ lớn của pet", "Your pet's name, species, accessories and stage")}</li>
          <li>{L("Số việc bạn xong tuần này", "The number of tasks you finished this week")}</li>
          <li>
            {L(
              "28 ngày gần đây: đạt mục tiêu, nghỉ (ngày nghỉ cũng có thể là ngày lịch quá kín để tính), hay chưa có gì",
              "A 28-day record of goal days and rest days (a rest day can also be a day too packed with meetings to count), or nothing",
            )}
          </li>
          <li>{L("Ngày làm thẻ", "The date it was made")}</li>
          <li>
            {L(
              "Khoá công khai của bạn, thứ nối các thẻ của bạn lại với nhau cho tới khi bạn tạo danh tính thẻ mới",
              "Your public key, which links your cards together until you make a new card identity",
            )}
          </li>
        </ul>
        <p>{L("Không bao giờ có tên việc, giờ giấc, tên ứng dụng hay tên bạn.", "Never task titles, times, app names or your name.")}</p>
      </div>
    </details>
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
  // The paste box is folded away behind "Add a friend", unless something was pasted and not added yet.
  const [addOpen, setAddOpen] = useState(brain.friendDraft !== "");
  const [boxFocus, setBoxFocus] = useState(0);
  // Friends who share a name are told apart by a tag, wherever the name shows.
  const tags = useMemo(() => sameNameTags(s.friends), [s.friends]);
  // After a removal the keyboard goes to the next friend's Remove (or the one before it), else to the paste box.
  const [after, setAfter] = useState<{ index: number; name: string; species: SpeciesId; tag: string | null } | null>(null);
  useEffect(() => {
    if (!after) return;
    const buttons = root.current?.querySelectorAll<HTMLElement>("[data-friend-remove]");
    if (buttons && buttons.length > 0) buttons[Math.min(after.index, buttons.length - 1)].focus({ preventScroll: true });
    else {
      setAddOpen(true);
      setBoxFocus((n) => n + 1);
    }
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
      <FriendList brain={brain} s={s} tags={tags} today={today} onRemoved={(index, name, species, tag) => setAfter({ index, name, species, tag })} />
      <WeekBoss s={s} />
      <MyCard brain={brain} s={s} />
      <AddFriend
        brain={brain}
        area={area}
        myPetName={s.prefs.petName}
        tags={tags}
        open={addOpen}
        focusTick={boxFocus}
        onToggle={() => {
          if (!addOpen) setBoxFocus((n) => n + 1);
          setAddOpen(!addOpen);
        }}
      />
      <span className="sr-only" role="status">
        {after && (
          <>
            {L("Đã xoá ", "Removed ")}
            <FriendName name={after.name} species={after.species} myPetName={s.prefs.petName} tag={after.tag} />.
          </>
        )}
      </span>
      <CardNote />
    </div>
  );
}
