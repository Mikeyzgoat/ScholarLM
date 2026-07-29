import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Files,
  GitFork,
  Home,
  StickyNote,
} from "lucide-react";
import { Link, useLocation, useParams } from "react-router";
import { useEffect, useRef } from "react";
import { listDocuments } from "../../services/documents";
import sidebarLogo from "../../assets/sidebar-logo.png";
export function Sidebar({
  collapsed,
  onToggle,
  onCollapse,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onCollapse: () => void;
}) {
  const { documentId } = useParams();
  const location = useLocation();
  const q = useQuery({ queryKey: ["documents"], queryFn: listDocuments });
  const sidebar = useRef<HTMLElement>(null);
  const navClass = (active: boolean, spaced = false) =>
    `${spaced ? "mt-1 " : ""}flex rounded p-2 ${
      active
        ? "bg-stone-700 text-white"
        : "text-stone-400 hover:bg-stone-800 hover:text-stone-200"
    } ${collapsed ? "justify-center" : "gap-2"}`;
  useEffect(() => {
    if (collapsed) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !sidebar.current?.contains(event.target)
      )
        onCollapse();
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCollapse();
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [collapsed, onCollapse]);
  return (
    <aside
      ref={sidebar}
      className="relative hidden w-[72px] shrink-0 lg:block"
    >
      <div
        className={`${collapsed ? "w-[72px] px-3" : "w-56 px-4"} absolute inset-y-0 left-0 z-40 border-r bg-stone-900 py-4 text-stone-200 shadow-[16px_0_40px_rgba(0,0,0,0.16)] transition-[width,padding] duration-300 ease-out will-change-[width]`}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Open navigation" : "Close navigation"}
          title={collapsed ? "Open navigation" : "Close navigation"}
          className="absolute -right-3 top-16 z-20 grid h-7 w-7 place-items-center rounded-full border border-orange-400/25 bg-neutral-950 text-stone-400 shadow-lg hover:text-orange-300"
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
        <Link
          to="/"
          title="ScholarLM"
          className={`mb-8 flex items-center font-semibold text-white ${collapsed ? "justify-center" : "gap-2.5"}`}
        >
          <img
            src={sidebarLogo}
            alt=""
            className="brand-mark h-10 w-10 rounded-full object-cover shadow-[0_0_18px_rgba(249,115,22,0.28)]"
          />
          {!collapsed && (
            <span>
              Scholar<span className="text-orange-500">LM</span>
            </span>
          )}
        </Link>
        <Link
          to="/"
          title="Home"
          className={navClass(location.pathname === "/")}
        >
          <Home size={18} />
          {!collapsed && "Home"}
        </Link>
        <Link
          to="/notes"
          title="Notes"
          className={navClass(location.pathname === "/notes", true)}
        >
          <StickyNote size={18} />
          {!collapsed && "Notes"}
        </Link>
        <Link
          to="/upload"
          title="Documents"
          className={navClass(
            location.pathname === "/upload" ||
              location.pathname.startsWith("/workspace/"),
            true,
          )}
        >
          <Files size={18} />
          {!collapsed && "Documents"}
        </Link>
        <Link
          to="/graph"
          title="Knowledge graph"
          className={navClass(location.pathname.startsWith("/graph"), true)}
        >
          <GitFork size={18} />
          {!collapsed && "Knowledge graph"}
        </Link>
        {!collapsed && (
          <>
            <p className="mb-2 mt-7 text-xs uppercase text-stone-500">
              Recent
            </p>
            {q.data?.slice(0, 6).map((d) => (
              <Link
                key={d.id}
                to={`/workspace/${d.id}`}
                className={`block truncate rounded p-2 text-sm ${documentId === d.id ? "bg-stone-700 text-white" : "hover:bg-stone-800"}`}
              >
                {d.name}
              </Link>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}
