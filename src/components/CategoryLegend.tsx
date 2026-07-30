//! 分类图例

import React from "react";
import type { CategorySummary, FileCategory } from "../types";
import { CATEGORY_COLORS, formatSize } from "../types";
import { useTranslation } from "../i18n/useTranslation";

interface CategoryLegendProps {
  summaries: CategorySummary[];
  selectedCategory: FileCategory | null;
  onCategorySelect: (category: FileCategory | null) => void;
}

const CategoryLegend: React.FC<CategoryLegendProps> = ({
  summaries,
  selectedCategory,
  onCategorySelect,
}) => {
  const { t } = useTranslation();
  const filtered = summaries
    .filter((s) => s.total_size > 0)
    .sort((a, b) => b.total_size - a.total_size);

  const totalSize = filtered.reduce((sum, s) => sum + s.total_size, 0);

  return (
    <div className="shrink-0 border-b border-moss-200/70 px-4 py-3">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {t("categoryLegend.title")}
        </span>
        <span className="text-[11px] text-ink-muted">{t("categoryLegend.total", { size: formatSize(totalSize) })}</span>
      </div>

      <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
        {filtered.map((summary) => {
          const isSelected = selectedCategory === summary.category;
          const pct =
            totalSize > 0
              ? ((summary.total_size / totalSize) * 100).toFixed(1)
              : "0.0";

          return (
            <button
              key={summary.category}
              type="button"
              className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs transition ${
                isSelected
                  ? "bg-moss-100 ring-1 ring-moss-400"
                  : "hover:bg-moss-50"
              }`}
              onClick={() =>
                onCategorySelect(isSelected ? null : summary.category)
              }
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: CATEGORY_COLORS[summary.category] }}
              />
              <span className="min-w-0 flex-1 truncate text-ink-soft">
                {t(`categoryLabels.${summary.category}` as Parameters<typeof t>[0])}
              </span>
              <span className="w-8 text-right text-[10px] text-ink-muted">{pct}%</span>
              <span className="font-mono text-[11px] text-ink-muted">
                {formatSize(summary.total_size)}
              </span>
            </button>
          );
        })}
      </div>

      {selectedCategory && (
        <button
          type="button"
          className="mt-2 w-full rounded-lg border border-moss-200 bg-sand-50 py-1.5 text-[11px] text-ink-soft transition hover:bg-moss-50"
          onClick={() => onCategorySelect(null)}
        >
          {t("categoryLegend.showAll")}
        </button>
      )}
    </div>
  );
};

export default CategoryLegend;
