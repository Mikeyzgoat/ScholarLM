import { Context, Hono } from "hono";
import { db } from "../db/database";
import {
  getGlobalKnowledgeGraph,
  getKnowledgeGraph,
} from "../services/knowledgeGraph";
import { getNote, updateNote } from "../services/notes";
import {
  getStandaloneCanvas,
  saveStandaloneCanvas,
} from "../services/standaloneCanvases";
import { indexNoteStickies } from "../services/stickyNotes";
import {
  createManualEdge,
  createManualGroup,
  deleteManualEdge,
  deleteManualGroup,
  type GraphScope,
  removeManualGraphNodes,
  updateManualEdge,
  updateManualGroup,
} from "../services/manualGraph";
const graph = new Hono();

function parseScope(value: unknown, documentId: unknown): GraphScope | null {
  if (value === "global") return { kind: "global" };
  if (
    value === "document" &&
    typeof documentId === "string" &&
    documentId.trim()
  )
    return { kind: "document", documentId };
  return null;
}

function visibleNodeIds(scope: GraphScope): Set<string> {
  const response =
    scope.kind === "global"
      ? getGlobalKnowledgeGraph()
      : getKnowledgeGraph(scope.documentId);
  return new Set(response.nodes.map((node) => node.id));
}

function graphInputError(c: Context, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Invalid graph curation request";
  const conflict =
    message.includes("UNIQUE constraint failed") ||
    message.includes("already belongs");
  return c.json(
    {
      error: {
        message: conflict
          ? "That connection exists or one of the nodes already belongs to a group"
          : message,
        code: conflict ? "CONFLICT" : "INVALID_INPUT",
      },
    },
    conflict ? 409 : 400,
  );
}

function withoutShapes(snapshot: unknown, shapeIds: string[]): {
  snapshot: unknown;
  removed: number;
} {
  const copy = JSON.parse(JSON.stringify(snapshot)) as {
    document?: { store?: Record<string, unknown> };
  };
  const store = copy.document?.store;
  if (!store) return { snapshot: copy, removed: 0 };
  const removedIds = new Set(shapeIds);
  let changed = true;
  while (changed) {
    changed = false;
    Object.values(store).forEach((value) => {
      if (!value || typeof value !== "object") return;
      const record = value as { id?: unknown; parentId?: unknown };
      if (
        typeof record.id === "string" &&
        typeof record.parentId === "string" &&
        removedIds.has(record.parentId) &&
        !removedIds.has(record.id)
      ) {
        removedIds.add(record.id);
        changed = true;
      }
    });
  }
  let removed = 0;
  removedIds.forEach((id) => {
    if (id in store) {
      delete store[id];
      removed += 1;
    }
  });
  return { snapshot: copy, removed };
}

