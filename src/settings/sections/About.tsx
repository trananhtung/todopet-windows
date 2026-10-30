import { version } from "../../../package.json";
import { L } from "../../core/l10n";
import { Icon } from "../../ui/icons";
import { PetStill } from "../../ui/PetArt";
import { useSettings } from "../context";
import { ExternalLink, Group, Page } from "../controls";

export const REPO_URL = "https://github.com/trananhtung/todopet-windows";
export const ORIGINAL_URL = "https://github.com/trananhtung/todopet";

export function AboutSection() {
  const { prefs } = useSettings();
  const privacy = [
    L("Không có analytics, không có máy chủ riêng.", "No analytics and no servers of its own."),
    L(
      "Chỉ kết nối tới api.todoist.com, các link lịch của bạn, api.anthropic.com khi bạn bấm Hỏi Claude, và GitHub để xem có bản mới (không gửi gì về bạn; tắt được trong mục Cập nhật).",
      "It only talks to api.todoist.com, your calendar links, api.anthropic.com when you press Ask Claude, and GitHub to look for a new version (nothing about you is sent; you can turn that off under Updates).",
    ),
    L("Tiêu đề cửa sổ và địa chỉ thẻ trình duyệt chỉ nằm trong bộ nhớ.", "Window titles and tab addresses stay in memory."),
    L("Bộ theo dõi bàn phím chỉ ghi thời điểm phím cuối cùng được bấm, không bao giờ ghi phím nào.", "The keyboard hook records only when you last pressed a key, never which key."),
    L("Token Todoist và khoá Anthropic nằm trong Windows Credential Manager.", "Your Todoist token and Anthropic key live in Windows Credential Manager."),
    L("Mọi thứ khác được lưu trên máy, trong %APPDATA%.", "Everything else stays on this PC, in %APPDATA%."),
  ];
  return (
    <Page id="about" title={L("Giới thiệu", "About")}>
      <div className="about-hero card">
        <PetStill species={prefs.species} size={84} idPrefix="about" pose={{ mood: "happy", t: 0.6 }} className="about-pet" />
        <div>
          <p className="about-name">TodoPet for Windows</p>
          <p className="about-version">
            {L("Phiên bản", "Version")} {version}
          </p>
          <p className="about-tag">
            {L(
              "Thú cưng trên thanh tác vụ đọc việc Todoist của bạn và vui lên khi bạn làm việc.",
              "A desktop pet that reads your Todoist tasks and gets happy when you work.",
            )}
          </p>
        </div>
      </div>

      <Group title={L("Quyền riêng tư", "Privacy")}>
        <ul className="privacy-list">
          {privacy.map((line) => (
            <li key={line}>
              <Icon name="shield" size={16} />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Group>

      <Group title={L("Liên kết", "Links")}>
        <div className="row">
          <div className="row-text">
            <p className="row-label">{L("Mã nguồn", "Source code")}</p>
            <p className="row-help">{L("Mã nguồn mở, giấy phép MIT.", "Open source, MIT license.")}</p>
          </div>
          <div className="row-control">
            <ExternalLink href={REPO_URL}>GitHub</ExternalLink>
          </div>
        </div>
        <div className="row">
          <div className="row-text">
            <p className="row-label">{L("Bản gốc cho macOS", "The original macOS app")}</p>
            <p className="row-help">{L("TodoPet viết bằng Swift.", "TodoPet, written in Swift.")}</p>
          </div>
          <div className="row-control">
            <ExternalLink href={ORIGINAL_URL}>trananhtung/todopet</ExternalLink>
          </div>
        </div>
      </Group>
    </Page>
  );
}
