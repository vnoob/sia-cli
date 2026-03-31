import crypto from "node:crypto";
import type Database from "better-sqlite3";
import { bufferToEmbedding, cosineSimilarity, embeddingToBuffer } from "./math.js";

export function insertKnowledgeChunk(
  db: Database.Database,
  sourceUri: string,
  text: string,
  embedding: number[],
): string {
  const id = crypto.randomUUID();
  const blob = embeddingToBuffer(embedding);
  db.prepare(
    `INSERT INTO knowledge_chunks (id, source_uri, text, embedding, dim)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, sourceUri, text, blob, embedding.length);
  return id;
}

export function listAllChunks(db: Database.Database): { id: string; source_uri: string; text: string; embedding: number[] }[] {
  const rows = db
    .prepare(`SELECT id, source_uri, text, embedding FROM knowledge_chunks`)
    .all() as { id: string; source_uri: string; text: string; embedding: Buffer }[];
  return rows.map((r) => ({
    id: r.id,
    source_uri: r.source_uri,
    text: r.text,
    embedding: bufferToEmbedding(Buffer.from(r.embedding)),
  }));
}

export function searchTopK(
  db: Database.Database,
  queryEmbedding: number[],
  k: number,
): { source_uri: string; text: string; score: number }[] {
  const chunks = listAllChunks(db);
  const scored = chunks
    .map((c) => ({
      source_uri: c.source_uri,
      text: c.text,
      score: cosineSimilarity(queryEmbedding, c.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return scored;
}
