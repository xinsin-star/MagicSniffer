//! 应用级副作用：标题/托盘、概览加载、缓存恢复、扫描事件监听

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "../i18n/useTranslation";
import { useScanStore } from "../stores/scan.store";
import { findNodeByPath } from "../utils/tree";
import type { FileNode } from "../types";
import {
  checkSmartctl,
  getSystemOverview,
  loadLatestScanCache,
  onScanPreview,
  onScanProgress,
  updateTrayMenu,
} from "./useTauriCommand";

/** 在首页（hash 为 #/ 或空）时判断是否应切换到结果页 */
function isOnDashboard(): boolean {
  const hash = window.location.hash;
  return hash === "" || hash === "#/";
}

export function useScanSetup(): void {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();

  // 动态设置页面标题 + 同步托盘菜单
  useEffect(() => {
    document.title = t("site.title");
    updateTrayMenu(locale).catch(() => {});
  }, [locale, t]);

  // 系统概览 + smartctl 可用性（不阻塞页面渲染，供设置面板展示）
  useEffect(() => {
    let cancelled = false;
    const loadOverview = async () => {
      try {
        const ov = await getSystemOverview(locale);
        if (cancelled) return;
        useScanStore.getState().setOverview(ov);
        checkSmartctl(locale)
          .then((s) => useScanStore.getState().setSmartctlStatus(s))
          .catch(() => useScanStore.getState().setSmartctlStatus({ available: false }));
      } catch (e) {
        console.warn("加载系统概览失败（非 Tauri 环境？）:", e);
        if (cancelled) return;
        useScanStore.getState().setOverview({
          total_space: 500_000_000_000,
          used_space: 300_000_000_000,
          free_space: 200_000_000_000,
          category_summary: [],
          top_consumers: [],
        });
      }
    };
    loadOverview();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  // 启动时恢复最近一次扫描缓存 + 加载缓存列表
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const [cached] = await Promise.all([
          loadLatestScanCache(),
          useScanStore.getState().refreshCacheList(),
        ]);
        if (cancelled) return;
        if (cached?.result) {
          useScanStore.getState().applyCached(cached, { fromCache: true });
        }
      } catch (e) {
        console.warn("加载扫描缓存失败:", e);
      }
    };
    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // 扫描进度 / 增量预览事件监听
  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenPreview: (() => void) | undefined;
    let cancelled = false;

    const setup = async () => {
      try {
        const [p, v] = await Promise.all([
          onScanProgress((progress) => useScanStore.getState().setScanProgress(progress)),
          onScanPreview((preview) => {
            const st = useScanStore.getState();
            st.setLivePreview(preview);
            st.setFromCache(false);
            // 在首页时切到结果页（实时预览）
            if (isOnDashboard()) navigate("/results");
            st.setNavStack((prev) => {
              if (prev.length === 0) return [preview.root_node];
              const paths = prev.map((n) => n.path);
              const next: FileNode[] = [];
              for (const path of paths) {
                const node = findNodeByPath(preview.root_node, path);
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
  }, [navigate]);
}
