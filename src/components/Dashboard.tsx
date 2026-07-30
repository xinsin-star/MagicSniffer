//! Dashboard — 清新自然首页概览

import React from "react";
import type { CategorySummary, SystemOverview } from "../types";
import { CATEGORY_INFO, formatSize } from "../types";

interface DashboardProps {
  overview: SystemOverview | null;
  onStartScan: () => void;
  onQuickScan: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  overview,
  onStartScan,
  onQuickScan,
}) => {
  if (!overview) {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto px-8 py-10">
        <h1 className="font-display text-3xl font-semibold text-moss-800">MagicSniffer</h1>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-ink-muted">
          <div className="text-4xl opacity-60">🌿</div>
          <p className="text-sm">正在加载系统存储信息…</p>
        </div>
      </div>
    );
  }

  const usedPct = ((overview.used_space / overview.total_space) * 100).toFixed(1);
  const freePct = ((overview.free_space / overview.total_space) * 100).toFixed(1);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-8 py-10">
      <div className="mb-8 max-w-2xl">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-moss-800">
          MagicSniffer
        </h1>
        <p className="mt-2 text-base text-ink-soft">
          用清爽的矩形树图看清磁盘空间去向，边扫边预览，顺手找回被遗忘的大文件。
        </p>
      </div>

      <div className="mb-8 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="总容量" value={formatSize(overview.total_space)} sub={`${formatSize(overview.free_space)} 可用`} />
        <StatCard label="已用空间" value={formatSize(overview.used_space)} sub={`${usedPct}% 已使用`} />
        <StatCard
          label="可用空间"
          value={formatSize(overview.free_space)}
          sub={`${freePct}% 可用`}
          accent
        />
      </div>

      <div className="mb-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onStartScan}
          className="rounded-xl bg-moss-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-moss-500"
        >
          开始完整扫描
        </button>
        <button
          type="button"
          onClick={onQuickScan}
          className="rounded-xl border border-moss-300 bg-white/70 px-5 py-2.5 text-sm font-medium text-moss-800 transition hover:border-moss-400 hover:bg-moss-50"
        >
          快速扫描用户目录
        </button>
      </div>

      {overview.category_summary.length > 1 && (
        <div className="max-w-4xl rounded-2xl border border-moss-200/80 bg-white/70 p-5 shadow-sm backdrop-blur-sm">
          <CategoryBarChart summary={overview.category_summary} />
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}> = ({ label, value, sub, accent }) => (
  <div className="rounded-2xl border border-moss-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-sm">
    <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</div>
    <div
      className={`mt-1 font-mono text-2xl font-semibold ${
        accent ? "text-moss-600" : "text-ink"
      }`}
    >
      {value}
    </div>
    <div className="mt-1 text-xs text-ink-soft">{sub}</div>
  </div>
);

const CategoryBarChart: React.FC<{ summary: CategorySummary[] }> = ({ summary }) => {
  const maxSize = Math.max(...summary.map((s) => s.total_size), 1);

  return (
    <div>
      <div className="mb-3 text-sm font-semibold text-moss-800">存储空间分类</div>
      <div className="flex flex-col gap-2">
        {summary
          .filter((s) => s.total_size > 0)
          .sort((a, b) => b.total_size - a.total_size)
          .map((s) => {
            const info = CATEGORY_INFO[s.category];
            const barWidth = (s.total_size / maxSize) * 100;
            return (
              <div key={s.category} className="flex items-center gap-2">
                <div
                  className="h-5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: info?.color }}
                />
                <div className="w-20 shrink-0 text-xs text-ink-soft">
                  {info?.label ?? s.category}
                </div>
                <div className="h-5 flex-1 overflow-hidden rounded-md bg-moss-50">
                  <div
                    className="h-full rounded-md transition-[width] duration-500"
                    style={{ width: `${barWidth}%`, backgroundColor: info?.color }}
                  />
                </div>
                <div className="w-16 shrink-0 text-right font-mono text-[11px] text-ink-muted">
                  {formatSize(s.total_size)}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default Dashboard;
