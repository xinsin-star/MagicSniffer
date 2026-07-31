//! MagicSniffer - 应用根组件

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Dashboard from "./components/Dashboard";
import Treemap from "./components/Treemap";
import SearchPanel from "./components/SearchPanel";
import CategoryLegend from "./components/CategoryLegend";
import FileDetailPanel from "./components/FileDetailPanel";
import SettingsModal from "./components/SettingsModal";
import {
  getSystemOverview,
  validateScanPath,
  startScan,
  onScanProgress,
  onScanPreview,
  loadLatestScanCache,
  loadScanCache,
  listScanCaches,
  clearScanCache,
  setScanPriority,
  stopScan,
  updateTrayMenu,
  getDiskMounts,
  getPhysicalDiskHealth,
} from "./hooks/useTauriCommand";
import type {
  FileNode,
  ScanProgress,
  ScanPreview,
  ScanResult,
  SystemOverview,
  FileCategory,
  SearchResultItem,
  ScanCacheMeta,
  CachedScan,
  DiskMountInfo,
  PhysicalDiskHealth,
} from "./types";
import { formatSize, formatDate } from "./types";
import { useTranslation } from "./i18n/useTranslation";

type AppState = "dashboard" | "scanning" | "results";

function findNodeByPath(root: FileNode, path: string): FileNode | null {
  if (root.path === path) return root;
  if (!root.children) return null;
  for (const child of root.children) {
    if (path === child.path) return child;
    if (
      child.path === "/" ||
      path.startsWith(`${child.path}/`) ||
      (child.path.length > 1 && path.startsWith(child.path))
    ) {
      const found = findNodeByPath(child, path);
      if (found) return found;
    }
  }
  return null;
}

/** 从根构建到目标路径的完整导航栈 */
function buildNavStack(root: FileNode, targetPath: string): FileNode[] {
  if (root.path === targetPath) return [root];

  const walk = (node: FileNode, trail: FileNode[]): FileNode[] | null => {
    if (node.path === targetPath) return trail;
    for (const child of node.children ?? []) {
      const found = walk(child, [...trail, child]);
      if (found) return found;
    }
    return null;
  };

  return walk(root, [root]) ?? [root];
}

