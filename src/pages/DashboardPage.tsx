//! 首页路由页：概览 + 懒加载磁盘面板 + 历史缓存

import React from "react";
import { useNavigate } from "react-router-dom";
import Dashboard from "../components/Dashboard";
import { useScanStore } from "../stores/scan.store";

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const overview = useScanStore((s) => s.overview);
  const cacheList = useScanStore((s) => s.cacheList);
  const startScan = useScanStore((s) => s.startScan);
  const quickScan = useScanStore((s) => s.quickScan);
  const openCacheEntry = useScanStore((s) => s.openCacheEntry);
  const clearCacheEntry = useScanStore((s) => s.clearCacheEntry);
  const clearAllCache = useScanStore((s) => s.clearAllCache);
  const resumeScan = useScanStore((s) => s.resumeScan);

  return (
    <Dashboard
      overview={overview}
      cacheList={cacheList}
      onStartScan={() => void startScan()}
      onQuickScan={() => void quickScan()}
      onOpenCacheEntry={(p) => void openCacheEntry(p)}
      onClearCacheEntry={(p) => void clearCacheEntry(p)}
      onClearAllCache={() => void clearAllCache()}
      onResumeScan={() => void resumeScan()}
      onOpenDiff={() => navigate("/diff")}
    />
  );
};

export default DashboardPage;
