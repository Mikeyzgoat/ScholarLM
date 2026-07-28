import { useState } from "react";
import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("scholarlm-sidebar-collapsed") === "true",
  );
  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      localStorage.setItem("scholarlm-sidebar-collapsed", String(next));
      return next;
    });
  }
  return (
    <div className="scholar-shell flex min-h-screen">
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <div className="min-w-0 flex-1">
        <Topbar />
        <Outlet />
      </div>
    </div>
  );
}
