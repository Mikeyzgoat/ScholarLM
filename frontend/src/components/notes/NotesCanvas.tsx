import { useCallback, useEffect, useRef } from "react";
import {
  Tldraw,
  loadSnapshot,
  type Editor,
  type TLShape,
  type TLShapeId,
} from "tldraw";
import "tldraw/tldraw.css";
import type { NotePage } from "../../lib/types";
import type { CanvasSelection } from "../../lib/types";
import {
  findGeneratedOutputById,
  isGeneratedExplanationShape,
} from "../../lib/generatedOutputs";
import { useTheme } from "../../lib/theme";
import { pdfPageShapeUtils } from "./PdfPageShape";
import { explanationStickyShapeUtils } from "./ExplanationStickyShape";

function shapesWithDescendants(editor: Editor, shapes: TLShape[]): TLShape[] {
  if (!shapes.length) return [];
  return [...editor.getShapeAndDescendantIds(shapes.map((shape) => shape.id))]
    .map((id) => editor.getShape(id))
    .filter((shape): shape is TLShape => Boolean(shape));
}

function selectionSignature(editor: Editor, shapes: TLShape[]): string {
  return shapesWithDescendants(editor, shapes)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((shape) =>
      JSON.stringify([
        shape.id,
        shape.parentId,
        shape.x,
        shape.y,
        shape.rotation,
        shape.props,
      ]),
    )
    .join("\u001e");
}

