//! 文件搜索面板组件
//!
//! 集成 Rust 高性能搜索引擎的前端搜索界面。
//! 支持模糊搜索、正则表达式和大小过滤。

import React, { useState, useCallback } from "react";
import type { SearchResult, SearchResultItem } from "../types";
import { CATEGORY_INFO, RISK_LEVEL_INFO, formatSize } from "../types";
import { searchFiles } from "../hooks/useTauriCommand";

interface SearchPanelProps {
  /** 搜索根路径 */
  rootPath: string;
  /** 搜索结果项点击回调 */
  onResultSelect: (item: SearchResultItem) => void;
}

/** 搜索面板组件 */
const SearchPanel: React.FC<SearchPanelProps> = ({
  rootPath,
  onResultSelect,
}) => {
  const [query, setQuery] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [minSize, setMinSize] = useState("0");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  /** 执行搜索 */
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

  /** 键盘事件处理 */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    } else if (e.key === "ArrowDown" && results) {
      setSelectedIndex((prev) =>
        Math.min(prev + 1, results.items.length - 1)
      );
    } else if (e.key === "ArrowUp" && results) {
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    }
  };

  return (
    <>
      {/* 搜索输入栏 */}
      <div className="search-panel" style={{ borderBottom: "none" }}>
        <div className="search-input-row">
          <input
            className="search-input"
            type="text"
            placeholder="搜索文件或目录（支持正则）..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="search-btn"
            onClick={handleSearch}
            disabled={isSearching || !query.trim()}
          >
            {isSearching ? "搜索中..." : "搜索"}
          </button>
        </div>

        {/* 搜索选项 */}
        <div className="search-options">
          <label className="search-checkbox-label">
            <input
              type="checkbox"
              checked={useRegex}
              onChange={(e) => setUseRegex(e.target.checked)}
            />
            正则
          </label>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            最小大小:
          </span>
          <input
            className="search-size-input"
            type="number"
            value={minSize}
            onChange={(e) => setMinSize(e.target.value)}
            placeholder="0 B"
          />
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            B
          </span>
        </div>
      </div>

      {/* 搜索结果列表 */}
      <div className="search-results">
        {error && (
          <div className="search-result-info" style={{ color: "#e74c3c" }}>
            搜索出错: {error}
          </div>
        )}

        {results && (
          <>
            <div className="search-result-info">
              找到 {results.total_count} 个结果 ({results.elapsed_ms}ms)
            </div>

            {results.items.map((item, index) => {
              const categoryInfo = CATEGORY_INFO[item.category];
              const riskInfo = RISK_LEVEL_INFO[item.risk_level];

              return (
                <div
                  key={item.path}
                  className={`search-result-item ${
                    index === selectedIndex ? "selected" : ""
                  }`}
                  onClick={() => onResultSelect(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div
                    className="legend-color-box"
                    style={{
                      backgroundColor: categoryInfo?.color,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="search-result-name">
                      {item.is_dir ? "📁 " : "📄 "}
                      {item.name}
                    </div>
                    <div className="search-result-path">
                      {item.path}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div className="search-result-size">
                      {formatSize(item.size)}
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        color: riskInfo.color,
                      }}
                    >
                      {categoryInfo?.label} · {riskInfo.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </>
  );
};

export default SearchPanel;
