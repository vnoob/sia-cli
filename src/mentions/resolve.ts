import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import type { MentionConfig } from "../config/types.js";
import { listMessages, getMemorySlot, listMemorySlotsBySession, type MessageRow } from "../db/client.js";
import type { ParsedMention } from "./parse.js";

function real(p: string): string {
  return fs.realpathSync(path.resolve(p));
}

function isAllowedFilePath(filePath: string, cwd: string, allowedRoots: string[]): boolean {
  const target = real(filePath);
  const bases = [real(cwd), ...allowedRoots.filter(Boolean).map((r) => real(r))];
  for (const base of bases) {
    const rel = path.relative(base, target);
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return true;
  }
  return false;
}

function isProbablyBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(8000, buf.length));
  let zero = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) zero++;
  }
  return zero > 0;
}

function lastUserContent(rows: MessageRow[]): string {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].role === "user") return rows[i].content;
  }
  return "";
}

export interface ResolveMentionsResult {
  /** Original user text plus appended mention blocks. */
  expanded: string;
  /** Human-readable errors (non-fatal). */
  warnings: string[];
}

export function resolveMentions(opts: {
  input: string;
  mentions: ParsedMention[];
  mentionConfig: MentionConfig;
  cwd: string;
  db: Database.Database;
  sessionId: string;
}): ResolveMentionsResult {
  const warnings: string[] = [];
  const blocks: string[] = [];
  const { mentionConfig, cwd, db, sessionId } = opts;

  for (const men of opts.mentions) {
    if (men.kind === "env" && men.envName) {
      if (!mentionConfig.envAllowlist.includes(men.envName)) {
        warnings.push(`Skipped @env:${men.envName} (not in mentions.envAllowlist)`);
        continue;
      }
      const v = process.env[men.envName];
      blocks.push(`--- mention: env ${men.envName} ---\n${v ?? ""}\n---`);
      continue;
    }

    if (men.kind === "file" && men.target) {
      const rel = men.target;
      const abs = path.resolve(cwd, rel);
      try {
        if (!isAllowedFilePath(abs, cwd, mentionConfig.allowedRoots)) {
          warnings.push(`Skipped @${rel} (outside cwd and allowedRoots)`);
          continue;
        }
        const st = fs.statSync(abs);
        if (!st.isFile()) {
          warnings.push(`Skipped @${rel} (not a file)`);
          continue;
        }
        const buf = fs.readFileSync(abs);
        if (buf.length > mentionConfig.maxFileBytes) {
          warnings.push(`Skipped @${rel} (exceeds mentions.maxFileBytes)`);
          continue;
        }
        if (isProbablyBinary(buf)) {
          warnings.push(`Skipped @${rel} (binary)`);
          continue;
        }
        const content = buf.toString("utf8");
        blocks.push(`--- mention: file ${path.relative(cwd, abs) || "."} ---\n${content}\n---`);
      } catch (e) {
        warnings.push(`Skipped @${rel} (${e instanceof Error ? e.message : String(e)})`);
      }
      continue;
    }

    if (men.kind === "hash" && men.target) {
      const t = men.target;
      if (t === "last") {
        const rows = listMessages(db, sessionId);
        const text = lastUserContent(rows);
        blocks.push(`--- mention: context #last (previous user message) ---\n${text || "(none)"}\n---`);
        continue;
      }
      if (t === "session") {
        const slots = listMemorySlotsBySession(db, sessionId);
        const body =
          slots.length === 0
            ? "(no memory slots for this session)"
            : slots.map((s) => `## ${s.label} (${s.id})\n${s.content}`).join("\n\n");
        blocks.push(`--- mention: context #session ---\n${body}\n---`);
        continue;
      }
      const slot = getMemorySlot(db, t);
      if (!slot) {
        warnings.push(`Unknown memory slot #${t}`);
        continue;
      }
      blocks.push(`--- mention: memory #${t} (${slot.label}) ---\n${slot.content}\n---`);
    }
  }

  const appendix = blocks.length ? `\n\n${blocks.join("\n\n")}` : "";
  return { expanded: `${opts.input}${appendix}`, warnings };
}
