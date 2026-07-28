import { useQuery } from "@tanstack/react-query";
import { Files, GitFork, Home, StickyNote } from "lucide-react";
import { Link, useParams } from "react-router";
import { listDocuments } from "../../services/documents";
import sidebarLogo from "../../assets/sidebar-logo.png";
export function Sidebar() {
  const { documentId } = useParams();
  const q = useQuery({ queryKey: ["documents"], queryFn: listDocuments });
  return (
    <aside className="hidden w-56 shrink-0 border-r bg-stone-900 p-4 text-stone-200 lg:block">
      <Link
        to="/"
        className="mb-8 flex items-center gap-2.5 font-semibold text-white"
      >
        <img
          src={sidebarLogo}
          alt=""
          className="h-10 w-10 rounded-full object-cover shadow-[0_0_18px_rgba(249,115,22,0.28)]"
        />
        <span>
          Scholar<span className="text-orange-500">LM</span>
        </span>
      </Link>
      <Link to="/" className="flex gap-2 rounded p-2 hover:bg-stone-800">
        <Home size={18} />
        Home
      </Link>
      <Link
        to="/notes"
        className="mt-1 flex gap-2 rounded p-2 hover:bg-stone-800"
      >
        <StickyNote size={18} />
        Notes
      </Link>
      <Link
        to="/upload"
        className="mt-1 flex gap-2 rounded p-2 hover:bg-stone-800"
      >
        <Files size={18} />
        Documents
      </Link>
      <Link
        to="/graph"
        className="mt-1 flex gap-2 rounded p-2 hover:bg-stone-800"
      >
        <GitFork size={18} />
        Knowledge graph
      </Link>
      <p className="mb-2 mt-7 text-xs uppercase text-stone-500">Recent</p>
      {q.data?.slice(0, 6).map((d) => (
        <Link
          key={d.id}
          to={`/workspace/${d.id}`}
          className={`block truncate rounded p-2 text-sm ${documentId === d.id ? "bg-stone-700 text-white" : "hover:bg-stone-800"}`}
        >
          {d.name}
        </Link>
      ))}
    </aside>
  );
}
