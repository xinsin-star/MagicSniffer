//! 快照对比路由页

import React from "react";
import { useNavigate } from "react-router-dom";
import DiffView from "../components/DiffView";

const DiffPage: React.FC = () => {
  const navigate = useNavigate();
  return <DiffView onExit={() => navigate("/")} />;
};

export default DiffPage;
