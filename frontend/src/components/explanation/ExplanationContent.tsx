import { cleanExplanation } from "../../lib/plainExplanation";

export function ExplanationContent({
  explanation,
  isLoading,
  error,
}: {
  explanation: string;
  isLoading: boolean;
  error: Error | null;
}) {
  if (isLoading && !explanation)
    return <p className="text-sm">Explaining selection…</p>;
  if (error) return <p className="text-sm text-red-700">{error.message}</p>;
  if (explanation)
    return (
      <div className="space-y-3 whitespace-pre-wrap text-sm leading-6">
        <p>
          {cleanExplanation(explanation)}
          {isLoading && (
            <span className="ml-1 inline-block h-4 w-1 animate-pulse rounded bg-orange-400 align-middle" />
          )}
        </p>
      </div>
    );
  return (
    <p className="text-sm text-stone-500">
      Select text and request an explanation.
    </p>
  );
}
