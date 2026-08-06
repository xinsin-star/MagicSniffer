//! MagicSniffer - 应用根组件（布局壳：路由 + 全局 UI）

import React, { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import ScanProgressBar from "./components/ScanProgressBar";
import SettingsModal from "./components/SettingsModal";
import Toolbar from "./components/Toolbar";
import { useScanSetup } from "./hooks/useScanSetup";
import DashboardPage from "./pages/DashboardPage";
import DiffPage from "./pages/DiffPage";
import ResultsPage from "./pages/ResultsPage";
import { bindNavigate, useScanStore } from "./stores/scan.store";

const App: React.FC = () => {
  useScanSetup();
  const navigate = useNavigate();

  // 把导航器注入 store，供扫描动作内部切换页面
  useEffect(() => {
    bindNavigate((path) => navigate(path));
    return () => bindNavigate(() => {});
  }, [navigate]);

  const settingsOpen = useScanStore((s) => s.settingsOpen);
  const setSettingsOpen = useScanStore((s) => s.setSettingsOpen);
  const smartctlStatus = useScanStore((s) => s.smartctlStatus);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        smartctl={smartctlStatus}
      />

      <Toolbar />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/diff" element={<DiffPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      <ScanProgressBar />
    </div>
  );
};

export default App;
