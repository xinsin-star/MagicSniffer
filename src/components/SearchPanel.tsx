//! 文件搜索面板

import React, { useState, useCallback } from "react";
import type { SearchResult, SearchResultItem } from "../types";
import { CATEGORY_COLORS, RISK_LEVEL_COLORS, formatSize } from "../types";
import { searchFiles } from "../hooks/useTauriCommand";
import { useTranslation } from "../i18n/useTranslation";

interface SearchPanelProps {
  rootPath: string;
  onResultSelect: (item: SearchResultItem) => void;
}

const SearchPanel: React.FC<SearchPanelProps> = ({ rootPath, onResultSelect }) => {
  const [query, setQuery] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [minSize, setMinSize] = useState("0");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setError(null);
    setResults(null);

    try {
      const result = await searchFiles({
        query: query.trim(),
        root_path: rootPath || "/",
        use_regex: useRegex,
        max_results: 200,
        min_size: parseInt(minSize) || 0,
        max_size: 0,
      });
      setResults(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsSearching(false);
    }
  }, [query, rootPath, useRegex, minSize]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    } else if (e.key === "ArrowDown" && results) {
      setSelectedIndex((prev) => Math.min(prev + 1, results.items.length - 1));
    } else if (e.key === "ArrowUp" && results) {
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    }
  };

  return (
    <>
      <div className="shrink-0 border-b border-moss-200/70 px-4 py-3">
        <div className="mb-2 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg border border-moss-200 bg-sand-50 px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-moss-400 focus:ring-2 focus:ring-moss-200"
            type="text"
            placeholder={t("search.placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            className="shrink-0 rounded-lg bg-moss-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-moss-500 disabled:opacity-50"
            onClick={handleSearch}
            disabled={isSearching || !query.trim()}
          >
            {isSearching ? "…" : t("search.button")}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-soft">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              className="rounded border-moss-300 text-moss-600 focus:ring-moss-300"
              checked={useRegex}
              onChange={(e) => setUseRegex(e.target.checked)}
            />
            {t("search.regex")}
          </label>
          <span>{t("search.minSize")}</span>
          <input
            className="w-16 rounded-md border border-moss-200 bg-sand-50 px-1.5 py-0.5 font-mono text-[11px] outline-none focus:border-moss-400"
            type="number"
            value={minSize}
            onChange={(e) => setMinSize(e.target.value)}
          />
          <span className="text-ink-muted">B</span>
        </div>
      </div>

      <div className="max-h-44 shrink-0 overflow-y-auto border-b border-moss-200/70">
        {error && (
          <div className="px-4 py-2 text-[11px] text-red-600">
            {t("search.error")}: {error}
          </div>
        )}

        {results && (
          <>
            <div className="px-4 py-1.5 text-[11px] text-ink-muted">
              {t("search.results", { total: results.total_count, elapsed: results.elapsed_ms })}
            </div>
            {results.items.map((item, index) => {
              return (
                <button
                  key={item.path}
                  type="button"
                  className={`flex w-full items-center gap-2 border-l-[3px] px-4 py-1.5 text-left transition ${
                    index === selectedIndex
                      ? "border-moss-500 bg-moss-50"
                      : "border-transparent hover:bg-moss-50/80"
                  }`}
                  onClick={() => onResultSelect(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: CATEGORY_COLORS[item.category] }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-ink">
                      {item.is_dir ? "📁 " : "📄 "}
                      {item.name}
                    </div>
                    <div className="truncate text-[10px] text-ink-muted">{item.path}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[11px] text-ink-muted">
                      {formatSize(item.size)}
                    </div>
                    <div
                      className="text-[9px]"
                      style={{ color: RISK_LEVEL_COLORS[item.risk_level] }}
                    >
                      {t(`categoryLabels.${item.category}` as Parameters<typeof t>[0])} ·{" "}
                      {t(`riskLabels.${item.risk_level}` as Parameters<typeof t>[0])}
                    </div>
                  </div>
                </button>
              );
            })}
          </>
        )}
      </div>
    </>
  );
};

export default SearchPanel;
