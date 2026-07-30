import { create } from "zustand";
import type { Locale } from "./types";
import zhCN from "../locales/zh-CN.json";
import en from "../locales/en.json";

const messages: Record<Locale, Record<string, unknown>> = {
  "zh-CN": zhCN,
  en,
};

function detectLocale(): Locale {
  const nav = navigator.language.toLowerCase();
  if (nav.startsWith("zh")) return "zh-CN";
  return "en";
}

interface I18nStore {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** 获取翻译文本，支持 {key} 参数插值 */
  t: (key: string, params?: Record<string, string | number>) => string;
}

export const useI18nStore = create<I18nStore>((set, get) => ({
  locale: detectLocale(),

  setLocale: (locale: Locale) => {
    set({ locale });
    document.documentElement.lang = locale;
  },

  t: (key: string, params?: Record<string, string | number>): string => {
    const { locale } = get();
    const parts = key.split(".");
    let value: unknown = messages[locale];
    for (const part of parts) {
      if (value == null || typeof value !== "object") return key;
      value = (value as Record<string, unknown>)[part];
    }
    if (typeof value !== "string") return key;
    if (params) {
      return value.replace(/\{(\w+)\}/g, (_, name: string) =>
        String(params[name] ?? `{${name}}`)
      );
    }
    return value;
  },
}));
