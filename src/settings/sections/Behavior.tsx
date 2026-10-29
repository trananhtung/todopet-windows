import { useEffect, useState } from "react";
import { L } from "../../core/l10n";
import type { SoundMode } from "../../core/prefs";
import { useSettings } from "../context";
import { Group, Notice, NumberRow, Page, Row, Segmented, SwitchRow } from "../controls";

function AutostartRow() {
  const { backend } = useSettings();
  const [on, setOn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    backend.system.getAutostart().then(
      (v) => alive && setOn(v),
      () => alive && setOn(false),
    );
    return () => {
      alive = false;
    };
  }, [backend]);

  const toggle = async (next: boolean) => {
    setOn(next);
    setError(null);
    try {
      await backend.system.setAutostart(next);
      setOn(await backend.system.getAutostart());
    } catch (e) {
      setOn(!next);
      setError(L("Windows không cho đổi tuỳ chọn này: ", "Windows wouldn't change this: ") + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <>
      <Row label={L("Mở cùng Windows", "Start with Windows")} help={L("Thú cưng có mặt ngay khi bạn đăng nhập.", "Your pet shows up as soon as you sign in.")}>
        {({ id, describedBy }) => (
          <input
            id={id}
            type="checkbox"
            role="switch"
            className="switch"
            checked={on ?? false}
            disabled={on === null}
            aria-describedby={describedBy}
            onChange={(e) => void toggle(e.target.checked)}
          />
        )}
      </Row>
      {error && (
        <div className="row">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
    </>
  );
}

export function BehaviorSection() {
  const { prefs, update } = useSettings();
  const sounds: { value: SoundMode; label: string }[] = [
    { value: "off", label: L("Tắt", "Off") },
    { value: "important", label: L("Chỉ việc quan trọng", "Important only") },
    { value: "all", label: L("Tất cả", "Everything") },
  ];
  return (
    <Page id="behavior" title={L("Tính cách", "Behavior")} intro={L("Thú cưng ồn ào hay lặng lẽ, tinh nghịch hay ngoan.", "How chatty, cheeky or quiet your pet is.")}>
      <Group title={L("Âm thanh và giọng nói", "Sound and voice")}>
        <Row label={L("Âm thanh", "Sounds")} help={L("Tiếng kêu nhỏ khi nhắc và khi ăn mừng.", "Little chirps for reminders and celebrations.")}>
          {({ labelId, describedBy }) => (
            <Segmented labelledBy={labelId} describedBy={describedBy} value={prefs.soundMode} options={sounds} onChange={(soundMode) => update({ soundMode })} />
          )}
        </Row>
        <SwitchRow
          k="voiceOn"
          label={L("Đọc to lời thoại", "Speak some lines")}
          help={L("Dùng giọng đọc có sẵn của Windows.", "Uses a built-in Windows voice.")}
        />
      </Group>

      <Group title={L("Tinh nghịch", "Mischief")}>
        <SwitchRow
          k="antics"
          label={L("Quậy khi bạn xao nhãng", "Make mischief when you get distracted")}
          help={L(
            "Càu nhàu, giơ biển, và lật bàn (╯°□°)╯︵ ┻━┻, chỉ khi bạn đang ở ứng dụng hay trang web gây xao nhãng. Tối đa một lần mỗi 20 phút.",
            "Grumbles, sign parades and the odd table flip (╯°□°)╯︵ ┻━┻, only while you're on a distracting app or site. At most one stunt every 20 minutes.",
          )}
        />
        <SwitchRow
          k="chaseWhenAngry"
          label={L("Đi về phía con trỏ khi cáu", "March toward the cursor when grumpy")}
        />
      </Group>

      <Group title={L("Yên tĩnh", "Calm")}>
        <NumberRow
          k="nudgeBudget"
          label={L("Nhắc tối đa mỗi ngày", "Reminders a day, at most")}
          help={L(
            "Lời nhắc bạn không yêu cầu. Việc có giờ, cuộc họp, lời chào buổi sáng, tổng kết cuối ngày, thẻ “bạn đang làm gì”, câu hỏi sau họp và việc bạn tự hẹn giờ không tính. Bạn đóng loại nhắc nào thì loại đó thưa dần; bỏ qua 3 lần liền thì thú cưng im một giờ.",
            "Bubbles you didn't ask for. Timed tasks, meetings, the morning hello, the end-of-day review, the “where was I?” card, the question after a meeting and plans you set yourself are free. Close a kind of reminder and it comes less often; pass on 3 in a row and your pet waits an hour.",
          )}
          unit={L("lần", "times")}
        />
        <SwitchRow
          k="protectFlow"
          label={L("Bảo vệ lúc làm sâu", "Protect deep work")}
          help={L("Gõ phím đều tay 10 phút là đang vào guồng: lời nhắc không gấp sẽ chờ.", "After 10 minutes of steady typing you're in the zone: non-urgent bubbles wait.")}
        />
        <SwitchRow k="stillWhileTyping" label={L("Đứng yên khi bạn gõ phím", "Keep still while I type")} />
        <SwitchRow
          k="hideInFullscreen"
          label={L("Ẩn khi có ứng dụng toàn màn hình", "Hide during full-screen apps")}
          help={L("Game, phim, trình chiếu.", "Games, videos, slideshows.")}
        />
      </Group>

      <Group title={L("Nhật ký và khởi động", "Diary and startup")}>
        <SwitchRow
          k="keepLog"
          label={L("Ghi nhật ký", "Keep a diary")}
          help={L("Ghi lại mỗi lời nhắc và lý do. Chỉ lưu trên máy này, trong 14 ngày.", "Notes every reminder and why it fired. Stays on this PC for 14 days.")}
        />
        <AutostartRow />
      </Group>
    </Page>
  );
}