const App: React.FC = () => {
  const { t, locale, setLocale } = useTranslation();
  const [appState, setAppState] = useState<AppState>("dashboard");
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [livePreview, setLivePreview] = useState<ScanPreview | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<FileCategory | null>(null);
  const [scanPath, setScanPath] = useState("/");
  /** 路径预检失败时的友好提示（不切换页面状态，避免忽闪） */
  const [scanError, setScanError] = useState<string | null>(null);
  /** 导航栈：从扫描根到当前聚焦目录 */
  const [navStack, setNavStack] = useState<FileNode[]>([]);
  /** 当前结果是否来自磁盘缓存 */
  const [fromCache, setFromCache] = useState(false);
  const [cacheMeta, setCacheMeta] = useState<ScanCacheMeta | null>(null);
  const [incomplete, setIncomplete] = useState(false);
  const [cacheList, setCacheList] = useState<ScanCacheMeta[]>([]);
  const [diskMounts, setDiskMounts] = useState<DiskMountInfo[]>([]);
  const [diskHealth, setDiskHealth] = useState<PhysicalDiskHealth[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scanningRef = React.useRef(false);
  const leaveAfterStopRef = React.useRef(false);

  const handleSetScanPath = useCallback((p: string) => {
    setScanPath(p);
    setScanError(null);
  }, []);

  const applyCached = useCallback((cached: CachedScan, opts?: { fromCache?: boolean }) => {
    const result = cached.result;
    setScanResult(result);
    setLivePreview(null);
    setSelectedNode(null);
    setSelectedCategory(null);
    setNavStack([result.root_node]);
    setScanPath(result.root_path);
    setFromCache(!!opts?.fromCache);
    setIncomplete(!!cached.incomplete);
    setCacheMeta({
      root_path: result.root_path,
      cached_at: cached.cached_at,
      total_size: result.root_node.size,
      total_files: result.total_files,
      total_dirs: result.total_dirs,
      elapsed_ms: result.elapsed_ms,
      incomplete: cached.incomplete,
    });
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
  }, []);

  /** 刷新缓存列表（最多 5 条） */
  const refreshCacheList = useCallback(async () => {
    try {
      const list = await listScanCaches();
      setCacheList(list);
    } catch (e) {
      console.warn("加载缓存列表失败:", e);
    }
  }, []);

  /** 打开指定缓存 */
  const handleOpenCacheEntry = useCallback(async (rootPath: string) => {
    try {
      const cached = await loadScanCache(rootPath);
      if (cached?.result) {
        applyCached(cached, { fromCache: true });
      }
    } catch (e) {
      console.error("打开缓存失败:", e);
    }
  }, [applyCached]);

  /** 清除指定缓存并刷新列表 */
  const handleClearCacheEntry = useCallback(async (rootPath: string) => {
    try {
      await clearScanCache(rootPath);
      await refreshCacheList();
      // 若清的是当前正在查看的，回 dashboard
      if (cacheMeta?.root_path === rootPath) {
        setCacheMeta(null);
        setFromCache(false);
        setIncomplete(false);
        setScanResult(null);
        setNavStack([]);
        setAppState("dashboard");
      }
    } catch (e) {
      console.error("清除缓存失败:", e);
    }
  }, [cacheMeta, refreshCacheList]);

  // 动态设置页面标题 + 同步托盘菜单
  useEffect(() => {
    document.title = t("site.title");
    updateTrayMenu(locale).catch(() => {});
  }, [locale, t]);

  useEffect(() => {
    let cancelled = false;
    const loadOverview = async () => {
      try {
        const [ov, mounts, health] = await Promise.all([
          getSystemOverview(locale),
          getDiskMounts(locale).catch((e) => {
            console.error("获取磁盘挂载信息失败:", e);
            return [] as DiskMountInfo[];
          }),
          getPhysicalDiskHealth(locale).catch((e) => {
            console.error("获取物理磁盘健康度失败:", e);
            return [] as PhysicalDiskHealth[];
          }),
        ]);
        if (cancelled) return;
        setOverview(ov);
        setDiskMounts(mounts);
        setDiskHealth(health);
      } catch (e) {
        console.warn("加载系统概览失败（非 Tauri 环境？）:", e);
        if (cancelled) return;
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
    return () => { cancelled = true; };
  }, [locale]);

  // 启动时恢复最近一次扫描缓存 + 加载缓存列表
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const [cached] = await Promise.all([
          loadLatestScanCache(),
          refreshCacheList(),
        ]);
        if (cancelled) return;
        if (cached?.result) {
          applyCached(cached, { fromCache: true });
        }
      } catch (e) {
        console.warn("加载扫描缓存失败:", e);
      }
    };
    restore();
    return () => {
      cancelled = true;
    };
  }, [applyCached, refreshCacheList]);

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
            setFromCache(false);
            setAppState((prev) => (prev === "dashboard" ? "scanning" : prev));
            setNavStack((prev) => {
              if (prev.length === 0) return [preview.root_node];
              const paths = prev.map((n) => n.path);
              const next: FileNode[] = [];
              for (const path of paths) {
                const node: FileNode | null = findNodeByPath(preview.root_node, path);
                if (!node) break;
                next.push(node);
              }
              return next.length > 0 ? next : [preview.root_node];
            });
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
    setScanError(null);
    // 先校验路径，再切 UI，避免无效路径导致页面忽闪
    try {
      await validateScanPath(scanPath || "/", locale);
    } catch (e) {
      const msg = typeof e === "string" ? e : String(e);
      setScanError(msg);
      return;
    }

    setAppState("scanning");
    scanningRef.current = true;
    setScanProgress(null);
    setLivePreview(null);
    setScanResult(null);
    setSelectedNode(null);
    setSelectedCategory(null);
    setNavStack([]);
    setFromCache(false);
    setIncomplete(false);

    try {
      const cached = await startScan(
        {
          path: scanPath || "/",
          exclude_patterns: ["/private/var/run", "/proc", "/dev"],
          min_file_size: 0,
        },
        false
      );
      scanningRef.current = false;
      applyCached(cached);
      refreshCacheList();
      if (leaveAfterStopRef.current) {
        leaveAfterStopRef.current = false;
        setAppState("dashboard");
        setLivePreview(null);
        setNavStack([]);
      }
    } catch (e) {
      console.error("扫描失败:", e);
      scanningRef.current = false;
      setLivePreview(null);
      const msg = typeof e === "string" ? e : String(e);
      setScanError(msg);
      setAppState("dashboard");
    }
  }, [scanPath, applyCached, refreshCacheList, locale]);

  const handleQuickScan = useCallback(async () => {
    setAppState("scanning");
    scanningRef.current = true;
    setScanProgress(null);
    setLivePreview(null);
    setScanResult(null);
    setSelectedCategory(null);
    setNavStack([]);
    setFromCache(false);
    setIncomplete(false);

    try {
      const cached = await startScan(
        {
          path: "~",
          exclude_patterns: [
            "/private/var/run",
            "/proc",
            "/dev",
            "/.Trash",
            "/Library/Caches/CloudKit",
          ],
          min_file_size: 0,
        },
        false
      );
      scanningRef.current = false;
      applyCached(cached);
      refreshCacheList();
      if (leaveAfterStopRef.current) {
        leaveAfterStopRef.current = false;
        setAppState("dashboard");
        setLivePreview(null);
        setNavStack([]);
      }
    } catch (e) {
      console.error("快速扫描失败:", e);
      scanningRef.current = false;
      setAppState("dashboard");
      setLivePreview(null);
    }
  }, [applyCached, refreshCacheList]);

  const handleResumeScan = useCallback(async () => {
    setAppState("scanning");
    scanningRef.current = true;
    setScanProgress(null);
    setLivePreview(null);
    setFromCache(false);

    try {
      const cached = await startScan(
        {
          path: cacheMeta?.root_path || scanPath || "~",
          exclude_patterns: ["/private/var/run", "/proc", "/dev"],
          min_file_size: 0,
        },
        true
      );
      scanningRef.current = false;
      applyCached(cached);
      refreshCacheList();
      if (leaveAfterStopRef.current) {
        leaveAfterStopRef.current = false;
        setAppState("dashboard");
        setLivePreview(null);
        setNavStack([]);
      }
    } catch (e) {
      console.error("续扫失败:", e);
      scanningRef.current = false;
      setAppState("results");
    }
  }, [cacheMeta, scanPath, applyCached, refreshCacheList]);

  /** 回到首页（扫描中则先停止） */
  const handleGoHome = useCallback(async () => {
    if (scanningRef.current) {
      leaveAfterStopRef.current = true;
      try { await stopScan(); } catch { /* ignore */ }
      return;
    }
    setAppState("dashboard");
    setLivePreview(null);
    setNavStack([]);
    void setScanPriority(null);
  }, []);

  const handleClearAllCache = useCallback(async () => {
    try {
      if (scanningRef.current) await stopScan();
      await clearScanCache();
      setCacheMeta(null);
      setCacheList([]);
      setFromCache(false);
      setIncomplete(false);
      setScanResult(null);
      setNavStack([]);
      setAppState("dashboard");
    } catch (e) {
      console.error("清除缓存失败:", e);
    }
  }, []);

  const handleNodeSelect = useCallback((node: FileNode) => {
    setSelectedNode(node);
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

  const filteredTreeRef = React.useRef<FileNode | null>(null);

  /** 按分类过滤后的完整树 */
  const filteredTree = useMemo(() => {
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

  filteredTreeRef.current = filteredTree;

  const syncPriority = useCallback((path: string | null) => {
    if (!scanningRef.current) return;
    void setScanPriority(path);
  }, []);

  const handleDrillInto = useCallback(
    (node: FileNode) => {
      if (!node.is_dir) return;
      const tree = filteredTreeRef.current;
      if (!tree) {
        setSelectedNode(node);
        setNavStack((prev) => [...prev, node]);
        syncPriority(node.path);
        return;
      }
      const full = findNodeByPath(tree, node.path) ?? node;
      setSelectedNode(full);
      setNavStack(buildNavStack(tree, full.path));
      syncPriority(full.path);
    },
    [syncPriority]
  );

  const handleNavigateTo = useCallback(
    (index: number) => {
      setNavStack((prev) => {
        if (index < 0 || index >= prev.length) return prev;
        const next = prev.slice(0, index + 1);
        const focus = next[next.length - 1];
        if (focus) {
          setSelectedNode(focus);
          syncPriority(index <= 0 ? null : focus.path);
        }
        return next;
      });
    },
    [syncPriority]
  );

  const handleNavigateUp = useCallback(() => {
    setNavStack((prev) => {
      if (prev.length <= 1) {
        syncPriority(null);
        return prev;
      }
      const next = prev.slice(0, -1);
      const focus = next[next.length - 1];
      if (focus) {
        setSelectedNode(focus);
        syncPriority(next.length <= 1 ? null : focus.path);
      }
      return next;
    });
  }, [syncPriority]);

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

  /** 当前聚焦节点：导航栈顶，并在过滤树中重解析 */
  const focusNode = useMemo(() => {
    if (!filteredTree) return null;
    if (navStack.length === 0) return filteredTree;
    const top = navStack[navStack.length - 1]!;
    return findNodeByPath(filteredTree, top.path) ?? filteredTree;
  }, [filteredTree, navStack]);

  const breadcrumb = useMemo(() => {
    if (!filteredTree) return [];
    if (navStack.length === 0) return [filteredTree];
    const items: FileNode[] = [];
    for (const n of navStack) {
      const resolved = findNodeByPath(filteredTree, n.path);
      if (!resolved) break;
      items.push(resolved);
    }
    return items.length > 0 ? items : [filteredTree];
  }, [filteredTree, navStack]);

  // 新树到达且导航为空时初始化
  useEffect(() => {
    if (filteredTree && navStack.length === 0) {
      setNavStack([filteredTree]);
    }
  }, [filteredTree, navStack.length]);

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
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Toolbar
        appState={appState}
        scanPath={scanPath}
        setScanPath={handleSetScanPath}
        scanError={scanError}
        overview={overview}
        fromCache={fromCache}
        incomplete={incomplete}
        cacheAt={cacheMeta?.cached_at}
        onStartScan={handleStartScan}
        onResumeScan={handleResumeScan}
        onClearCache={handleClearAllCache}
        onGoHome={handleGoHome}
        t={t}
        locale={locale}
        setLocale={setLocale}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {appState === "dashboard" ? (
          <Dashboard
            overview={overview}
            cacheList={cacheList}
            diskMounts={diskMounts}
            diskHealth={diskHealth}
            onStartScan={handleStartScan}
            onQuickScan={handleQuickScan}
            onOpenCacheEntry={handleOpenCacheEntry}
            onClearCacheEntry={handleClearCacheEntry}
            onClearAllCache={handleClearAllCache}
            onResumeScan={handleResumeScan}
          />
        ) : (
          <>
            <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
              <Treemap
                data={focusNode}
                breadcrumb={breadcrumb}
                selectedPath={selectedNode?.path}
                isLoading={isLiveScanning}
                onNodeSelect={handleNodeSelect}
                onDrillInto={handleDrillInto}
                onNavigateTo={handleNavigateTo}
                onNavigateUp={handleNavigateUp}
              />
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
                  onCategorySelect={(cat) => {
                    setSelectedCategory(cat);
                    // 过滤变化时回到根
                    if (filteredTree || activeRoot) {
                      const root = activeRoot;
                      if (root) setNavStack([root]);
                    }
                  }}
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
              {scanProgress?.phase ? t(scanProgress.phase as Parameters<typeof t>[0]) : t("app.scanningPhrase")}
              {scanProgress?.current_path ? `: ${scanProgress.current_path}` : ""}
            </span>
            <span className="shrink-0 font-mono">
              {livePreview
                ? `${t("app.progressTopLevel")} ${livePreview.completed_top_dirs}/${livePreview.total_top_dirs} · `
                : ""}
              {t("app.progressFound", { count: scanProgress?.files_found ?? livePreview?.files_found ?? 0 })} · {t("app.progressScannedDirs", { count: scanProgress?.dirs_scanned ?? livePreview?.dirs_scanned ?? 0 })}
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
  scanError: string | null;
  overview: SystemOverview | null;
  fromCache: boolean;
  incomplete: boolean;
  cacheAt?: number;
  onStartScan: () => void;
  onResumeScan: () => void;
  onClearCache: () => void;
  onGoHome: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: string;
  setLocale: (locale: "zh-CN" | "en") => void;
  onOpenSettings: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  appState,
  scanPath,
  setScanPath,
  scanError,
  overview,
  fromCache,
  incomplete,
  cacheAt,
  onStartScan,
  onResumeScan,
  onClearCache,
  onGoHome,
  t,
  locale,
  setLocale,
  onOpenSettings,
}) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return (
  <header className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-moss-200/70 bg-white/60 px-4 backdrop-blur-md">
    {/* App title + dropdown */}
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="flex items-center gap-1 font-display text-lg font-semibold tracking-tight text-moss-700 transition hover:text-moss-500"
      >
        {t("app.title")}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mt-0.5 text-moss-400">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {menuOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-moss-200/90 bg-white/95 py-1 shadow-lg backdrop-blur-md">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ink transition hover:bg-moss-50"
            onClick={() => { setMenuOpen(false); onGoHome(); }}
          >
            <span className="text-base">🏠</span>
            {t("menu.home")}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ink transition hover:bg-moss-50"
            onClick={() => { setMenuOpen(false); onOpenSettings(); }}
          >
            <span className="text-base">⚙</span>
            {t("menu.settings")}
          </button>
        </div>
      )}
    </div>

    {overview && (
      <span className="hidden font-mono text-xs text-ink-muted sm:inline">
        {t("app.usedOf", { used: formatSize(overview.used_space), total: formatSize(overview.total_space) })}
      </span>
    )}

    {appState === "scanning" && (
      <span className="animate-soft-pulse rounded-md bg-moss-500 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white">
        {t("app.scanning")}
      </span>
    )}

    {appState === "results" && fromCache && (
      <span
        className="rounded-md bg-sand-200 px-2 py-0.5 text-[10px] font-medium text-ink-soft"
        title={cacheAt ? t("app.cachedAt", { date: formatDate(cacheAt, locale) }) : t("app.cached")}
      >
        {incomplete ? t("app.incompleteCheckpoint") : t("app.cached")}
        {cacheAt ? ` · ${formatDate(cacheAt, locale)}` : ""}
      </span>
    )}

    <div className="flex-1" />

    <div className="flex items-center gap-2">
      {/* Language toggle */}
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
            if (e.key === "Enter" && appState !== "scanning") onStartScan();
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
      {incomplete && appState !== "scanning" && (
        <button
          type="button"
          className="rounded-lg border border-moss-300 bg-white px-2.5 py-1.5 text-xs font-medium text-moss-800 transition hover:bg-moss-50"
          onClick={onResumeScan}
        >
          {t("app.continueScan")}
        </button>
      )}
      {(fromCache || incomplete) && appState === "results" && (
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
        disabled={appState === "scanning"}
      >
        {appState === "scanning" ? t("app.scanningBtn") : appState === "dashboard" ? t("app.scan") : t("app.rescan")}
      </button>
    </div>
  </header>
  );
};

export default App;
