import { Hono } from "hono";
import {
  CanvasRevisionConflictError,
  deleteStandaloneCanvas,
  getStandaloneCanvas,
  listStandaloneCanvases,
  saveStandaloneCanvas,
} from "../services/standaloneCanvases";

const canvases = new Hono();

canvases.get("/", (c) => c.json({ canvases: listStandaloneCanvases() }));

canvases.get("/:canvasId", (c) => {
  const canvas = getStandaloneCanvas(c.req.param("canvasId"));
  return canvas
    ? c.json({ canvas })
    : c.json(
        { error: { message: "Canvas not found", code: "NOT_FOUND" } },
        404,
      );
});

canvases.put("/:canvasId", async (c) => {
  const canvasId = c.req.param("canvasId");
  const body = (await c.req.json<unknown>().catch(() => null)) as {
    title?: unknown;
    snapshot?: unknown;
    expectedRevision?: unknown;
  } | null;
  if (
    !canvasId ||
    !body ||
    typeof body.title !== "string" ||
    !body.title.trim() ||
    body.title.length > 200 ||
    body.snapshot === undefined ||
    (body.expectedRevision !== undefined &&
      !Number.isInteger(body.expectedRevision))
  )
    return c.json(
      { error: { message: "Invalid canvas save", code: "INVALID_INPUT" } },
      400,
    );
  try {
    return c.json({
      canvas: saveStandaloneCanvas({
        canvasId,
        title: body.title.trim(),
        snapshot: body.snapshot,
        expectedRevision: body.expectedRevision as number | undefined,
      }),
    });
  } catch (error) {
    if (error instanceof CanvasRevisionConflictError)
      return c.json(
        { error: { message: error.message, code: "REVISION_CONFLICT" } },
        409,
      );
    throw error;
  }
});

canvases.delete("/:canvasId", (c) =>
  deleteStandaloneCanvas(c.req.param("canvasId"))
    ? c.body(null, 204)
    : c.json(
        { error: { message: "Canvas not found", code: "NOT_FOUND" } },
        404,
      ),
);

export default canvases;
