import { useContext } from "react";
import { I18nContext } from "./I18nProvider";

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslation must be used within I18nProvider");
  return ctx;
}
