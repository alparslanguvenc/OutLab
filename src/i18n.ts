import { useSyncExternalStore } from "react";

/**
 * Minimal bilingual layer. Strings are written inline as pairs so each
 * translation stays next to its context: t("Kaydet", "Save").
 * Turkish is the default; the choice is remembered per browser.
 */
export type Lang = "tr" | "en";
const KEY = "outlab-lang";
const listeners = new Set<() => void>();

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "tr" || saved === "en") return saved;
  } catch {
    /* storage unavailable: fall back to Turkish */
  }
  return "tr";
}
let current: Lang = initial();
if (typeof document !== "undefined") document.documentElement.lang = current;

export const getLang = (): Lang => current;

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = lang;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-render the calling component when the language changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/** Pick the string for the current language. */
export function t(tr: string, en: string): string {
  return current === "en" ? en : tr;
}

/** Locale for numbers and dates. */
export const locale = (): string => (current === "en" ? "en-GB" : "tr-TR");
