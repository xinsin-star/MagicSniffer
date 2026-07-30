//! 文件/目录详情面板

import React, { useEffect, useState } from "react";
import type { FileNode, RiskDetail } from "../types";
import { CATEGORY_INFO, RISK_LEVEL_INFO, formatSize, formatDate } from "../types";
import { assessDeleteRisk } from "../hooks/useTauriCommand";

interface FileDetailPanelProps {
  node: FileNode | null;
}

const FileDetailPanel: React.FC<FileDetailPanelProps> = ({ node }) => {
  const [riskDetail, setRiskDetail] = useState<RiskDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!node) {
      setRiskDetail(null);
      return;
    }

    let cancelled = false;
    const loadRiskInfo = async () => {
      setIsLoading(true);
      try {
        const detail = await assessDeleteRisk(node.path);
        if (!cancelled) setRiskDetail(detail);
      } catch {
        if (!cancelled) setRiskDetail(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadRiskInfo();
    return () => {
      cancelled = true;
    };
  }, [node?.path]);

  if (!node) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center text-ink-muted">
        <div className="text-3xl opacity-50">👆</div>
        <p className="max-w-[220px] text-sm leading-relaxed">
          点击树图中的色块或搜索结果，查看详情与删除风险
        </p>
      </div>
    );
  }

  const categoryInfo = CATEGORY_INFO[node.category];
  const riskInfo = RISK_LEVEL_INFO[node.risk_level];

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      <h3 className="mb-3 break-all text-sm font-semibold text-ink">
        {node.is_dir ? "📁 " : "📄 "}
        {node.name}
      </h3>

      <Section title="基本信息">
        <Row label="类型" value={node.is_dir ? "目录" : `文件${node.extension ? ` (.${node.extension})` : ""}`} />
        <Row label="大小" value={formatSize(node.size)} mono />
        {node.modified_at > 0 && (
          <Row label="修改时间" value={formatDate(node.modified_at)} mono />
        )}
        <Row label="路径" value={node.path} mono small />
      </Section>

      <Section title="分类">
        <div className="flex items-center justify-between py-1 text-sm">
          <span className="text-ink-soft">类别</span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{
              backgroundColor: `${categoryInfo?.color}22`,
              color: categoryInfo?.color,
            }}
          >
            {categoryInfo?.label ?? node.category}
          </span>
        </div>
        <div className="flex items-center justify-between py-1 text-sm">
          <span className="text-ink-soft">删除风险</span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{
              backgroundColor: `${riskInfo.color}22`,
              color: riskInfo.color,
            }}
          >
            {riskInfo.label}
          </span>
        </div>
      </Section>

      {isLoading && (
        <Section title="风险评估">
          <p className="px-1 text-xs text-ink-muted">正在分析…</p>
        </Section>
      )}

      {riskDetail && !isLoading && (
        <Section title="风险评估">
          <p className="mb-2 rounded-lg bg-moss-50 px-2.5 py-2 text-xs leading-relaxed text-ink-soft">
            {riskDetail.explanation}
          </p>
          <p className="rounded-lg border-l-[3px] border-moss-400 bg-sand-50 px-2.5 py-2 text-xs leading-relaxed text-moss-700">
            {riskDetail.recommendation}
          </p>
        </Section>
      )}

      {node.children && node.children.length > 0 && (
        <Section title={`内容概览 (${node.children.length} 项)`}>
          {[...node.children]
            .sort((a, b) => b.size - a.size)
            .slice(0, 10)
            .map((child) => {
              const childCatInfo = CATEGORY_INFO[child.category];
              return (
                <div
                  key={child.path}
                  className="flex items-center gap-2 py-0.5 text-[11px]"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: childCatInfo?.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-ink-soft">
                    {child.is_dir ? "📁 " : "📄 "}
                    {child.name}
                  </span>
                  <span className="shrink-0 font-mono text-ink-muted">
                    {formatSize(child.size)}
                  </span>
                </div>
              );
            })}
        </Section>
      )}
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="mb-4">
    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
      {title}
    </div>
    {children}
  </div>
);

const Row: React.FC<{
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
}> = ({ label, value, mono, small }) => (
  <div className="flex items-start justify-between gap-3 py-1 text-sm">
    <span className="shrink-0 text-ink-soft">{label}</span>
    <span
      className={`max-w-[200px] text-right text-ink ${mono ? "font-mono" : ""} ${
        small ? "text-[10px] break-all" : "text-xs"
      }`}
    >
      {value}
    </span>
  </div>
);

export default FileDetailPanel;
