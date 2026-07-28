import { useCallback, useEffect, useRef } from "react";
import { Tldraw, loadSnapshot, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import type { NotePage } from "../../lib/types";
export function NotesCanvas({
  note,
  onEditorReady,
  embedded = false,
  onTextSelected,
}: {
  note: NotePage;
  onEditorReady: (editor: Editor) => void;
  embedded?: boolean;
  onTextSelected?: (text: string) => void;
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
      )
        loadSnapshot(editor.store, note.snapshot);
      onEditorReady(editor);
      selectionCleanup.current?.();
      selectionCleanup.current = editor.store.listen(
        () => {
          if (!onTextSelected) return;
          const selectedShapes = editor.getSelectedShapes();
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
          selectedShapes.forEach((shape) => {
            const props = shape.props as Record<string, unknown>;
            if (typeof props.text === "string" && props.text.trim())
              parts.push(props.text.trim());
            if (props.richText) collectText(props.richText);
          });
          const text = [...new Set(parts)].join(" ").trim();
          if (!text) {
            lastSelection.current = "";
            return;
          }
          if (text && text !== lastSelection.current) {
            lastSelection.current = text;
            onTextSelected(text);
          }
        },
        { scope: "session" },
      );
    },
    [note.id, onEditorReady, onTextSelected],
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
