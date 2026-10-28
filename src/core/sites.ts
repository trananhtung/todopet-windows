// Distracting apps and websites (the BrowserWatcher rules and Prefs lists of the macOS app).
import type { ForegroundApp } from "../backend/types";

/** "youtube.com, https://www.Reddit.com" → ["youtube.com", "reddit.com"]. */
export function siteRules(list: string): string[] {
  return list
    .split(",")
    .map((rule) => {
      let r = rule.trim().toLowerCase();
      for (const prefix of ["https://", "http://", "www."]) if (r.startsWith(prefix)) r = r.slice(prefix.length);
      return r;
    })
    .filter((r) => r.length > 0);
}

/** "TikTok, Netflix" → ["tiktok", "netflix"]. */
export function appRules(list: string): string[] {
  return list
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.length > 0);
}

/** "https://m.youtube.com/watch?v=1" → "m.youtube.com" (null when it isn't a web address). */
export function hostOf(url: string): string | null {
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * Plain rules match a domain and its subdomains ("youtube.com" matches "m.youtube.com");
 * rules with a slash match part of the address ("youtube.com/shorts"). Returns the matching rule.
 */
export function matchSite(host: string, url: string, rules: string[]): string | null {
  const lowerUrl = url.toLowerCase();
  for (const rule of rules) {
    if (rule.includes("/")) {
      if (lowerUrl.includes(rule)) return rule;
    } else if (host === rule || host.endsWith(`.${rule}`)) {
      return rule;
    }
  }
  return null;
}

/** Browsers whose window title ends with " - <Browser>": used when the address bar can't be read. */
const BROWSER_EXES = ["chrome.exe", "msedge.exe", "brave.exe", "vivaldi.exe", "opera.exe", "firefox.exe", "arc.exe"];

export const isBrowser = (app: ForegroundApp | null) => app !== null && BROWSER_EXES.includes(app.exe.toLowerCase());

/**
 * The distraction in front right now, as a label ("youtube.com", "Discord"), or null.
 * Browser: the tab address against site rules, else the page title against the plain domain names
 * ("YouTube - Google Chrome" contains "youtube"). Other apps: name or exe against the app list.
 */
export function currentDistraction(
  app: ForegroundApp | null,
  url: string | null,
  sites: string[],
  apps: string[],
  watchBrowsers: boolean,
): string | null {
  if (!app) return null;
  if (isBrowser(app)) {
    if (!watchBrowsers) return null;
    if (url) {
      const host = hostOf(url);
      return host ? matchSite(host, url, sites) : null;
    }
    const title = app.title.toLowerCase();
    for (const rule of sites) {
      if (rule.includes("/")) continue;
      const name = rule.split(".")[0];
      if (name.length >= 3 && title.includes(name)) return rule;
    }
    return null;
  }
  const name = app.name.toLowerCase();
  const exe = app.exe.toLowerCase();
  return apps.some((a) => name.includes(a) || exe.includes(a)) ? app.name : null;
}
