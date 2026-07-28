import { Hono } from "hono";
import { db } from "../db/database";
import {
  getGlobalKnowledgeGraph,
  getKnowledgeGraph,
} from "../services/knowledgeGraph";
const graph = new Hono();
graph.get("/", (c) => c.json(getGlobalKnowledgeGraph()));
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
