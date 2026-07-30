import { useEffect } from "react";
import { useI18nStore } from "./store";

/**
 * 轻量 Provider：仅负责在 locale 变化时同步 <html lang> 属性。
 * 翻译状态由 Zustand store 管理，无需 Context。
 */
export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const locale = useI18nStore((s) => s.locale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <>{children}</>;
};
