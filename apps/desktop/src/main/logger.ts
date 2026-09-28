import {
  closeSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { format } from "node:util";

export type LogLevel = "info" | "warn" | "error";

export interface Logger {
  readonly file: string;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  /** Writes pre-formatted output (e.g. a child process's stdout) line by line. */
  raw(text: string): void;
  close(): void;
}

export interface LoggerOptions {
  /** Once the file passes this size it is moved to `<name>.old.log` and a new one starts. */
  maxBytes?: number;
  /** Also echo to the console (handy when running unpackaged). */
  echo?: boolean;
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Appends timestamped lines to `<dir>/<name>.log`, keeping at most one rotated
 * `<name>.old.log`. Local only — nothing is uploaded.
 */
export function createLogger(
  dir: string,
  name: string,
  { maxBytes = DEFAULT_MAX_BYTES, echo = false }: LoggerOptions = {},
): Logger {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.log`);
  const old = path.join(dir, `${name}.old.log`);

  // Synchronous appends: log volume is small, and a crash never loses buffered lines.
  let fd = -1;
  let size = 0;

  const open = () => {
    fd = openSync(file, "a");
    size = statSync(file).size;
  };
  const rotate = () => {
    closeSync(fd);
    try {
      rmSync(old, { force: true });
      renameSync(file, old);
    } catch {
      // Another process may hold the file; keep appending to it.
    }
    open();
  };
  const write = (line: string) => {
    try {
      writeSync(fd, line);
      size += Buffer.byteLength(line);
      if (size >= maxBytes) rotate();
    } catch {
      // Logging must never crash the app.
    }
  };
  const log =
    (level: LogLevel) =>
    (...args: unknown[]) => {
      const line = `[${new Date().toISOString()}] [${level}] ${format(...args)}\n`;
      if (echo) process[level === "info" ? "stdout" : "stderr"].write(line);
      write(line);
    };

  open();
  if (size >= maxBytes) rotate();
  return {
    file,
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
    raw(text) {
      for (const part of text.split(/\r?\n/)) {
        if (!part) continue;
        const line = `[${new Date().toISOString()}] ${part}\n`;
        if (echo) process.stdout.write(line);
        write(line);
      }
    },
    close() {
      closeSync(fd);
    },
  };
}
