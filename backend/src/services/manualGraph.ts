import { createHash } from "node:crypto";
import { db } from "../db/database";
import type { GraphResponse } from "../types";
import { createId } from "../utils/ids";
import {
  normalizeVector,
  parseEmbedding,
  serializeEmbedding,
} from "../utils/vectors";

export type GraphScope =
  | { kind: "global" }
  | { kind: "document"; documentId: string };

const GROUP_COLORS = [
  "#0d9488",
  "#2563eb",
  "#7c3aed",
  "#c2410c",
  "#be123c",
  "#a16207",
] as const;

function scopeKey(scope: GraphScope): string {
  return scope.kind === "global" ? "global" : `document:${scope.documentId}`;
}

function canonicalPair(left: string, right: string): [string, string] {
  return left.localeCompare(right) <= 0 ? [left, right] : [right, left];
}

type GroupRow = {
  id: string;
  name: string;
  color: string;
  documentId: string | null;
  indexStatus: "indexed" | "empty" | "stale" | null;
  candidateCount: number | null;
};

export function getManualGraphData(
  scope: GraphScope,
  visibleNodeIds: Set<string>,
): Pick<GraphResponse, "edges" | "groups"> {
  const key = scopeKey(scope);
  const edges = (
    db
      .query(
        `SELECT id,source_node_id source,target_node_id target,relationship
         FROM manual_graph_edges WHERE scope_key=? ORDER BY created_at`,
      )
      .all(key) as GraphResponse["edges"]
  )
    .filter(
      (edge) =>
        visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
    )
    .map((edge) => ({ ...edge, manual: true }));
  const rows = db
    .query(
      `SELECT g.id,g.name,g.color,g.document_id documentId,
              i.status indexStatus,i.candidate_count candidateCount
       FROM manual_graph_groups g
       LEFT JOIN manual_graph_group_index i ON i.group_id=g.id
       WHERE g.scope_key=? ORDER BY g.created_at`,
    )
    .all(key) as GroupRow[];
  const memberQuery = db.query(
    "SELECT node_id nodeId FROM manual_graph_group_members WHERE group_id=? ORDER BY rowid",
  );
  const groups = rows.flatMap<GraphResponse["groups"][number]>((row) => {
    const memberNodeIds = (
      memberQuery.all(row.id) as Array<{ nodeId: string }>
    )
      .map((item) => item.nodeId)
      .filter((id) => visibleNodeIds.has(id));
    if (memberNodeIds.length < 2) return [];
    return [{
      id: row.id,
      name: row.name,
      color: row.color,
      memberNodeIds,
      scope: scope.kind,
      indexStatus: row.indexStatus ?? "stale",
      indexedCandidateCount: row.candidateCount ?? 0,
    }];
  });
  return { edges, groups };
}

export function createManualEdge(input: {
  scope: GraphScope;
  source: string;
  target: string;
  relationship: string;
}): string {
  const [source, target] = canonicalPair(input.source, input.target);
  if (source === target) throw new Error("Choose two different nodes");
  const relationship = input.relationship.trim();
  if (!relationship || relationship.length > 80)
    throw new Error("Relationship must be between 1 and 80 characters");
  const id = createId();
  const now = new Date().toISOString();
  db.query(
    `INSERT INTO manual_graph_edges
     (id,scope_key,document_id,source_node_id,target_node_id,relationship,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    scopeKey(input.scope),
    input.scope.kind === "document" ? input.scope.documentId : null,
    source,
    target,
    relationship,
    now,
    now,
  );
  return id;
}

export function updateManualEdge(id: string, relationship: string): boolean {
  const value = relationship.trim();
  if (!value || value.length > 80)
    throw new Error("Relationship must be between 1 and 80 characters");
  return Boolean(
    db
      .query(
        "UPDATE manual_graph_edges SET relationship=?,updated_at=? WHERE id=?",
      )
      .run(value, new Date().toISOString(), id).changes,
  );
}

export function deleteManualEdge(id: string): boolean {
  return Boolean(
    db.query("DELETE FROM manual_graph_edges WHERE id=?").run(id).changes,
  );
}

export function createManualGroup(input: {
  scope: GraphScope;
  name: string;
  color: string;
  memberNodeIds: string[];
}): string {
  const name = input.name.trim();
  if (!name || name.length > 80)
    throw new Error("Group name must be between 1 and 80 characters");
  if (!GROUP_COLORS.includes(input.color as (typeof GROUP_COLORS)[number]))
    throw new Error("Choose a supported group color");
  const members = [...new Set(input.memberNodeIds)];
  if (members.length < 2 || members.length > 100)
    throw new Error("A group needs between 2 and 100 nodes");
  const id = createId();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.query(
      `INSERT INTO manual_graph_groups
       (id,scope_key,document_id,name,color,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).run(
      id,
      scopeKey(input.scope),
      input.scope.kind === "document" ? input.scope.documentId : null,
      name,
      input.color,
      now,
      now,
    );
    const insert = db.query(
      "INSERT INTO manual_graph_group_members(group_id,scope_key,node_id) VALUES (?,?,?)",
    );
    members.forEach((nodeId) => insert.run(id, scopeKey(input.scope), nodeId));
  })();
  rebuildGroupIndex(id);
  return id;
}

