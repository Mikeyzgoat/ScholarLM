import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BookOpenCheck, Send } from "lucide-react";
import type { RagAnswer } from "../../lib/types";
import { askDocument } from "../../services/rag";

interface QuestionTurn extends RagAnswer {
  question: string;
}

export function DocumentQA({
  documentId,
  disabled,
  onSourceSelect,
}: {
  documentId: string;
  disabled: boolean;
  onSourceSelect: (pageNumber: number) => void;
}) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<QuestionTurn[]>([]);
  const ask = useMutation({
    mutationFn: (value: string) =>
      askDocument({ documentId, question: value }),
    onSuccess: (answer, askedQuestion) => {
      setTurns((current) => [
        ...current,
        { ...answer, question: askedQuestion },
      ]);
      setQuestion("");
    },
  });

  function submit() {
    const value = question.trim();
    if (!disabled && !ask.isPending && value.length >= 3) ask.mutate(value);
  }

  return (
    <section className="rounded-xl border border-orange-400/15 bg-neutral-950/70 p-3 shadow-[0_0_32px_rgba(249,115,22,0.04)]">
      <div className="mb-3 flex items-center gap-2">
        <BookOpenCheck size={16} className="text-orange-400" />
        <h2 className="text-sm font-semibold text-stone-100">Ask the PDF</h2>
        <span className="ml-auto rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] uppercase tracking-wide text-emerald-300">
          Open PDF only
        </span>
      </div>
      <div className="max-h-72 space-y-3 overflow-auto">
        {turns.map((turn, index) => (
          <article
            key={`${turn.question}:${index}`}
            className="rounded-lg border border-white/10 bg-white/[0.035] p-3"
          >
            <p className="text-xs font-medium text-orange-200">
              {turn.question}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-stone-300">
              {turn.answer}
            </p>
            {!!turn.sources.length && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {turn.sources.map((source) => (
                  <button
                    key={source.sourceId}
                    type="button"
                    title={source.content}
                    onClick={() => onSourceSelect(source.pageNumber)}
                    className="rounded-md border border-orange-400/20 bg-orange-500/10 px-2 py-1 font-mono text-[10px] text-orange-300 hover:bg-orange-500/20"
                  >
                    {source.sourceId} · p.{source.pageNumber}
                  </button>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
      <form
        className="mt-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          disabled={disabled || ask.isPending}
          rows={3}
          maxLength={2000}
          placeholder={
            disabled
              ? "Waiting for document embeddings…"
              : "Ask a question grounded in this PDF…"
          }
          className="w-full resize-none rounded-lg border border-white/10 bg-black/20 p-2.5 text-xs leading-5 text-stone-200 outline-none placeholder:text-stone-600 focus:border-orange-400/40"
        />
        <button
          type="submit"
          disabled={disabled || ask.isPending || question.trim().length < 3}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500/15 px-3 py-2 text-xs font-medium text-orange-200 transition hover:bg-orange-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={14} />
          {ask.isPending ? "Retrieving evidence…" : "Answer with sources"}
        </button>
      </form>
      {ask.isError && (
        <p className="mt-2 text-xs leading-5 text-red-400">
          {ask.error.message}
        </p>
      )}
    </section>
  );
}
