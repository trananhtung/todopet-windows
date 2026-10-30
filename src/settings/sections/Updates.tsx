import { useCallback, useEffect, useState } from "react";
import { BackendError, type UpdateStatus } from "../../backend/types";
import { L } from "../../core/l10n";
import { manualReasonText, statusLine, tidyNotes } from "../../core/updates";
import { Icon, type IconName } from "../../ui/icons";
import { localeTag } from "../../ui/lang";
import { useBus, useWindowFocus } from "../../ui/useBackend";
import { useSettings } from "../context";
import { Group, Notice, Page, SwitchRow } from "../controls";

/** How long Settings waits for the pet to say it took the request to install, before it says it didn't hear back. */
const HEARD_WITHIN_MS = 8_000;

const TONE_ICON: Record<"ok" | "new" | "error" | "info", IconName> = { ok: "check", new: "sparkle", error: "warning", info: "clock" };

/** Where a request to install stands: asked and waiting to be taken; taken (it can take minutes: no time limit); not taken. */
type Asked = "no" | "waiting" | "installing" | "unheard";

/**
 * Settings → Updates. It reads the backend's cached status (no network) and asks GitHub only when you press **Check now**.
 *
 * **Installing is the overlay's job, not this window's.** The overlay owns the pet's state (its life, today's gates) and
 * Settings can't save any of it, so "Update & restart" asks the overlay over the bus (`update-install`); the overlay saves
 * everything, keeps the release notes for after the restart, shows the progress in the pet's bubble and falls back to the download
 * page if it fails. This window only needs the read commands, and the install command stays in the overlay's capability alone.
 *
 * The overlay answers `update-installing` when it has taken the request: from then on this page says it is updating for as long
 * as the download takes (minutes, maybe), until `update-changed` (it failed, or there was nothing to install). If no answer comes
 * within a few seconds it says so, kindly, and offers to try again or to open the download page.
 *
 * Buttons that are busy are `aria-disabled`, never `disabled` or removed, and the notices that appear are below them: whoever
 * pressed Enter keeps the keyboard's focus, and nothing under it moves.
 */