export function updateManualGroup(input: {
  id: string;
  name?: string;
  color?: string;
  memberNodeIds?: string[];
}): boolean {
  const row = db
    .query("SELECT scope_key scopeKey FROM manual_graph_groups WHERE id=?")
    .get(input.id) as { scopeKey: string } | null;
  if (!row) return false;
  const name = input.name?.trim();
  if (name !== undefined && (!name || name.length > 80))
    throw new Error("Group name must be between 1 and 80 characters");
  if (
    input.color !== undefined &&
    !GROUP_COLORS.includes(input.color as (typeof GROUP_COLORS)[number])
  )
    throw new Error("Choose a supported group color");
  if (input.memberNodeIds) {
    const members = [...new Set(input.memberNodeIds)];
    if (members.length < 2 || members.length > 100)
      throw new Error("A group needs between 2 and 100 nodes");
    db.transaction(() => {
      db.query("DELETE FROM manual_graph_group_members WHERE group_id=?").run(
        input.id,
      );
      const insert = db.query(
        "INSERT INTO manual_graph_group_members(group_id,scope_key,node_id) VALUES (?,?,?)",
      );
      members.forEach((nodeId) => insert.run(input.id, row.scopeKey, nodeId));
    })();
  }
  db.query(
    `UPDATE manual_graph_groups SET name=COALESCE(?,name),
     color=COALESCE(?,color),updated_at=? WHERE id=?`,
  ).run(name ?? null, input.color ?? null, new Date().toISOString(), input.id);
  if (input.memberNodeIds) rebuildGroupIndex(input.id, true);
  return true;
}

export function deleteManualGroup(id: string): boolean {
  return Boolean(
    db.query("DELETE FROM manual_graph_groups WHERE id=?").run(id).changes,
  );
}

export function removeManualGraphNodes(
  nodeIds: string[],
  documentId?: string,
): void {
  const ids = [...new Set(nodeIds)].filter(Boolean);
  db.transaction(() => {
    const removeEdges = db.query(
      "DELETE FROM manual_graph_edges WHERE source_node_id=? OR target_node_id=?",
    );
    const removeMembers = db.query(
      "DELETE FROM manual_graph_group_members WHERE node_id=?",
    );
    ids.forEach((id) => {
      removeEdges.run(id, id);
      removeMembers.run(id);
    });
    if (documentId) {
      db.query("DELETE FROM manual_graph_edges WHERE document_id=?").run(
        documentId,
      );
      db.query("DELETE FROM manual_graph_groups WHERE document_id=?").run(
        documentId,
      );
    }
    db.exec(
      `DELETE FROM manual_graph_groups
       WHERE (SELECT COUNT(*) FROM manual_graph_group_members
              WHERE group_id=manual_graph_groups.id)<2`,
    );
  })();
}

type Candidate = {
  id: string;
  kind: "pdf" | "sticky";
  documentId: string;
  embedding: string | Uint8Array;
};

function groupCandidates(groupId: string): Candidate[] {
  const members = (
    db
      .query(
        "SELECT node_id nodeId FROM manual_graph_group_members WHERE group_id=?",
      )
      .all(groupId) as Array<{ nodeId: string }>
  ).map((item) => item.nodeId);
  const candidates = new Map<string, Candidate>();
  const addChunks = (where: string, ...params: Array<string | number>) => {
    const rows = db
      .query(
        `SELECT id,'pdf' kind,document_id documentId,embedding FROM chunks
         WHERE embedding IS NOT NULL AND ${where}`,
      )
      .all(...params) as Candidate[];
    rows.forEach((item) => candidates.set(`pdf:${item.id}`, item));
  };
  const addStickies = (where: string, ...params: Array<string | number>) => {
    const rows = db
      .query(
        `SELECT id,'sticky' kind,document_id documentId,embedding
         FROM sticky_note_index WHERE ${where}`,
      )
      .all(...params) as Candidate[];
    rows.forEach((item) => candidates.set(`sticky:${item.id}`, item));
  };
  members.forEach((nodeId) => {
    if (nodeId.startsWith("source:"))
      addChunks("document_id=?", nodeId.slice(7));
    else if (nodeId.startsWith("note:"))
      addStickies("note_id=?", nodeId.slice(5));
    else if (nodeId.startsWith("sticky:"))
      addStickies("id=?", nodeId);
    else if (nodeId.startsWith("handwriting:"))
      addStickies("explanation_id=?", nodeId.slice(12));
    else {
      const concept = db
        .query(
          "SELECT document_id documentId,page_number pageNumber FROM concepts WHERE id=?",
        )
        .get(nodeId) as {
        documentId: string;
        pageNumber: number | null;
      } | null;
      if (concept?.pageNumber)
        addChunks(
          "document_id=? AND page_number=?",
          concept.documentId,
          concept.pageNumber,
        );
    }
  });
  return [...candidates.values()];
}

