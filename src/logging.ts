import fs from "node:fs";
import path from "node:path";
import { getSiaHome, ensureDir } from "./paths.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LoggerOptions {
  logDir?: string;
  logFile?: string;
  minLevel?: LogLevel;
  maxFileSize?: number;
  maxFiles?: number;
  console?: boolean;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
}

let globalLogger: Logger | null = null;

export class Logger {
  private logPath: string;
  private minLevel: LogLevel;
  private maxFileSize: number;
  private maxFiles: number;
  private logToConsole: boolean;
  private buffer: string[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: LoggerOptions = {}) {
    const logDir = opts.logDir ?? path.join(getSiaHome(), "logs");
    ensureDir(logDir);

    const today = new Date().toISOString().slice(0, 10);
    this.logPath = opts.logFile ?? path.join(logDir, `sia-${today}.log`);
    this.minLevel = opts.minLevel ?? "info";
    this.maxFileSize = opts.maxFileSize ?? 10 * 1024 * 1024; // 10MB
    this.maxFiles = opts.maxFiles ?? 7;
    this.logToConsole = opts.console ?? false;

    this.rotateIfNeeded();
  }

  private rotateIfNeeded(): void {
    try {
      if (!fs.existsSync(this.logPath)) return;
      const stat = fs.statSync(this.logPath);
      if (stat.size < this.maxFileSize) return;

      const dir = path.dirname(this.logPath);
      const base = path.basename(this.logPath, ".log");
      const ext = ".log";

      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const oldFile = path.join(dir, `${base}.${i}${ext}`);
        const newFile = path.join(dir, `${base}.${i + 1}${ext}`);
        if (fs.existsSync(oldFile)) {
          if (i + 1 >= this.maxFiles) {
            fs.unlinkSync(oldFile);
          } else {
            fs.renameSync(oldFile, newFile);
          }
        }
      }

      fs.renameSync(this.logPath, path.join(dir, `${base}.1${ext}`));
    } catch {
      // Ignore rotation errors
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.minLevel];
  }

  private formatEntry(entry: LogEntry): string {
    const dataStr = entry.data !== undefined ? ` ${JSON.stringify(entry.data)}` : "";
    return `${entry.timestamp} [${entry.level.toUpperCase().padEnd(5)}] [${entry.category}] ${entry.message}${dataStr}\n`;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flush();
    }, 100);
  }

  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer.length === 0) return;

    try {
      fs.appendFileSync(this.logPath, this.buffer.join(""), "utf8");
      this.buffer = [];
    } catch {
      // Ignore write errors
    }
  }

  log(level: LogLevel, category: string, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data,
    };

    const line = this.formatEntry(entry);
    this.buffer.push(line);
    this.scheduleFlush();

    if (this.logToConsole) {
      const color = level === "error" ? "\x1b[31m" : level === "warn" ? "\x1b[33m" : "";
      const reset = color ? "\x1b[0m" : "";
      process.stderr.write(`${color}${line}${reset}`);
    }
  }

  debug(category: string, message: string, data?: unknown): void {
    this.log("debug", category, message, data);
  }

  info(category: string, message: string, data?: unknown): void {
    this.log("info", category, message, data);
  }

  warn(category: string, message: string, data?: unknown): void {
    this.log("warn", category, message, data);
  }

  error(category: string, message: string, data?: unknown): void {
    this.log("error", category, message, data);
  }

  getLogPath(): string {
    return this.logPath;
  }
}

export function initLogger(opts: LoggerOptions = {}): Logger {
  globalLogger = new Logger(opts);
  return globalLogger;
}

export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}

export function log(level: LogLevel, category: string, message: string, data?: unknown): void {
  getLogger().log(level, category, message, data);
}
