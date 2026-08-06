//! 快照对比 — 独立页面
//!
//! 选择基准/目标快照，展示差异汇总、分类变化，并支持树图/列表两种视图。

import React, { useEffect, useMemo, useState } from "react";
import type { DiffNode, FileNode, SnapshotDiff, SnapshotMeta } from "../types";
import { formatDate, formatSize } from "../types";
import { diffSnapshots, listSnapshots } from "../hooks/useTauriCommand";
import { useTranslation } from "../i18n/useTranslation";
import Treemap, { type DiffInfo } from "./Treemap";
import DiffListView, { type DiffStatusFilter } from "./DiffListView";

interface DiffViewProps {
  onExit: () => void;
}

/** DiffNode → FileNode（size 取 new_size，供 Treemap 按"当前布局 + 差异色"渲染） */
function diffToFileNode(d: DiffNode): FileNode {
  return {
    name: d.name,
    path: d.path,
    size: d.new_size,
    is_dir: d.is_dir,
    category: d.category,
    risk_level: "None",
    children: d.children?.map(diffToFileNode),
    modified_at: 0,
    extension: undefined,
  };
}

/** 扁平化差异树为 path → 差异信息，供 Treemap 染色与 tooltip */
function buildDiffMap(root: DiffNode): Map<string, DiffInfo> {
  const map = new Map<string, DiffInfo>();
  const walk = (n: DiffNode) => {
    map.set(n.path, { status: n.status, delta: n.delta, growthRate: n.growth_rate });
    for (const c of n.children ?? []) walk(c);
  };
  walk(root);
  return map;
}

/** 带符号字节文本（formatSize 不处理负数） */
function signedSize(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${formatSize(Math.abs(n))}`;
}

const StatCard: React.FC<{
  icon: string;
  label: string;
  value: string;
  sub?: string;
  tone: "pos" | "neg" | "neutral";
}> = ({ icon, label, value, sub, tone }) => {
  const toneCls =
    tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-rose-600" : "text-moss-800";
  return (
    <div className="rounded-xl border border-moss-200/80 bg-white/80 p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ink-soft">{label}</span>
        <span className="text-base leading-none opacity-80">{icon}</span>
      </div>
      <div className={`mt-1 truncate font-mono text-lg font-semibold ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-ink-muted">{sub}</div>}
    </div>
  );
};

/** 侧栏分区（标签 + 内容） */
const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="mb-5">
    <div className="mb-2 text-xs font-semibold text-ink-soft">{label}</div>
    {children}
  </div>
);

