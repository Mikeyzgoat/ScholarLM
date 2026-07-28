import { useQuery } from "@tanstack/react-query";
import { GRAPH_POLL_INTERVAL } from "../lib/constants";
import type { DocumentStatus } from "../lib/types";
import { getDocumentGraph } from "../services/graph";
export function useKnowledgeGraph(
  documentId: string | undefined,
  documentStatus: DocumentStatus | undefined,
) {
  const q = useQuery({
    queryKey: ["graph", documentId],
    queryFn: () => getDocumentGraph(documentId!),
    enabled:
      !!documentId &&
      (documentStatus === "graphing" || documentStatus === "ready"),
    refetchInterval:
      documentStatus === "graphing" ? GRAPH_POLL_INTERVAL : false,
  });
  return {
    graph: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error,
  };
}
