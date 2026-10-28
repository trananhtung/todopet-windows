import { type FormEvent, useState } from "react";
import { L } from "../../core/l10n";
import { DEFAULT_FILTER } from "../../core/prefs";
import { Icon } from "../../ui/icons";
import { useSettings } from "../context";
import { ExternalLink, Group, Notice, Page, StackRow, TextField } from "../controls";
import { secretErrorText } from "../model";

const DEVELOPER_URL = "https://app.todoist.com/app/settings/integrations/developer";

export function TodoistSection() {
  const { backend, secrets, refreshSecrets } = useSettings();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<"connect" | "disconnect" | null>(null);
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const connect = async (e: FormEvent) => {
    e.preventDefault();
    const value = token.trim();
    if (!value || busy) return;
    setBusy("connect");
    setResult(null);
    try {
      await backend.secrets.setTodoistToken(value);
      setToken("");
      await backend.bus.emit({ type: "secrets-changed" });
      await refreshSecrets();
      setResult({ kind: "ok", text: L("Đã kết nối. Thú cưng đang lấy danh sách việc của bạn.", "Connected. Your pet is fetching your tasks.") });
    } catch (err) {
      setResult({ kind: "error", text: secretErrorText(err, "todoist") });
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    setResult(null);
    try {
      await backend.secrets.clearTodoistToken();
      await backend.bus.emit({ type: "secrets-changed" });
      await refreshSecrets();
      setResult({ kind: "ok", text: L("Đã ngắt kết nối và xoá token khỏi máy.", "Disconnected. The token was removed from this PC.") });
    } catch (err) {
      setResult({ kind: "error", text: secretErrorText(err, "todoist") });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page id="todoist" title="Todoist" intro={L("Thú cưng đọc việc hôm nay từ Todoist của bạn.", "Your pet reads today's tasks from your Todoist.")}>
      <Group title={L("Tài khoản", "Account")}>
        <div className="row">
          <div className="row-text">
            <p className="row-label">{L("Trạng thái", "Status")}</p>
            <p className="row-help">
              {L("Token được giữ trong Windows Credential Manager và không bao giờ hiện lại.", "Your token lives in Windows Credential Manager and is never shown again.")}
            </p>
          </div>
          <div className="row-control">
            <span className={`status-pill ${secrets.todoist ? "good" : "off"}`}>
              <span className="dot" aria-hidden="true" />
              {secrets.todoist ? L("Đã kết nối", "Connected") : L("Chưa kết nối", "Not connected")}
            </span>
          </div>
        </div>

        <StackRow
          label={secrets.todoist ? L("Đổi token API", "Replace the API token") : L("Token API", "API token")}
          help={
            <>
              {L("Trong Todoist: Cài đặt → Tích hợp → Nhà phát triển → sao chép token API.", "In Todoist: Settings → Integrations → Developer → copy the API token.")}{" "}
              <ExternalLink href={DEVELOPER_URL}>{L("Mở trang đó", "Open that page")}</ExternalLink>
            </>
          }
        >
          {({ id, describedBy }) => (
            <form className="inline-form" onSubmit={connect}>
              <input
                id={id}
                className="field mono"
                type="password"
                value={token}
                placeholder={secrets.todoist ? "••••••••••••••••" : L("Dán token vào đây", "Paste your token here")}
                autoComplete="off"
                spellCheck={false}
                aria-describedby={describedBy}
                onChange={(e) => setToken(e.target.value)}
              />
              <button className="btn primary" type="submit" disabled={!token.trim() || busy !== null}>
                {busy === "connect" ? L("Đang kết nối…", "Connecting…") : L("Lưu và kết nối", "Save & connect")}
              </button>
            </form>
          )}
        </StackRow>

        {(result || secrets.todoist) && (
          <div className="row actions-row">
            {result ? <Notice kind={result.kind}>{result.text}</Notice> : <span />}
            {secrets.todoist && (
              <button className="btn danger" type="button" onClick={disconnect} disabled={busy !== null}>
                <Icon name="key" size={15} />
                {busy === "disconnect" ? L("Đang ngắt…", "Disconnecting…") : L("Ngắt kết nối", "Disconnect")}
              </button>
            )}
          </div>
        )}
      </Group>

      <Group title={L("Ngày của tôi", "My day")}>
        <StackRow
          label={L("Bộ lọc việc hôm nay", "Today's filter")}
          help={L(
            `Bộ lọc Todoist quyết định việc nào nằm trong danh sách hôm nay. Để trống để dùng “${DEFAULT_FILTER}”.`,
            `The Todoist filter that decides which tasks make today's list. Leave empty for “${DEFAULT_FILTER}”.`,
          )}
        >
          {({ id, describedBy }) => <TextField id={id} k="filterQuery" describedBy={describedBy} placeholder={DEFAULT_FILTER} mono />}
        </StackRow>
      </Group>
    </Page>
  );
}
