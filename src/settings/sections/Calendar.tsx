import { L } from "../../core/l10n";
import { Icon } from "../../ui/icons";
import { useSettings } from "../context";
import { Group, NumberRow, Page, StackRow, SwitchRow, TextField } from "../controls";
import { MAX_CALENDARS, checkCalendarText } from "../model";

function LinkStatus() {
  const { prefs } = useSettings();
  const { links, invalid, overLimit } = checkCalendarText(prefs.calendarUrls);
  if (links.length === 0 && invalid.length === 0) return null;
  return (
    <div className="link-status">
      {links.length > 0 && (
        <p className="ok-line">
          <Icon name="check" size={14} />
          {L(`${links.length} lịch đã liên kết`, links.length === 1 ? "1 calendar linked" : `${links.length} calendars linked`)}
        </p>
      )}
      {overLimit > 0 && (
        <p className="row-warn">
          <Icon name="warning" size={14} />
          {L(`Chỉ dùng ${MAX_CALENDARS} link đầu tiên.`, `Only the first ${MAX_CALENDARS} links are used.`)}
        </p>
      )}
      {invalid.length > 0 && (
        <div className="row-warn block" role="status">
          <Icon name="warning" size={14} />
          <div>
            {L("Bỏ qua (chỉ nhận link https:// và webcal://):", "Ignored (only https:// and webcal:// links work):")}
            <ul className="bad-links">
              {invalid.map((s) => (
                <li key={s} className="mono">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
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
        <StackRow
          label={L("Link ICS", "ICS links")}
          help={L("Mỗi dòng một link. Link là bí mật: ai có link đều đọc được lịch của bạn.", "One link per line. Treat them like passwords: anyone with a link can read that calendar.")}
          after={
            <>
              <LinkStatus />
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
                  <dd>
                    {L("Chia sẻ lịch → Lịch công khai → sao chép link webcal://.", "Share the calendar → Public Calendar → copy the webcal:// link.")}
                  </dd>
                </dl>
              </details>
            </>
          }
        >
          {({ id, describedBy }) => (
            <TextField
              id={id}
              k="calendarUrls"
              describedBy={describedBy}
              multiline
              rows={4}
              mono
              noWrap
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
            />
          )}
        </StackRow>
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
