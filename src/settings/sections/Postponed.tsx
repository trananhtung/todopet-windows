import { type FormEvent, useState } from "react";
import { L } from "../../core/l10n";
import { DEFAULT_CLAUDE_MODEL } from "../../core/prefs";
import { Icon } from "../../ui/icons";
import { useSettings } from "../context";
import { ExternalLink, Group, Notice, NumberRow, Page, StackRow, TextField } from "../controls";
import { secretErrorText } from "../model";

const KEYS_URL = "https://console.anthropic.com/settings/keys";

export function PostponedSection() {
  const { backend, secrets, refreshSecrets } = useSettings();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const store = async (value: string | null) => {
    setBusy(true);
    setResult(null);
    try {
      await backend.secrets.setAnthropicKey(value);
      setKey("");
      await backend.bus.emit({ type: "secrets-changed" });
      await refreshSecrets();
      setResult({
        kind: "ok",
        text: value ? L("Đã lưu khoá.", "Key saved.") : L("Đã xoá khoá khỏi máy.", "Key removed from this PC."),
      });
    } catch (err) {
      setResult({ kind: "error", text: secretErrorText(err, "anthropic") });
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const value = key.trim();
    if (value && !busy) void store(value);
  };

  return (
    <Page
      id="postponed"
      title={L("Việc bị hoãn", "Postponed tasks")}
      intro={L(
        "Việc cứ bị dời mãi? Thú cưng đề nghị chia nhỏ thành các bước 15–30 phút, hoặc bỏ khỏi kế hoạch hôm nay.",
        "A task that keeps slipping? Your pet offers to split it into 15–30 minute steps, or to drop it from today's plan.",
      )}
    >
      <Group>
        <NumberRow
          k="stuckDays"
          label={L("Coi là bị hoãn sau", "Counts as postponed after")}
          help={L("Số ngày việc đó nằm trong danh sách mà chưa xong.", "Days the task has sat on your list without getting done.")}
          unit={L("ngày", "days")}
        />
      </Group>

      <Group title={L("Hỏi Claude (không bắt buộc)", "Ask Claude (optional)")}>
        <div className="row">
          <div className="row-text">
            <p className="row-label">{L("Khoá API Anthropic", "Anthropic API key")}</p>
            <p className="row-help">
              {L("Có khoá, nút Hỏi Claude sẽ gợi ý cách chia việc.", "With a key, the Ask Claude button suggests how to split a task.")}{" "}
              <ExternalLink href={KEYS_URL}>{L("Lấy khoá", "Get a key")}</ExternalLink>
            </p>
          </div>
          <div className="row-control">
            <span className={`status-pill ${secrets.anthropic ? "good" : "off"}`}>
              <span className="dot" aria-hidden="true" />
              {secrets.anthropic ? L("Đã lưu", "Saved") : L("Chưa có", "Not set")}
            </span>
          </div>
        </div>
        <StackRow
          label={secrets.anthropic ? L("Thay khoá", "Replace the key") : L("Khoá mới", "New key")}
          help={L("Lưu trong Windows Credential Manager, không bao giờ hiện lại.", "Stored in Windows Credential Manager and never shown again.")}
        >
          {({ id, describedBy }) => (
            <form className="inline-form" onSubmit={save}>
              <input
                id={id}
                className="field mono"
                type="password"
                value={key}
                placeholder={secrets.anthropic ? "••••••••••••••••" : "sk-ant-…"}
                autoComplete="off"
                spellCheck={false}
                aria-describedby={describedBy}
                onChange={(e) => setKey(e.target.value)}
              />
              <button className="btn primary" type="submit" disabled={!key.trim() || busy}>
                {L("Lưu", "Save")}
              </button>
            </form>
          )}
        </StackRow>
        {(result || secrets.anthropic) && (
          <div className="row actions-row">
            {result ? <Notice kind={result.kind}>{result.text}</Notice> : <span />}
            {secrets.anthropic && (
              <button className="btn danger" type="button" disabled={busy} onClick={() => void store(null)}>
                <Icon name="key" size={15} />
                {L("Xoá khoá", "Remove")}
              </button>
            )}
          </div>
        )}
        <StackRow label={L("Mô hình Claude", "Claude model")} help={L(`Để trống để dùng ${DEFAULT_CLAUDE_MODEL}.`, `Leave empty for ${DEFAULT_CLAUDE_MODEL}.`)}>
          {({ id, describedBy }) => <TextField id={id} k="claudeModel" describedBy={describedBy} placeholder={DEFAULT_CLAUDE_MODEL} mono />}
        </StackRow>
      </Group>

      <p className="privacy-note">
        <Icon name="shield" size={16} />
        <span>
          {L(
            "Chỉ tiêu đề và ghi chú của việc được gửi tới Anthropic, và chỉ khi bạn bấm Hỏi Claude.",
            "Only the task's title and notes are sent to Anthropic, and only when you press Ask Claude.",
          )}
        </span>
      </p>
    </Page>
  );
}
