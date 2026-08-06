//! 全局状态（zustand）
//!
//! 集中管理扫描结果、实时预览、导航栈、分类过滤、工具栏输入等共享状态，
//! 并提供所有 Tauri 副作用动作。页面组件只读状态、触发动作，不再自行管理。

import { create } from "zustand";
import { useI18nStore } from "./i18n.store";
import {
  clearScanCache,
  expandNode,
  listScanCaches,
  loadScanCache,
  setScanPriority,
  startScan,
  stopScan,
  validateScanPath,
} from "../hooks/useTauriCommand";
import type {
  CachedScan,
  CategorySummary,
  FileCategory,
  FileNode,
  ScanCacheMeta,
  ScanPreview,
  ScanProgress,
  ScanResult,
  SearchResultItem,
  SmartctlStatus,
  SystemOverview,
} from "../types";
import {
  buildNavStack,
  findNodeByPath,
  filterTreeByCategory,
  injectChildren,
  loadPersistedCache,
  persistCache,
} from "../utils/tree";

/** 已展开目录缓存（跨 action 复用，不入 store 以免触发渲染） */
let expandedCache = new Map<string, FileNode[]>();

/** 路由导航器：由 App 在路由就绪后注入，store 动作借此切换页面 */
let navigateFn: (path: string) => void = () => {};
export function bindNavigate(fn: (path: string) => void): void {
  navigateFn = fn;
}

/** 稳定空引用，避免选择器每次返回新数组导致多余重渲染 */
const EMPTY_SUMMARY: CategorySummary[] = [];

export interface ScanStore {
  // ── 数据 ──
  overview: SystemOverview | null;
  smartctlStatus: SmartctlStatus | null;
  scanResult: ScanResult | null;
  livePreview: ScanPreview | null;
  scanProgress: ScanProgress | null;
  selectedNode: FileNode | null;
  selectedCategory: FileCategory | null;
  navStack: FileNode[];
  expandingPaths: Set<string>;
  fromCache: boolean;
  cacheMeta: ScanCacheMeta | null;
  incomplete: boolean;
  cacheList: ScanCacheMeta[];
  scanning: boolean;
  leaveAfterStop: boolean;

  // ── 工具栏 / UI ──
  scanPath: string;
  scanError: string | null;
  settingsOpen: boolean;

  // ── setter ──
  setOverview: (o: SystemOverview | null) => void;
  setSmartctlStatus: (s: SmartctlStatus | null) => void;
  setScanProgress: (p: ScanProgress | null) => void;
  setLivePreview: (p: ScanPreview | null) => void;
  setFromCache: (v: boolean) => void;
  setSelectedNode: (n: FileNode | null) => void;
  setSelectedCategory: (c: FileCategory | null) => void;
  setNavStack: (updater: FileNode[] | ((prev: FileNode[]) => FileNode[])) => void;
  setScanPath: (p: string) => void;
  setScanError: (e: string | null) => void;
  setSettingsOpen: (v: boolean) => void;

  // ── 动作 ──
  applyCached: (cached: CachedScan, opts?: { fromCache?: boolean }) => void;
  refreshCacheList: () => Promise<void>;
  openCacheEntry: (rootPath: string) => Promise<void>;
  clearCacheEntry: (rootPath: string) => Promise<void>;
  clearAllCache: () => Promise<void>;
  startScan: () => Promise<void>;
  quickScan: () => Promise<void>;
  resumeScan: () => Promise<void>;
  goHome: () => Promise<void>;
  drillInto: (node: FileNode) => Promise<void>;
  navigateTo: (index: number) => void;
  navigateUp: () => void;
  searchResultSelect: (item: SearchResultItem) => void;
}

/** 选择器：当前可视根节点（扫描中优先实时预览树） */
export const selectActiveRoot = (s: ScanStore): FileNode | null =>
  s.scanning && s.livePreview?.root_node
    ? s.livePreview.root_node
    : (s.scanResult?.root_node ?? s.livePreview?.root_node ?? null);

/** 选择器：分类汇总（扫描中优先实时预览） */
export const selectActiveSummary = (s: ScanStore): CategorySummary[] => {
  if (s.scanning && s.livePreview?.category_summary) return s.livePreview.category_summary;
  return s.scanResult?.category_summary ?? s.livePreview?.category_summary ?? EMPTY_SUMMARY;
};

