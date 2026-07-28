import { useEffect, useRef, useState } from "react";
import { getSnapshot, type Editor } from "tldraw";
import { NOTE_AUTOSAVE_DELAY } from "../lib/constants";
import type { NotePage, SaveState } from "../lib/types";
import { removeLocalNoteDraft, saveLocalNoteDraft } from "../lib/noteStorage";
import { getNote, updateNote } from "../services/notes";
export function useNoteAutosave({
  note,
  editor,
  onServerNoteUpdated,
}: {
  note: NotePage | undefined;
  editor: Editor | null;
  onServerNoteUpdated?: (note: NotePage) => void;
}) {
  const [saveState, setSaveState] = useState<SaveState>("saved"),
    [lastSavedAt, setLastSavedAt] = useState<string | null>(
      note?.updatedAt ?? null,
    );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    revision = useRef(note?.revision ?? 1),
    applying = useRef(true),
    dirty = useRef(false),
    inFlight = useRef<Promise<void> | null>(null),
    active = useRef(true);
  useEffect(
    () => () => {
      active.current = false;
    },
    [],
  );
  async function flush(): Promise<void> {
    if (!note || !editor || applying.current) return;
    if (inFlight.current) {
      await inFlight.current;
      if (dirty.current && active.current && !timer.current)
        timer.current = setTimeout(() => void flush(), NOTE_AUTOSAVE_DELAY);
      return;
    }
    if (!dirty.current && !timer.current) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    dirty.current = false;
    const snapshot = getSnapshot(editor.store);
    const updatedAt = new Date().toISOString();
    saveLocalNoteDraft({
      noteId: note.id,
      snapshot,
      metadata: note.metadata,
      revision: revision.current,
      updatedAt,
    });
    setSaveState("saving");
    const operation = (async () => {
      try {
        let updated: NotePage;
        try {
          updated = await updateNote({
            noteId: note.id,
            snapshot,
            metadata: note.metadata,
            expectedRevision: revision.current,
          });
        } catch {
          const latest = await getNote(note.id);
          revision.current = latest.revision;
          updated = await updateNote({
            noteId: note.id,
            snapshot,
            metadata: note.metadata,
            expectedRevision: latest.revision,
          });
        }
        revision.current = updated.revision;
        if (!dirty.current) removeLocalNoteDraft(note.id);
        setLastSavedAt(updated.updatedAt);
        setSaveState(dirty.current ? "unsaved" : "saved");
        onServerNoteUpdated?.(updated);
      } catch {
        dirty.current = true;
        setSaveState("error");
      }
    })();
    inFlight.current = operation;
    await operation;
    if (inFlight.current === operation) inFlight.current = null;
  }
  useEffect(() => {
    revision.current = note?.revision ?? 1;
    applying.current = true;
    const id = requestAnimationFrame(() => {
      applying.current = false;
    });
    return () => cancelAnimationFrame(id);
  }, [note?.id, note?.revision]);
  useEffect(() => {
    if (!note || !editor) return;
    const unsubscribe = editor.store.listen(
      () => {
        if (applying.current) return;
        dirty.current = true;
        const snapshot = getSnapshot(editor.store),
          updatedAt = new Date().toISOString();
        saveLocalNoteDraft({
          noteId: note.id,
          snapshot,
          metadata: note.metadata,
          revision: revision.current,
          updatedAt,
        });
        setSaveState("unsaved");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), NOTE_AUTOSAVE_DELAY);
      },
      { scope: "document" },
    );
    return () => {
      unsubscribe();
      if (timer.current) void flush();
    };
  }, [editor, note?.id]);
  return {
    saveState,
    lastSavedAt,
    recoverableDraftFound: note
      ? Boolean(localStorage.getItem(`scholarlm-note-draft:${note.id}`))
      : false,
    flush,
  };
}
