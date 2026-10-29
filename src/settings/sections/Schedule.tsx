// "Work day" and "Focus" pages.
import { type FormEvent, useState } from "react";
import { dayKey, parseDate } from "../../core/dates";
import { L, plural } from "../../core/l10n";
import { dayRange, MAX_REST_DAYS, MAX_REST_RANGE, tidyRestDays } from "../../core/prefs";
import { Icon } from "../../ui/icons";
import { localeTag } from "../../ui/lang";
import { useSettings } from "../context";
import { Group, Notice, NumberRow, Page, StackRow, SwitchRow } from "../controls";
import { hourLabel, restRangeProblem, restRuns, workHoursProblem } from "../model";

/** Days off (vacation, sick days, holidays): added as a range, listed as runs you can remove. */
function RestDays() {
  const { prefs, update, lang } = useSettings();
  const today = dayKey(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const problem = restRangeProblem(from, to, today);
  const runs = restRuns(prefs.restDays, today);
  const label = (key: string) => parseDate(key)?.toLocaleDateString(localeTag(lang), { weekday: "short", day: "numeric", month: "short" }) ?? key;
  const span = (run: { from: string; to: string }) => (run.from === run.to ? label(run.from) : `${label(run.from)} – ${label(run.to)}`);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const range = dayRange(from, to);
    if (problem || range.length === 0) return;
    const next = tidyRestDays([...prefs.restDays, ...range]);
    const left = range.filter((d) => !next.includes(d)).length;
    update({ restDays: next });
    setResult(
      left > 0
        ? {
            kind: "error",
            text: L(`Đã đủ ${MAX_REST_DAYS} ngày nghỉ, nên ${left} ngày chưa được thêm.`, `That's the limit of ${MAX_REST_DAYS} days off, so ${plural(left, "", "day wasn't", "days weren't").trim()} added.`),
          }
        : { kind: "ok", text: L(`Đã thêm ${range.length} ngày nghỉ.`, `Added ${plural(range.length, "", "day off", "days off").trim()}.`) },
    );
  };

  return (
    <>
      <StackRow
        label={L("Thêm ngày nghỉ", "Add days off")}
        help={L(
          `Nghỉ phép, ốm hay lễ: thú cưng không nhắc việc, và chuỗi ngày vẫn giữ nguyên. Mỗi lần tối đa ${MAX_REST_RANGE} ngày.`,
          `Vacation, sick days, holidays: your pet won't nudge you, and your streak stays put. Up to ${MAX_REST_RANGE} days at a time.`,
        )}
        after={
          <>
            {problem && (
              <p className="row-warn" role="status">
                <Icon name="warning" size={14} />
                {problem}
              </p>
            )}
            {result && <Notice kind={result.kind}>{result.text}</Notice>}
          </>
        }
      >
        {({ id, describedBy }) => (
          <form className="inline-form rest-form" onSubmit={add}>
            <input
              id={id}
              className="field"
              type="date"
              min={today}
              value={from}
              aria-describedby={describedBy}
              onChange={(e) => {
                setFrom(e.target.value);
                if (!to || to < e.target.value) setTo(e.target.value);
                setResult(null);
              }}
            />
            <span className="rest-to" aria-hidden="true">
              →
            </span>
            <input
              className="field"
              type="date"
              min={from || today}
              value={to}
              aria-label={L("Đến ngày", "Until")}
              onChange={(e) => {
                setTo(e.target.value);
                setResult(null);
              }}
            />
            <button className="btn primary" type="submit" disabled={!from || !to || problem !== null}>
              <Icon name="plus" size={15} />
              {L("Thêm", "Add")}
            </button>
          </form>
        )}
      </StackRow>
      <div className="row stack">
        <p className="row-label">{L("Sắp tới", "Coming up")}</p>
        {runs.length === 0 ? (
          <p className="row-help">{L("Chưa có ngày nghỉ nào. Trên bảng việc cũng có nút “Nghỉ hôm nay”.", "No days off yet. The board also has a “Take today off” button.")}</p>
        ) : (
          <ul className="rest-list">
            {runs.map((run) => (
              <li key={run.from} className="rest-run">
                <span className="rest-when">{span(run)}</span>
                <span className="rest-count">{plural(run.days.length, "ngày", "day", "days")}</span>
                <button
                  className="btn small"
                  type="button"
                  aria-label={L(`Bỏ ngày nghỉ ${span(run)}`, `Remove the days off ${span(run)}`)}
                  onClick={() => {
                    update({ restDays: prefs.restDays.filter((d) => !run.days.includes(d)) });
                    setResult(null);
                  }}
                >
                  <Icon name="close" size={14} />
                  {L("Bỏ", "Remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function WorkdaySection() {
  const { prefs } = useSettings();
  const problem = workHoursProblem(prefs);
  const endProblem = prefs.workEnd <= prefs.workStart ? problem : null;
  const deadlineProblem = endProblem ? null : problem;
  return (
    <Page
      id="workday"
      title={L("Ngày làm việc", "Work day")}
      intro={L("Khi nào thú cưng nhắc bạn, và nhắc thường xuyên đến đâu.", "When your pet nudges you, and how often.")}
    >
      <Group title={L("Mục tiêu", "Goal")}>
        <NumberRow
          k="dailyTarget"
          label={L("Số việc mỗi ngày", "Tasks to plan each day")}
          help={L("Quy tắc 3 việc: ít mà chắc.", "The Rule of 3: few tasks, actually done.")}
          unit={L("việc", "tasks")}
        />
      </Group>

      <Group title={L("Giờ giấc", "Hours")}>
        <NumberRow k="workStart" label={L("Bắt đầu làm", "Work starts")} help={hourLabel(prefs.workStart)} unit="h" />
        <NumberRow k="workEnd" label={L("Kết thúc", "Work ends")} help={hourLabel(prefs.workEnd)} unit="h" warn={endProblem} />
        <NumberRow
          k="planDeadline"
          label={L("Hạn lên kế hoạch", "Plan by")}
          help={L(
            `Sau ${hourLabel(prefs.planDeadline)} mà chưa đủ việc cho hôm nay, thú cưng sẽ nhắc mỗi 30 phút.`,
            `If today isn't planned by ${hourLabel(prefs.planDeadline)}, your pet asks every 30 minutes.`,
          )}
          unit="h"
          warn={deadlineProblem}
        />
        <SwitchRow k="workSaturday" label={L("Làm việc thứ Bảy", "Work on Saturday")} />
        <SwitchRow k="workSunday" label={L("Làm việc Chủ nhật", "Work on Sunday")} />
      </Group>

      <Group title={L("Ngày nghỉ", "Days off")}>
        <RestDays />
      </Group>

      <Group title={L("Lời nhắc", "Reminders")}>
        <NumberRow
          k="remindEvery"
          label={L("Nhắc việc tiếp theo mỗi", "Nudge about the next task every")}
          help={L("Theo thứ tự “ăn con ếch”: việc khó và quan trọng trước.", "In “eat the frog” order: the hard, important task first.")}
          unit={L("phút", "min")}
        />
        <NumberRow
          k="bubbleGap"
          label={L("Giữa hai lời nhắc ít nhất", "At least this long between bubbles")}
          help={L("Áp dụng cho lời nhắc bạn không yêu cầu. 0 = không giới hạn.", "For bubbles you didn't ask for. 0 = no limit.")}
          unit={L("phút", "min")}
        />
      </Group>
    </Page>
  );
}

export function FocusSection() {
  const { prefs } = useSettings();
  return (
    <Page
      id="focus"
      title={L("Tập trung", "Focus")}
      intro={L("Bấm Tập trung trên một việc: thú cưng đeo băng đô và ngồi yên trong góc.", "Press Focus on a task: your pet puts on a headband and sits quietly in the corner.")}
    >
      <div className="focus-strip card" aria-hidden="true">
        <span className="focus-block work" style={{ flexGrow: prefs.focusMinutes }}>
          🍅 {prefs.focusMinutes}′
        </span>
        <span className="focus-block rest" style={{ flexGrow: Math.max(prefs.breakMinutes, 4) }}>
          ☕ {prefs.breakMinutes}′
        </span>
      </div>
      <Group title={L("Phiên tập trung", "Focus session")}>
        <NumberRow
          k="focusMinutes"
          label={L("Thời gian tập trung", "Focus for")}
          help={L("Hết giờ, thú cưng hỏi bạn đã xong việc chưa.", "When time is up, your pet asks whether you finished.")}
          unit={L("phút", "min")}
        />
        <NumberRow
          k="breakMinutes"
          label={L("Nghỉ giải lao", "Then take a break of")}
          help={L("Bắt đầu sau khi bạn trả lời.", "Starts once you answer.")}
          unit={L("phút", "min")}
        />
      </Group>
    </Page>
  );
}