export const useScanStore = create<ScanStore>((set, get) => {
  /** 扫描中同步后端优先级（防止下钻时后端扫无关目录） */
  const syncPriority = (path: string | null) => {
    if (!get().scanning) return;
    void setScanPriority(path);
  };

  return {
    // ── 初始值 ──
    overview: null,
    smartctlStatus: null,
    scanResult: null,
    livePreview: null,
    scanProgress: null,
    selectedNode: null,
    selectedCategory: null,
    navStack: [],
    expandingPaths: new Set(),
    fromCache: false,
    cacheMeta: null,
    incomplete: false,
    cacheList: [],
    scanning: false,
    leaveAfterStop: false,
    scanPath: "/",
    scanError: null,
    settingsOpen: false,

    // ── setter ──
    setOverview: (overview) => set({ overview }),
    setSmartctlStatus: (smartctlStatus) => set({ smartctlStatus }),
    setScanProgress: (scanProgress) => set({ scanProgress }),
    setLivePreview: (livePreview) => set({ livePreview }),
    setFromCache: (fromCache) => set({ fromCache }),
    setSelectedNode: (selectedNode) => set({ selectedNode }),
    setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
    setNavStack: (updater) =>
      set((s) => ({
        navStack: typeof updater === "function" ? updater(s.navStack) : updater,
      })),
    setScanPath: (scanPath) => set({ scanPath, scanError: null }),
    setScanError: (scanError) => set({ scanError }),
    setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

    // ── 动作 ──
    applyCached: (cached, opts) => {
      const result = cached.result;
      expandedCache = loadPersistedCache(result.root_path);
      set({
        scanResult: result,
        livePreview: null,
        selectedNode: null,
        selectedCategory: null,
        navStack: [result.root_node],
        scanPath: result.root_path,
        scanError: null,
        fromCache: !!opts?.fromCache,
        incomplete: !!cached.incomplete,
        cacheMeta: {
          root_path: result.root_path,
          cached_at: cached.cached_at,
          total_size: result.root_node.size,
          total_files: result.total_files,
          total_dirs: result.total_dirs,
          elapsed_ms: result.elapsed_ms,
          incomplete: cached.incomplete,
        },
      });
      const ov = get().overview;
      if (ov) {
        set({
          overview: {
            ...ov,
            category_summary: result.category_summary,
            top_consumers: result.root_node.children
              ? [...result.root_node.children].sort((a, b) => b.size - a.size).slice(0, 10)
              : [],
          },
        });
      }
      navigateFn("/results");
    },

    refreshCacheList: async () => {
      try {
        const list = await listScanCaches();
        set({ cacheList: list });
      } catch (e) {
        console.warn("加载缓存列表失败:", e);
      }
    },

    openCacheEntry: async (rootPath) => {
      try {
        const cached = await loadScanCache(rootPath);
        if (cached?.result) {
          get().applyCached(cached, { fromCache: true });
        }
      } catch (e) {
        console.error("打开缓存失败:", e);
      }
    },

    clearCacheEntry: async (rootPath) => {
      try {
        await clearScanCache(rootPath);
        await get().refreshCacheList();
        if (get().cacheMeta?.root_path === rootPath) {
          set({
            cacheMeta: null,
            fromCache: false,
            incomplete: false,
            scanResult: null,
            navStack: [],
          });
          navigateFn("/");
        }
      } catch (e) {
        console.error("清除缓存失败:", e);
      }
    },

    clearAllCache: async () => {
      try {
        if (get().scanning) await stopScan();
        await clearScanCache();
        set({
          cacheMeta: null,
          cacheList: [],
          fromCache: false,
          incomplete: false,
          scanResult: null,
          navStack: [],
        });
        navigateFn("/");
      } catch (e) {
        console.error("清除缓存失败:", e);
      }
    },

    startScan: async () => {
      const locale = useI18nStore.getState().locale;
      const path = get().scanPath || "/";
      set({ scanError: null });
      // 先校验路径，再切页面，避免无效路径导致页面忽闪
      try {
        await validateScanPath(path, locale);
      } catch (e) {
        set({ scanError: typeof e === "string" ? e : String(e) });
        return;
      }

      set({
        scanning: true,
        scanProgress: null,
        livePreview: null,
        scanResult: null,
        selectedNode: null,
        selectedCategory: null,
        navStack: [],
        fromCache: false,
        incomplete: false,
      });
      navigateFn("/results");

      try {
        const cached = await startScan(
          {
            path,
            exclude_patterns: ["/private/var/run", "/proc", "/dev"],
            min_file_size: 0,
          },
          false,
        );
        set({ scanning: false });
        get().applyCached(cached);
        get().refreshCacheList();
        if (get().leaveAfterStop) {
          set({ leaveAfterStop: false, livePreview: null, navStack: [] });
          navigateFn("/");
        }
      } catch (e) {
        console.error("扫描失败:", e);
        set({ scanning: false, livePreview: null });
        set({ scanError: typeof e === "string" ? e : String(e) });
        navigateFn("/");
      }
    },

    quickScan: async () => {
      set({
        scanning: true,
        scanProgress: null,
        livePreview: null,
        scanResult: null,
        selectedCategory: null,
        navStack: [],
        fromCache: false,
        incomplete: false,
      });
      navigateFn("/results");

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
          false,
        );
        set({ scanning: false });
        get().applyCached(cached);
        get().refreshCacheList();
        if (get().leaveAfterStop) {
          set({ leaveAfterStop: false, livePreview: null, navStack: [] });
          navigateFn("/");
        }
      } catch (e) {
        console.error("快速扫描失败:", e);
        set({ scanning: false, livePreview: null });
        navigateFn("/");
      }
    },

    resumeScan: async () => {
      const s = get();
      set({ scanning: true, scanProgress: null, livePreview: null, fromCache: false });
      navigateFn("/results");

      try {
        const cached = await startScan(
          {
            path: s.cacheMeta?.root_path || s.scanPath || "~",
            exclude_patterns: ["/private/var/run", "/proc", "/dev"],
            min_file_size: 0,
          },
          true,
        );
        set({ scanning: false });
        get().applyCached(cached);
        get().refreshCacheList();
        if (get().leaveAfterStop) {
          set({ leaveAfterStop: false, livePreview: null, navStack: [] });
          navigateFn("/");
        }
      } catch (e) {
        console.error("续扫失败:", e);
        set({ scanning: false });
        navigateFn("/results");
      }
    },

    goHome: async () => {
      if (get().scanning) {
        set({ leaveAfterStop: true });
        try {
          await stopScan();
        } catch {
          /* ignore */
        }
        return;
      }
      set({ livePreview: null, navStack: [] });
      void setScanPriority(null);
      navigateFn("/");
    },

    drillInto: async (node) => {
      if (!node.is_dir) return;
      const s = get();
      const activeRoot = selectActiveRoot(s);
      const tree = filterTreeByCategory(activeRoot, s.selectedCategory);
      if (!tree) {
        set({ selectedNode: node, navStack: [...s.navStack, node] });
        syncPriority(node.path);
        return;
      }

      const full = findNodeByPath(tree, node.path) ?? node;
      set({ selectedNode: full, navStack: buildNavStack(tree, full.path) });
      syncPriority(full.path);

      // 懒加载：如果该目录尚未展开（children 为空或不存在），加载子项
      if (!full.children || full.children.length === 0) {
        const cached = expandedCache.get(full.path);
        let resp: { children: FileNode[]; truncated: boolean };
        if (cached) {
          resp = { children: cached, truncated: false };
        } else {
          set((st) => ({ expandingPaths: new Set(st.expandingPaths).add(full.path) }));
          try {
            const r = await expandNode(full.path);
            resp = r;
            expandedCache.set(full.path, r.children);
            const cur = get();
            if (cur.scanResult) {
              persistCache(cur.scanResult.root_path, expandedCache);
            }
          } catch (e) {
            console.error("展开目录失败:", e);
            return;
          } finally {
            set((st) => {
              const next = new Set(st.expandingPaths);
              next.delete(full.path);
              return { expandingPaths: next };
            });
          }
        }

        // 克隆整条路径并注入 children，触发 React 重渲染
        const cur = get();
        if (cur.scanResult) {
          const newRoot = injectChildren(cur.scanResult.root_node, full.path, resp.children);
          set({ scanResult: { ...cur.scanResult, root_node: newRoot } });
        }
      }
    },

    navigateTo: (index) => {
      const s = get();
      if (index < 0 || index >= s.navStack.length) return;
      const next = s.navStack.slice(0, index + 1);
      const focus = next[next.length - 1];
      if (focus) {
        syncPriority(index <= 0 ? null : focus.path);
        set({ navStack: next, selectedNode: focus });
      } else {
        set({ navStack: next });
      }
    },

    navigateUp: () => {
      const s = get();
      if (s.navStack.length <= 1) {
        syncPriority(null);
        return;
      }
      const next = s.navStack.slice(0, -1);
      const focus = next[next.length - 1];
      if (focus) {
        syncPriority(next.length <= 1 ? null : focus.path);
        set({ navStack: next, selectedNode: focus });
      } else {
        set({ navStack: next });
      }
    },

    searchResultSelect: (item) => {
      set({
        selectedNode: {
          name: item.name,
          path: item.path,
          size: item.size,
          is_dir: item.is_dir,
          category: item.category,
          risk_level: item.risk_level,
          modified_at: item.modified_at,
        },
      });
    },
  };
});
