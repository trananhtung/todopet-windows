// "Work day" and "Focus" pages.
import { L } from "../../core/l10n";
import { useSettings } from "../context";
import { Group, NumberRow, Page, SwitchRow } from "../controls";
import { hourLabel, workHoursProblem } from "../model";

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
