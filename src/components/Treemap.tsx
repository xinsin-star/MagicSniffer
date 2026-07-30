//! MagicSniffer 风格矩形树图（Treemap）组件
//!
//! 实现 Squarified Treemap 算法，生成类似 SpaceSniffer 的可视化效果。
//! 支持：
//! - 递归布局（目录嵌套）
//! - 鼠标悬停高亮
//! - 点击选中查看详情
//! - 路径导航（面包屑）

import React, { useMemo, useRef, useState } from "react";
import type { FileNode, TreemapNode } from "../types";
import { CATEGORY_INFO, formatSize } from "../types";

// ─── Treemap 组件 Props ─────────────────────────────────────────────────────────
interface TreemapProps {
  /** 根节点文件树数据 */
  data: FileNode | null;
  /** 节点点击回调 */
  onNodeSelect: (node: FileNode) => void;
  /** 当前选中的路径 */
  selectedPath?: string;
  /** 是否处于边扫边预览（实时更新）模式 */
  isLive?: boolean;
}

// ─── Treemap 布局计算参数 ──────────────────────────────────────────────────────
interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * MagicSniffer 风格的 Squarified Treemap 组件
 *
 * 使用 SVG 渲染，支持递归嵌套和交互
 */
const Treemap: React.FC<TreemapProps> = ({
  data,
  onNodeSelect,
  isLive = false,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredNode, setHoveredNode] = useState<TreemapNode | null>(null);

  // 计算 treemap 布局
  const layout = useMemo(() => {
    if (!data) return null;
    return computeTreemapLayout(data, 0, 0, 100, 100);
  }, [data]);

  if (!layout) {
    return (
      <div className={`treemap-container ${isLive ? "treemap-live" : ""}`}>
        <div className="empty-state">
          <div className="empty-state-icon">📂</div>
          <div className="empty-state-text">
            {isLive
              ? "正在收集目录信息，预览即将出现…"
              : "选择目录并开始扫描以查看空间分布"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`treemap-container ${isLive ? "treemap-live" : ""}`}>
      {isLive && (
        <div className="treemap-live-banner">边扫描边预览 · 布局会随扫描持续更新</div>
      )}
      <svg
        ref={svgRef}
        className="treemap-svg"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid meet"
      >
        {renderTreemapNode(layout, hoveredNode, setHoveredNode, onNodeSelect)}
      </svg>

      {/* 悬停信息提示 */}
      {hoveredNode && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            background: "rgba(0,0,0,0.85)",
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 12,
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          <div style={{ color: "#e0e0e0", fontWeight: 600 }}>
            {hoveredNode.name}
          </div>
          <div style={{ color: hoveredNode.color }}>
            {formatSize(hoveredNode.size)} —{" "}
            {CATEGORY_INFO[hoveredNode.category]?.label ?? "其他"}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── 递归渲染 Treemap SVG 节点 ──────────────────────────────────────────────────

/**
 * 递归渲染 Treemap 节点为 SVG 矩形组
 *
 * @param node     - Treemap 布局节点
 * @param hovered  - 当前悬停节点
 * @param onHover  - 悬停状态设置回调
 * @param onSelect - 点击选择回调
 * @param depth    - 当前递归深度
 */
function renderTreemapNode(
  node: TreemapNode,
  hovered: TreemapNode | null,
  onHover: (n: TreemapNode | null) => void,
  onSelect: (n: FileNode) => void,
  depth: number = 0
): React.ReactNode[] {
  const elements: React.ReactNode[] = [];

  // 跳过过小的矩形（4x4 以下不渲染，避免视觉噪点）
  const minSize = 0.5; // 百分比
  if (node.width < minSize || node.height < minSize) return elements;

  // SVG 坐标（将百分比映射到 1000x1000 视口）
  const x = (node.x / 100) * 1000;
  const y = (node.y / 100) * 1000;
  const w = (node.width / 100) * 1000;
  const h = (node.height / 100) * 1000;

  const isHovered = hovered?.path === node.path;

  // 渲染矩形块
  elements.push(
    <rect
      key={`rect-${node.path}`}
      x={x}
      y={y}
      width={w}
      height={h}
      fill={node.color}
      opacity={isHovered ? 0.85 : 0.75}
      className="treemap-rect"
      onMouseEnter={() => onHover(node)}
      onMouseLeave={() => onHover(null)}
      onClick={() =>
        onSelect({
          name: node.name,
          path: node.path,
          size: node.size,
          is_dir: node.is_dir,
          category: node.category,
          risk_level: node.risk_level,
          modified_at: 0,
        })
      }
    />
  );

  // 添加文本标签（仅矩形足够大时）
  const labelSize = Math.min(w, h);
  const fontSize = Math.max(10, Math.min(24, labelSize / 6));

  if (w > 40 && h > 25) {
    elements.push(
      <text
        key={`label-${node.path}`}
        x={x + 6}
        y={y + fontSize + 4}
        fontSize={fontSize}
        className="treemap-label"
      >
        {truncateText(node.name, w, fontSize)}
      </text>
    );
  }

  // 添加大小标签
  if (w > 60 && h > 40) {
    elements.push(
      <text
        key={`size-${node.path}`}
        x={x + 6}
        y={y + fontSize * 2 + 8}
        fontSize={Math.max(9, fontSize - 2)}
        className="treemap-size-label"
      >
        {formatSize(node.size)}
      </text>
    );
  }

  // 递归渲染子节点（仅当前节点未被选中展开时显示子节点）
  if (node.children && depth < 8) {
    for (const child of node.children) {
      elements.push(
        ...renderTreemapNode(child, hovered, onHover, onSelect, depth + 1)
      );
    }
  }

  return elements;
}

// ─── 文本截断 ───────────────────────────────────────────────────────────────────

/** 根据可用宽度截断文本 */
function truncateText(text: string, maxWidth: number, fontSize: number): string {
  // 每个字符大约占 fontSize * 0.6 像素
  const charWidth = fontSize * 0.6;
  const maxChars = Math.floor(maxWidth / charWidth);

  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(1, maxChars - 2)) + "..";
}

// ─── Squarified Treemap 布局算法 ────────────────────────────────────────────────

/**
 * 计算 Squarified Treemap 布局
 *
 * 算法核心思想：
 * 1. 按大小降序排列子节点
 * 2. 逐个添加节点到当前行，同时计算长宽比
 * 3. 当长宽比开始恶化时，将当前行布局为一行，开始新行
 * 4. 递归处理子目录
 *
 * 参考：Bruls, Huizing, van Wijk. "Squarified Treemaps" (2000)
 */
function computeTreemapLayout(
  node: FileNode,
  x: number,
  y: number,
  width: number,
  height: number
): TreemapNode {
  const color = CATEGORY_INFO[node.category]?.color ?? "#bdc3c7";

  // 基本 Treemap 节点
  const result: TreemapNode = {
    name: node.name,
    path: node.path,
    size: node.size,
    x,
    y,
    width,
    height,
    color,
    category: node.category,
    risk_level: node.risk_level,
    is_dir: node.is_dir,
  };

  // 如果有子节点，计算子节点布局
  if (node.children && node.children.length > 0) {
    // 过滤掉大小为 0 的节点
    const validChildren = node.children.filter((c) => c.size > 0);

    if (validChildren.length > 0) {
      // 按大小降序排列
      const sorted = [...validChildren].sort((a, b) => b.size - a.size);

      // 计算子节点布局
      const childLayouts = squarify(sorted, x, y, width, height);

      // 递归处理子节点（如果子节点是目录且有下级）
      result.children = childLayouts.map((layout, i): TreemapNode => {
        const child = sorted[i]!;
        if (child.is_dir && child.children && child.children.length > 0) {
          return computeTreemapLayout(
            child,
            layout.x,
            layout.y,
            layout.width,
            layout.height
          );
        }
        // 叶子节点 - 直接返回布局
        return {
          name: child.name,
          path: child.path,
          size: child.size,
          x: layout.x,
          y: layout.y,
          width: layout.width,
          height: layout.height,
          color: CATEGORY_INFO[child.category]?.color ?? "#bdc3c7",
          category: child.category,
          risk_level: child.risk_level,
          is_dir: child.is_dir,
        };
      });
    }
  }

  return result;
}

/**
 * Squarify 算法核心实现
 *
 * 将一系列矩形排列到给定区域内，使每个矩形尽可能接近正方形。
 * 这是 Treemap 视觉美观的关键算法。
 */
function squarify(
  items: FileNode[],
  x: number,
  y: number,
  width: number,
  height: number
): LayoutRect[] {
  if (items.length === 0) return [];

  const totalSize = items.reduce((sum, item) => sum + item.size, 0);
  if (totalSize === 0) return items.map(() => ({ x, y, width: 0, height: 0 }));

  const layouts: LayoutRect[] = [];
  let remaining = items;
  let currentX = x;
  let currentY = y;
  let currentWidth = width;
  let currentHeight = height;

  while (remaining.length > 0) {
    // 确定当前行的最佳分割点
    const splitIndex = findBestSplit(remaining, currentWidth, currentHeight, totalSize);

    // 取出当前行的项目
    const rowItems = remaining.slice(0, splitIndex);
    remaining = remaining.slice(splitIndex);

    // 计算当前行各类数值
    const rowSize = rowItems.reduce((sum, item) => sum + item.size, 0);
    const rowRatio = rowSize / totalSize;

    if (currentWidth >= currentHeight) {
      // 水平分割：横向排列
      let xOffset = currentX;
      for (const item of rowItems) {
        layouts.push({
          x: xOffset,
          y: currentY,
          width: currentWidth * (item.size / rowSize),
          height: currentHeight * rowRatio,
        });
        xOffset += currentWidth * (item.size / rowSize);
      }
      currentY += currentHeight * rowRatio;
      currentHeight -= currentHeight * rowRatio;
    } else {
      // 垂直分割：纵向排列
      let yOffset = currentY;
      for (const item of rowItems) {
        layouts.push({
          x: currentX,
          y: yOffset,
          width: currentWidth * rowRatio,
          height: currentHeight * (item.size / rowSize),
        });
        yOffset += currentHeight * (item.size / rowSize);
      }
      currentX += currentWidth * rowRatio;
      currentWidth -= currentWidth * rowRatio;
    }

    // 更新剩余项目的总面积比例
    const remainingSize = remaining.reduce((sum, item) => sum + item.size, 0);
    if (remainingSize === 0) break;
  }

  return layouts;
}

/**
 * 找到最佳分割点
 *
 * 逐项检查添加元素到当前行的长宽比，
 * 当长宽比开始变差时停止。
 */
function findBestSplit(
  items: FileNode[],
  width: number,
  height: number,
  totalSize: number
): number {
  if (items.length <= 1) return items.length;

  let bestIndex = 1;
  let bestAspect = Infinity;

  for (let i = 1; i <= items.length; i++) {
    const rowItems = items.slice(0, i);
    const rowSize = rowItems.reduce((sum, item) => sum + item.size, 0);
    const rowRatio = rowSize / totalSize;

    const rowLength = width >= height ? width : height;
    const rowThickness = width >= height
      ? height * rowRatio
      : width * rowRatio;

    // 计算行内所有矩形的最大长宽比
    let maxAspect = 0;
    for (const item of rowItems) {
      const itemRatio = item.size / rowSize;
      const itemLength = rowLength * itemRatio;

      const aspect = itemLength > rowThickness
        ? itemLength / rowThickness
        : rowThickness / itemLength;

      if (aspect > maxAspect) maxAspect = aspect;
    }

    // 如果长宽比开始变差，返回上一个索引
    if (maxAspect > bestAspect) {
      return bestIndex;
    }

    bestIndex = i;
    bestAspect = maxAspect;
  }

  return bestIndex;
}

export default Treemap;
