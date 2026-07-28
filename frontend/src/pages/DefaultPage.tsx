import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { listDocuments } from "../services/documents";
import { createNote, listDocumentNotes } from "../services/notes";

export default function DefaultPage() {
  const navigate = useNavigate();
  const creating = useRef(false);
  const [createError, setCreateError] = useState<Error | null>(null);
  const documents = useQuery({
    queryKey: ["documents"],
    queryFn: listDocuments,
  });
  const document = documents.data?.[0];
  const notes = useQuery({
    queryKey: ["notes", document?.id],
    queryFn: () => listDocumentNotes(document!.id),
    enabled: !!document,
  });

  useEffect(() => {
    if (
      !document ||
      notes.isLoading ||
      notes.data?.length ||
      creating.current ||
      createError
    )
      return;
    creating.current = true;
    void createNote({
      documentId: document.id,
      title: `${document.name} notes`,
      metadata: { page: 1 },
      snapshot: {},
    })
      .then((note) => navigate(`/notes/${note.id}`, { replace: true }))
      .catch((error: unknown) => {
        setCreateError(
          error instanceof Error ? error : new Error("Unable to create canvas"),
        );
      })
      .finally(() => {
        creating.current = false;
      });
  }, [
    document?.id,
    notes.isLoading,
    notes.data?.length,
    navigate,
    createError,
  ]);

  if (documents.isLoading || (document && notes.isLoading))
    return <main className="p-8 text-stone-500">Opening your canvas…</main>;
  if (documents.isError || notes.isError)
    return (
      <main className="p-8 text-red-400">
        Unable to open the latest canvas. Use Upload PDF to continue.
      </main>
    );
  if (createError)
    return <main className="p-8 text-red-400">{createError.message}</main>;
  if (!document) return <Navigate to="/upload" replace />;
  if (notes.data?.[0])
    return <Navigate to={`/notes/${notes.data[0].id}`} replace />;
  return <main className="p-8 text-stone-500">Creating your canvas…</main>;
}
