import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileUp } from "lucide-react";
import { Link } from "react-router-dom";
import { getDocument } from "../../services/documents";
export function Topbar() {
  const { documentId } = useParams();
  const q = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => getDocument(documentId!),
    enabled: !!documentId,
  });
  return (
    <header className="flex h-14 items-center border-b bg-white px-5">
      <span className="mr-2 h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_16px_rgba(249,115,22,0.9)]" />
      <span className="font-semibold tracking-tight lg:hidden">ScholarLM</span>
      {q.data && (
        <span className="ml-auto truncate text-sm text-stone-600">
          {q.data.name}
        </span>
      )}
      <Link
        to="/upload"
        className={`${q.data ? "ml-4" : "ml-auto"} flex items-center gap-2 rounded-lg border border-orange-400/20 bg-orange-500/10 px-3 py-1.5 text-sm text-orange-300 hover:border-orange-400/40 hover:bg-orange-500/15`}
      >
        <FileUp size={16} />
        Upload PDF
      </Link>
    </header>
  );
}
