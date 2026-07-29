import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { searchDocument } from "../services/search";
import type { SearchResult } from "../lib/types";
export function useSemanticSearch(documentId: string) {
  const [restored] = useState(() => {
    try {
      const value = JSON.parse(
        sessionStorage.getItem(`scholarlm-document-search:${documentId}`) ??
          "{}",
      ) as { query?: unknown; results?: unknown };
      return {
        query: typeof value.query === "string" ? value.query : "",
        results: Array.isArray(value.results)
          ? (value.results as SearchResult[])
          : [],
      };
    } catch {
      return { query: "", results: [] as SearchResult[] };
    }
  });
  const [query, setQuery] = useState(restored.query);
  const [results, setResults] = useState<SearchResult[]>(restored.results);
  useEffect(() => {
    sessionStorage.setItem(
      `scholarlm-document-search:${documentId}`,
      JSON.stringify({ query, results }),
    );
  }, [documentId, query, results]);
  const mutation = useMutation({
    mutationFn: (q: string) => searchDocument({ documentId, query: q }),
    onSuccess: setResults,
  });
  return {
    query,
    setQuery,
    results,
    search: () => {
      const q = query.trim();
      if (q) mutation.mutate(q);
    },
    isSearching: mutation.isPending,
    error: mutation.error,
    clear: () => {
      setQuery("");
      setResults([]);
      mutation.reset();
    },
  };
}
