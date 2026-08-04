//! ECharts 矩形树图 — 缩放 / 下钻 / 面包屑导航

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption, TreemapSeriesOption } from "echarts";
import type { FileCategory, FileNode } from "../types";
import { CATEGORY_COLORS, formatSize } from "../types";
import { revealInFileManager } from "../hooks/useTauriCommand";
import { useTranslation } from "../i18n/useTranslation";

export interface TreemapProps {
  /** 当前可视根节点（已按导航聚焦） */
  data: FileNode | null;
  /** 从扫描根到当前聚焦的面包屑路径节点 */
  breadcrumb: FileNode[];
  /** 选中节点（详情面板） */
  selectedPath?: string;
  /** 是否扫描中 */
  isLoading?: boolean;
  /** 单击选中 */
  onNodeSelect: (node: FileNode) => void;
  /** 双击目录下钻 */
  onDrillInto: (node: FileNode) => void;
  /** 面包屑跳转（index = -1 表示扫描根的上一级不存在，0 为根） */
  onNavigateTo: (index: number) => void;
  /** 回到上一级 */
  onNavigateUp: () => void;
}

/** 自然色系扩展色板，避免同分类色块过于单调 */
const NATURAL_PALETTE = [
  "#7cb798", "#6fa0c4", "#d4a574", "#89a07a", "#6db3a8", "#c9985a",
  "#6b93b8", "#c07a74", "#7f9bb0", "#6fa08e", "#a8c07a", "#8bb8a0",
  "#b89a6e", "#79a8c4", "#9bb87a", "#c48a78", "#6a9e8a", "#8a9ec0",
  "#d4b07a", "#7aada0", "#a07a8e", "#8cba8c", "#c4a090", "#70a8b8",
];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** 基于路径哈希，在分类色附近做明暗偏移，使相邻块更易区分 */
function colorForNode(path: string, category: FileCategory): string {
  const base = CATEGORY_COLORS[category] ?? NATURAL_PALETTE[0]!;
  const h = hashString(path);
  const palette = NATURAL_PALETTE[h % NATURAL_PALETTE.length]!;
  // 混入分类色与调色板色，再微调亮度
  const [r1, g1, b1] = hexToRgb(base);
  const [r2, g2, b2] = hexToRgb(palette);
  const mix = 0.45 + ((h >> 8) % 30) / 100;
  let r = r1 * (1 - mix) + r2 * mix;
  let g = g1 * (1 - mix) + g2 * mix;
  let b = b1 * (1 - mix) + b2 * mix;
  const lift = (((h >> 3) % 41) - 20) * 1.2;
  return rgbToHex(r + lift, g + lift, b + lift * 0.8);
}

interface EChartsTreeItem {
  name: string;
  value: number;
  path: string;
  isDir: boolean;
  category: FileCategory;
  riskLevel: string;
  itemStyle: { color: string; borderColor: string; borderWidth: number; borderType?: "solid" | "dashed" | "dotted" };
  children?: EChartsTreeItem[];
}

function toEChartsTree(node: FileNode, depth: number, maxDepth: number): EChartsTreeItem {
  // 未展开的目录：用虚线描边 + 更小宽度，视觉上提示"可双击加载"
  const isCollapsibleDir = node.is_dir && (!node.children || node.children.length === 0);
  const color = colorForNode(node.path, node.category);
  const item: EChartsTreeItem = {
    name: node.name || node.path,
    value: Math.max(node.size, 1),
    path: node.path,
    isDir: node.is_dir,
    category: node.category,
    riskLevel: node.risk_level,
    itemStyle: {
      color,
      borderColor: isCollapsibleDir ? "#7cb798" : "#ffffff",
      borderWidth: isCollapsibleDir ? 2 : 2,
      borderType: isCollapsibleDir ? "dashed" : "solid",
    },
  };

  if (node.is_dir && node.children && node.children.length > 0 && depth < maxDepth) {
    const kids = [...node.children]
      .filter((c) => c.size > 0)
      .sort((a, b) => b.size - a.size)
      .slice(0, 80)
      .map((c) => toEChartsTree(c, depth + 1, maxDepth));
    if (kids.length > 0) item.children = kids;
  }

  return item;
}

function findNodeByPath(root: FileNode, path: string): FileNode | null {
  if (root.path === path) return root;
  if (!root.children) return null;
  for (const child of root.children) {
    if (path === child.path || path.startsWith(child.path + "/")) {
      const found = findNodeByPath(child, path);
      if (found) return found;
    }
  }
  return null;
}

