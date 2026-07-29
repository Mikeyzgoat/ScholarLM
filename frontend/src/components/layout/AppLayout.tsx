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
  function collapseSidebar() {
    setSidebarCollapsed(true);
    localStorage.setItem("scholarlm-sidebar-collapsed", "true");
  }
  return (
    <div className="scholar-shell flex min-h-screen">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        onCollapse={collapseSidebar}
      />
      <div className="min-w-0 flex-1 transition-[width] duration-300 ease-out">
        <Topbar />
        <Outlet />
      </div>
    </div>
  );
}
