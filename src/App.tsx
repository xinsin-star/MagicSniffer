//! MagicSniffer - 应用根组件

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

type AppState = "dashboard" | "scanning" | "results";

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>("dashboard");
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [livePreview, setLivePreview] = useState<ScanPreview | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<FileCategory | null>(null);
  const [scanPath, setScanPath] = useState("/");

  useEffect(() => {
    const loadOverview = async () => {
      try {
        setOverview(await getSystemOverview());
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
        // 非 Tauri 环境
      }
    };

    setup();
    return () => {
      cancelled = true;
      unlistenProgress?.();
      unlistenPreview?.();
    };
  }, []);

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
        exclude_patterns: ["/private/var/run", "/proc", "/dev"],
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
            ? [...result.root_node.children].sort((a, b) => b.size - a.size).slice(0, 10)
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

  const handleQuickScan = useCallback(async () => {
    setAppState("scanning");
    setScanProgress(null);
    setLivePreview(null);
    setScanResult(null);
    setSelectedCategory(null);

    try {
      const result = await startScan({
        path: "/Users",
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
          Math.round((livePreview.completed_top_dirs / livePreview.total_top_dirs) * 100)
        )
      : 0;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
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

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {appState === "dashboard" ? (
          <Dashboard
            overview={overview}
            onStartScan={handleStartScan}
            onQuickScan={handleQuickScan}
          />
        ) : (
          <>
            <div
              className={`relative flex min-w-0 flex-1 flex-col overflow-hidden ${
                isLiveScanning ? "ring-2 ring-inset ring-moss-300/60" : ""
              }`}
            >
              <Treemap
                data={filteredTreemapData}
                onNodeSelect={handleNodeSelect}
                selectedPath={selectedNode?.path}
                isLive={isLiveScanning}
              />
              {isLiveScanning && !filteredTreemapData && (
                <div className="pointer-events-none absolute inset-0 z-[4] flex flex-col items-center justify-center gap-3 text-sm text-ink-soft">
                  <div className="animate-scan-ring h-12 w-12 rounded-full border-2 border-moss-400" />
                  <div>正在扫描，矩形块将陆续出现…</div>
                </div>
              )}
            </div>

            <aside className="flex w-[340px] min-w-[280px] flex-col overflow-hidden border-l border-moss-200/80 bg-white/55 backdrop-blur-md">
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
            </aside>
          </>
        )}
      </div>

      {isLiveScanning && (
        <div className="shrink-0 border-t border-moss-200/80 bg-white/70 px-4 py-2 backdrop-blur-md">
          <div className="h-1.5 overflow-hidden rounded-full bg-moss-100">
            <div
              className="animate-shimmer h-full rounded-full bg-gradient-to-r from-moss-400 via-moss-300 to-moss-500"
              style={{ width: `${previewCoverage > 0 ? previewCoverage : 15}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between gap-4 text-[11px] text-ink-muted">
            <span className="min-w-0 truncate">
              {scanProgress?.phase ?? "正在扫描…"}
              {scanProgress?.current_path ? `: ${scanProgress.current_path}` : ""}
            </span>
            <span className="shrink-0 font-mono">
              {livePreview
                ? `顶级 ${livePreview.completed_top_dirs}/${livePreview.total_top_dirs} · `
                : ""}
              发现 {scanProgress?.files_found ?? livePreview?.files_found ?? 0} 个文件 · 扫描{" "}
              {scanProgress?.dirs_scanned ?? livePreview?.dirs_scanned ?? 0} 个目录
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

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
  <header className="flex h-14 shrink-0 items-center gap-3 border-b border-moss-200/70 bg-white/60 px-4 backdrop-blur-md">
    <button
      type="button"
      onClick={onGoDashboard}
      className="font-display text-lg font-semibold tracking-tight text-moss-700 transition hover:text-moss-500"
    >
      MagicSniffer
    </button>

    {overview && (
      <span className="hidden font-mono text-xs text-ink-muted sm:inline">
        已用 {formatSize(overview.used_space)} / 总计 {formatSize(overview.total_space)}
      </span>
    )}

    {appState === "scanning" && (
      <span className="animate-soft-pulse rounded-md bg-moss-500 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white">
        LIVE
      </span>
    )}

    <div className="flex-1" />

    <div className="flex items-center gap-2">
      <input
        className="w-44 rounded-lg border border-moss-200 bg-sand-50 px-3 py-1.5 font-mono text-xs text-ink outline-none transition placeholder:text-ink-muted focus:border-moss-400 focus:ring-2 focus:ring-moss-200 sm:w-64 md:w-80"
        type="text"
        value={scanPath}
        onChange={(e) => setScanPath(e.target.value)}
        placeholder="扫描路径，默认 /"
      />
      <button
        type="button"
        className="rounded-lg bg-moss-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-moss-500 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={onStartScan}
        disabled={appState === "scanning"}
      >
        {appState === "scanning" ? "扫描中…" : appState === "dashboard" ? "扫描" : "重新扫描"}
      </button>
    </div>
  </header>
);

export default App;
