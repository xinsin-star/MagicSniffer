import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "./types";
import { STORAGE_KEY } from "./types";
import zhCN from "../locales/zh-CN.json";
import en from "../locales/en.json";

const messages: Record<Locale, Record<string, unknown>> = {
  "zh-CN": zhCN,
  en,
};

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "zh-CN" || stored === "en") return stored;
  } catch {
    // localStorage unavailable
  }
  const nav = navigator.language.toLowerCase();
  if (nav.startsWith("zh")) return "zh-CN";
  return "en";
}

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  const setLocale = useCallback((next: Locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
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
    [locale]
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const ctx = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={ctx}>{children}</I18nContext.Provider>;
};
