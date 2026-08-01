import { useCallback, useEffect, useRef, useState } from "react";
import { useExplanation } from "../../hooks/useExplanation";
import { useSpeech } from "../../hooks/useSpeech";
import { AnimatePresence, motion } from "framer-motion";
import { SelectionPopover } from "../pdf/SelectionPopover";
import { ExplanationContent } from "./ExplanationContent";
import { AudioControls } from "./AudioControls";
import type { CanvasSelectionAnchor, MathPlot } from "../../lib/types";
import { findLatestGeneratedOutput } from "../../lib/generatedOutputs";
import {
  createDeterministicMathGraph,
  findExistingExplanation,
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
  const [isGraphing, setIsGraphing] = useState(false);
  const screenshotInput = useRef<HTMLInputElement>(null);
  const voiceText = useRef("");
  const [canvasInput, setCanvasInput] = useState<Parameters<
    NonNullable<typeof onExplanationGenerated>
  >[0]>();
  const activeImage = selectionImage ?? pastedImage;
  const activeText =
    selectedText.trim() || (pastedImage ? "Screenshot selection" : "");
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
    const value = await state.explain({
      selectedText: activeText,
      selectedTexts:
        !pastedImage && selectedTexts && selectedTexts.length > 1
          ? selectedTexts
          : undefined,
      imageDataUrl: activeImage,
      imageInputKind: pastedImage ? "selection" : "handwriting",
      graphRequested: requestGraph,
      documentId,
      noteId,
      canvasId,
      shapeId:
        activeImage && !pastedImage
          ? selectionAnchors?.[0]?.shapeId
          : undefined,
      shapeIds:
        activeImage && !pastedImage
          ? selectionAnchors?.map((anchor) => anchor.shapeId)
          : undefined,
      documentTitle,
      pageNumber: pageNumber ?? undefined,
      mode,
      previousExplanation:
        mode === "explain" ? undefined : state.explanation || undefined,
    });
    if (value) {
      const displayAnswer = value.answer ?? value.explanation;
      const voiceExplanation = value.voiceExplanation ?? displayAnswer;
      voiceText.current = voiceExplanation;
      setRecognizedEquation(value.recognizedEquation ?? "");
      setGraphError("");
      if (value.plot)
        onPlotGenerated?.(
          value.plot,
          value.recognizedEquation,
          selectionAnchors?.map((anchor) => anchor.shapeId),
        );
      setCanvasInput({
        selectedText: activeText,
        explanation: displayAnswer,
        mode,
        answers: value.answers,
        anchors: selectionAnchors,
        explanationId: value.historyId,
        pageNumber: pageNumber ?? undefined,
      });
      if (pastedImage) setInputMode("selection");
      await speech.speak(voiceExplanation, activeText, value.historyId);
    }
  }
  async function insertVerifiedGraph() {
    const equation = recognizedEquation.trim() || activeText.trim();
    if (!equation || isGraphing) return;
    setGraphError("");
    setIsGraphing(true);
    try {
      const result = await createDeterministicMathGraph(equation);
      setRecognizedEquation(result.normalizedEquation);
      if (!result.plot) {
        setGraphError(result.error ?? "This equation cannot be graphed yet");
        return;
      }
      onPlotGenerated?.(
        result.plot,
        result.normalizedEquation,
        selectionAnchors?.map((anchor) => anchor.shapeId),
      );
    } catch (error) {
      setGraphError(
        error instanceof Error ? error.message : "Graph generation failed",
      );
    } finally {
      setIsGraphing(false);
    }
  }
  useEffect(() => {
    speech.stop();
    if (!activeText && !activeImage) {
      voiceText.current = "";
      state.clear();
      setCanvasInput(undefined);
      setRecognizedEquation("");
      setGraphError("");
      return;
    }
    const existing =
      existingExplanation ||
      (!activeImage &&
      activeText !== "Handwritten equation" &&
      activeText !== "Screenshot selection"
        ? findLatestGeneratedOutput(activeText, pageNumber ?? undefined)?.text
        : undefined);
    if (existing) {
      voiceText.current = existing;
      state.load(existing);
      void speech.prepare(
        existing,
        activeText,
        existingExplanationId,
      );
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
  }, [
    activeText,
    activeImage,
    pageNumber,
    existingExplanation,
    existingExplanationId,
    selectionAnchors,
  ]);
  useEffect(() => {
    if (
      (!activeText && !activeImage) ||
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
          const voiceExplanation = cached.voiceExplanation ?? displayAnswer;
          voiceText.current = voiceExplanation;
          state.load(displayAnswer);
          void speech.prepare(
            voiceExplanation,
            activeText,
            cached.historyId,
          );
          setRecognizedEquation(cached.recognizedEquation ?? "");
          setCanvasInput({
            selectedText: activeText,
            explanation: displayAnswer,
            mode: "explain",
            anchors: selectionAnchors,
            explanationId: cached.historyId,
            pageNumber: pageNumber ?? undefined,
          });
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
    existingExplanation,
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
              onExplainWithGraph={() => void explain("explain", true)}
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
        <AudioControls
          isLoading={speech.isLoading}
          isPlaying={speech.isPlaying}
          isPaused={speech.isPaused}
          isReady={speech.isReady}
          canLoad={Boolean(state.explanation)}
          usingFallback={speech.usingFallback}
          autoRead={speech.autoRead}
          playbackRate={speech.playbackRate}
          onPause={speech.pause}
          onResume={() => {
            if (speech.isReady) speech.resume();
            else
              void speech.play(
                voiceText.current || state.explanation,
                activeText,
                canvasInput?.explanationId ?? existingExplanationId,
              );
          }}
          onReplay={speech.replay}
          onStop={speech.stop}
          onAutoReadChange={speech.setAutoRead}
          onPlaybackRateChange={speech.setPlaybackRate}
        />
      )}
      <ExplanationContent
        selectedText={activeText}
        explanation={state.explanation}
        isLoading={state.isExplaining}
        error={state.error}
        activeWordIndex={speech.activeWordIndex}
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
          {activeText && (
            <button
              type="button"
              className="scholar-secondary-action flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs"
              disabled={state.isExplaining || isGraphing}
              onClick={() => void insertVerifiedGraph()}
            >
              <ChartSpline size={15} />
              {isGraphing
                ? "Drawing verified graph…"
                : "Insert / replace graph"}
            </button>
          )}
          {graphError && <p className="text-xs text-red-400">{graphError}</p>}
        </>
      )}
    </motion.section>
  );
}


