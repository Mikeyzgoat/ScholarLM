import { useCallback, useEffect, useRef, useState } from "react";
import { useExplanation } from "../../hooks/useExplanation";
import { useSpeech } from "../../hooks/useSpeech";
import { getStoredExplanationSpeech } from "../../services/speech";
import { AnimatePresence, motion } from "framer-motion";
import { SelectionPopover } from "../pdf/SelectionPopover";
import { ExplanationContent } from "./ExplanationContent";
import { AudioControls } from "./AudioControls";
import type { CanvasSelectionAnchor, FlowchartDiagram, MathPlot } from "../../lib/types";
import { findLatestGeneratedOutput } from "../../lib/generatedOutputs";
import {
  findExistingExplanation,
  generateVoiceExplanation,
} from "../../services/explanation";
import {
  ChartSpline,
  ClipboardPaste,
  FilePlus2,
  ImageUp,
  StickyNote,
} from "lucide-react";

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Clipboard image could not be read"));
    reader.onerror = () => reject(reader.error ?? new Error("Image read failed"));
    reader.readAsDataURL(blob);
  });
}

function imageFromClipboard(items: DataTransferItemList): Blob | null {
  for (const item of items)
    if (item.kind === "file" && item.type.startsWith("image/"))
      return item.getAsFile();
  return null;
}

