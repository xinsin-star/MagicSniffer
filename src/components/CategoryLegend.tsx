//! 分类图例组件
//!
//! 显示各文件分类的颜色、名称和大小汇总，
//! 支持点击分类进行过滤显示

import React from "react";
import type { CategorySummary, FileCategory } from "../types";
import { CATEGORY_INFO, formatSize } from "../types";

interface CategoryLegendProps {
  /** 分类汇总数据 */
  summaries: CategorySummary[];
  /** 选中的分类过滤 */
  selectedCategory: FileCategory | null;
  /** 分类选择回调 */
  onCategorySelect: (category: FileCategory | null) => void;
}

/** 分类图例面板 */
const CategoryLegend: React.FC<CategoryLegendProps> = ({
  summaries,
  selectedCategory,
  onCategorySelect,
}) => {
  // 过滤掉大小为 0 的分类
  const filtered = summaries
    .filter((s) => s.total_size > 0)
    .sort((a, b) => b.total_size - a.total_size);

  const totalSize = filtered.reduce((sum, s) => sum + s.total_size, 0);

  return (
    <div className="legend-panel">
      <div className="legend-title">
        分类图例
        <span
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginLeft: 8,
            fontWeight: 400,
            textTransform: "none",
          }}
        >
          共 {formatSize(totalSize)}
        </span>
      </div>

      <div className="legend-list">
        {filtered.map((summary) => {
          const info = CATEGORY_INFO[summary.category];
          const isSelected = selectedCategory === summary.category;
          const pct = totalSize > 0
            ? ((summary.total_size / totalSize) * 100).toFixed(1)
            : "0.0";

          return (
            <div
              key={summary.category}
              className="legend-item"
              style={{
                background: isSelected
                  ? "var(--bg-hover)"
                  : "transparent",
                outline: isSelected
                  ? "1px solid var(--text-accent)"
                  : "none",
              }}
              onClick={() =>
                onCategorySelect(
                  isSelected ? null : summary.category
                )
              }
            >
              <div
                className="legend-color-box"
                style={{ backgroundColor: info?.color }}
              />
              <div className="legend-label">
                {info?.label ?? summary.category}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", minWidth: 30, textAlign: "right" }}>
                {pct}%
              </div>
              <div className="legend-size">
                {formatSize(summary.total_size)}
              </div>
            </div>
          );
        })}
      </div>

      {/* 清除过滤按钮 */}
      {selectedCategory && (
        <button
          style={{
            marginTop: 8,
            padding: "4px 12px",
            background: "var(--bg-hover)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: 4,
            fontSize: 11,
            cursor: "pointer",
            width: "100%",
          }}
          onClick={() => onCategorySelect(null)}
        >
          显示全部分类
        </button>
      )}
    </div>
  );
};

export default CategoryLegend;
