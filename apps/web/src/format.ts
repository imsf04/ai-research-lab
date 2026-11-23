import type { AuditEvent, EvidenceSource, TaskStatus } from "./api";

export function classNames(
  ...values: Array<string | false | null | undefined>
) {
  return values.filter(Boolean).join(" ");
}

export function relativeTime(
  iso: string | undefined,
  now = Date.now(),
): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(time).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function duration(start: string | undefined, end: string | undefined) {
  if (!start || !end) return "";
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return "";
  const ms = to - from;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function clockTime(iso: string | undefined): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  return new Date(time).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusLabel(status: TaskStatus | "idle"): string {
  switch (status) {
    case "queued":
    case "ready":
      return "Queued";
    case "running":
      return "Researching";
    case "pending":
      return "Needs approval";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "rejected":
      return "Rejected";
    case "expired":
      return "Expired";
    case "interrupted":
      return "Interrupted";
    default:
      return "Ready";
  }
}

export function statusTone(
  status: TaskStatus | "idle",
): "neutral" | "active" | "warning" | "success" | "danger" {
  switch (status) {
    case "running":
    case "queued":
    case "ready":
      return "active";
    case "pending":
      return "warning";
    case "completed":
      return "success";
    case "failed":
    case "interrupted":
      return "danger";
    case "rejected":
    case "expired":
      return "neutral";
    default:
      return "neutral";
  }
}

export function truncate(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

export function hostname(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isWebSource(source: EvidenceSource): boolean {
  return /^https?:\/\//.test(source.url ?? "");
}

export function sourceOrdinal(source: EvidenceSource, index: number): string {
  const match = /^(?:RAG|WEB|W):(\d+)$/.exec(source.id);
  return match?.[1] ?? String(index + 1);
}

export function eventDetailString(
  event: AuditEvent,
  key: string,
): string | undefined {
  const detail =
    event.detail && typeof event.detail === "object" ? event.detail : {};
  const value = detail[key];
  return typeof value === "string" ? value : undefined;
}

export function eventTimestamp(event: AuditEvent): number {
  const parsed = Date.parse(event.created_at);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function mergeEvents(
  current: AuditEvent[],
  incoming: AuditEvent[],
): AuditEvent[] {
  if (!incoming.length) return current;
  const known = new Map(current.map((event) => [event.seq, event]));
  for (const event of incoming) known.set(event.seq, event);
  return [...known.values()].sort((left, right) => left.seq - right.seq);
}

export function maxSeq(events: AuditEvent[]): number {
  return events.reduce((max, event) => Math.max(max, event.seq), 0);
}
