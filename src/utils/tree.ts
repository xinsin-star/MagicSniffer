//! 树结构纯函数工具
//!
//! 与 React / Tauri 解耦的纯逻辑：节点查找、导航栈构建、分类过滤、懒加载展开缓存。

import type { FileCategory, FileNode } from "../types";

/** 在树中按 path 精确查找节点 */
export function findNodeByPath(root: FileNode, path: string): FileNode | null {
  if (root.path === path) return root;
  if (!root.children) return null;
  for (const child of root.children) {
    if (path === child.path) return child;
    if (
      child.path === "/" ||
      path.startsWith(`${child.path}/`) ||
      (child.path.length > 1 && path.startsWith(child.path))
    ) {
      const found = findNodeByPath(child, path);
      if (found) return found;
    }
  }
  return null;
}

/** 从根构建到目标路径的完整导航栈 */
export function buildNavStack(root: FileNode, targetPath: string): FileNode[] {
  if (root.path === targetPath) return [root];

  const walk = (node: FileNode, trail: FileNode[]): FileNode[] | null => {
    if (node.path === targetPath) return trail;
    for (const child of node.children ?? []) {
      const found = walk(child, [...trail, child]);
      if (found) return found;
    }
    return null;
  };

  return walk(root, [root]) ?? [root];
}

/** 按分类过滤后的树（根到目标路径整条链保留），未命中返回 null */
export function filterTreeByCategory(
  root: FileNode | null,
  category: FileCategory | null,
): FileNode | null {
  if (!root) return null;
  if (!category) return root;

  const matchesCategory = (n: FileNode, cat: FileCategory): boolean => {
    if (n.category === cat) return true;
    if (n.children) return n.children.some((c) => matchesCategory(c, cat));
    return false;
  };

  const filter = (node: FileNode): FileNode | null => {
    if (
      node.category === category ||
      (node.is_dir && node.children?.some((c) => matchesCategory(c, category)))
    ) {
      return {
        ...node,
        children: node.children?.map(filter).filter((n): n is FileNode => n !== null),
      };
    }
    return null;
  };

  return filter(root);
}

/** 把 children 注入目标路径节点，返回克隆后的新树（从根到目标路径全部新建引用） */
export function injectChildren(root: FileNode, targetPath: string, children: FileNode[]): FileNode {
  if (root.path === targetPath) {
    return { ...root, children };
  }
  const newChildren: FileNode[] = [];
  let matched = false;
  for (const child of root.children ?? []) {
    if (
      !matched &&
      (child.path === targetPath ||
        targetPath.startsWith(`${child.path}/`) ||
        (child.path === "/" && targetPath.startsWith("/")))
    ) {
      newChildren.push(injectChildren(child, targetPath, children));
      matched = true;
    } else {
      newChildren.push(child);
    }
  }
  return { ...root, children: newChildren };
}

// ─── 懒加载展开缓存（localStorage 持久化）──────────────────────────────────────

const EXPANDED_CACHE_PREFIX = "magicsniffer.expand-cache";

/** 缓存 key = 扫描根路径，避免不同根之间互相覆盖 */
export function expandedCacheKey(rootPath: string | undefined): string | null {
  return rootPath ? `${EXPANDED_CACHE_PREFIX}::${rootPath}` : null;
}

/** 从 localStorage 读取持久化的展开缓存 */
export function loadPersistedCache(rootPath: string): Map<string, FileNode[]> {
  const key = expandedCacheKey(rootPath);
  if (!key) return new Map();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, FileNode[]>;
    return new Map(Object.entries(parsed));
  } catch (e) {
    console.warn("读取展开缓存失败:", e);
    return new Map();
  }
}

/** 持久化展开缓存到 localStorage */
export function persistCache(rootPath: string, cache: Map<string, FileNode[]>): void {
  const key = expandedCacheKey(rootPath);
  if (!key) return;
  try {
    const obj: Record<string, FileNode[]> = {};
    for (const [k, v] of cache) obj[k] = v;
    localStorage.setItem(key, JSON.stringify(obj));
  } catch (e) {
    console.warn("写入展开缓存失败:", e);
  }
}
