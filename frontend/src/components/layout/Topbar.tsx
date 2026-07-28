import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
    </header>
  );
}
