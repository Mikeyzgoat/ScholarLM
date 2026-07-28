import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { listDocuments } from "../services/documents";

export default function DefaultPage() {
  const documents = useQuery({
    queryKey: ["documents"],
    queryFn: listDocuments,
  });

  if (documents.isLoading)
    return <main className="p-8 text-stone-500">Opening knowledge graph…</main>;
  if (documents.isError)
    return (
      <main className="p-8 text-red-400">
        Unable to load your knowledge graph. Use Upload PDF to continue.
      </main>
    );

  const latestDocument = documents.data?.[0];
  if (!latestDocument) return <Navigate to="/upload" replace />;
  return <Navigate to={`/graph/${latestDocument.id}`} replace />;
}