export function rebuildGroupIndex(groupId: string, force = false): void {
  const candidates = groupCandidates(groupId);
  const fingerprint = createHash("sha256")
    .update(
      candidates
        .map((item) => `${item.kind}:${item.id}:${String(item.embedding)}`)
        .sort()
        .join("\u001f"),
    )
    .digest("hex");
  const existing = db
    .query(
      "SELECT content_hash contentHash FROM manual_graph_group_index WHERE group_id=?",
    )
    .get(groupId) as { contentHash: string } | null;
  if (!force && existing?.contentHash === fingerprint) return;
  const vectors = candidates
    .map((item) => normalizeVector(parseEmbedding(item.embedding)))
    .filter((vector) => vector.length);
  const dimension = vectors[0]?.length ?? 0;
  const compatible = vectors.filter((vector) => vector.length === dimension);
  const centroid = new Float32Array(dimension);
  compatible.forEach((vector) =>
    vector.forEach((value, index) => {
      centroid[index] += value;
    }),
  );
  const normalized = dimension ? normalizeVector(Array.from(centroid)) : null;
  const refs = candidates.map((item) => ({
    id: item.id,
    kind: item.kind,
    documentId: item.documentId,
  }));
  db.query(
    `INSERT INTO manual_graph_group_index
     (group_id,embedding,candidate_refs,content_hash,candidate_count,status,updated_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(group_id) DO UPDATE SET embedding=excluded.embedding,
       candidate_refs=excluded.candidate_refs,content_hash=excluded.content_hash,
       candidate_count=excluded.candidate_count,status=excluded.status,
       updated_at=excluded.updated_at`,
  ).run(
    groupId,
    normalized ? serializeEmbedding(Array.from(normalized)) : null,
    JSON.stringify(refs),
    fingerprint,
    refs.length,
    normalized ? "indexed" : "empty",
    new Date().toISOString(),
  );
}

export function rebuildDocumentGroupIndexes(documentId: string): void {
  const groups = db
    .query(
      `SELECT g.id FROM manual_graph_groups g
       LEFT JOIN manual_graph_group_index i ON i.group_id=g.id
       WHERE g.document_id=? AND (i.group_id IS NULL OR i.status='stale')`,
    )
    .all(documentId) as Array<{ id: string }>;
  groups.forEach((group) => rebuildGroupIndex(group.id));
}

export function markGraphGroupIndexesStale(documentId: string): void {
  db.query(
    `UPDATE manual_graph_group_index SET status='stale'
     WHERE group_id IN (
       SELECT id FROM manual_graph_groups
       WHERE document_id=? OR scope_key='global'
     )`,
  ).run(documentId);
}

export function getDocumentGroupRouting(input: {
  documentId: string;
  queryVector: Float32Array;
  topGroups?: number;
}): { allowedGroupedCandidates: Set<string>; groupedCandidates: Set<string> } {
  rebuildDocumentGroupIndexes(input.documentId);
  const rows = db
    .query(
      `SELECT i.embedding,i.candidate_refs refs
       FROM manual_graph_group_index i
       JOIN manual_graph_groups g ON g.id=i.group_id
       WHERE g.document_id=? AND i.status='indexed'`,
    )
    .all(input.documentId) as Array<{
    embedding: string | Uint8Array;
    refs: string;
  }>;
  const scored = rows
    .map((row) => ({
      refs: JSON.parse(row.refs) as Array<{
        id: string;
        kind: "pdf" | "sticky";
        documentId: string;
      }>,
      vector: normalizeVector(parseEmbedding(row.embedding)),
    }))
    .filter((item) => item.vector.length === input.queryVector.length)
    .map((item) => ({
      ...item,
      score: item.vector.reduce(
        (sum, value, index) => sum + value * input.queryVector[index],
        0,
      ),
    }))
    .sort((left, right) => right.score - left.score);
  const groupedCandidates = new Set<string>();
  scored.forEach((group) =>
    group.refs.forEach((ref) =>
      groupedCandidates.add(`${ref.kind}:${ref.id}`),
    ),
  );
  const allowedGroupedCandidates = new Set<string>();
  scored.slice(0, input.topGroups ?? 3).forEach((group) =>
    group.refs.forEach((ref) => {
      if (ref.documentId === input.documentId)
        allowedGroupedCandidates.add(`${ref.kind}:${ref.id}`);
    }),
  );
  return { allowedGroupedCandidates, groupedCandidates };
}
