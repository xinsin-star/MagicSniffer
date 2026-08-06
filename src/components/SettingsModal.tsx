import React, { useEffect, useRef } from "react";
import { useTranslation } from "../i18n/useTranslation";
import type { SmartctlStatus } from "../types";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  smartctl: SmartctlStatus | null;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose, smartctl }) => {
  const { t } = useTranslation();
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
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Disk Health (smartctl) */}
        <div className="mb-4 rounded-xl border border-moss-200/80 bg-moss-50/70 p-4">
          <div className="mb-1 text-sm font-medium text-ink">{t("settings.diskHealth")}</div>
          {smartctl === null ? (
            <p className="text-xs text-ink-muted">{t("settings.checking")}</p>
          ) : smartctl.available ? (
            <div>
              <p className="text-xs text-ink-soft">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 mr-1" />
                smartmontools {smartctl.version} {t("settings.smartctlInstalled")}
              </p>
              <p className="mt-1 text-[11px] text-ink-muted">{t("settings.smartctlDataDesc")}</p>
            </div>
          ) : (
            <div>
              <p className="text-xs text-ink-soft">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 mr-1" />
                {t("settings.smartctlNotInstalled")}
              </p>
              <p className="mt-1 text-[11px] text-ink-muted">{t("settings.smartctlInstallHint")}</p>
              <code className="mt-1.5 block select-all rounded-md bg-moss-100 px-2 py-1 font-mono text-[11px] text-moss-800">
                brew install smartmontools
              </code>
            </div>
          )}
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
