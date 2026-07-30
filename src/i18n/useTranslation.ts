import { useI18nStore } from "../stores/i18n.store";

/**
 * i18n hook — 返回 { t, locale, setLocale }
 *
 * 状态由 Zustand store 管理，无需 Provider 包裹。
 */
export function useTranslation() {
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);
  const t = useI18nStore((s) => s.t);
  return { t, locale, setLocale } as const;
}
