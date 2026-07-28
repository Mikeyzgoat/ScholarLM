import { Columns2, FileText, PencilRuler } from "lucide-react";

export type WorkspaceMode = "split" | "pdf" | "canvas";

export function WorkspaceModeBar({
  mode,
  onModeChange,
}: {
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
}) {
  const options = [
    { id: "split" as const, label: "Split", icon: Columns2 },
    { id: "pdf" as const, label: "PDF", icon: FileText },
    { id: "canvas" as const, label: "Canvas", icon: PencilRuler },
  ];
  return (
    <nav
      aria-label="Workspace view"
      className="mb-3 flex w-fit gap-1 rounded-lg border bg-white p-1"
    >
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onModeChange(id)}
          aria-pressed={mode === id}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs ${
            mode === id
              ? "bg-orange-500/15 text-orange-300"
              : "text-stone-500 hover:bg-white/5"
          }`}
        >
          <Icon size={15} />
          {label}
        </button>
      ))}
    </nav>
  );
}
