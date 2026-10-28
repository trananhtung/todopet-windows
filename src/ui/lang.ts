// Window language: the user's choice in Settings, else the Windows display language.
import { langFromLocale } from "../core/l10n";
import type { Lang } from "../core/types";

export function resolveLang(pref: Lang | null | undefined, systemLocale: string | null | undefined): Lang {
  return pref ?? langFromLocale(systemLocale);
}

/** BCP 47 tag for Intl formatting and `<html lang>`. */
export function localeTag(lang: Lang): string {
  return lang === "vi" ? "vi-VN" : "en-US";
}
