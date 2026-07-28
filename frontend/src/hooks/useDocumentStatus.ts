import { useQuery } from "@tanstack/react-query";
import { DOCUMENT_STATUS_POLL_INTERVAL } from "../lib/constants";
import { getDocumentStatus } from "../services/documents";
export function useDocumentStatus(documentId: string | undefined) {
  const q = useQuery({
    queryKey: ["document-status", documentId],
    queryFn: () => getDocumentStatus(documentId!),
    enabled: !!documentId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "ready" || s === "failed"
        ? false
        : DOCUMENT_STATUS_POLL_INTERVAL;
    },
  });
  return {
    status: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error,
  };
}
