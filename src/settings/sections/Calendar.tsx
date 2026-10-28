import { type FormEvent, useState } from "react";
import { L } from "../../core/l10n";
import { Icon } from "../../ui/icons";
import { useSettings } from "../context";
import { Group, Notice, NumberRow, Page, StackRow, SwitchRow } from "../controls";
import { MAX_CALENDARS, checkCalendarText, secretErrorText } from "../model";

/**
 * Calendar links are "secret addresses": anyone with one can read the whole calendar. Like the API keys they're
 * write-only here: saved to Windows Credential Manager, and only their hosts are ever shown again.
 */
function CalendarLinks() {
  const { backend, secrets, refreshSecrets } = useSettings();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const { links, invalid, overLimit } = checkCalendarText(text);
  const saved = secrets.calendarHosts;

  const store = async (next: string[]) => {
    setBusy(true);
    setResult(null);
    try {
      await backend.secrets.setCalendarLinks(next);
      setText("");
      await backend.bus.emit({ type: "secrets-changed" });
      await refreshSecrets();
      setResult({
        kind: "ok",
        text: next.length > 0 ? L(`Đã lưu ${next.length} link lịch.`, next.length === 1 ? "Saved 1 calendar link." : `Saved ${next.length} calendar links.`) : L("Đã xoá các link lịch khỏi máy.", "Calendar links removed from this PC."),
      });
    } catch (err) {
      setResult({ kind: "error", text: secretErrorText(err, "calendar") });
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (links.length > 0 && !busy) void store(links);
  };

  return (
    <>
      <div className="row">
        <div className="row-text">
          <p className="row-label">{L("Lịch đã liên kết", "Linked calendars")}</p>
          <p className="row-help">
            {saved.length > 0
              ? saved.join(" · ")
              : L("Chưa có link nào. Thú cưng vẫn chạy tốt, chỉ là không biết giờ họp của bạn.", "No links yet. The pet works fine, it just doesn't know your meetings.")}
          </p>
        </div>
        <div className="row-control">
          <span className={`status-pill ${saved.length > 0 ? "good" : "off"}`}>
            <span className="dot" aria-hidden="true" />
            {saved.length > 0 ? L(`${saved.length} lịch`, saved.length === 1 ? "1 calendar" : `${saved.length} calendars`) : L("Chưa có", "None")}
          </span>
        </div>
      </div>
      <StackRow
        label={saved.length > 0 ? L("Thay các link", "Replace the links") : L("Link ICS", "ICS links")}
        help={L(
          "Mỗi dòng một link. Link là bí mật nên được lưu trong Windows Credential Manager và không hiện lại.",
          "One link per line. Links are secrets, so they're kept in Windows Credential Manager and never shown again.",
        )}
        after={
          <>
            {invalid.length > 0 && (
              <div className="row-warn block" role="status">
                <Icon name="warning" size={14} />
                <div>
                  {L("Bỏ qua (chỉ nhận link https:// và webcal://):", "Ignored (only https:// and webcal:// links work):")}
                  <ul className="bad-links">
                    {invalid.map((x) => (
                      <li key={x} className="mono">
                        {x.length > 60 ? `${x.slice(0, 59)}…` : x}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {overLimit > 0 && (
              <p className="row-warn">
                <Icon name="warning" size={14} />
                {L(`Chỉ lưu ${MAX_CALENDARS} link đầu tiên.`, `Only the first ${MAX_CALENDARS} links are saved.`)}
              </p>
            )}
            <details className="howto">
              <summary>{L("Tìm link ở đâu?", "Where do I find the link?")}</summary>
              <dl>
                <dt>Google Calendar</dt>
                <dd>
                  {L(
                    "Cài đặt → chọn lịch ở cột trái → Tích hợp lịch → sao chép “Địa chỉ bí mật ở định dạng iCal”.",
                    "Settings → pick the calendar on the left → Integrate calendar → copy “Secret address in iCal format”.",
                  )}
                </dd>
                <dt>Outlook / Microsoft 365</dt>
                <dd>
                  {L(
                    "Cài đặt → Lịch → Lịch dùng chung → Phát hành lịch → chọn lịch, “Có thể xem mọi chi tiết” → Phát hành → sao chép link ICS.",
                    "Settings → Calendar → Shared calendars → Publish a calendar → choose the calendar and “Can view all details” → Publish → copy the ICS link.",
                  )}
                </dd>
                <dt>iCloud</dt>
                <dd>{L("Chia sẻ lịch → Lịch công khai → sao chép link webcal://.", "Share the calendar → Public Calendar → copy the webcal:// link.")}</dd>
              </dl>
            </details>
          </>
        }
      >
        {({ id, describedBy }) => (
          <form className="inline-form stack" onSubmit={save}>
            <textarea
              id={id}
              className="field mono"
              rows={3}
              value={text}
              wrap="off"
              spellCheck={false}
              autoComplete="off"
              aria-describedby={describedBy}
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              onChange={(e) => setText(e.target.value)}
            />
            <button className="btn primary" type="submit" disabled={links.length === 0 || busy}>
              {L("Lưu", "Save")}
            </button>
          </form>
        )}
      </StackRow>
      {(result || saved.length > 0) && (
        <div className="row actions-row">
          {result ? <Notice kind={result.kind}>{result.text}</Notice> : <span />}
          {saved.length > 0 && (
            <button className="btn danger" type="button" disabled={busy} onClick={() => void store([])}>
              <Icon name="key" size={15} />
              {L("Xoá các link", "Remove links")}
            </button>
          )}
        </div>
      )}
    </>
  );
}

export function CalendarSection() {
  return (
    <Page
      id="calendar"
      title={L("Lịch", "Calendar")}
      intro={L("Giờ họp được tính là giờ làm, thú cưng giữ im lặng trong cuộc họp và nhắc bạn trước khi bắt đầu.", "Meetings count as work, your pet stays quiet during them and reminds you before they start.")}
    >
      <Group>
        <SwitchRow k="useCalendar" label={L("Dùng lịch của tôi", "Use my calendar")} />
      </Group>

      <Group title={L("Link lịch (ICS)", "Calendar links (ICS)")}>
        <CalendarLinks />
      </Group>

      <Group title={L("Cuộc họp", "Meetings")}>
        <SwitchRow
          k="adaptTarget"
          label={L("Giảm mục tiêu khi họp nhiều", "Lower the target on busy days")}
          help={L("Ngày kín lịch họp thì cần ít việc hơn.", "A day packed with meetings asks for fewer tasks.")}
        />
        <NumberRow
          k="meetingLead"
          label={L("Nhắc trước cuộc họp", "Remind me before a meeting")}
          help={L("Kèm nút Tham gia khi có link họp.", "With a Join button when the event has a meeting link.")}
          unit={L("phút", "min")}
        />
      </Group>
    </Page>
  );
}
