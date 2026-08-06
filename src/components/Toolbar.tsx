//! 顶部工具栏

import React from "react";
import { Settings } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "../i18n/useTranslation";
import { useScanStore } from "../stores/scan.store";
import { formatDate, formatSize } from "../types";

const Toolbar: React.FC = () => {
  const { t, locale, setLocale } = useTranslation();
  const location = useLocation();

  const scanning = useScanStore((s) => s.scanning);
  const overview = useScanStore((s) => s.overview);
  const scanPath = useScanStore((s) => s.scanPath);
  const scanError = useScanStore((s) => s.scanError);
  const fromCache = useScanStore((s) => s.fromCache);
  const incomplete = useScanStore((s) => s.incomplete);
  const cacheAt = useScanStore((s) => s.cacheMeta?.cached_at);
  const setScanPath = useScanStore((s) => s.setScanPath);
  const startScan = useScanStore((s) => s.startScan);
  const resumeScan = useScanStore((s) => s.resumeScan);
  const clearAllCache = useScanStore((s) => s.clearAllCache);
  const goHome = useScanStore((s) => s.goHome);
  const setSettingsOpen = useScanStore((s) => s.setSettingsOpen);

  const onStartScan = () => void startScan();
  const onResumeScan = () => void resumeScan();
  const onClearCache = () => void clearAllCache();
  const onGoHome = () => void goHome();

  const isResults = location.pathname === "/results";
  const scanBtnLabel = scanning
    ? t("app.scanningBtn")
    : location.pathname === "/"
      ? t("app.scan")
      : t("app.rescan");

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-moss-200/70 bg-white/60 px-4 backdrop-blur-md">
      {/* App 标题：点击回首页 */}
      <button
        type="button"
        onClick={onGoHome}
        title={t("menu.home")}
        className="font-display text-lg font-semibold tracking-tight text-moss-700 transition hover:text-moss-500"
      >
        {t("app.title")}
      </button>

      {overview && (
        <span className="hidden font-mono text-xs text-ink-muted sm:inline">
          {t("app.usedOf", {
            used: formatSize(overview.used_space),
            total: formatSize(overview.total_space),
          })}
        </span>
      )}

      {scanning && (
        <span className="animate-soft-pulse rounded-md bg-moss-500 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white">
          {t("app.scanning")}
        </span>
      )}

      {isResults && fromCache && (
        <span
          className="rounded-md bg-sand-200 px-2 py-0.5 text-[10px] font-medium text-ink-soft"
          title={
            cacheAt ? t("app.cachedAt", { date: formatDate(cacheAt, locale) }) : t("app.cached")
          }
        >
          {incomplete ? t("app.incompleteCheckpoint") : t("app.cached")}
          {cacheAt ? ` · ${formatDate(cacheAt, locale)}` : ""}
        </span>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {/* 设置 */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title={t("menu.settings")}
          aria-label={t("menu.settings")}
          className="rounded-lg border border-moss-200 bg-white p-1.5 text-ink-soft transition hover:bg-moss-50"
        >
          <Settings size={14} aria-hidden="true" />
        </button>
        {/* 语言切换 */}
        <button
          type="button"
          onClick={() => setLocale(locale === "zh-CN" ? "en" : "zh-CN")}
          className="rounded-lg border border-moss-200 bg-white px-2 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-moss-50"
          title={locale === "zh-CN" ? "Switch to English" : "切换到中文"}
        >
          {locale === "zh-CN" ? "EN" : "中文"}
        </button>

        <div className="relative">
          <input
            className={`w-44 rounded-lg border bg-sand-50 px-3 py-1.5 font-mono text-xs text-ink outline-none transition placeholder:text-ink-muted sm:w-64 md:w-80 ${
              scanError
                ? "border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-200"
                : "border-moss-200 focus:border-moss-400 focus:ring-2 focus:ring-moss-200"
            }`}
            type="text"
            value={scanPath}
            onChange={(e) => setScanPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !scanning) onStartScan();
            }}
            placeholder={t("app.scanPathPlaceholder")}
            aria-invalid={!!scanError}
            title={scanError ?? undefined}
          />
          {scanError && (
            <p
              className="absolute right-0 top-full z-20 mt-1 max-w-[min(20rem,70vw)] truncate rounded-md border border-rose-200 bg-white px-2 py-1 text-[11px] text-rose-600 shadow-sm"
              title={scanError}
              role="alert"
            >
              {scanError}
            </p>
          )}
        </div>
        {incomplete && !scanning && (
          <button
            type="button"
            className="rounded-lg border border-moss-300 bg-white px-2.5 py-1.5 text-xs font-medium text-moss-800 transition hover:bg-moss-50"
            onClick={onResumeScan}
          >
            {t("app.continueScan")}
          </button>
        )}
        {(fromCache || incomplete) && isResults && (
          <button
            type="button"
            className="rounded-lg border border-moss-200 bg-white px-2.5 py-1.5 text-xs text-ink-soft transition hover:border-moss-300 hover:bg-moss-50"
            onClick={onClearCache}
          >
            {t("app.clearCache")}
          </button>
        )}
        <button
          type="button"
          className="rounded-lg bg-moss-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-moss-500 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onStartScan}
          disabled={scanning}
        >
          {scanBtnLabel}
        </button>
      </div>
    </header>
  );
};

export default Toolbar;
