//! 文件/目录详情面板

import React, { useEffect, useState } from "react";
import type { FileNode, RiskDetail } from "../types";
import { CATEGORY_COLORS, RISK_LEVEL_COLORS, formatSize, formatDate } from "../types";
import { assessDeleteRisk } from "../hooks/useTauriCommand";
import { useTranslation } from "../i18n/useTranslation";

interface FileDetailPanelProps {
  node: FileNode | null;
}

const FileDetailPanel: React.FC<FileDetailPanelProps> = ({ node }) => {
  const { t, locale } = useTranslation();
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
        const detail = await assessDeleteRisk(node.path, locale);
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
        <p className="max-w-[220px] text-sm leading-relaxed">{t("detail.clickHint")}</p>
      </div>
    );
  }

  const catColor = CATEGORY_COLORS[node.category];
  const riskColor = RISK_LEVEL_COLORS[node.risk_level];

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      <h3 className="mb-3 break-all text-sm font-semibold text-ink">
        {node.is_dir ? "📁 " : "📄 "}
        {node.name}
      </h3>

      <Section title={t("detail.basicInfo")}>
        <Row
          label={t("detail.type")}
          value={
            node.is_dir
              ? t("detail.directory")
              : t("detail.fileWithExt", { ext: node.extension ?? "" })
          }
        />
        <Row label={t("detail.size")} value={formatSize(node.size)} mono />
        {node.modified_at > 0 && (
          <Row label={t("detail.modified")} value={formatDate(node.modified_at, locale)} mono />
        )}
        <Row label={t("detail.path")} value={node.path} mono small />
      </Section>

      <Section title={t("detail.categorySection")}>
        <div className="flex items-center justify-between py-1 text-sm">
          <span className="text-ink-soft">{t("detail.category")}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{
              backgroundColor: `${catColor}22`,
              color: catColor,
            }}
          >
            {t(`categoryLabels.${node.category}` as Parameters<typeof t>[0])}
          </span>
        </div>
        <div className="flex items-center justify-between py-1 text-sm">
          <span className="text-ink-soft">{t("detail.risk")}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{
              backgroundColor: `${riskColor}22`,
              color: riskColor,
            }}
          >
            {t(`riskLabels.${node.risk_level}` as Parameters<typeof t>[0])}
          </span>
        </div>
      </Section>

      {isLoading && (
        <Section title={t("detail.riskAssessment")}>
          <p className="px-1 text-xs text-ink-muted">{t("detail.analyzing")}</p>
        </Section>
      )}

      {riskDetail && !isLoading && (
        <Section title={t("detail.riskAssessment")}>
          <p className="mb-2 rounded-lg bg-moss-50 px-2.5 py-2 text-xs leading-relaxed text-ink-soft">
            {riskDetail.explanation}
          </p>
          <p className="rounded-lg border-l-[3px] border-moss-400 bg-sand-50 px-2.5 py-2 text-xs leading-relaxed text-moss-700">
            {riskDetail.recommendation}
          </p>
        </Section>
      )}

      {node.children && node.children.length > 0 && (
        <Section title={t("detail.contentsOverview", { count: node.children.length })}>
          {[...node.children]
            .sort((a, b) => b.size - a.size)
            .slice(0, 10)
            .map((child) => {
              return (
                <div key={child.path} className="flex items-center gap-2 py-0.5 text-[11px]">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: CATEGORY_COLORS[child.category] }}
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

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
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
