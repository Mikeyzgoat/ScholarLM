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
  useEffect(() => () => selectionCleanup.current?.(), []);

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
          const parts: string[] = [];
          const collectText = (value: unknown): void => {
            if (Array.isArray(value)) {
              value.forEach(collectText);
              return;
            }
            if (value && typeof value === "object") {
              const record = value as Record<string, unknown>;
              if (typeof record.text === "string" && record.text.trim())
                parts.push(record.text.trim());
              Object.entries(record)
                .filter(([key]) => key !== "text")
                .forEach(([, child]) => collectText(child));
            }
          };
          inputShapes.forEach((shape) => {
            const props = shape.props as Record<string, unknown>;
            if (typeof props.text === "string" && props.text.trim())
              parts.push(props.text.trim());
            if (props.richText) collectText(props.richText);
          });
          const text = [...new Set(parts)].join(" ").trim();
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
          if (!containsDrawing) onCanvasSelection?.({ text });
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
      className={
        embedded ? "relative h-full min-h-[576px]" : "absolute inset-0 top-14"
      }
    >
      <Tldraw colorScheme="dark" onMount={mount} />
    </div>
  );
}
