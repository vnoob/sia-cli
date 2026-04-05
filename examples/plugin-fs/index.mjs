/**
 * Filesystem plugin for sia-cli
 *
 * Provides tools for reading, writing, and managing files within the working directory.
 * Copy this folder to SIA_HOME/plugins/fs/ or .sia/plugins/fs/ to enable.
 *
 * SECURITY: All paths are resolved relative to `cwd` and cannot escape it.
 */

import fs from "node:fs";
import path from "node:path";

const MAX_READ_BYTES = 512 * 1024; // 512 KB max read
const MAX_WRITE_BYTES = 1024 * 1024; // 1 MB max write

/**
 * Resolve path safely within cwd. Throws if path escapes.
 */
function safePath(cwd, relPath) {
  const resolved = path.resolve(cwd, relPath);
  const cwdNorm = path.resolve(cwd);
  if (!resolved.startsWith(cwdNorm + path.sep) && resolved !== cwdNorm) {
    throw new Error(`Path "${relPath}" escapes working directory`);
  }
  return resolved;
}

export default async function register(api) {
  // ─────────────────────────────────────────────────────────────
  // sia_fs_read — Read file contents
  // ─────────────────────────────────────────────────────────────
  api.registerTool({
    name: "sia_fs_read",
    description:
      "Read the contents of a file. Path is relative to the working directory. Returns text content (max 512KB).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to the file" },
      },
      required: ["path"],
    },
    async handler(args, ctx) {
      const relPath = String(args?.path ?? "");
      if (!relPath) return JSON.stringify({ error: "path is required" });

      try {
        const abs = safePath(ctx.cwd, relPath);
        const stat = fs.statSync(abs);
        if (stat.isDirectory()) {
          return JSON.stringify({ error: "Path is a directory, use sia_fs_list" });
        }
        if (stat.size > MAX_READ_BYTES) {
          return JSON.stringify({ error: `File too large (${stat.size} bytes, max ${MAX_READ_BYTES})` });
        }
        const content = fs.readFileSync(abs, "utf8");
        return JSON.stringify({ path: relPath, content });
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    },
  });

  // ─────────────────────────────────────────────────────────────
  // sia_fs_write — Write/create a file
  // ─────────────────────────────────────────────────────────────
  api.registerTool({
    name: "sia_fs_write",
    description:
      "Write content to a file (creates or overwrites). Path is relative to working directory. Parent directories are created automatically. Max 1MB.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to the file" },
        content: { type: "string", description: "File content to write" },
      },
      required: ["path", "content"],
    },
    async handler(args, ctx) {
      const relPath = String(args?.path ?? "");
      const content = String(args?.content ?? "");
      if (!relPath) return JSON.stringify({ error: "path is required" });

      if (Buffer.byteLength(content, "utf8") > MAX_WRITE_BYTES) {
        return JSON.stringify({ error: `Content too large (max ${MAX_WRITE_BYTES} bytes)` });
      }

      try {
        const abs = safePath(ctx.cwd, relPath);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, "utf8");
        return JSON.stringify({ ok: true, path: relPath, bytes: Buffer.byteLength(content, "utf8") });
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    },
  });

  // ─────────────────────────────────────────────────────────────
  // sia_fs_append — Append to a file
  // ─────────────────────────────────────────────────────────────
  api.registerTool({
    name: "sia_fs_append",
    description:
      "Append content to an existing file (creates if missing). Path is relative to working directory.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to the file" },
        content: { type: "string", description: "Content to append" },
      },
      required: ["path", "content"],
    },
    async handler(args, ctx) {
      const relPath = String(args?.path ?? "");
      const content = String(args?.content ?? "");
      if (!relPath) return JSON.stringify({ error: "path is required" });

      try {
        const abs = safePath(ctx.cwd, relPath);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.appendFileSync(abs, content, "utf8");
        return JSON.stringify({ ok: true, path: relPath });
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    },
  });

  // ─────────────────────────────────────────────────────────────
  // sia_fs_list — List directory contents
  // ─────────────────────────────────────────────────────────────
  api.registerTool({
    name: "sia_fs_list",
    description:
      "List files and directories in a path. Returns names with trailing / for directories. Path is relative to working directory.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to directory (default: '.')" },
      },
      required: [],
    },
    async handler(args, ctx) {
      const relPath = String(args?.path ?? ".");

      try {
        const abs = safePath(ctx.cwd, relPath);
        const entries = fs.readdirSync(abs, { withFileTypes: true });
        const items = entries.map((e) => (e.isDirectory() ? e.name + "/" : e.name));
        return JSON.stringify({ path: relPath, items });
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    },
  });

  // ─────────────────────────────────────────────────────────────
  // sia_fs_mkdir — Create directory
  // ─────────────────────────────────────────────────────────────
  api.registerTool({
    name: "sia_fs_mkdir",
    description: "Create a directory (and parent directories). Path is relative to working directory.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to directory" },
      },
      required: ["path"],
    },
    async handler(args, ctx) {
      const relPath = String(args?.path ?? "");
      if (!relPath) return JSON.stringify({ error: "path is required" });

      try {
        const abs = safePath(ctx.cwd, relPath);
        fs.mkdirSync(abs, { recursive: true });
        return JSON.stringify({ ok: true, path: relPath });
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    },
  });

  // ─────────────────────────────────────────────────────────────
  // sia_fs_delete — Delete file or empty directory
  // ─────────────────────────────────────────────────────────────
  api.registerTool({
    name: "sia_fs_delete",
    description:
      "Delete a file or empty directory. Path is relative to working directory. Use recursive=true for non-empty directories.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to delete" },
        recursive: { type: "boolean", description: "If true, delete non-empty directories recursively" },
      },
      required: ["path"],
    },
    async handler(args, ctx) {
      const relPath = String(args?.path ?? "");
      const recursive = Boolean(args?.recursive);
      if (!relPath) return JSON.stringify({ error: "path is required" });

      try {
        const abs = safePath(ctx.cwd, relPath);
        const stat = fs.statSync(abs);
        if (stat.isDirectory()) {
          fs.rmSync(abs, { recursive });
        } else {
          fs.unlinkSync(abs);
        }
        return JSON.stringify({ ok: true, path: relPath });
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    },
  });

  // ─────────────────────────────────────────────────────────────
  // sia_fs_exists — Check if path exists
  // ─────────────────────────────────────────────────────────────
  api.registerTool({
    name: "sia_fs_exists",
    description: "Check if a file or directory exists. Returns type: 'file', 'directory', or 'none'.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to check" },
      },
      required: ["path"],
    },
    async handler(args, ctx) {
      const relPath = String(args?.path ?? "");
      if (!relPath) return JSON.stringify({ error: "path is required" });

      try {
        const abs = safePath(ctx.cwd, relPath);
        if (!fs.existsSync(abs)) {
          return JSON.stringify({ path: relPath, exists: false, type: "none" });
        }
        const stat = fs.statSync(abs);
        const type = stat.isDirectory() ? "directory" : "file";
        return JSON.stringify({ path: relPath, exists: true, type, size: stat.size });
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    },
  });

  // ─────────────────────────────────────────────────────────────
  // sia_fs_rename — Rename/move file or directory
  // ─────────────────────────────────────────────────────────────
  api.registerTool({
    name: "sia_fs_rename",
    description: "Rename or move a file/directory within the working directory.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Source path (relative)" },
        to: { type: "string", description: "Destination path (relative)" },
      },
      required: ["from", "to"],
    },
    async handler(args, ctx) {
      const fromRel = String(args?.from ?? "");
      const toRel = String(args?.to ?? "");
      if (!fromRel || !toRel) return JSON.stringify({ error: "from and to are required" });

      try {
        const absFrom = safePath(ctx.cwd, fromRel);
        const absTo = safePath(ctx.cwd, toRel);
        fs.mkdirSync(path.dirname(absTo), { recursive: true });
        fs.renameSync(absFrom, absTo);
        return JSON.stringify({ ok: true, from: fromRel, to: toRel });
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    },
  });
}
