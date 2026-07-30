//! Dashboard 仪表盘组件
//!
//! 显示系统存储概览，包括总容量、已用空间、各类别占比

import React from "react";
import type { CategorySummary, SystemOverview } from "../types";
import { CATEGORY_INFO, formatSize } from "../types";

interface DashboardProps {
  /** 系统概览数据 */
  overview: SystemOverview | null;
  /** 开始扫描回调 */
  onStartScan: () => void;
  /** 快速扫描已知目录回调 */
  onQuickScan: () => void;
}

/** Dashboard 组件 - 扫描前的首页概览视图 */
const Dashboard: React.FC<DashboardProps> = ({
  overview,
  onStartScan,
  onQuickScan,
}) => {
  if (!overview) {
    return (
      <div className="dashboard">
        <div className="dashboard-title">MagicSniffer</div>
        <div className="empty-state">
          <div className="empty-state-icon">💾</div>
          <div className="empty-state-text">
            正在加载系统存储信息...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-title">MagicSniffer</div>

      {/* 存储概览统计卡片 */}
      <div className="dashboard-stats-grid">
        <StatCard
          label="总容量"
          value={formatSize(overview.total_space)}
          sub={`${formatSize(overview.free_space)} 可用`}
        />
        <StatCard
          label="已用空间"
          value={formatSize(overview.used_space)}
          sub={`${((overview.used_space / overview.total_space) * 100).toFixed(1)}% 已使用`}
        />
        <StatCard
          label="可用空间"
          value={formatSize(overview.free_space)}
          sub={`${((overview.free_space / overview.total_space) * 100).toFixed(1)}% 可用`}
          accent
        />
      </div>

      {/* 操作按钮 */}
      <div className="dashboard-actions">
        <button className="btn-primary" onClick={onStartScan}>
          🔍 扫描主目录
        </button>
        <button className="btn-secondary" onClick={onQuickScan}>
          ⚡ 快速扫描已知目录
        </button>
      </div>

      {/* 分类使用情况柱状图 */}
      {overview.category_summary.length > 1 && (
        <div className="dashboard-chart-area">
          <CategoryBarChart summary={overview.category_summary} />
        </div>
      )}
    </div>
  );
};

/** 统计卡片子组件 */
const StatCard: React.FC<{
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}> = ({ label, value, sub, accent }) => (
  <div className="stat-card">
    <div className="stat-card-label">{label}</div>
    <div
      className="stat-card-value"
      style={accent ? { color: "var(--text-accent)" } : undefined}
    >
      {value}
    </div>
    <div className="stat-card-sub">{sub}</div>
  </div>
);

/** 分类柱状图组件 */
const CategoryBarChart: React.FC<{
  summary: CategorySummary[];
}> = ({ summary }) => {
  const maxSize = Math.max(...summary.map((s) => s.total_size));

  return (
    <div className="category-bar-chart">
      <div
        className="legend-title"
        style={{ marginBottom: 12 }}
      >
        存储空间分类分析
      </div>
      {summary
        .filter((s) => s.total_size > 0)
        .sort((a, b) => b.total_size - a.total_size)
        .map((s) => {
          const info = CATEGORY_INFO[s.category];
          const barWidth = maxSize > 0 ? (s.total_size / maxSize) * 100 : 0;

          return (
            <div key={s.category} className="category-bar-item">
              <div
                className="category-bar-color"
                style={{ backgroundColor: info?.color }}
              />
              <div className="category-bar-label">
                {info?.label ?? s.category}
              </div>
              <div className="category-bar-track">
                <div
                  className="category-bar-fill"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: info?.color,
                  }}
                />
              </div>
              <div className="category-bar-size">
                {formatSize(s.total_size)}
              </div>
            </div>
          );
        })}
    </div>
  );
};

export default Dashboard;
