//! 扫描结果路由页：树图 + 侧栏（搜索 / 分类 / 详情）

import React, { useEffect, useMemo } from "react";
import CategoryLegend from "../components/CategoryLegend";
import FileDetailPanel from "../components/FileDetailPanel";
import SearchPanel from "../components/SearchPanel";
import Treemap from "../components/Treemap";
import { selectActiveRoot, selectActiveSummary, useScanStore } from "../stores/scan.store";
import type { FileNode } from "../types";
import { filterTreeByCategory, findNodeByPath } from "../utils/tree";

const ResultsPage: React.FC = () => {
  const activeRoot = useScanStore(selectActiveRoot);
  const activeSummary = useScanStore(selectActiveSummary);
  const scanning = useScanStore((s) => s.scanning);
  const selectedNode = useScanStore((s) => s.selectedNode);
  const selectedCategory = useScanStore((s) => s.selectedCategory);
  const navStack = useScanStore((s) => s.navStack);
  const expandingPaths = useScanStore((s) => s.expandingPaths);
  const scanResult = useScanStore((s) => s.scanResult);
  const scanPath = useScanStore((s) => s.scanPath);

  const setSelectedNode = useScanStore((s) => s.setSelectedNode);
  const setSelectedCategory = useScanStore((s) => s.setSelectedCategory);
  const setNavStack = useScanStore((s) => s.setNavStack);
  const drillInto = useScanStore((s) => s.drillInto);
  const navigateTo = useScanStore((s) => s.navigateTo);
  const navigateUp = useScanStore((s) => s.navigateUp);
  const searchResultSelect = useScanStore((s) => s.searchResultSelect);

  /** 按分类过滤后的完整树 */
  const filteredTree = useMemo(
    () => filterTreeByCategory(activeRoot, selectedCategory),
    [activeRoot, selectedCategory],
  );

  /** 当前聚焦节点：导航栈顶，并在过滤树中重解析 */
  const focusNode = useMemo(() => {
    if (!filteredTree) return null;
    if (navStack.length === 0) return filteredTree;
    const top = navStack[navStack.length - 1]!;
    return findNodeByPath(filteredTree, top.path) ?? filteredTree;
  }, [filteredTree, navStack]);

  const breadcrumb = useMemo(() => {
    if (!filteredTree) return [];
    if (navStack.length === 0) return [filteredTree];
    const items: FileNode[] = [];
    for (const n of navStack) {
      const resolved = findNodeByPath(filteredTree, n.path);
      if (!resolved) break;
      items.push(resolved);
    }
    return items.length > 0 ? items : [filteredTree];
  }, [filteredTree, navStack]);

  // 新树到达且导航为空时初始化
  useEffect(() => {
    if (filteredTree && navStack.length === 0) {
      setNavStack([filteredTree]);
    }
  }, [filteredTree, navStack.length, setNavStack]);

  const rootPathForSearch = scanResult?.root_path ?? scanPath ?? "/";

  return (
    <>
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <Treemap
          data={focusNode}
          breadcrumb={breadcrumb}
          selectedPath={selectedNode?.path}
          isLoading={scanning}
          expandingPaths={expandingPaths}
          onNodeSelect={setSelectedNode}
          onDrillInto={(n) => void drillInto(n)}
          onNavigateTo={navigateTo}
          onNavigateUp={navigateUp}
        />
      </div>

      <aside className="flex w-[340px] min-w-[280px] flex-col overflow-hidden border-l border-moss-200/80 bg-white/55 backdrop-blur-md">
        <SearchPanel rootPath={rootPathForSearch} onResultSelect={searchResultSelect} />
        {activeSummary.length > 0 && (
          <CategoryLegend
            summaries={activeSummary}
            selectedCategory={selectedCategory}
            onCategorySelect={(cat) => {
              setSelectedCategory(cat);
              // 过滤变化时回到根
              if (activeRoot) setNavStack([activeRoot]);
            }}
          />
        )}
        <FileDetailPanel node={selectedNode} />
      </aside>
    </>
  );
};

export default ResultsPage;