export function NotesCanvas({
  note,
  onEditorReady,
  embedded = false,
  onTextSelected,
  onCanvasSelection,
  onPdfTextSelected,
}: {
  note: NotePage;
  onEditorReady: (editor: Editor) => void;
  embedded?: boolean;
  onTextSelected?: (text: string) => void;
  onCanvasSelection?: (selection: CanvasSelection) => void;
  onPdfTextSelected?: (text: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const selectionCleanup = useRef<(() => void) | null>(null);
  const captureFrame = useRef(0);
  const lastSelection = useRef("");
  const lastPdfSelection = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    let offset = { x: 0, y: 0 };
    try {
      const saved = localStorage.getItem("scholarlm-style-panel-position");
      if (saved) offset = JSON.parse(saved) as { x: number; y: number };
    } catch {
      localStorage.removeItem("scholarlm-style-panel-position");
    }
    const applyPosition = () => {
      host
        .querySelectorAll<HTMLElement>(".tlui-style-panel__wrapper")
        .forEach((panel) => {
          panel.style.translate = `${offset.x}px ${offset.y}px`;
          panel.dataset.floating = "true";
        });
    };
    const observer = new MutationObserver(applyPosition);
    observer.observe(host, { childList: true, subtree: true });
    applyPosition();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      const panel = target.closest<HTMLElement>(
        ".tlui-style-panel__wrapper",
      );
      if (!panel) return;
      const bounds = panel.getBoundingClientRect();
      const onHandle =
        event.clientY >= bounds.top - 28 && event.clientY <= bounds.top + 8;
      if (!onHandle) return;
      event.preventDefault();
      const start = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        offsetX: offset.x,
        offsetY: offset.y,
      };
      const move = (moveEvent: PointerEvent) => {
        offset = {
          x: start.offsetX + moveEvent.clientX - start.pointerX,
          y: start.offsetY + moveEvent.clientY - start.pointerY,
        };
        panel.style.translate = `${offset.x}px ${offset.y}px`;
      };
      const up = () => {
        localStorage.setItem(
          "scholarlm-style-panel-position",
          JSON.stringify(offset),
        );
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };
    host.addEventListener("pointerdown", onPointerDown);
    return () => {
      observer.disconnect();
      host.removeEventListener("pointerdown", onPointerDown);
      selectionCleanup.current?.();
      cancelAnimationFrame(captureFrame.current);
    };
  }, []);
  useEffect(() => {
    const selected = (event: Event) => {
      const text = (event as CustomEvent<unknown>).detail;
      if (typeof text === "string" && text.trim()) {
        lastPdfSelection.current = Date.now();
        onPdfTextSelected?.(text.trim());
      }
    };
    window.addEventListener("scholarlm:pdf-selection", selected);
    return () =>
      window.removeEventListener("scholarlm:pdf-selection", selected);
  }, [onPdfTextSelected]);

  const mount = useCallback(
    (editor: Editor) => {
      if (
        note.snapshot &&
        typeof note.snapshot === "object" &&
        Object.keys(note.snapshot).length
      ) {
        try {
          loadSnapshot(editor.store, note.snapshot);
        } catch (error) {
          console.error(
            `Could not restore the tldraw snapshot for note ${note.id}. The saved data was left untouched.`,
            error,
          );
        }
      }
      onEditorReady(editor);
      selectionCleanup.current?.();
      selectionCleanup.current = editor.store.listen(
        () => {
          if (!onTextSelected && !onCanvasSelection) return;
          const selectedShapes = editor.getSelectedShapes();
          const generatedShapes = selectedShapes.filter(
            isGeneratedExplanationShape,
          );
          const inputShapes = selectedShapes.filter(
            (shape) => !isGeneratedExplanationShape(shape),
          );
          const collectText = (value: unknown, parts: string[]): void => {
            if (Array.isArray(value)) {
              value.forEach((child) => collectText(child, parts));
              return;
            }
            if (value && typeof value === "object") {
              const record = value as Record<string, unknown>;
              if (typeof record.text === "string" && record.text.trim())
                parts.push(record.text.trim());
              Object.entries(record)
                .filter(([key]) => key !== "text")
                .forEach(([, child]) => collectText(child, parts));
            }
          };
          const texts = inputShapes.flatMap((shape) => {
            const parts: string[] = [];
            const props = shape.props as Record<string, unknown>;
            if (typeof props.text === "string" && props.text.trim())
              parts.push(props.text.trim());
            if (props.richText) collectText(props.richText, parts);
            const value = [...new Set(parts)].join(" ").trim();
            return value ? [value] : [];
          });
          const anchors = inputShapes.flatMap((shape) => {
            const bounds = editor.getShapePageBounds(shape);
            if (!bounds) return [];
            const props = shape.props as Record<string, unknown>;
            const parts: string[] = [];
            if (typeof props.text === "string" && props.text.trim())
              parts.push(props.text.trim());
            if (props.richText) collectText(props.richText, parts);
            const anchorText = [...new Set(parts)].join(" ").trim();
            return anchorText
              ? [
                  {
                    shapeId: shape.id,
                    text: anchorText,
                    x: bounds.x,
                    y: bounds.y,
                    width: bounds.w,
                    height: bounds.h,
                  },
                ]
              : [];
          });
          const text = texts
            .map((value, index) =>
              texts.length > 1 ? `Selection ${index + 1}: ${value}` : value,
            )
            .join("\n\n");
          const selectedBounds = editor.getSelectionPageBounds();
          const relevantAnchors =
            anchors.length || !selectedBounds || !inputShapes.length
              ? anchors
              : [
                  {
                    shapeId: inputShapes[0].id,
                    text: text || "Handwritten equation",
                    x: selectedBounds.x,
                    y: selectedBounds.y,
                    width: selectedBounds.w,
                    height: selectedBounds.h,
                  },
                ];
          const signature = selectionSignature(editor, selectedShapes);
          if (!signature) {
            const browserSelection = getSelection()?.toString().trim() ?? "";
            if (
              browserSelection ||
              Date.now() - lastPdfSelection.current < 1500
            )
              return;
            lastSelection.current = "";
            onTextSelected?.("");
            onCanvasSelection?.({ text: "" });
            return;
          }
          if (signature === lastSelection.current) return;
          lastSelection.current = signature;
          if (!inputShapes.length) {
            if (generatedShapes.length === 1) {
              if (
                generatedShapes[0].type === "text" &&
                generatedShapes[0].props.color !== "black"
              )
                editor.updateShape({
                  id: generatedShapes[0].id,
                  type: "text",
                  meta: JSON.parse(
                    JSON.stringify(generatedShapes[0].meta),
                  ),
                  props: { color: "black" },
                });
              const meta = generatedShapes[0].meta as Record<string, unknown>;
              const mapped =
                typeof meta.scholarLmOutputId === "string"
                  ? findGeneratedOutputById(meta.scholarLmOutputId)
                  : null;
              const sourceText =
                typeof meta.scholarLmSourceText === "string"
                  ? meta.scholarLmSourceText
                  : mapped?.sourceText ?? "";
              const existingExplanation =
                typeof meta.scholarLmExplanation === "string"
                  ? meta.scholarLmExplanation
                  : mapped?.text ?? "";
              const explanationId =
                typeof meta.scholarLmExplanationId === "string"
                  ? meta.scholarLmExplanationId
                  : generatedShapes[0].type === "scholar-explanation-sticky"
                    ? generatedShapes[0].props.explanationId
                    : undefined;
              onTextSelected?.(sourceText);
              onCanvasSelection?.({
                text: sourceText,
                existingExplanation,
                explanationId,
                generatedOutput: true,
              });
            } else {
              onTextSelected?.("");
              onCanvasSelection?.({ text: "" });
            }
            return;
          }
          if (text) onTextSelected?.(text);
          const containsDrawing = shapesWithDescendants(
            editor,
            inputShapes,
          ).some((shape) =>
            ["draw", "line", "arrow"].includes(shape.type),
          );
          if (!containsDrawing)
            onCanvasSelection?.({ text, texts, anchors: relevantAnchors });
          else {
            onCanvasSelection?.({
              text: text || "Handwritten equation",
              texts,
              anchors: relevantAnchors,
            });
            cancelAnimationFrame(captureFrame.current);
            captureFrame.current = requestAnimationFrame(() => {
              if (
                lastSelection.current !== signature ||
                selectionSignature(editor, editor.getSelectedShapes()) !==
                  signature
              )
                return;
              const freshShapes = inputShapes
                .map((shape) => editor.getShape(shape.id as TLShapeId))
                .filter((shape): shape is TLShape => Boolean(shape));
              void editor
                .toImageDataUrl(freshShapes, {
                  format: "png",
                  background: true,
                  padding: 32,
                  scale: 2,
                })
                .then(({ url }) => {
                  if (
                    lastSelection.current !== signature ||
                    selectionSignature(editor, editor.getSelectedShapes()) !==
                      signature
                  )
                    return;
                  onCanvasSelection?.({
                    text: text || "Handwritten equation",
                    texts,
                    anchors: relevantAnchors,
                    imageDataUrl: url,
                  });
                })
                .catch((error) =>
                  console.error("Could not capture canvas selection", error),
                );
            });
          }
        },
        { scope: "all" },
      );
    },
    [note.id, onEditorReady, onTextSelected, onCanvasSelection],
  );
  return (
    <div
      ref={root}
      onMouseUp={() => {
        const text = getSelection()?.toString().trim() ?? "";
        if (text) {
          lastPdfSelection.current = Date.now();
          onPdfTextSelected?.(text);
        }
      }}
      className={
        embedded ? "relative h-full min-h-0" : "absolute inset-0 top-14"
      }
    >
      <Tldraw
        colorScheme={resolvedTheme}
        onMount={mount}
        shapeUtils={[...pdfPageShapeUtils, ...explanationStickyShapeUtils]}
      />
    </div>
  );
}
