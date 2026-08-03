import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BookOpenCheck, Check, Pause, Play, Plus, Send } from "lucide-react";
import type { RagAnswer, RagSource } from "../../lib/types";
import { askDocument } from "../../services/rag";
import { useSpeech } from "../../hooks/useSpeech";

interface QuestionTurn extends RagAnswer {
  question: string;
}

function storageKey(documentId: string): string {
  return `scholarlm-document-qa:${documentId}`;
}

function restoreState(documentId: string): {
  question: string;
  turns: QuestionTurn[];
  savedTurns: Set<number>;
} {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(storageKey(documentId)) ?? "{}",
    ) as {
      question?: unknown;
      turns?: unknown;
      savedTurns?: unknown;
    };
    return {
      question: typeof value.question === "string" ? value.question : "",
      turns: Array.isArray(value.turns)
        ? value.turns.filter(
            (turn): turn is QuestionTurn =>
              Boolean(turn) &&
              typeof turn === "object" &&
              typeof (turn as QuestionTurn).question === "string" &&
              typeof (turn as QuestionTurn).answer === "string" &&
              Array.isArray((turn as QuestionTurn).sources),
          )
        : [],
      savedTurns: new Set(
        Array.isArray(value.savedTurns)
          ? value.savedTurns.filter(
              (index): index is number =>
                Number.isInteger(index) && index >= 0,
            )
          : [],
      ),
    };
  } catch {
    return { question: "", turns: [], savedTurns: new Set() };
  }
}

