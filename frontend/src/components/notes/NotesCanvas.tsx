import { useCallback, useEffect, useRef } from "react";
import { Tldraw, loadSnapshot, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import type { NotePage } from "../../lib/types";
import type { CanvasSelection } from "../../lib/types";
import { isGeneratedExplanationShape } from "../../lib/generatedOutputs";
export function NotesCanvas({
  note,
  onEditorReady,
  embedded = false,
  onTextSelected,
  onCanvasSelection,
}: {
  note: NotePage;
  onEditorReady: (editor: Editor) => void;
  embedded?: boolean;
  onTextSelected?: (text: string) => void;
  onCanvasSelection?: (selection: CanvasSelection) => void;
}) {
  const selectionCleanup = useRef<(() => void) | null>(null);
  const lastSelection = useRef("");
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
    };
  }, []);

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
          const text = texts
            .map((value, index) =>
              texts.length > 1 ? `Selection ${index + 1}: ${value}` : value,
            )
            .join("\n\n");
          const signature = selectedShapes
            .map((shape) => shape.id)
            .sort()
            .join(",");
          if (!signature) {
            lastSelection.current = "";
            onTextSelected?.("");
            onCanvasSelection?.({ text: "" });
            return;
          }
          if (signature === lastSelection.current) return;
          lastSelection.current = signature;
          if (!inputShapes.length) {
            onTextSelected?.("");
            onCanvasSelection?.({ text: "" });
            return;
          }
          if (text) onTextSelected?.(text);
          const containsDrawing = inputShapes.some((shape) =>
            ["draw", "line", "arrow"].includes(shape.type),
          );
          if (!containsDrawing) onCanvasSelection?.({ text, texts });
          else
            void editor
              .toImageDataUrl(inputShapes, {
                format: "png",
                background: true,
                padding: 32,
                scale: 2,
              })
              .then(({ url }) => {
                if (lastSelection.current !== signature) return;
                onCanvasSelection?.({
                  text: text || "Handwritten equation",
                  texts,
                  imageDataUrl: url,
                });
              })
              .catch((error) =>
                console.error("Could not capture canvas selection", error),
              );
        },
        { scope: "session" },
      );
    },
    [note.id, onEditorReady, onTextSelected, onCanvasSelection],
  );
  return (
    <div
      ref={root}
      className={
        embedded ? "relative h-full min-h-[576px]" : "absolute inset-0 top-14"
      }
    >
      <Tldraw colorScheme="dark" onMount={mount} />
    </div>
  );
}