export function ExplainPanel({
  selectedText,
  selectedTexts,
  existingExplanation,
  existingExplanationId,
  selectionAnchors,
  selectionImage,
  documentId,
  noteId,
  canvasId,
  pageNumber,
  documentTitle,
  onPlotGenerated,
  onFlowchartGenerated,
  onExplanationGenerated,
  onExplanationStickyRequested,
}: {
  selectedText: string;
  selectedTexts?: string[];
  existingExplanation?: string;
  existingExplanationId?: string;
  selectionAnchors?: CanvasSelectionAnchor[];
  selectionImage?: string;
  documentId?: string;
  noteId?: string;
  canvasId?: string;
  pageNumber: number | null;
  documentTitle: string;
  onPlotGenerated?: (
    plot: MathPlot,
    equation?: string,
    sourceShapeIds?: string[],
  ) => void;
  onFlowchartGenerated?: (
    flowchart: FlowchartDiagram,
    sourceShapeIds?: string[],
  ) => void;
  onExplanationGenerated?: (input: {
    selectedText: string;
    explanation: string;
    mode: "explain" | "regenerate" | "simplify";
    answers?: string[];
    anchors?: CanvasSelectionAnchor[];
    explanationId?: string;
    pageNumber?: number;
  }) => void;
  onExplanationStickyRequested?: NonNullable<
    typeof onExplanationGenerated
  >;
}) {
  const state = useExplanation(),
    speech = useSpeech();
  const [inputMode, setInputMode] = useState<"selection" | "screenshot">(
    "selection",
  );
  const [pastedImage, setPastedImage] = useState<string>();
  const [pasteError, setPasteError] = useState("");
  const [recognizedEquation, setRecognizedEquation] = useState("");
  const [graphError, setGraphError] = useState("");
  const [suggestedPlot, setSuggestedPlot] = useState<MathPlot>();
  const [suggestedFlowchart, setSuggestedFlowchart] = useState<FlowchartDiagram>();
  const [suggestedSourceShapeIds, setSuggestedSourceShapeIds] = useState<string[]>();
  const [audioOwner, setAudioOwner] = useState("");
  const [queueAudioError, setQueueAudioError] = useState("");
  const screenshotInput = useRef<HTMLInputElement>(null);
  const voiceText = useRef("");
  const voiceController = useRef<AbortController | null>(null);
  const [canvasInput, setCanvasInput] = useState<Parameters<
    NonNullable<typeof onExplanationGenerated>
  >[0]>();
  const [requestHistory, setRequestHistory] = useState<
    Array<{
      id: string;
      sourceText: string;
      status: "pending" | "complete" | "failed";
      result?: Parameters<NonNullable<typeof onExplanationGenerated>>[0];
      error?: string;
    }>
  >([]);
  const [activeQueueId, setActiveQueueId] = useState("");
  const [activeExplanationId, setActiveExplanationId] = useState("");
  const audioSelection = useRef(0);
  const activeImage = selectionImage ?? pastedImage;
  const activeText =
    selectedText.trim() || (pastedImage ? "Screenshot selection" : "");
  const selectStoredExplanationAudio = (explanationId: string, owner: string) => {
    const selection = ++audioSelection.current;
    speech.reset();
    setAudioOwner("");
    setQueueAudioError("");
    void getStoredExplanationSpeech(explanationId)
      .then((audio) => {
        if (selection !== audioSelection.current) return;
        setAudioOwner(owner);
        return speech.prepareStored(audio);
      })
      .catch((error) => {
        if (selection !== audioSelection.current) return;
        setQueueAudioError(
          error instanceof Error
            ? error.message
            : "Stored audio could not be loaded",
        );
      });
  };
  const syncCachedQueue = (
    cached: Awaited<ReturnType<typeof findExistingExplanation>>,
    displayAnswer: string,
  ) => {
    if (!cached?.historyId) return;
    const result = {
      selectedText: activeText,
      explanation: displayAnswer,
      mode: "explain" as const,
      anchors: selectionAnchors,
      explanationId: cached.historyId,
      pageNumber: pageNumber ?? undefined,
    };
    let selectedId = `history:${cached.historyId}`;
    setRequestHistory((history) => {
      const existing = history.find(
        (request) => request.result?.explanationId === cached.historyId,
      );
      if (existing) {
        selectedId = existing.id;
        return history.map((request) =>
          request.id === existing.id
            ? { ...request, status: "complete", result }
            : request,
        );
      }
      return [
        ...history,
        {
          id: selectedId,
          sourceText: activeText,
          status: "complete" as const,
          result,
        },
      ];
    });
    setActiveQueueId(selectedId);
    setActiveExplanationId(cached.historyId);
    setCanvasInput(result);
  };
  const acceptClipboardImage = useCallback(async (blob: Blob) => {
    if (!blob.type.startsWith("image/")) return;
    setPasteError("");
    setInputMode("screenshot");
    if (blob.size > 4_000_000) {
      setPasteError("Screenshot must be smaller than 4 MB");
      return;
    }
    try {
      setPastedImage(await toDataUrl(blob));
    } catch (error) {
      setPasteError(
        error instanceof Error ? error.message : "Could not paste screenshot",
      );
    }
  }, []);
  const readClipboard = useCallback(async () => {
    setPasteError("");
    try {
      if (!navigator.clipboard?.read)
        throw new Error("Use Ctrl/Cmd+V to paste a screenshot here");
      const entries = await navigator.clipboard.read();
      for (const entry of entries) {
        const imageType = entry.types.find((type) => type.startsWith("image/"));
        if (!imageType) continue;
        await acceptClipboardImage(await entry.getType(imageType));
        return;
      }
      throw new Error("The clipboard does not contain an image");
    } catch (error) {
      setPasteError(
        error instanceof Error ? error.message : "Could not access clipboard",
      );
    }
  }, [acceptClipboardImage]);
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (selectedText.trim() || selectionImage) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;
      if (!event.clipboardData) return;
      const image = imageFromClipboard(event.clipboardData.items);
      if (!image) return;
      event.preventDefault();
      void acceptClipboardImage(image);
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [acceptClipboardImage, selectedText, selectionImage]);
  useEffect(() => {
    if (!selectedText.trim() && !selectionImage) return;
    setPastedImage(undefined);
    setPasteError("");
  }, [selectedText, selectionImage]);
  async function explain(
    mode: "explain" | "regenerate" | "simplify" = "explain",
    requestGraph = false,
  ) {
    const requestId = crypto.randomUUID();
    const requestText = activeText;
    const requestImage = activeImage;
    const requestAnchors = selectionAnchors;
    const requestPageNumber = pageNumber ?? undefined;
    const requestPastedImage = pastedImage;
    setRequestHistory((history) => [
      ...history,
      { id: requestId, sourceText: requestText, status: "pending" },
    ]);
    voiceController.current?.abort();
    voiceController.current = null;
    let failureMessage = "Explanation failed";
    const value = await state.explain({
      selectedText: requestText,
      selectedTexts:
        !requestPastedImage && selectedTexts && selectedTexts.length > 1
          ? selectedTexts
          : undefined,
      imageDataUrl: requestImage,
      imageInputKind: requestPastedImage ? "selection" : "handwriting",
      graphRequested: requestGraph,
      documentId,
      noteId,
      canvasId,
      shapeId:
        requestImage && !requestPastedImage
          ? requestAnchors?.[0]?.shapeId
          : undefined,
      shapeIds:
        requestImage && !requestPastedImage
          ? requestAnchors?.map((anchor) => anchor.shapeId)
          : undefined,
      documentTitle,
      pageNumber: requestPageNumber,
      mode,
      previousExplanation:
        mode === "explain" ? undefined : state.explanation || undefined,
    }).catch((error: unknown) => {
      failureMessage =
        error instanceof Error ? error.message : "Explanation failed";
      return null;
    });
    if (value) {
      const displayAnswer = value.answer ?? value.explanation;
      voiceText.current = value.voiceExplanation ?? "";
      setRecognizedEquation(value.recognizedEquation ?? "");
      setSuggestedPlot(value.plot);
      setSuggestedFlowchart(value.flowchart);
      setSuggestedSourceShapeIds(
        requestAnchors?.map((anchor) => anchor.shapeId),
      );
      setGraphError("");
      const completedInput = {
        selectedText: requestText,
        explanation: displayAnswer,
        mode,
        answers: value.answers,
        anchors: requestAnchors,
        explanationId: value.historyId,
        pageNumber: requestPageNumber,
      };
      setCanvasInput(completedInput);
      setActiveQueueId(requestId);
      setActiveExplanationId(value.historyId ?? "");
      setRequestHistory((history) =>
        history.map((request) =>
          request.id === requestId
            ? { ...request, status: "complete", result: completedInput }
            : request,
        ),
      );
      if (requestPastedImage) setInputMode("selection");
      const backgroundVoice = new AbortController();
      voiceController.current = backgroundVoice;
      void (async () => {
        try {
          const voiceExplanation =
            value.voiceExplanation ??
            (
              await generateVoiceExplanation({
                answer: displayAnswer,
                recognizedEquation: value.recognizedEquation,
                historyId: value.historyId,
                signal: backgroundVoice.signal,
              })
            ).voiceExplanation;
          if (backgroundVoice.signal.aborted) return;
          voiceText.current = voiceExplanation;
          setAudioOwner(requestText);
          await speech.enqueue(
            voiceExplanation,
            requestText,
            value.historyId,
            value.cached === true,
          );
        } catch (error) {
          if (!backgroundVoice.signal.aborted)
            console.warn("Could not prepare the spoken explanation", error);
        } finally {
          if (voiceController.current === backgroundVoice)
            voiceController.current = null;
        }
      })();
    } else {
      setRequestHistory((history) =>
        history.map((request) =>
          request.id === requestId
            ? { ...request, status: "failed", error: failureMessage }
            : request,
        ),
      );
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    voiceController.current?.abort();
    voiceController.current = null;
    audioSelection.current += 1;
    speech.reset();
    setAudioOwner("");
    if (!activeText && !activeImage) {
      voiceText.current = "";
      state.clear();
      setCanvasInput(undefined);
      setRecognizedEquation("");
      setSuggestedPlot(undefined);
      setSuggestedFlowchart(undefined);
      setSuggestedSourceShapeIds(undefined);
      setAudioOwner("");
      setGraphError("");
      return () => controller.abort();
    }
    const existing =
      existingExplanation ||
      (!activeImage &&
      activeText !== "Handwritten equation" &&
      activeText !== "Screenshot selection"
        ? findLatestGeneratedOutput(activeText, pageNumber ?? undefined)?.text
        : undefined);
    if (existing) {
      voiceText.current = "";
      state.load(existing);
      if (existingExplanationId) {
        void findExistingExplanation({
          selectedText: activeText,
          imageDataUrl: activeImage,
          documentId,
          canvasId,
          shapeId:
            activeImage && !pastedImage
              ? selectionAnchors?.[0]?.shapeId
              : undefined,
          documentTitle,
          pageNumber: pageNumber ?? undefined,
          signal: controller.signal,
        }).then(async (cached) => {
          if (!cached || controller.signal.aborted) return;
          const displayAnswer = cached.answer ?? cached.explanation;
          syncCachedQueue(cached, displayAnswer);
          state.load(displayAnswer);
          setRecognizedEquation(cached.recognizedEquation ?? "");
          if (cached.historyId)
            selectStoredExplanationAudio(cached.historyId, activeText);
        }).catch((error) => {
          if (!controller.signal.aborted)
            console.warn("Could not restore saved speech", error);
        });
      }
      setCanvasInput({
        selectedText: activeText,
        explanation: existing,
        mode: "explain",
        anchors: selectionAnchors,
        explanationId: existingExplanationId,
        pageNumber: pageNumber ?? undefined,
      });
    } else {
      state.clear();
      setCanvasInput(undefined);
      setRecognizedEquation("");
      setGraphError("");
    }
    return () => controller.abort();
  }, [
    activeText,
    activeImage,
    canvasId,
    documentId,
    documentTitle,
    pageNumber,
    pastedImage,
    existingExplanation,
    existingExplanationId,
    selectionAnchors,
  ]);
  useEffect(() => {
    if (
      (!activeText && !activeImage) ||
      existingExplanation ||
      state.explanation ||
      state.isExplaining
    )
      return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void findExistingExplanation({
        selectedText: activeText,
        imageDataUrl: activeImage,
        documentId,
        canvasId,
        shapeId:
          activeImage && !pastedImage
            ? selectionAnchors?.[0]?.shapeId
            : undefined,
        documentTitle,
        pageNumber: pageNumber ?? undefined,
        signal: controller.signal,
      })
        .then((cached) => {
          if (!cached || controller.signal.aborted) return;
          const displayAnswer = cached.answer ?? cached.explanation;
          state.load(displayAnswer);
          syncCachedQueue(cached, displayAnswer);
          setRecognizedEquation(cached.recognizedEquation ?? "");
          setCanvasInput({
            selectedText: activeText,
            explanation: displayAnswer,
            mode: "explain",
            anchors: selectionAnchors,
            explanationId: cached.historyId,
            pageNumber: pageNumber ?? undefined,
          });
          if (cached.historyId)
            selectStoredExplanationAudio(cached.historyId, activeText);
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            console.warn("Could not restore the saved explanation", error);
        });
    }, 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    activeText,
    activeImage,
    canvasId,
    documentId,
    documentTitle,
    pageNumber,
    pastedImage,
    selectionAnchors,
    state.explanation,
    state.isExplaining,
  ]);
  return (
    <motion.section
      layout
      transition={{ layout: { duration: 0.24, ease: "easeOut" } }}
      className="space-y-3 rounded-lg border bg-white p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Explanation</h2>
      </div>
      {!activeText && !activeImage && (
        <div className="rounded-lg border border-dashed border-orange-400/25 bg-orange-500/[0.04] p-3">
          <div className="mb-3 grid grid-cols-2 rounded-lg bg-black/5 p-1">
            <button
              type="button"
              onClick={() => {
                setInputMode("selection");
                setPasteError("");
              }}
              className={`rounded-md px-2 py-1.5 text-[11px] transition ${
                inputMode === "selection"
                  ? "bg-orange-500 font-semibold text-white shadow-sm shadow-orange-500/25"
                  : "text-stone-500 hover:bg-orange-500/10 hover:text-orange-500"
              }`}
            >
              Explain selection
            </button>
            <button
              type="button"
              onClick={() => {
                setInputMode("screenshot");
                setPasteError("");
                screenshotInput.current?.click();
              }}
              className={`rounded-md px-2 py-1.5 text-[11px] transition ${
                inputMode === "screenshot"
                  ? "bg-sky-600 font-semibold text-white shadow-sm shadow-sky-600/25"
                  : "text-stone-500 hover:bg-sky-500/10 hover:text-sky-500"
              }`}
            >
              Upload screenshot
            </button>
          </div>
          {inputMode === "selection" ? (
            <div className="py-2 text-center">
              <p className="text-xs leading-5 text-stone-500">
                Select PDF text, typed canvas text, or a handwritten region.
              </p>
              <p className="mt-1 text-[10px] font-medium text-orange-500/80">
                Waiting for a selection…
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void readClipboard()}
                  className="scholar-secondary-action flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs"
                >
                  <ClipboardPaste size={15} />
                  Paste
                </button>
                <button
                  type="button"
                  onClick={() => screenshotInput.current?.click()}
                  className="scholar-secondary-action flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs"
                >
                  <ImageUp size={15} />
                  Upload
                </button>
              </div>
              <p className="mt-2 text-center text-[10px] text-stone-500">
                Or copy any screen region and press Ctrl/Cmd+V.
              </p>
            </>
          )}
        </div>
      )}
      <input
        ref={screenshotInput}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void acceptClipboardImage(file);
          event.currentTarget.value = "";
        }}
      />
      {pasteError && <p className="text-xs text-red-400">{pasteError}</p>}
      {requestHistory.length > 0 && (
        <section className="space-y-2 rounded-lg border border-orange-400/15 p-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-400">Queued explanations</p>
            <span className="text-[10px] text-stone-500">{state.pendingCount} pending</span>
          </div>
          {requestHistory.slice().reverse().map((request) => (
            <div
              key={request.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                setActiveQueueId(request.id);
                setActiveExplanationId(request.result?.explanationId ?? "");
                if (request.result) {
                  setCanvasInput(request.result);
                  state.load(request.result.explanation);
                  if (request.result.explanationId)
                    selectStoredExplanationAudio(
                      request.result.explanationId,
                      request.sourceText,
                    );
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setActiveQueueId(request.id);
                  setActiveExplanationId(request.result?.explanationId ?? "");
                  if (request.result) {
                    setCanvasInput(request.result);
                    state.load(request.result.explanation);
                    if (request.result.explanationId)
                      selectStoredExplanationAudio(
                        request.result.explanationId,
                        request.sourceText,
                      );
                  }
                }
              }}
              className={`rounded-lg border px-3 py-2 transition ${
                activeQueueId === request.id ||
                (activeExplanationId &&
                  activeExplanationId === request.result?.explanationId)
                  ? "border-orange-400/60 bg-orange-500/10 ring-1 ring-orange-400/30"
                  : "border-orange-400/15 bg-black/5"
              }`}
            >
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-xs text-stone-400">
                  {request.sourceText}
                </p>
                <span className="text-[10px] uppercase tracking-wide text-orange-400">
                  {request.status}
                </span>
              </div>
              {request.error && (
                <p className="mt-1 text-[10px] leading-4 text-red-400">
                  {request.error}
                </p>
              )}
              {request.result && (
                <div className="mt-2 flex gap-2">
                  {request.result.explanationId && (
                    <button
                      type="button"
                      onClickCapture={(event) => event.stopPropagation()}
                      onClick={() => {
                        setQueueAudioError("");
                        void getStoredExplanationSpeech(
                          request.result!.explanationId!,
                        )
                          .then((audio) => {
                            setAudioOwner(request.sourceText);
                            return speech.enqueueStored(audio);
                          })
                          .catch((error) =>
                            setQueueAudioError(
                              error instanceof Error
                                ? error.message
                                : "Stored audio could not be played",
                            ),
                          );
                      }}
                      className="scholar-secondary-action rounded border px-2 py-1 text-[10px]"
                    >
                      Play audio
                    </button>
                  )}
                  <button
                    type="button"
                    onClickCapture={(event) => event.stopPropagation()}
                    onClick={() => onExplanationGenerated?.(request.result!)}
                    className="scholar-secondary-action rounded border px-2 py-1 text-[10px]"
                  >
                    Add as text
                  </button>
                  <button
                    type="button"
                    onClickCapture={(event) => event.stopPropagation()}
                    onClick={() =>
                      onExplanationStickyRequested?.(request.result!)
                    }
                    className="scholar-primary-action rounded px-2 py-1 text-[10px]"
                  >
                    Add sticky
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
      {queueAudioError && (
        <p className="text-xs text-red-400">{queueAudioError}</p>
      )}
      <AnimatePresence mode="popLayout">
        {activeText && !state.explanation && (
          <motion.div
            key="selection"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
          >
            {pastedImage && (
              <img
                src={pastedImage}
                alt="Pasted screenshot selection"
                className="mb-2 max-h-36 w-full rounded-lg border border-white/10 object-contain"
              />
            )}
            <SelectionPopover
              selectedText={activeText}
              onExplain={() => void explain("explain")}
              onDismiss={() => {
                setPastedImage(undefined);
                state.clear();
              }}
            />
            {selectedTexts && selectedTexts.length > 1 && (
              <p className="mt-2 text-xs text-orange-300">
                {selectedTexts.length} selected blocks will be answered
                separately in one request.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {state.explanation && (
        <section className="space-y-2 rounded-lg border border-orange-400/15 bg-orange-500/[0.04] p-2">
          <div className="px-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-400">
              Audio playback
            </p>
            <p className="mt-1 truncate text-xs text-stone-500">
              {audioOwner
                ? `${speech.isPlaying ? "Playing" : speech.isLoading ? "Preparing" : "Ready"}: ${audioOwner}`
                : "One explanation plays at a time."}
            </p>
          </div>
          <AudioControls
            isLoading={speech.isLoading}
            isPlaying={speech.isPlaying}
            isPaused={speech.isPaused}
            isReady={speech.isReady}
            canLoad={Boolean(voiceText.current)}
            usingFallback={speech.usingFallback}
            autoRead={speech.autoRead}
            playbackRate={speech.playbackRate}
            onPause={speech.pause}
            onResume={() => {
              if (speech.isReady) speech.resume();
              else if (voiceText.current)
                void speech.play(
                  voiceText.current,
                  activeText,
                  canvasInput?.explanationId ?? existingExplanationId,
                );
            }}
            onReplay={speech.replay}
            onStop={speech.stop}
            onAutoReadChange={speech.setAutoRead}
            onPlaybackRateChange={speech.setPlaybackRate}
          />
        </section>
      )}
      <ExplanationContent
        explanation={state.explanation}
        isLoading={state.isExplaining}
        error={state.error}
      />
      {speech.error && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
          {speech.error.message}
        </p>
      )}
      {state.explanation && (
        <>
          {recognizedEquation && (
            <div className="rounded-lg border border-orange-400/20 bg-orange-500/[0.05] p-3">
              <label
                htmlFor="recognized-equation"
                className="text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-500"
              >
                Recognized equation · editable
              </label>
              <input
                id="recognized-equation"
                value={recognizedEquation}
                onChange={(event) => {
                  setRecognizedEquation(event.target.value);
                  setGraphError("");
                }}
                className="mt-2 w-full rounded-md border bg-white/60 px-3 py-2 font-mono text-sm outline-none focus:border-orange-400/50"
              />
            </div>
          )}
          {pastedImage && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  speech.stop();
                  state.clear();
                  setCanvasInput(undefined);
                  setPastedImage(undefined);
                  setInputMode("selection");
                }}
                className="scholar-secondary-action rounded-lg border px-3 py-2 text-xs"
              >
                Explain another selection
              </button>
              <button
                type="button"
                onClick={() => {
                  speech.stop();
                  state.clear();
                  setCanvasInput(undefined);
                  setPastedImage(undefined);
                  setInputMode("screenshot");
                  screenshotInput.current?.click();
                }}
                className="scholar-secondary-action rounded-lg border px-3 py-2 text-xs"
              >
                Upload another screenshot
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={state.isExplaining}
              onClick={() => void explain("regenerate")}
              className="scholar-secondary-action rounded-lg border px-3 py-2 text-xs disabled:cursor-not-allowed"
            >
              {state.isExplaining ? "Working…" : "New explanation"}
            </button>
            <button
              type="button"
              disabled={state.isExplaining}
              onClick={() => void explain("simplify")}
              className="scholar-purple-action rounded-lg border px-3 py-2 text-xs disabled:cursor-not-allowed"
            >
              Simplify
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!canvasInput || state.isExplaining}
              onClick={() => {
                if (canvasInput) onExplanationStickyRequested?.(canvasInput);
              }}
              className="scholar-primary-action flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium disabled:cursor-not-allowed"
            >
              <StickyNote size={15} />
              Add as sticky
            </button>
            <button
              type="button"
              disabled={!canvasInput || state.isExplaining}
              onClick={() => {
                if (canvasInput) onExplanationGenerated?.(canvasInput);
              }}
              className="scholar-secondary-action flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs disabled:cursor-not-allowed"
            >
              <FilePlus2 size={15} />
              Add as text
            </button>
          </div>
          <button
              type="button"
              className="scholar-secondary-action flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs"
              disabled={!suggestedPlot && !suggestedFlowchart}
              onClick={() => {
                if (suggestedPlot)
                  onPlotGenerated?.(
                    suggestedPlot,
                    recognizedEquation,
                    suggestedSourceShapeIds,
                  );
                else if (suggestedFlowchart)
                  onFlowchartGenerated?.(
                    suggestedFlowchart,
                    suggestedSourceShapeIds,
                  );
              }}
            >
              <ChartSpline size={15} />
              {suggestedFlowchart
                ? "Insert / replace flowchart"
                : "Insert / replace graph"}
          </button>
          {graphError && <p className="text-xs text-red-400">{graphError}</p>}
        </>
      )}
    </motion.section>
  );
}