/** 加载中的马赛克呼吸动画 */
const TreemapLoading: React.FC = () => {
  const { t } = useTranslation();
  const cells = useMemo(() => {
    const sizes = [3, 2, 2, 1, 1, 2, 1, 1, 2, 3, 1, 2, 1, 1, 2];
    return sizes.map((span, i) => ({
      span,
      color: NATURAL_PALETTE[i % NATURAL_PALETTE.length]!,
      delay: (i % 6) * 0.12,
    }));
  }, []);

  return (
    <div className="absolute inset-0 z-[4] flex flex-col bg-sand-50/80 p-4">
      <div
        className="grid h-full w-full gap-1.5"
        style={{
          gridTemplateColumns: "repeat(6, 1fr)",
          gridAutoRows: "minmax(48px, 1fr)",
        }}
      >
        {cells.map((c, i) => (
          <div
            key={i}
            className="animate-soft-pulse rounded-lg opacity-70"
            style={{
              gridColumn: `span ${c.span}`,
              backgroundColor: c.color,
              animationDelay: `${c.delay}s`,
            }}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="rounded-2xl border border-moss-200/80 bg-white/85 px-5 py-3 text-sm text-moss-800 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-moss-400 opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-moss-500" />
            </span>
            {t("treemap.scanningOverlay")}
          </div>
        </div>
      </div>
    </div>
  );
};

const Treemap: React.FC<TreemapProps> = ({
  data,
  breadcrumb,
  selectedPath,
  isLoading = false,
  onNodeSelect,
  onDrillInto,
  onNavigateTo,
  onNavigateUp,
}) => {
  const { t, locale } = useTranslation();
  const chartRef = useRef<ReactECharts>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    node: FileNode;
  } | null>(null);

  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, []);

  const treeData = useMemo(() => {
    if (!data) return null;
    // 当前聚焦节点：展示其子级；若无子级则展示自身
    if (data.children && data.children.length > 0) {
      return [...data.children]
        .filter((c) => c.size > 0)
        .sort((a, b) => b.size - a.size)
        .slice(0, 120)
        .map((c) => toEChartsTree(c, 0, 2));
    }
    return [toEChartsTree(data, 0, 1)];
  }, [data]);

  const option: EChartsOption = useMemo(() => {
    const series: TreemapSeriesOption = {
      type: "treemap",
      width: "100%",
      height: "100%",
      roam: true,
      nodeClick: false,
      breadcrumb: { show: false },
      animationDurationUpdate: 400,
      animationEasingUpdate: "quarticOut",
      leafDepth: 2,
      visibleMin: 300,
      // 叶子标签：居中简洁显示
      label: {
        show: true,
        position: "inside",
        distance: 0,
        formatter: (params: unknown) => {
          const p = params as {
            name?: string;
            value?: number;
            treePathInfo?: unknown[];
          };
          const name = p.name ?? "";
          const size = formatSize(Number(p.value) || 0);
          // 过长名称截断
          const short =
            name.length > 18 ? `${name.slice(0, 16)}…` : name;
          return `{name|${short}}\n{size|${size}}`;
        },
        rich: {
          name: {
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "Figtree, PingFang SC, sans-serif",
            color: "#1a2420",
            lineHeight: 18,
            align: "center",
            textShadowColor: "rgba(255,255,255,0.7)",
            textShadowBlur: 3,
          },
          size: {
            fontSize: 10,
            fontFamily: "IBM Plex Mono, monospace",
            color: "rgba(26,36,32,0.72)",
            lineHeight: 15,
            align: "center",
            textShadowColor: "rgba(255,255,255,0.65)",
            textShadowBlur: 2,
          },
        },
      },
      // 父级目录条：细长顶栏，只显示名称
      upperLabel: {
        show: true,
        height: 26,
        formatter: (params: unknown) => {
          const p = params as { name?: string };
          const name = p.name ?? "";
          return name.length > 28 ? `${name.slice(0, 26)}…` : name;
        },
        color: "#243028",
        fontSize: 11,
        fontWeight: 600,
        fontFamily: "Figtree, PingFang SC, sans-serif",
        padding: [0, 10],
        align: "left",
        verticalAlign: "middle",
        backgroundColor: "rgba(255,255,255,0.78)",
        borderRadius: [6, 6, 0, 0],
      },
      itemStyle: {
        borderColor: "#fff",
        borderWidth: 2,
        gapWidth: 2,
      },
      levels: [
        {
          itemStyle: { borderWidth: 0, gapWidth: 3 },
          upperLabel: { show: false },
        },
        {
          itemStyle: { borderWidth: 2, gapWidth: 2, borderColor: "#fff" },
          upperLabel: {
            show: true,
            height: 26,
            backgroundColor: "rgba(255,255,255,0.78)",
          },
          label: { show: false },
        },
        {
          colorSaturation: [0.35, 0.55],
          itemStyle: {
            borderWidth: 1,
            gapWidth: 1,
            borderColorSaturation: 0.6,
          },
          upperLabel: { show: false },
          label: {
            show: true,
            fontSize: 11,
          },
        },
      ],
      data: treeData ?? [],
      emphasis: {
        itemStyle: {
          shadowBlur: 12,
          shadowColor: "rgba(36,48,40,0.25)",
        },
      },
    };

    return {
      backgroundColor: "transparent",
      tooltip: {
        confine: true,
        formatter: (info: unknown) => {
          const i = info as {
            name?: string;
            value?: number;
            data?: EChartsTreeItem;
          };
          const d = i.data;
          if (!d) return "";
          const cat = t(`categoryLabels.${d.category}` as Parameters<typeof t>[0]);
          const typeLabel = d.isDir ? t("treemap.directory") : t("treemap.file");
          return [
            `<div style="font-weight:600;margin-bottom:4px">${d.name}</div>`,
            `<div>${formatSize(d.value)}</div>`,
            `<div style="opacity:.7;margin-top:2px">${cat} · ${typeLabel}</div>`,
            `<div style="opacity:.55;font-size:11px;margin-top:4px;max-width:280px;word-break:break-all">${d.path}</div>`,
          ].join("");
        },
      },
      series: [series],
    };
  }, [treeData]);

  const resolveNode = useCallback((path: string): FileNode | null => {
    const root = dataRef.current;
    if (!root) return null;
    return findNodeByPath(root, path) ?? (root.path === path ? root : null);
  }, []);

  const onEvents = useMemo(
    () => ({
      click: (params: { data?: EChartsTreeItem }) => {
        setCtxMenu(null);
        const d = params.data;
        if (!d?.path) return;
        const found = resolveNode(d.path);
        const node: FileNode =
          found ??
          ({
            name: d.name,
            path: d.path,
            size: d.value,
            is_dir: d.isDir,
            category: d.category,
            risk_level: d.riskLevel as FileNode["risk_level"],
            modified_at: 0,
          } satisfies FileNode);
        onNodeSelect(node);
      },
      dblclick: (params: { data?: EChartsTreeItem }) => {
        setCtxMenu(null);
        const d = params.data;
        if (!d?.path || !d.isDir) return;
        const found = resolveNode(d.path);
        const node: FileNode =
          found ??
          ({
            name: d.name,
            path: d.path,
            size: d.value,
            is_dir: true,
            category: d.category,
            risk_level: d.riskLevel as FileNode["risk_level"],
            modified_at: 0,
            children: [],
          } satisfies FileNode);
        onDrillInto(node);
      },
      contextmenu: (params: {
        data?: EChartsTreeItem;
        event?: { event?: MouseEvent };
      }) => {
        const native = params.event?.event;
        if (native) {
          native.preventDefault();
          native.stopPropagation();
        }
        const d = params.data;
        if (!d?.path) return;
        const found = resolveNode(d.path);
        const node: FileNode =
          found ??
          ({
            name: d.name,
            path: d.path,
            size: d.value,
            is_dir: d.isDir,
            category: d.category,
            risk_level: d.riskLevel as FileNode["risk_level"],
            modified_at: 0,
          } satisfies FileNode);
        onNodeSelect(node);
        const x = Math.min(native?.clientX ?? 0, window.innerWidth - 200);
        const y = Math.min(native?.clientY ?? 0, window.innerHeight - 140);
        setCtxMenu({ x, y, node });
      },
    }),
    [onNodeSelect, onDrillInto, resolveNode]
  );

  const handleReveal = async () => {
    if (!ctxMenu) return;
    const path = ctxMenu.node.path;
    setCtxMenu(null);
    try {
      await revealInFileManager(path, locale);
    } catch (e) {
      console.error("打开文件管理器失败:", e);
    }
  };

  // 选中高亮：通过 dispatchAction
  useEffect(() => {
    const inst = chartRef.current?.getEchartsInstance();
    if (!inst || !selectedPath) return;
    // ECharts treemap 无直接按 path 高亮 API，依赖 tooltip/click 即可
  }, [selectedPath]);

  const canGoUp = breadcrumb.length > 1;

  const handleZoom = (factor: number) => {
    const inst = chartRef.current?.getEchartsInstance();
    if (!inst) return;
    // roam 缩放：通过 dispatchAction
    inst.dispatchAction({
      type: "treemapZoomToNode",
      targetId: undefined,
    });
    // 备用：用 getOption 改 zoom
    const opt = inst.getOption() as {
      series?: Array<{ zoom?: number; center?: number[] }>;
    };
    const series0 = opt.series?.[0];
    if (!series0) return;
    const currentZoom = typeof series0.zoom === "number" ? series0.zoom : 1;
    inst.setOption({
      series: [
        {
          zoom: Math.max(0.5, Math.min(4, currentZoom * factor)),
        },
      ],
    });
  };

  const handleResetView = () => {
    const inst = chartRef.current?.getEchartsInstance();
    if (!inst) return;
    inst.setOption({ series: [{ zoom: 1, center: [0.5, 0.5] }] });
    inst.resize();
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-sand-50/40">
      {/* 深度导航栏 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-moss-200/70 bg-white/70 px-3 py-2 backdrop-blur-md">
        <button
          type="button"
          disabled={!canGoUp}
          onClick={onNavigateUp}
          className="rounded-lg border border-moss-200 bg-sand-50 px-2 py-1 text-xs font-medium text-moss-800 transition hover:bg-moss-50 disabled:cursor-not-allowed disabled:opacity-40"
          title={t("treemap.backTitle")}
        >
          {t("treemap.back")}
        </button>

        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-xs">
          {breadcrumb.map((node, index) => {
            const isLast = index === breadcrumb.length - 1;
            const label =
              node.name ||
              (node.path === "/" ? "/" : node.path.split("/").filter(Boolean).pop()) ||
              node.path;
            return (
              <React.Fragment key={`${node.path}-${index}`}>
                {index > 0 && <span className="shrink-0 text-ink-muted">/</span>}
                <button
                  type="button"
                  disabled={isLast}
                  onClick={() => onNavigateTo(index)}
                  className={`max-w-[140px] shrink-0 truncate rounded-md px-1.5 py-0.5 transition ${
                    isLast
                      ? "font-semibold text-moss-800"
                      : "text-ink-soft hover:bg-moss-50 hover:text-moss-700"
                  }`}
                  title={node.path}
                >
                  {label}
                </button>
              </React.Fragment>
            );
          })}
          {breadcrumb.length === 0 && (
            <span className="text-ink-muted">{t("treemap.waitingData")}</span>
          )}
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => handleZoom(1 / 1.25)}
            className="rounded-lg border border-moss-200 bg-white px-2 py-1 text-xs text-moss-800 hover:bg-moss-50"
            title={t("treemap.zoomOut")}
          >
            −
          </button>
          <button
            type="button"
            onClick={() => handleZoom(1.25)}
            className="rounded-lg border border-moss-200 bg-white px-2 py-1 text-xs text-moss-800 hover:bg-moss-50"
            title={t("treemap.zoomIn")}
          >
            +
          </button>
          <button
            type="button"
            onClick={handleResetView}
            className="rounded-lg border border-moss-200 bg-white px-2 py-1 text-xs text-moss-800 hover:bg-moss-50"
            title={t("treemap.resetViewTitle")}
          >
            {t("treemap.resetView")}
          </button>
        </div>
      </div>

      <div
        className="relative min-h-0 flex-1"
        onContextMenu={(e) => {
          // 空白处也拦截浏览器默认菜单
          e.preventDefault();
        }}
      >
        {isLoading && !data && <TreemapLoading />}

        {data && treeData && (
          <ReactECharts
            ref={chartRef}
            option={option}
            onEvents={onEvents}
            style={{ height: "100%", width: "100%" }}
            opts={{ renderer: "canvas" }}
            notMerge
            lazyUpdate
          />
        )}

        {!isLoading && !data && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-muted">
            <div className="text-4xl opacity-50">📂</div>
            <p className="text-sm">{t("treemap.emptyState")}</p>
          </div>
        )}

        {isLoading && data && (
          <div className="pointer-events-none absolute top-3 right-3 rounded-full bg-moss-600/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm">
            {t("treemap.scanningBadge")}
          </div>
        )}

        {ctxMenu && (
          <div
            className="fixed z-50 min-w-[180px] overflow-hidden rounded-xl border border-moss-200/90 bg-white/95 py-1 shadow-lg backdrop-blur-md"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="border-b border-moss-100 px-3 py-1.5">
              <div className="max-w-[200px] truncate text-xs font-semibold text-ink">
                {ctxMenu.node.name}
              </div>
              <div className="max-w-[200px] truncate font-mono text-[10px] text-ink-muted">
                {formatSize(ctxMenu.node.size)}
              </div>
            </div>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink transition hover:bg-moss-50"
              onClick={handleReveal}
            >
              <span className="text-base">📂</span>
              {typeof navigator !== "undefined" &&
              /mac/i.test(navigator.platform || navigator.userAgent)
                ? t("treemap.showInFinder")
                : t("treemap.showInExplorer")}
            </button>
            {ctxMenu.node.is_dir && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink transition hover:bg-moss-50"
                onClick={() => {
                  const n = ctxMenu.node;
                  setCtxMenu(null);
                  onDrillInto(n);
                }}
              >
                <span className="text-base">↘</span>
                {t("treemap.enterDir")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Treemap;
