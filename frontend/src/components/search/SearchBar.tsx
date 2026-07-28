import { Search } from "lucide-react";
export function SearchBar({
  query,
  onQueryChange,
  onSearch,
  isSearching,
  disabled,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  onSearch: () => void;
  isSearching: boolean;
  disabled?: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSearch();
      }}
      className="flex gap-2"
    >
      <label className="relative flex-1">
        <span className="sr-only">Search document</span>
        <Search size={16} className="absolute left-3 top-3 text-stone-400" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          disabled={disabled || isSearching}
          placeholder="Search concepts…"
          className="w-full rounded-lg border border-stone-300 py-2 pl-9 pr-3 focus:outline-2 focus:outline-teal-600"
        />
      </label>
      <button
        disabled={disabled || isSearching || !query.trim()}
        className="rounded-lg bg-stone-900 px-3 text-white disabled:opacity-40"
      >
        {isSearching ? "…" : "Search"}
      </button>
    </form>
  );
}