graph.get("/", (c) => c.json(getGlobalKnowledgeGraph()));
graph.post("/manual/edges", async (c) => {
  const body = (await c.req.json<unknown>().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const scope = parseScope(body?.scope, body?.documentId);
  if (
    !body ||
    !scope ||
    typeof body.source !== "string" ||
    typeof body.target !== "string" ||
    typeof body.relationship !== "string"
  )
    return c.json(
      { error: { message: "Invalid manual connection", code: "INVALID_INPUT" } },
      400,
    );
  const visible = visibleNodeIds(scope);
  if (!visible.has(body.source) || !visible.has(body.target))
    return c.json(
      { error: { message: "Graph node not found", code: "NOT_FOUND" } },
      404,
    );
  try {
    const id = createManualEdge({
      scope,
      source: body.source,
      target: body.target,
      relationship: body.relationship,
    });
    return c.json({ id }, 201);
  } catch (error) {
    return graphInputError(c, error);
  }
});
graph.patch("/manual/edges/:edgeId", async (c) => {
  const body = (await c.req.json<unknown>().catch(() => null)) as {
    relationship?: unknown;
  } | null;
  if (!body || typeof body.relationship !== "string")
    return c.json(
      { error: { message: "Relationship is required", code: "INVALID_INPUT" } },
      400,
    );
  try {
    return updateManualEdge(c.req.param("edgeId"), body.relationship)
      ? c.body(null, 204)
      : c.json(
          { error: { message: "Connection not found", code: "NOT_FOUND" } },
          404,
        );
  } catch (error) {
    return graphInputError(c, error);
  }
});
graph.delete("/manual/edges/:edgeId", (c) =>
  deleteManualEdge(c.req.param("edgeId"))
    ? c.body(null, 204)
    : c.json(
        { error: { message: "Connection not found", code: "NOT_FOUND" } },
        404,
      ),
);
graph.post("/manual/groups", async (c) => {
  const body = (await c.req.json<unknown>().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const scope = parseScope(body?.scope, body?.documentId);
  if (
    !body ||
    !scope ||
    typeof body.name !== "string" ||
    typeof body.color !== "string" ||
    !Array.isArray(body.memberNodeIds) ||
    !body.memberNodeIds.every((id) => typeof id === "string")
  )
    return c.json(
      { error: { message: "Invalid manual group", code: "INVALID_INPUT" } },
      400,
    );
  const visible = visibleNodeIds(scope);
  if (!body.memberNodeIds.every((id) => visible.has(id as string)))
    return c.json(
      { error: { message: "Graph node not found", code: "NOT_FOUND" } },
      404,
    );
  try {
    const id = createManualGroup({
      scope,
      name: body.name,
      color: body.color,
      memberNodeIds: body.memberNodeIds as string[],
    });
    return c.json({ id }, 201);
  } catch (error) {
    return graphInputError(c, error);
  }
});
graph.patch("/manual/groups/:groupId", async (c) => {
  const body = (await c.req.json<unknown>().catch(() => null)) as {
    name?: unknown;
    color?: unknown;
    memberNodeIds?: unknown;
  } | null;
  if (
    !body ||
    (body.name !== undefined && typeof body.name !== "string") ||
    (body.color !== undefined && typeof body.color !== "string") ||
    (body.memberNodeIds !== undefined &&
      (!Array.isArray(body.memberNodeIds) ||
        !body.memberNodeIds.every((id) => typeof id === "string")))
  )
    return c.json(
      { error: { message: "Invalid manual group update", code: "INVALID_INPUT" } },
      400,
    );
  if (Array.isArray(body.memberNodeIds)) {
    const row = db
      .query(
        "SELECT scope_key scopeKey,document_id documentId FROM manual_graph_groups WHERE id=?",
      )
      .get(c.req.param("groupId")) as {
      scopeKey: string;
      documentId: string | null;
    } | null;
    if (!row)
      return c.json(
        { error: { message: "Group not found", code: "NOT_FOUND" } },
        404,
      );
    const scope: GraphScope =
      row.scopeKey === "global"
        ? { kind: "global" }
        : { kind: "document", documentId: row.documentId! };
    const visible = visibleNodeIds(scope);
    if (!body.memberNodeIds.every((id) => visible.has(id as string)))
      return c.json(
        { error: { message: "Graph node not found", code: "NOT_FOUND" } },
        404,
      );
  }
  try {
    return updateManualGroup({
      id: c.req.param("groupId"),
      name: body.name as string | undefined,
      color: body.color as string | undefined,
      memberNodeIds: body.memberNodeIds as string[] | undefined,
    })
      ? c.body(null, 204)
      : c.json(
          { error: { message: "Group not found", code: "NOT_FOUND" } },
          404,
        );
  } catch (error) {
    return graphInputError(c, error);
  }
});
graph.delete("/manual/groups/:groupId", (c) =>
  deleteManualGroup(c.req.param("groupId"))
    ? c.body(null, 204)
    : c.json(
        { error: { message: "Group not found", code: "NOT_FOUND" } },
        404,
      ),
);
graph.delete("/concepts/:conceptId", (c) => {
  const conceptId = c.req.param("conceptId");
  const removed = db
    .query("DELETE FROM concepts WHERE id=?")
    .run(conceptId).changes;
  if (removed) removeManualGraphNodes([conceptId]);
  return removed
    ? c.body(null, 204)
    : c.json(
        { error: { message: "Concept not found", code: "NOT_FOUND" } },
        404,
      );
});
graph.delete("/explanations/:explanationId", (c) => {
  const explanationId = c.req.param("explanationId");
  const removed = db
    .query("DELETE FROM explanation_history WHERE id=?")
    .run(explanationId).changes;
  if (removed) removeManualGraphNodes([`handwriting:${explanationId}`]);
  return removed
    ? c.body(null, 204)
    : c.json(
        { error: { message: "Explanation not found", code: "NOT_FOUND" } },
        404,
      );
});
graph.post("/nodes/delete", async (c) => {
  const body = (await c.req.json<unknown>().catch(() => null)) as {
    noteId?: unknown;
    canvasId?: unknown;
    shapeIds?: unknown;
  } | null;
  const shapeIds =
    body && Array.isArray(body.shapeIds)
      ? [
          ...new Set(
            body.shapeIds.filter(
              (value): value is string =>
                typeof value === "string" && Boolean(value.trim()),
            ),
          ),
        ]
      : [];
  if (
    !body ||
    shapeIds.length < 1 ||
    shapeIds.length > 500 ||
    (typeof body.noteId !== "string" &&
      typeof body.canvasId !== "string")
  )
    return c.json(
      { error: { message: "Invalid graph-node deletion", code: "INVALID_INPUT" } },
      400,
    );
  if (typeof body.noteId === "string") {
    const note = getNote(body.noteId);
    if (!note)
      return c.json(
        { error: { message: "Note not found", code: "NOT_FOUND" } },
        404,
      );
    const next = withoutShapes(note.snapshot, shapeIds);
    if (!next.removed)
      return c.json(
        { error: { message: "Canvas shape not found", code: "NOT_FOUND" } },
        404,
      );
    const updated = updateNote({
      noteId: note.id,
      snapshot: next.snapshot,
      expectedRevision: note.revision,
    });
    await indexNoteStickies({
      noteId: updated.id,
      documentId: updated.documentId,
      snapshot: updated.snapshot,
    });
    return c.json({ removed: next.removed });
  }
  const canvas = getStandaloneCanvas(String(body.canvasId));
  if (!canvas)
    return c.json(
      { error: { message: "Canvas not found", code: "NOT_FOUND" } },
      404,
    );
  const next = withoutShapes(canvas.snapshot, shapeIds);
  if (!next.removed)
    return c.json(
      { error: { message: "Canvas shape not found", code: "NOT_FOUND" } },
      404,
    );
  const updated = saveStandaloneCanvas({
    canvasId: canvas.id,
    title: canvas.title,
    snapshot: next.snapshot,
    expectedRevision: canvas.revision,
  });
  return c.json({ removed: next.removed, canvas: updated });
});
graph.get("/:documentId", (c) => {
  const id = c.req.param("documentId");
  if (!id)
    return c.json(
      { error: { message: "Document ID is required", code: "INVALID_ID" } },
      400,
    );
  if (!db.query("SELECT 1 FROM documents WHERE id=?").get(id))
    return c.json(
      { error: { message: "Document not found", code: "NOT_FOUND" } },
      404,
    );
  return c.json(getKnowledgeGraph(id));
});
export default graph;
