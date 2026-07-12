import type { LogEntry, LogOp } from "./conventions.js";

export function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC, stable)
}

// Parse `## [YYYY-MM-DD] op | title` lines from the Log HTML body.
export function parseLogEntries(html: string): LogEntry[] {
  const re = /##\s*\[(\d{4}-\d{2}-\d{2})\]\s*(ingest|query|lint|delete|session)\s*\|\s*(.+)/g;
  const out: LogEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push({ date: m[1]!, op: m[2] as LogOp, title: m[3]!.trim() });
  }
  return out;
}

export function formatLogEntry(e: LogEntry): string {
  return `## [${e.date}] ${e.op} | ${e.title}`;
}