export function UpdatesSection() {
  const { backend, lang } = useSettings();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [checking, setChecking] = useState(false);
  const [asked, setAsked] = useState<Asked>("no");
  const [pageFailed, setPageFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await backend.updates.status());
      setUnreadable(false);
    } catch {
      setUnreadable(true);
    }
  }, [backend]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useBus(backend, (e) => {
    // The pet took the request (or an install began from its bubble or its chip): it is updating.
    if (e.type === "update-installing") setAsked("installing");
    // The pet checked, or its install failed, or there was nothing to install: read the status again and stop waiting.
    if (e.type === "update-changed") {
      setAsked("no");
      void refresh();
    }
  });
  useWindowFocus(() => void refresh());
  useEffect(() => {
    if (asked !== "waiting") return;
    const id = setTimeout(() => setAsked((a) => (a === "waiting" ? "unheard" : a)), HEARD_WITHIN_MS);
    return () => clearTimeout(id);
  }, [asked]);

  const installing = asked === "waiting" || asked === "installing";

  const checkNow = async () => {
    if (checking || installing) return;
    setChecking(true);
    setPageFailed(false);
    try {
      setStatus(await backend.updates.check(true));
      // The pet (the board's chip, the tray item) learns what this found.
      await backend.bus.emit({ type: "update-changed" }).catch(() => undefined);
    } catch (e) {
      // (A network failure comes back as a status with `error`; a rejection is something else going wrong, and says nothing new.)
      // The version found before stays on offer; only the failure is new.
      const error = e instanceof BackendError ? { kind: e.kind, message: e.message } : { kind: "internal" as const, message: e instanceof Error ? e.message : String(e) };
      setStatus((old) => ({ current: old?.current ?? "", checkedAt: Date.now(), available: old?.available ?? null, error }));
    } finally {
      setChecking(false);
    }
  };

  const install = async () => {
    if (checking || installing) return;
    setAsked("waiting");
    setPageFailed(false);
    await backend.bus.emit({ type: "update-install" }).catch(() => setAsked("unheard"));
  };

  const openPage = async () => {
    setPageFailed(false);
    try {
      await backend.updates.openPage();
    } catch {
      setPageFailed(true);
    }
  };

  const u = status?.available ?? null;
  const line = status ? statusLine(status, checking, Date.now()) : null;
  const notes = u ? tidyNotes(u.notes) : "";
  const published = u?.publishedAt && !Number.isNaN(Date.parse(u.publishedAt)) ? new Date(u.publishedAt).toLocaleDateString(localeTag(lang), { year: "numeric", month: "short", day: "numeric" }) : null;

  return (
    <Page id="updates" title={L("Cập nhật", "Updates")} intro={L("Mình báo bạn khi có bản mới, và cập nhật chỉ với một cú bấm.", "Your pet tells you when a new version is out, and updates in one click.")}>
      <Group>
        <div className="row">
          <div className="row-text">
            <p className="row-label">{L("Phiên bản đang dùng", "Installed version")}</p>
          </div>
          <div className="row-control">
            <span className="update-version">{status?.current || "—"}</span>
          </div>
        </div>

        <div className="row stack" aria-busy={status === null && !unreadable}>
          {line ? (
            <p className={`update-status ${line.tone}`} role="status">
              <Icon name={TONE_ICON[line.tone]} size={16} />
              <span>
                <b>{line.text}</b>
                {line.detail && <span className="update-detail"> · {line.detail}</span>}
              </span>
            </p>
          ) : unreadable ? (
            <Notice kind="error">{L("Chưa đọc được trạng thái cập nhật.", "Couldn't read the update status.")}</Notice>
          ) : null}
          {line?.problem && (
            <div className="update-problem">
              <Notice kind="error">{line.problem}</Notice>
            </div>
          )}
          {u && !u.canInstall && (
            <div className="update-why">
              <Notice kind="info">{manualReasonText(u.manualReason)}</Notice>
            </div>
          )}
          <div className="update-actions">
            <button className="btn" type="button" onClick={checkNow} aria-disabled={checking || installing} aria-busy={checking}>
              <Icon name="refresh" size={15} />
              {L("Kiểm tra ngay", "Check now")}
            </button>
            {u && u.canInstall && (
              <button className="btn primary" type="button" onClick={install} aria-disabled={checking || installing} aria-busy={installing}>
                {L("Cập nhật & khởi động lại", "Update & restart")}
              </button>
            )}
            {u && (!u.canInstall || asked === "unheard") && (
              <button className={u.canInstall ? "btn" : "btn primary"} type="button" onClick={openPage}>
                <Icon name="external" size={15} />
                {L("Mở trang tải về", "Open download page")}
              </button>
            )}
          </div>
          {(installing || asked === "unheard" || pageFailed) && (
            <div className="update-after">
              {installing && <Notice kind="info">{L("Đang cập nhật… mình sẽ khởi động lại trong giây lát.", "Updating… I'll restart in a moment.")}</Notice>}
              {asked === "unheard" && <Notice kind="info">{L("Mình chưa bắt đầu cập nhật được. Bạn thử lại, hoặc mở trang tải về nhé.", "I couldn't start the update just now. Try again, or open the download page.")}</Notice>}
              {pageFailed && <Notice kind="error">{L("Mình chưa mở được trang tải về. Bạn thử lại sau một lát nhé.", "I couldn't open the download page just now. Please try again in a little while.")}</Notice>}
            </div>
          )}
        </div>
      </Group>

      {u && notes && (
        <Group title={L(`Có gì mới trong ${u.version}`, `What's new in ${u.version}`)}>
          <div className="row stack">
            {published && <p className="row-help">{L(`Phát hành ${published}`, `Released ${published}`)}</p>}
            {/* Plain text from the release, shown as text a line at a time (so a bullet can hang): never markup. */}
            <div className="update-notes" role="region" tabIndex={0} aria-label={L(`Ghi chú phát hành ${u.version}`, `Release notes for ${u.version}`)}>
              <NoteLines text={notes} />
            </div>
          </div>
        </Group>
      )}

      <Group title={L("Tự kiểm tra", "Automatic checks")}>
        <SwitchRow
          k="autoUpdateCheck"
          label={L("Tự kiểm tra bản mới", "Check for updates automatically")}
          help={L("Hỏi GitHub khoảng 6 giờ một lần; không gửi gì về bạn.", "Asks GitHub about every 6 hours; sends nothing about you.")}
        />
      </Group>
    </Page>
  );
}

/** The tidied notes, a block to a line: a bullet gets a hanging indent, a blank line a small gap. */
function NoteLines({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) =>
        line === "" ? <div key={i} className="note-gap" aria-hidden /> : <p key={i} className={line.startsWith("• ") ? "note-line bullet" : "note-line"}>{line}</p>,
      )}
    </>
  );
}