export function DocumentQA({
  documentId,
  disabled,
  onSourceSelect,
  activePage,
  onAddSticky,
}: {
  documentId: string;
  disabled: boolean;
  onSourceSelect: (pageNumber: number) => void;
  activePage?: number;
  onAddSticky?: (input: {
    question: string;
    answer: string;
    pageNumber: number;
    sources: RagSource[];
  }) => void;
}) {
  const [restored] = useState(() => restoreState(documentId));
  const [question, setQuestion] = useState(restored.question);
  const [turns, setTurns] = useState<QuestionTurn[]>(restored.turns);
  const [draftAnswer, setDraftAnswer] = useState("");
  const [savedTurns, setSavedTurns] = useState<Set<number>>(
    restored.savedTurns,
  );
  const [stickyChoice, setStickyChoice] = useState<{
    turn: QuestionTurn;
    turnIndex: number;
    sources: RagSource[];
  } | null>(null);
  const speech = useSpeech();
  const audioByTurn = useRef(new Map<string, Blob>());
  const audioRequests = useRef(new Map<string, Promise<Blob>>());
  const audioSelection = useRef(0);
  const [activeAudioTurn, setActiveAudioTurn] = useState("");

  function audioKey(turn: QuestionTurn): string {
    return `${turn.question}\n${turn.answer}`;
  }

  function prepareTurnAudio(turn: QuestionTurn): Promise<Blob> {
    const key = audioKey(turn);
    const stored = audioByTurn.current.get(key);
    if (stored) return Promise.resolve(stored);
    const pending = audioRequests.current.get(key);
    if (pending) return pending;
    const request = speech
      .generateQueued(turn.answer, turn.question, turn.historyId)
      .then((audio) => {
        audioByTurn.current.set(key, audio);
        audioRequests.current.delete(key);
        return audio;
      })
      .catch((error) => {
        audioRequests.current.delete(key);
        throw error;
      });
    audioRequests.current.set(key, request);
    return request;
  }

  async function playTurnAudio(turn: QuestionTurn) {
    const key = audioKey(turn);
    if (activeAudioTurn === key && speech.isPlaying) {
      speech.pause();
      return;
    }
    if (activeAudioTurn === key && speech.isReady) {
      speech.resume();
      return;
    }
    const selection = ++audioSelection.current;
    speech.reset();
    setActiveAudioTurn(key);
    try {
      const audio = await prepareTurnAudio(turn);
      if (selection !== audioSelection.current) return;
      await speech.playStored(audio);
    } catch (error) {
      console.warn("Could not prepare retrieved-answer audio", error);
    }
  }
  useEffect(() => {
    sessionStorage.setItem(
      storageKey(documentId),
      JSON.stringify({
        question,
        turns,
        savedTurns: [...savedTurns],
      }),
    );
  }, [documentId, question, savedTurns, turns]);
  const ask = useMutation({
    mutationFn: (value: string) =>
      askDocument({
        documentId,
        question: value,
        pageNumber: activePage,
        onToken: (token) =>
          setDraftAnswer((current) => current + token),
      }),
    onMutate: () => setDraftAnswer(""),
    onSuccess: (answer, askedQuestion) => {
      const completedTurn = { ...answer, question: askedQuestion };
      setTurns((current) => [
        ...current,
        completedTurn,
      ]);
      setDraftAnswer("");
      setQuestion("");
      const generatedAudio = prepareTurnAudio(completedTurn);
      if (speech.autoRead)
        void speech.enqueueGenerated(generatedAudio, () => {
          audioSelection.current += 1;
          setActiveAudioTurn(audioKey(completedTurn));
        });
      else void generatedAudio.catch(() => undefined);
    },
    onError: () => setDraftAnswer(""),
  });

  function submit() {
    const value = question.trim();
    if (!disabled && !ask.isPending && value.length >= 3) ask.mutate(value);
  }

  function saveTurnAsSticky(
    turn: QuestionTurn,
    turnIndex: number,
    pageNumber: number,
  ) {
    if (!onAddSticky) return;
    onAddSticky({
      question: turn.question,
      answer: turn.answer,
      pageNumber,
      sources: turn.sources,
    });
    setSavedTurns((current) => new Set(current).add(turnIndex));
    setStickyChoice(null);
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
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 text-xs font-medium text-orange-200">
                {turn.question}
              </p>
              {onAddSticky && (
                <button
                  type="button"
                  disabled={savedTurns.has(index)}
                  title="Add this answer as a sticky on the PDF canvas"
                  aria-label="Add answer as sticky note"
                  onClick={() => {
                    const uniqueSources = [
                      ...new Map(
                        turn.sources.map((source) => [
                          `${source.documentId ?? documentId}:${source.pageNumber}`,
                          source,
                        ]),
                      ).values(),
                    ];
                    if (uniqueSources.length > 1) {
                      setStickyChoice({
                        turn,
                        turnIndex: index,
                        sources: uniqueSources,
                      });
                      return;
                    }
                    saveTurnAsSticky(
                      turn,
                      index,
                      uniqueSources[0]?.pageNumber ?? activePage ?? 1,
                    );
                  }}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-orange-400/20 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 disabled:text-emerald-300 disabled:opacity-80"
                >
                  {savedTurns.has(index) ? (
                    <Check size={14} />
                  ) : (
                    <Plus size={14} />
                  )}
                </button>
              )}
              <button
                type="button"
                title={
                  activeAudioTurn === audioKey(turn) && speech.isPlaying
                    ? "Pause this answer"
                    : "Play this answer"
                }
                aria-label={
                  activeAudioTurn === audioKey(turn) && speech.isPlaying
                    ? "Pause answer audio"
                    : "Play answer audio"
                }
                onClick={() => void playTurnAudio(turn)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-orange-400/20 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20"
              >
                {activeAudioTurn === audioKey(turn) && speech.isPlaying ? (
                  <Pause size={14} />
                ) : (
                  <Play size={14} />
                )}
              </button>
            </div>
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
        {ask.isPending && draftAnswer && (
          <article className="rounded-lg border border-orange-400/15 bg-orange-500/[0.04] p-3">
            <p className="text-xs font-medium text-orange-200">
              {ask.variables}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-stone-300">
              {draftAnswer}
              <span className="ml-1 inline-block h-3 w-1 animate-pulse rounded bg-orange-400 align-middle" />
            </p>
          </article>
        )}
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
      {stickyChoice && (
        <div
          className="fixed inset-0 z-[1300] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sticky-page-choice-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-orange-400/20 bg-neutral-950 p-5 shadow-2xl">
            <h3 id="sticky-page-choice-title" className="font-semibold">
              Choose where to store the sticky
            </h3>
            <p className="mt-2 text-xs leading-5 text-stone-400">
              This answer uses multiple sources. Select the PDF page where the
              sticky should be placed; every citation will remain linked.
            </p>
            <div className="mt-4 space-y-2">
              {stickyChoice.sources.map((source) => (
                <button
                  key={`${source.documentId ?? documentId}:${source.pageNumber}`}
                  type="button"
                  onClick={() =>
                    saveTurnAsSticky(
                      stickyChoice.turn,
                      stickyChoice.turnIndex,
                      source.pageNumber,
                    )
                  }
                  className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-left text-xs hover:border-orange-400/30"
                >
                  <span className="truncate">
                    {source.documentName ?? "Open PDF"}
                  </span>
                  <span className="ml-3 shrink-0 font-mono text-orange-300">
                    Page {source.pageNumber}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStickyChoice(null)}
              className="mt-4 w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-stone-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
