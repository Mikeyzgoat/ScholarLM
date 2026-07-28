import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
export function AppLayout() {
  return (
    <div className="scholar-shell flex min-h-screen">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <Topbar />
        <Outlet />
      </div>
    </div>
  );
}
