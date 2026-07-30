//! 文件/目录详情面板
//!
//! 显示选中文件或目录的详细信息，包括大小、分类、安全风险和删除建议。
//! 支持调用 Rust 后端获取详细的风险评估数据。

import React, { useEffect, useState } from "react";
import type { FileNode, RiskDetail } from "../types";
import { CATEGORY_INFO, RISK_LEVEL_INFO, formatSize, formatDate } from "../types";
import { assessDeleteRisk } from "../hooks/useTauriCommand";

interface FileDetailPanelProps {
  /** 选中的文件节点 */
  node: FileNode | null;
  /** 导航到父目录的回调 */
  onNavigateUp?: (path: string) => void;
}

/** 文件详情面板 */
const FileDetailPanel: React.FC<FileDetailPanelProps> = ({ node }) => {
  const [riskDetail, setRiskDetail] = useState<RiskDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  /** 当选中节点变化时，加载风险评估详情 */
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
        if (!cancelled) {
          setRiskDetail(detail);
        }
      } catch {
        if (!cancelled) {
          setRiskDetail(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadRiskInfo();
    return () => {
      cancelled = true;
    };
  }, [node?.path]);

  if (!node) {
    return (
      <div className="detail-panel">
        <div className="empty-state" style={{ padding: 40 }}>
          <div className="empty-state-icon">👆</div>
          <div className="empty-state-text">
            点击 Treemap 中的矩形块或搜索结果以查看详情
          </div>
        </div>
      </div>
    );
  }

  const categoryInfo = CATEGORY_INFO[node.category];
  const riskInfo = RISK_LEVEL_INFO[node.risk_level];

  return (
    <div className="detail-panel">
      <div className="detail-title">
        {node.is_dir ? "📁 " : "📄 "}
        {node.name}
      </div>

      {/* 基本信息 */}
      <div className="detail-section">
        <div className="detail-section-title">基本信息</div>
        <div className="detail-row">
          <span className="detail-label">类型</span>
          <span className="detail-value">
            {node.is_dir ? "目录" : `文件${node.extension ? ` (.${node.extension})` : ""}`}
          </span>
        </div>
        <div className="detail-row">
          <span className="detail-label">大小</span>
          <span className="detail-value">{formatSize(node.size)}</span>
        </div>
        {node.modified_at > 0 && (
          <div className="detail-row">
            <span className="detail-label">修改时间</span>
            <span className="detail-value">
              {formatDate(node.modified_at)}
            </span>
          </div>
        )}
        <div className="detail-row">
          <span className="detail-label">路径</span>
          <span
            className="detail-value"
            style={{
              fontSize: 10,
              maxWidth: 200,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              wordBreak: "break-all",
            }}
          >
            {node.path}
          </span>
        </div>
      </div>

      {/* 分类信息 */}
      <div className="detail-section">
        <div className="detail-section-title">分类</div>
        <div className="detail-row">
          <span className="detail-label">类别</span>
          <span
            className="detail-badge"
            style={{
              backgroundColor: categoryInfo?.color + "33",
              color: categoryInfo?.color,
            }}
          >
            {categoryInfo?.label ?? node.category}
          </span>
        </div>
        <div className="detail-row">
          <span className="detail-label">删除风险</span>
          <span
            className="detail-badge"
            style={{
              backgroundColor: riskInfo.color + "33",
              color: riskInfo.color,
            }}
          >
            {riskInfo.label}
          </span>
        </div>
      </div>

      {/* 风��评估详情（从 Rust 后端获取） */}
      {isLoading && (
        <div className="detail-section">
          <div className="detail-section-title">风险评估</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", padding: 8 }}>
            正在分析...
          </div>
        </div>
      )}

      {riskDetail && !isLoading && (
        <div className="detail-section">
          <div className="detail-section-title">风险评估</div>
          <div className="detail-explanation">
            {riskDetail.explanation}
          </div>
          <div className="detail-recommendation">
            💡 {riskDetail.recommendation}
          </div>
        </div>
      )}

      {/* 子目录统计 */}
      {node.children && node.children.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-title">
            内容概览 ({node.children.length} 项)
          </div>
          <div style={{ fontSize: 12 }}>
            {node.children
              .sort((a, b) => b.size - a.size)
              .slice(0, 10)
              .map((child) => {
                const childCatInfo = CATEGORY_INFO[child.category];
                return (
                  <div
                    key={child.path}
                    className="detail-row"
                    style={{ padding: "2px 0", fontSize: 11 }}
                  >
                    <span
                      style={{
                        color: "var(--text-secondary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                        marginRight: 8,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          backgroundColor: childCatInfo?.color,
                          marginRight: 6,
                        }}
                      />
                      {child.is_dir ? "📁 " : "📄 "}
                      {child.name}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatSize(child.size)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileDetailPanel;
