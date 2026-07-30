import React, { useEffect, useRef } from "react";
import { useTranslation } from "../i18n/useTranslation";
import type { Locale } from "../i18n/types";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const { t, locale, setLocale } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const languages: { value: Locale; label: string }[] = [
    { value: "zh-CN", label: t("settings.zhCN") },
    { value: "en", label: t("settings.en") },
  ];

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-2xl border border-moss-200/80 bg-white/95 p-6 shadow-xl backdrop-blur-md">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-moss-800">
            {t("settings.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-ink-muted transition hover:bg-moss-50 hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Language */}
        <div className="mb-4">
          <div className="mb-2 text-sm font-medium text-ink">{t("settings.language")}</div>
          <p className="mb-2 text-xs text-ink-soft">{t("settings.languageDesc")}</p>
          <div className="flex gap-2">
            {languages.map((lang) => (
              <button
                key={lang.value}
                type="button"
                onClick={() => setLocale(lang.value)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                  locale === lang.value
                    ? "border-moss-400 bg-moss-100 text-moss-800"
                    : "border-moss-200 bg-white text-ink-soft hover:bg-moss-50"
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-moss-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-moss-500"
          >
            {t("settings.close")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
