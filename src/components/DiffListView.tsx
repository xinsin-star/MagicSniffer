//! 快照对比 — 列表视图
//!
//! 将差异树扁平为表格行，支持按状态筛选与表头排序。

import React, { useMemo, useState } from "react";
import type { DiffNode, DiffStatus } from "../types";
import { DIFF_STATUS_COLORS, formatSize } from "../types";
import { useTranslation } from "../i18n/useTranslation";

export type DiffStatusFilter = DiffStatus | "all";

interface DiffListViewProps {
  diffRoot: DiffNode;
  statusFilter: DiffStatusFilter;
}

type SortKey = "name" | "delta" | "new_size" | "growth_rate";

/** 带符号字节文本（formatSize 不处理负数） */
function signedSize(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${formatSize(Math.abs(n))}`;
}

/** 状态徽章配色（浅色底 + 描边 + 对应文字色） */
const STATUS_BADGE: Record<DiffStatus, string> = {
  Grown: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Shrunk: "border-rose-200 bg-rose-50 text-rose-700",
  Unchanged: "border-sand-200 bg-sand-100 text-ink-muted",
  Added: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Removed: "border-rose-200 bg-rose-50 text-rose-700",
};

const DiffListView: React.FC<DiffListViewProps> = ({ diffRoot, statusFilter }) => {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<SortKey>("delta");
  const [sortDesc, setSortDesc] = useState(true);

  // 扁平化差异树（排除根节点本身）
  const rows = useMemo(() => {
    const walk = (node: DiffNode, depth: number): Array<{ node: DiffNode; depth: number }> => {
      const out: Array<{ node: DiffNode; depth: number }> = [];
      if (statusFilter === "all" || node.status === statusFilter) {
        out.push({ node, depth });
      }
      for (const child of node.children ?? []) {
        out.push(...walk(child, depth + 1));
      }
      return out;
    };
    return walk(diffRoot, 0).filter((r) => r.depth > 0);
  }, [diffRoot, statusFilter]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    const factor = sortDesc ? -1 : 1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.node.name.localeCompare(b.node.name) * factor;
        case "delta":
          return (a.node.delta - b.node.delta) * factor;
        case "new_size":
          return (a.node.new_size - b.node.new_size) * factor;
        case "growth_rate": {
          const ga = a.node.growth_rate ?? -Infinity;
          const gb = b.node.growth_rate ?? -Infinity;
          return (ga - gb) * factor;
        }
        default:
          return 0;
      }
    });
    return arr;
  }, [rows, sortKey, sortDesc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(key === "name");
    }
  };

  const SortableHeader: React.FC<{ label: string; k: SortKey; align?: "left" | "right" }> = ({
    label,
    k,
    align = "left",
  }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`cursor-pointer select-none px-3 py-2.5 text-[11px] font-semibold tracking-wide whitespace-nowrap text-ink-muted transition hover:text-moss-700 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`text-[9px] ${sortKey === k ? "text-moss-700" : "text-ink-muted/40"}`}>
          {sortKey === k ? (sortDesc ? "▼" : "▲") : "⇅"}
        </span>
      </span>
    </th>
  );

  if (sorted.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-muted">
        <div className="text-3xl opacity-40">🗂️</div>
        <p className="text-sm">{t("diff.diffEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-moss-200/80 bg-white/85 shadow-sm backdrop-blur-sm">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-sand-50/95 backdrop-blur">
          <tr className="border-b border-moss-200/70">
            <th className="w-[92px] px-3 py-2.5 text-left text-[11px] font-semibold tracking-wide whitespace-nowrap text-ink-muted">
              {t("diff.status")}
            </th>
            <SortableHeader label={t("diff.path")} k="name" />
            <th className="px-3 py-2.5 text-left text-[11px] font-semibold tracking-wide whitespace-nowrap text-ink-muted">
              {t("detail.category")}
            </th>
            <th className="px-3 py-2.5 text-right text-[11px] font-semibold tracking-wide whitespace-nowrap text-ink-muted">
              {t("diff.oldSize")}
            </th>
            <SortableHeader label={t("diff.newSize")} k="new_size" align="right" />
            <SortableHeader label={t("diff.delta")} k="delta" align="right" />
            <SortableHeader label={t("diff.growthRate")} k="growth_rate" align="right" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ node, depth }, idx) => {
            const deltaColor =
              node.delta > 0 ? "text-emerald-600" : node.delta < 0 ? "text-rose-600" : "text-ink-muted";
            return (
              <tr
                key={node.path}
                className={`border-b border-moss-100/40 transition-colors hover:bg-moss-50/50 ${
                  idx % 2 === 1 ? "bg-sand-50/40" : ""
                }`}
              >
                <td className="px-3 py-2 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[node.status]}`}
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: DIFF_STATUS_COLORS[node.status] }}
                    />
                    {t(`diffStatusLabels.${node.status}` as Parameters<typeof t>[0])}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex min-w-0 flex-col font-mono text-xs">
                    <div className="flex items-center gap-1">
                      <span style={{ width: depth * 14 }} className="shrink-0" />
                      <span className="truncate font-medium text-ink">{node.name}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-ink-muted/80" title={node.path}>
                      <span style={{ width: depth * 14 }} className="inline-block shrink-0" />
                      {node.path}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-xs whitespace-nowrap text-ink-soft">
                  {t(`categoryLabels.${node.category}` as Parameters<typeof t>[0])}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap text-ink-muted">
                  {formatSize(node.old_size)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap text-ink">
                  {formatSize(node.new_size)}
                </td>
                <td className={`px-3 py-2 text-right font-mono text-xs font-semibold whitespace-nowrap ${deltaColor}`}>
                  {signedSize(node.delta)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap text-ink-soft">
                  {node.growth_rate == null
                    ? "—"
                    : `${node.growth_rate >= 0 ? "+" : ""}${node.growth_rate.toFixed(1)}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default DiffListView;
