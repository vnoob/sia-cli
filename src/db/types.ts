import type { DatabaseSync } from "node:sqlite";

/** SQLite handle: Node built-in `node:sqlite` (no native `.node` addon). */
export type SiaDatabase = DatabaseSync;
