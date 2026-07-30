//! MagicSniffer - 应用根组件
//!
//! 组合所有子组件，管理全局状态：
//! - 系统概览加载
//! - 扫描流程控制（边扫边预览）
//! - 搜索交互
//! - Treemap 导航
//! - 分类过滤

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Dashboard from "./components/Dashboard";
import Treemap from "./components/Treemap";
import SearchPanel from "./components/SearchPanel";
import CategoryLegend from "./components/CategoryLegend";
import FileDetailPanel from "./components/FileDetailPanel";
import {
  getSystemOverview,
  startScan,
  onScanProgress,
  onScanPreview,
} from "./hooks/useTauriCommand";
import type {
  FileNode,
  ScanProgress,
  ScanPreview,
  ScanResult,
  SystemOverview,
  FileCategory,
  SearchResultItem,
} from "./types";
import { formatSize } from "./types";

/** 应用状态枚举 */
type AppState = "dashboard" | "scanning" | "results";

/** MagicSniffer 应用根组件 */
const App: React.FC = () => {
  // ─── 全局状态 ────────────────────────────────────────────────────
  const [appState, setAppState] = useState<AppState>("dashboard");
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [livePreview, setLivePreview] = useState<ScanPreview | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<FileCategory | null>(null);
  const [scanPath, setScanPath] = useState("/");

  // ─── 初始化：加载系统概览 ────────────────────────────────────────
  useEffect(() => {
    const loadOverview = async () => {
      try {
        const data = await getSystemOverview();
        setOverview(data);
      } catch (e) {
        console.warn("加载系统概览失败（非 Tauri 环境？）:", e);
        setOverview({
          total_space: 500_000_000_000,
          used_space: 300_000_000_000,
          free_space: 200_000_000_000,
          category_summary: [],
          top_consumers: [],
        });
      }
    };
    loadOverview();
  }, []);

  // ─── 扫描进度 + 增量预览监听（全程挂载，避免与 startScan 竞态） ─
  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenPreview: (() => void) | undefined;
    let cancelled = false;

    const setup = async () => {
      try {
        const [p, v] = await Promise.all([
          onScanProgress(setScanProgress),
          onScanPreview((preview) => {
            setLivePreview(preview);
            // 有预览数据后保持在可视化区（边扫边看）
            setAppState((prev) => (prev === "dashboard" ? "scanning" : prev));
          }),
        ]);
        if (cancelled) {
          p();
          v();
          return;
        }
        unlistenProgress = p;
        unlistenPreview = v;
      } catch {
        // 非 Tauri 环境静默失败
      }
    };

    setup();

    return () => {
      cancelled = true;
      unlistenProgress?.();
      unlistenPreview?.();
    };
  }, []);

  // ─── 开始完整扫描 ─────────────────────────────────────────────────
  const handleStartScan = useCallback(async () => {
    setAppState("scanning");
    setScanProgress(null);
    setLivePreview(null);
    setScanResult(null);
    setSelectedNode(null);
    setSelectedCategory(null);

    try {
      const result = await startScan({
        path: scanPath || "/",
        exclude_patterns: [
          "/private/var/run",
          "/proc",
          "/dev",
        ],
        min_file_size: 0,
      });
      setScanResult(result);
      setLivePreview(null);
      setOverview((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          category_summary: result.category_summary,
          top_consumers: result.root_node.children
            ? [...result.root_node.children]
                .sort((a, b) => b.size - a.size)
                .slice(0, 10)
            : [],
        };
      });
      setAppState("results");
    } catch (e) {
      console.error("扫描失败:", e);
      setAppState("dashboard");
      setLivePreview(null);
    }
  }, [scanPath]);

  // ─── 快速扫描已知目录 ─────────────────────────────────────────────
  const handleQuickScan = useCallback(async () => {
    setAppState("scanning");
    setScanProgress(null);
    setLivePreview(null);
    setScanResult(null);
    setSelectedCategory(null);

    const homePath = "/Users";

    try {
      const result = await startScan({
        path: homePath,
        exclude_patterns: [],
        min_file_size: 1048576,
        max_depth: 3,
      });
      setScanResult(result);
      setLivePreview(null);
      setAppState("results");
    } catch (e) {
      console.error("快速扫描失败:", e);
      setAppState("dashboard");
      setLivePreview(null);
    }
  }, []);

  const handleNodeSelect = useCallback((node: FileNode) => {
    setSelectedNode(node);
  }, []);

  const handleSearchResultSelect = useCallback((item: SearchResultItem) => {
    setSelectedNode({
      name: item.name,
      path: item.path,
      size: item.size,
      is_dir: item.is_dir,
      category: item.category,
      risk_level: item.risk_level,
      modified_at: item.modified_at,
    });
  }, []);

  /** 当前用于 Treemap 的树：扫描中用预览，完成后用最终结果 */
  const activeRoot = useMemo((): FileNode | null => {
    if (appState === "scanning" && livePreview?.root_node) {
      return livePreview.root_node;
    }
    return scanResult?.root_node ?? livePreview?.root_node ?? null;
  }, [appState, livePreview, scanResult]);

  const activeSummary = useMemo(() => {
    if (appState === "scanning" && livePreview?.category_summary) {
      return livePreview.category_summary;
    }
    return scanResult?.category_summary ?? livePreview?.category_summary ?? [];
  }, [appState, livePreview, scanResult]);

  const filteredTreemapData = useMemo(() => {
    if (!activeRoot) return null;
    if (!selectedCategory) return activeRoot;

    const matchesCategory = (n: FileNode, cat: FileCategory): boolean => {
      if (n.category === cat) return true;
      if (n.children) return n.children.some((c) => matchesCategory(c, cat));
      return false;
    };

    const filterByCategory = (node: FileNode): FileNode | null => {
      if (
        node.category === selectedCategory ||
        (node.is_dir && node.children?.some((c) => matchesCategory(c, selectedCategory)))
      ) {
        return {
          ...node,
          children: node.children
            ?.map(filterByCategory)
            .filter((n): n is FileNode => n !== null),
        };
      }
      return null;
    };

    return filterByCategory(activeRoot);
  }, [activeRoot, selectedCategory]);

  const rootPathForSearch = scanResult?.root_path ?? scanPath ?? "/";
  const isLiveScanning = appState === "scanning";
  const previewCoverage =
    livePreview && livePreview.total_top_dirs > 0
      ? Math.min(
          100,
          Math.round(
            (livePreview.completed_top_dirs / livePreview.total_top_dirs) * 100
          )
        )
      : 0;

  return (
    <div className="app-container">
      <Toolbar
        appState={appState}
        scanPath={scanPath}
        setScanPath={setScanPath}
        overview={overview}
        onStartScan={handleStartScan}
        onGoDashboard={() => {
          setAppState("dashboard");
          setLivePreview(null);
        }}
      />

      <div className="main-content">
        {appState === "dashboard" ? (
          <Dashboard
            overview={overview}
            onStartScan={handleStartScan}
            onQuickScan={handleQuickScan}
          />
        ) : (
          <>
            <div className={`viz-panel ${isLiveScanning ? "is-scanning" : ""}`}>
              <Treemap
                data={filteredTreemapData}
                onNodeSelect={handleNodeSelect}
                selectedPath={selectedNode?.path}
                isLive={isLiveScanning}
              />
              {isLiveScanning && !filteredTreemapData && (
                <div className="scan-waiting-overlay">
                  <div className="scan-pulse" />
                  <div>正在扫描，矩形块将陆续出现…</div>
                </div>
              )}
            </div>

            <div className="side-panel">
              <SearchPanel
                rootPath={rootPathForSearch}
                onResultSelect={handleSearchResultSelect}
              />

              {activeSummary.length > 0 && (
                <CategoryLegend
                  summaries={activeSummary}
                  selectedCategory={selectedCategory}
                  onCategorySelect={setSelectedCategory}
                />
              )}

              <FileDetailPanel node={selectedNode} />
            </div>
          </>
        )}
      </div>

      {isLiveScanning && (
        <div className="progress-bar-container">
          <div className="progress-bar-track">
            <div
              className="progress-bar-fill live"
              style={{
                width: `${previewCoverage > 0 ? previewCoverage : 15}%`,
              }}
            />
          </div>
          <div className="progress-info">
            <span>
              {scanProgress?.phase ?? "正在扫描…"}
              {scanProgress?.current_path
                ? `: ${scanProgress.current_path}`
                : ""}
            </span>
            <span>
              {livePreview
                ? `顶级 ${livePreview.completed_top_dirs}/${livePreview.total_top_dirs} · `
                : ""}
              发现 {scanProgress?.files_found ?? livePreview?.files_found ?? 0}{" "}
              个文件 · 扫描{" "}
              {scanProgress?.dirs_scanned ?? livePreview?.dirs_scanned ?? 0}{" "}
              个目录
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── 工具栏组件 ─────────────────────────────────────────────────────────

interface ToolbarProps {
  appState: AppState;
  scanPath: string;
  setScanPath: (p: string) => void;
  overview: SystemOverview | null;
  onStartScan: () => void;
  onGoDashboard: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  appState,
  scanPath,
  setScanPath,
  overview,
  onStartScan,
  onGoDashboard,
}) => (
  <div className="toolbar">
    <span className="toolbar-title" onClick={onGoDashboard} style={{ cursor: "pointer" }}>
      MagicSniffer
    </span>

    {overview && (
      <>
        <span style={{ color: "var(--border-light)", marginLeft: 8 }}>|</span>
        <span
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          已用 {formatSize(overview.used_space)} /
          总计 {formatSize(overview.total_space)}
        </span>
      </>
    )}

    {appState === "scanning" && (
      <span className="live-badge">LIVE</span>
    )}

    <div style={{ flex: 1 }} />

    {appState !== "dashboard" && (
      <>
        <input
          className="toolbar-path-input"
          type="text"
          value={scanPath}
          onChange={(e) => setScanPath(e.target.value)}
          placeholder="输入扫描路径..."
        />
        <button
          className="btn-primary"
          style={{ padding: "6px 16px", fontSize: 12 }}
          onClick={onStartScan}
          disabled={appState === "scanning"}
        >
          {appState === "scanning" ? "扫描中…" : "重新扫描"}
        </button>
      </>
    )}

    {appState === "dashboard" && (
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="toolbar-path-input"
          type="text"
          value={scanPath}
          onChange={(e) => setScanPath(e.target.value)}
          placeholder="输入扫描路径，默认 /"
        />
        <button
          className="btn-primary"
          style={{ padding: "6px 16px", fontSize: 12 }}
          onClick={onStartScan}
        >
          扫描
        </button>
      </div>
    )}
  </div>
);

export default App;