const DiffView: React.FC<DiffViewProps> = ({ onExit }) => {
  const { t, locale } = useTranslation();

  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const [activeRoot, setActiveRoot] = useState<string>("");
  const [baseId, setBaseId] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");

  const [diff, setDiff] = useState<SnapshotDiff | null>(null);
  const [viewMode, setViewMode] = useState<"treemap" | "list">("treemap");
  const [statusFilter, setStatusFilter] = useState<DiffStatusFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 载入快照列表，默认选中最新扫描根路径的最早/最新两份
  useEffect(() => {
    let cancelled = false;
    listSnapshots()
      .then((list) => {
        if (cancelled) return;
        setSnapshots(list);
        if (list.length > 0) {
          const root = list[0]!.root_path;
          const group = list.filter((s) => s.root_path === root); // 列表已按 captured_at 倒序
          setActiveRoot(root);
          setBaseId(group[group.length - 1]!.id);
          setTargetId(group[0]!.id);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setSnapshotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 两个快照变化时自动对比
  useEffect(() => {
    if (!baseId || !targetId || baseId === targetId) {
      setDiff(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    diffSnapshots(baseId, targetId)
      .then((d) => {
        if (!cancelled) setDiff(d);
      })
      .catch((e) => {
        if (!cancelled) {
          setDiff(null);
          setError(String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [baseId, targetId]);

  const rootPaths = useMemo(
    () => Array.from(new Set(snapshots.map((s) => s.root_path))),
    [snapshots],
  );
  const rootGroup = useMemo(
    () => snapshots.filter((s) => s.root_path === activeRoot),
    [snapshots, activeRoot],
  );
  const baseOptions = rootGroup.filter((s) => s.id !== targetId);
  const targetOptions = rootGroup.filter((s) => s.id !== baseId);

  const handleRootChange = (root: string) => {
    setActiveRoot(root);
    const group = snapshots.filter((s) => s.root_path === root);
    setBaseId(group[group.length - 1]!.id);
    setTargetId(group[0]!.id);
  };

  const rootFile = useMemo(() => (diff ? diffToFileNode(diff.root) : null), [diff]);
  const diffMap = useMemo(() => (diff ? buildDiffMap(diff.root) : undefined), [diff]);

  const summary = diff?.summary;
  const categoryDiff = diff?.category_diff ?? [];
  const maxAbsDelta = Math.max(1, ...categoryDiff.map((c) => Math.abs(c.delta)));

  const selectCls =
    "rounded-lg border border-moss-200 bg-white px-2.5 py-1.5 text-xs text-moss-800 outline-none transition hover:border-moss-300 focus:border-moss-400";
  const chipBase = "rounded-full px-3 py-1 text-xs font-medium transition";
  const chipActive = "bg-moss-700 text-white";
  const chipInactive = "border border-moss-200 bg-white text-ink-soft hover:bg-moss-50";

  // 空态：还没有任何快照
  if (!snapshotsLoading && snapshots.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-ink-muted">
        <div className="text-5xl opacity-50">📸</div>
        <p className="text-sm">{t("diff.noSnapshots")}</p>
        <button
          type="button"
          onClick={onExit}
          className="rounded-lg border border-moss-200 bg-white px-4 py-2 text-sm text-moss-800 transition hover:bg-moss-50"
        >
          {t("diff.back")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-sand-50/40">
      {/* 顶部栏 */}
      <div className="flex shrink-0 items-center gap-3 border-b border-moss-200/70 bg-white/70 px-4 py-2.5 backdrop-blur-md">
        <button
          type="button"
          onClick={onExit}
          className="rounded-lg border border-moss-200 bg-white px-2.5 py-1 text-xs text-moss-800 transition hover:bg-moss-50"
        >
          {t("diff.back")}
        </button>
        <h1 className="font-display text-lg font-semibold text-moss-800">{t("diff.title")}</h1>
        <span className="ml-auto text-xs text-ink-muted">
          {snapshotsLoading || loading ? t("diff.loading") : ""}
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 左侧：树图 / 列表 */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col p-4">
          {diff && rootFile ? (
            viewMode === "treemap" ? (
              <Treemap
                data={rootFile}
                breadcrumb={[rootFile]}
                diffMap={diffMap}
                onNodeSelect={() => {}}
                onDrillInto={() => {}}
                onNavigateTo={() => {}}
                onNavigateUp={() => {}}
              />
            ) : (
              <DiffListView diffRoot={diff.root} statusFilter={statusFilter} />
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-muted">
              <div className="text-4xl opacity-50">🔍</div>
              <p className="text-sm">{loading ? t("diff.loading") : t("diff.selectPlaceholder")}</p>
            </div>
          )}
        </div>

        {/* 右侧：控制侧栏 */}
        <aside className="flex w-[340px] min-w-[280px] shrink-0 flex-col overflow-y-auto border-l border-moss-200/80 bg-white/55 px-4 py-4 backdrop-blur-md">
          <Section label={t("diff.rootPath")}>
            {rootPaths.length > 1 ? (
              <select
                value={activeRoot}
                onChange={(e) => handleRootChange(e.target.value)}
                className={`${selectCls} w-full`}
              >
                {rootPaths.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            ) : (
              <span
                className="flex min-w-0 items-center gap-1.5 rounded-lg bg-moss-100/70 px-2.5 py-1 font-mono text-xs text-moss-800"
                title={activeRoot}
              >
                <span className="shrink-0">📁</span>
                <span className="truncate">{activeRoot || "—"}</span>
              </span>
            )}
          </Section>

          <Section label={t("diff.selectTitle")}>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <label className="w-12 shrink-0 text-xs font-medium text-ink-soft">
                  {t("diff.base")}
                </label>
                <select
                  value={baseId}
                  onChange={(e) => setBaseId(e.target.value)}
                  className={`${selectCls} min-w-0 flex-1`}
                  disabled={baseOptions.length === 0}
                >
                  {baseOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatDate(s.captured_at, locale)} · {formatSize(s.total_size)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="w-12 shrink-0 text-xs font-medium text-ink-soft">
                  {t("diff.target")}
                </label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className={`${selectCls} min-w-0 flex-1`}
                  disabled={targetOptions.length === 0}
                >
                  {targetOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatDate(s.captured_at, locale)} · {formatSize(s.total_size)}
                    </option>
                  ))}
                </select>
              </div>
              {rootGroup.length < 2 && (
                <p className="text-xs text-rose-600">{t("diff.needMore")}</p>
              )}
              {error && <p className="text-xs text-rose-600">{error}</p>}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
              {t("diff.storageHint")}
            </p>
          </Section>

          {summary && (
            <Section label={t("diff.summaryTitle")}>
              <div className="grid grid-cols-2 gap-2">
                <StatCard
                  icon="📊"
                  label={t("diff.totalChange")}
                  value={signedSize(summary.total_delta)}
                  sub={`${formatSize(summary.total_old_size)} → ${formatSize(summary.total_new_size)}`}
                  tone={
                    summary.total_delta > 0 ? "pos" : summary.total_delta < 0 ? "neg" : "neutral"
                  }
                />
                <StatCard
                  icon="📈"
                  label={t("diff.grown")}
                  value={`${summary.grown_count}`}
                  sub={`+${formatSize(summary.grown_bytes)}`}
                  tone="pos"
                />
                <StatCard
                  icon="📉"
                  label={t("diff.shrunk")}
                  value={`${summary.shrunk_count}`}
                  sub={`-${formatSize(summary.shrunk_bytes)}`}
                  tone="neg"
                />
                <StatCard
                  icon="🔀"
                  label={t("diff.addedRemoved")}
                  value={`${summary.added_count} / ${summary.removed_count}`}
                  tone="neutral"
                />
              </div>
            </Section>
          )}

          {categoryDiff.length > 0 && (
            <Section label={t("diff.categoryBreakdown")}>
              <div className="flex flex-col gap-1.5">
                {categoryDiff.slice(0, 8).map((c) => (
                  <div key={c.category} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 truncate text-ink-soft">
                      {t(`categoryLabels.${c.category}` as Parameters<typeof t>[0])}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-sand-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(Math.abs(c.delta) / maxAbsDelta) * 100}%`,
                          backgroundColor: c.delta >= 0 ? "#2ecc71" : "#e74c3c",
                        }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right font-mono text-ink-soft">
                      {signedSize(c.delta)}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section label={t("diff.viewTitle")}>
            <div className="flex flex-col gap-2">
              <div className="flex overflow-hidden rounded-lg border border-moss-200">
                <button
                  type="button"
                  onClick={() => setViewMode("treemap")}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium transition ${
                    viewMode === "treemap"
                      ? "bg-moss-700 text-white"
                      : "bg-white text-ink-soft hover:bg-moss-50"
                  }`}
                >
                  {t("diff.viewTreemap")}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium transition ${
                    viewMode === "list"
                      ? "bg-moss-700 text-white"
                      : "bg-white text-ink-soft hover:bg-moss-50"
                  }`}
                >
                  {t("diff.viewList")}
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {(
                  ["all", "Grown", "Shrunk", "Unchanged", "Added", "Removed"] as DiffStatusFilter[]
                ).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setStatusFilter(f)}
                    className={`${chipBase} ${statusFilter === f ? chipActive : chipInactive}`}
                  >
                    {f === "all"
                      ? t("diff.filterAll")
                      : t(`diffStatusLabels.${f}` as Parameters<typeof t>[0])}
                  </button>
                ))}
              </div>
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
};

export default DiffView;
