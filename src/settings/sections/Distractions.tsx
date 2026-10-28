import { L } from "../../core/l10n";
import { siteRules } from "../../core/sites";
import { useSettings } from "../context";
import { Group, Page, StackRow, SwitchRow, TextField } from "../controls";
import { listItems } from "../model";

function Chips({ items, label }: { items: string[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <ul className="chip-list" aria-label={label}>
      {items.map((item) => (
        <li key={item} className="chip">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function DistractionsSection() {
  const { prefs } = useSettings();
  return (
    <Page
      id="distractions"
      title={L("Xao nhãng", "Distractions")}
      intro={L("Ở trên một trang hay ứng dụng dưới đây quá 2 phút, thú cưng sẽ nhăn mặt.", "Spend more than 2 minutes on one of these and your pet starts to frown.")}
    >
      <Group title={L("Trình duyệt", "Browsers")}>
        <SwitchRow
          k="watchBrowsers"
          label={L("Để ý trình duyệt", "Watch browsers")}
          help={L(
            "Đọc địa chỉ thẻ đang mở trong Chrome, Edge, Brave, Vivaldi, Opera và Firefox. Địa chỉ chỉ nằm trong bộ nhớ, không được lưu.",
            "Reads the active tab's address in Chrome, Edge, Brave, Vivaldi, Opera and Firefox. Addresses stay in memory and are never saved.",
          )}
        />
      </Group>

      <Group title={L("Danh sách", "Lists")}>
        <StackRow
          label={L("Trang web gây xao nhãng", "Distracting sites")}
          help={L(
            "Cách nhau bằng dấu phẩy. Mỗi mục khớp với một phần địa chỉ: “youtube.com/shorts” chỉ bắt Shorts, còn video YouTube khác thì không.",
            "Separate with commas. Each entry matches part of an address: “youtube.com/shorts” catches Shorts but leaves other YouTube videos alone.",
          )}
          after={<Chips items={siteRules(prefs.distractionSites)} label={L("Các trang sẽ bị để ý", "Sites that will be watched")} />}
        >
          {({ id, describedBy }) => (
            <TextField id={id} k="distractionSites" describedBy={describedBy} multiline rows={3} placeholder="youtube.com/shorts, facebook.com" />
          )}
        </StackRow>
        <StackRow
          label={L("Ứng dụng gây xao nhãng", "Distracting apps")}
          help={L("Tên ứng dụng như trong Task Manager, cách nhau bằng dấu phẩy.", "App names as Task Manager shows them, separated with commas.")}
          after={<Chips items={listItems(prefs.distractionApps)} label={L("Các ứng dụng sẽ bị để ý", "Apps that will be watched")} />}
        >
          {({ id, describedBy }) => <TextField id={id} k="distractionApps" describedBy={describedBy} placeholder="Discord, Steam" />}
        </StackRow>
      </Group>
    </Page>
  );
}
