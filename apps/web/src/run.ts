import type {
  AuditEvent,
  EvidenceSource,
  ResearchTask,
  ReportQuality,
  TaskStatus,
} from "./api";
import { eventDetailString, eventTimestamp } from "./format";

export type StepStatus = "running" | "done" | "failed" | "warning";
export type StepIcon =
  | "search"
  | "web"
  | "tool"
  | "document"
  | "verify"
  | "delegate"
  | "plan"
  | "notice"
  | "approval";

export interface RunStep {
  key: string;
  icon: StepIcon;
  status: StepStatus;
  title: string;
  subtitle?: string;
  startedAt?: string;
  endedAt?: string;
  sources?: EvidenceSource[];
  bullets?: string[];
  raw?: Record<string, unknown>;
}

export interface RunSummary {
  steps: RunStep[];
  sources: EvidenceSource[];
  hidden: number;
}

const HIDDEN_ACTIONS = new Set([
  "created",
  "followup",
  "started",
  "node_started",
  "node_completed",
  "intent_started",
  "intent_decided",
  "transform_started",
  "resume_requested",
  "completed",
  "REPORT_PREVIEW",
  "REPORT_DELTA",
  "REPORT_UNVERIFIED",
]);

function readSources(value: unknown): EvidenceSource[] {
  if (!Array.isArray(value)) return [];
  const sources: EvidenceSource[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.content !== "string") {
      continue;
    }
    sources.push({
      id: record.id,
      content: record.content,
      ...(typeof record.chunkId === "string"
        ? { chunkId: record.chunkId }
        : {}),
      ...(typeof record.documentId === "string"
        ? { documentId: record.documentId }
        : {}),
      ...(typeof record.url === "string" ? { url: record.url } : {}),
      ...(typeof record.title === "string" ? { title: record.title } : {}),
      ...(typeof record.sourceKind === "string"
        ? { sourceKind: record.sourceKind }
        : {}),
      ...(typeof record.startLine === "number"
        ? { startLine: record.startLine }
        : {}),
      ...(typeof record.endLine === "number"
        ? { endLine: record.endLine }
        : {}),
      ...(typeof record.score === "number" ? { score: record.score } : {}),
    });
  }
  return sources;
}

function searchTitle(action: string | undefined): {
  icon: StepIcon;
  title: string;
} {
  switch (action) {
    case "web":
      return { icon: "web", title: "Searched the web" };
    case "mcp":
      return { icon: "document", title: "Read local documents" };
    default:
      return { icon: "search", title: "Searched local evidence" };
  }
}

export function buildRun(events: AuditEvent[], verbose = false): RunSummary {
  const steps: RunStep[] = [];
  const collected = new Map<string, EvidenceSource>();
  const openSearches: Array<{ step: RunStep; query: string; action?: string }> =
    [];
  const openTools: Array<{ step: RunStep; tool: string }> = [];
  let hidden = 0;

  const addSource = (source: EvidenceSource) => {
    if (!collected.has(source.id)) collected.set(source.id, source);
    return [...collected.values()];
  };

  for (const event of events) {
    const detail =
      event.detail && typeof event.detail === "object"
        ? event.detail
        : ({} as Record<string, unknown>);
    const message = eventDetailString(event, "message");
    const key = `s-${event.seq}`;
    const start = event.created_at;

    switch (event.action) {
      case "RETRIEVAL_STARTED": {
        const action = eventDetailString(event, "action");
        const query = eventDetailString(event, "query") ?? "";
        const shown = searchTitle(action);
        const step: RunStep = {
          key,
          icon: shown.icon,
          status: "running",
          title: shown.title,
          ...(query ? { subtitle: query } : {}),
          startedAt: start,
          raw: detail,
        };
        steps.push(step);
        openSearches.push({ step, query, ...(action ? { action } : {}) });
        break;
      }
      case "RETRIEVAL_COMPLETED": {
        const query = eventDetailString(event, "query") ?? "";
        const action = eventDetailString(event, "action");
        const sources = readSources(detail.sources);
        for (const source of sources) addSource(source);
        const openIndex = openSearches.findIndex(
          (entry) =>
            entry.query === query && (!action || entry.action === action),
        );
        const step =
          openIndex >= 0
            ? openSearches.splice(openIndex, 1)[0]!.step
            : (() => {
                const shown = searchTitle(action);
                const created: RunStep = {
                  key,
                  icon: shown.icon,
                  status: "done",
                  title: shown.title,
                  ...(query ? { subtitle: query } : {}),
                  startedAt: start,
                  raw: detail,
                };
                steps.push(created);
                return created;
              })();
        step.status = "done";
        step.endedAt = start;
        step.subtitle = query
          ? `${query} · ${sources.length} source${sources.length === 1 ? "" : "s"}`
          : `${sources.length} source${sources.length === 1 ? "" : "s"}`;
        if (sources.length) step.sources = sources;
        step.raw = detail;
        break;
      }
      case "RETRIEVAL_FAILED": {
        const query = eventDetailString(event, "query") ?? "";
        const openIndex = openSearches.findIndex(
          (entry) => entry.query === query,
        );
        const step =
          openIndex >= 0
            ? openSearches.splice(openIndex, 1)[0]!.step
            : (() => {
                const created: RunStep = {
                  key,
                  icon: "search",
                  status: "failed",
                  title: "Search failed",
                  startedAt: start,
                  raw: detail,
                };
                steps.push(created);
                return created;
              })();
        step.status = "failed";
        step.endedAt = start;
        step.subtitle = message ?? "Retrieval tool failed.";
        step.raw = detail;
        break;
      }
      case "RETRIEVAL_DEGRADED":
        steps.push({
          key,
          icon: "search",
          status: "warning",
          title: "Retrieval degraded",
          ...(message ? { subtitle: message } : {}),
          endedAt: start,
          raw: detail,
        });
        break;
      case "TOOLS_DISCOVERED": {
        const tools = Array.isArray(detail.tools)
          ? detail.tools.filter(
              (tool): tool is string => typeof tool === "string",
            )
          : [];
        steps.push({
          key,
          icon: "tool",
          status: "done",
          title: "Connected to document tools",
          ...(tools.length
            ? { subtitle: tools.join(", ") }
            : message
              ? { subtitle: message }
              : {}),
          endedAt: start,
          raw: detail,
        });
        break;
      }
      case "TOOL_CALLED": {
        const tool = eventDetailString(event, "tool") ?? "tool";
        const args =
          detail.arguments && typeof detail.arguments === "object"
            ? Object.entries(detail.arguments as Record<string, unknown>)
                .map(([name, value]) => `${name}: ${String(value)}`)
                .join(", ")
            : "";
        const step: RunStep = {
          key,
          icon: "tool",
          status: "running",
          title: `Called ${tool}`,
          ...(args ? { subtitle: args } : message ? { subtitle: message } : {}),
          startedAt: start,
          raw: detail,
        };
        steps.push(step);
        openTools.push({ step, tool });
        break;
      }
      case "TOOL_RESULT": {
        const tool = eventDetailString(event, "tool") ?? "";
        const openIndex = tool
          ? openTools.findIndex((entry) => entry.tool === tool)
          : openTools.length - 1;
        const step =
          openIndex >= 0
            ? openTools.splice(openIndex, 1)[0]!.step
            : (() => {
                const created: RunStep = {
                  key,
                  icon: "tool",
                  status: "done",
                  title: tool ? `Called ${tool}` : "Tool finished",
                  startedAt: start,
                  raw: detail,
                };
                steps.push(created);
                return created;
              })();
        step.status = "done";
        step.endedAt = start;
        if (message) step.subtitle = message;
        step.raw = detail;
        break;
      }
      case "TOOL_FAILED": {
        const step =
          openTools.length > 0
            ? openTools.pop()!.step
            : (() => {
                const created: RunStep = {
                  key,
                  icon: "tool",
                  status: "failed",
                  title: "Tool failed",
                  startedAt: start,
                  raw: detail,
                };
                steps.push(created);
                return created;
              })();
        step.status = "failed";
        step.endedAt = start;
        if (message) step.subtitle = message;
        step.raw = detail;
        break;
      }
      case "TOOL_SKIPPED":
        steps.push({
          key,
          icon: "tool",
          status: "warning",
          title: "Tool skipped",
          ...(message ? { subtitle: message } : {}),
          endedAt: start,
          raw: detail,
        });
        break;
      case "LOOP_PLAN": {
        const round =
          typeof detail.round === "number" ? detail.round : undefined;
        const questions = Array.isArray(detail.questions)
          ? detail.questions.filter(
              (question): question is string => typeof question === "string",
            )
          : [];
        steps.push({
          key,
          icon: "plan",
          status: "done",
          title: round ? `Plan · round ${round}` : "Planned the next step",
          ...(message ? { subtitle: message } : {}),
          ...(questions.length ? { bullets: questions } : {}),
          endedAt: start,
          raw: detail,
        });
        break;
      }
      case "LOOP_ANALYSIS":
        steps.push({
          key,
          icon: "plan",
          status: "done",
          title: "Synthesized evidence",
          ...(message ? { subtitle: message } : {}),
          endedAt: start,
          raw: detail,
        });
        break;
      case "EVIDENCE_ASSESSED": {
        const sufficient =
          typeof detail.sufficient === "boolean"
            ? detail.sufficient
            : undefined;
        steps.push({
          key,
          icon: "verify",
          status: sufficient === false ? "warning" : "done",
          title: "Assessed evidence",
          ...(message ? { subtitle: message } : {}),
          endedAt: start,
          raw: detail,
        });
        break;
      }
      case "ROLE_DELEGATED": {
        const agent = eventDetailString(event, "agent") ?? "agent";
        steps.push({
          key,
          icon: "delegate",
          status: "done",
          title: `Delegated to ${agent}`,
          ...(message ? { subtitle: message } : {}),
          endedAt: start,
          raw: detail,
        });
        break;
      }
      case "CRITIC_REVIEWED": {
        const verdict = eventDetailString(event, "verdict");
        const approved = verdict === "approve";
        const issues = Array.isArray(detail.issues)
          ? detail.issues.filter(
              (issue): issue is string => typeof issue === "string",
            )
          : [];
        steps.push({
          key,
          icon: "verify",
          status: approved ? "done" : "warning",
          title: approved
            ? "Critic approved the draft"
            : "Critic requested more evidence",
          ...(message ? { subtitle: message } : {}),
          ...(issues.length ? { bullets: issues } : {}),
          endedAt: start,
          raw: detail,
        });
        break;
      }
      case "CITATIONS_VALIDATED":
        steps.push({
          key,
          icon: "verify",
          status: "done",
          title: "Citation check passed",
          ...(message ? { subtitle: message } : {}),
          endedAt: start,
          raw: detail,
        });
        break;
      case "CITATIONS_UNVERIFIED":
      case "REPORT_UNVERIFIED":
        steps.push({
          key,
          icon: "verify",
          status: "warning",
          title: "Citation check needs review",
          ...(message ? { subtitle: message } : {}),
          endedAt: start,
          raw: detail,
        });
        break;
      case "RESEARCH_STOPPED":
        steps.push({
          key,
          icon: "notice",
          status: "warning",
          title: "Research stopped",
          ...(message ? { subtitle: message } : {}),
          endedAt: start,
          raw: detail,
        });
        break;
      case "approval_requested": {
        const approval =
          detail.approval && typeof detail.approval === "object"
            ? (detail.approval as Record<string, unknown>)
            : null;
        const reason =
          approval && typeof approval.reason === "string"
            ? approval.reason
            : message;
        steps.push({
          key,
          icon: "approval",
          status: "warning",
          title: "Approval requested",
          ...(reason ? { subtitle: reason } : {}),
          endedAt: start,
          raw: detail,
        });
        break;
      }
      case "approved":
      case "rejected":
      case "expired":
      case "interrupted":
      case "approval_expired":
        steps.push({
          key,
          icon: "notice",
          status: event.action === "approved" ? "done" : "warning",
          title: `Approval ${event.action}`,
          ...(message ? { subtitle: message } : {}),
          endedAt: start,
          raw: detail,
        });
        break;
      case "AGENT_FAILED":
      case "failed":
        steps.push({
          key,
          icon: "notice",
          status: "failed",
          title: "Run failed",
          ...(message ? { subtitle: message } : {}),
          endedAt: start,
          raw: detail,
        });
        break;
      default: {
        if (HIDDEN_ACTIONS.has(event.action)) {
          hidden += 1;
          break;
        }
        if (
          message &&
          (verbose || event.kind === "tool" || event.kind === "rag")
        ) {
          steps.push({
            key,
            icon: "notice",
            status: "done",
            title: message,
            endedAt: start,
            raw: detail,
          });
          break;
        }
        hidden += 1;
      }
    }
  }

  return { steps, sources: [...collected.values()], hidden };
}

export interface TurnView {
  roundId: string;
  number: number;
  message: string;
  report: string;
  quality: ReportQuality;
  revision: number;
  status: TaskStatus;
  events: AuditEvent[];
  isCurrent: boolean;
  completedAt?: string;
  error?: string;
}

function roundIdOf(event: AuditEvent): string {
  if (event.roundId) return event.roundId;
  const meta =
    event.detail && typeof event.detail === "object"
      ? event.detail._event
      : undefined;
  if (meta && typeof meta === "object" && "roundId" in meta) {
    const value = (meta as { roundId?: unknown }).roundId;
    if (typeof value === "string") return value;
  }
  return "current";
}

export function buildTurns(
  task: ResearchTask,
  events: AuditEvent[],
): TurnView[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | undefined) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ordered.push(id);
  };

  for (const item of task.history ?? []) add(item.turn?.id);
  if (task.turn?.id) add(task.turn.id);
  const grouped = new Map<string, AuditEvent[]>();
  for (const event of [...events].sort((left, right) => left.seq - right.seq)) {
    const id = roundIdOf(event);
    const bucket = grouped.get(id);
    if (bucket) bucket.push(event);
    else grouped.set(id, [event]);
  }
  for (const id of grouped.keys()) add(id);
  if (ordered.length === 0) add("current");

  const currentId = task.turn?.id ?? ordered[ordered.length - 1] ?? "current";

  return ordered.map((roundId, position) => {
    const history = task.history?.find((item) => item.turn?.id === roundId);
    const isCurrent = roundId === currentId;
    const roundEvents = grouped.get(roundId) ?? [];
    const messageEvent = roundEvents.find(
      (event) => event.action === "created" || event.action === "followup",
    );
    const eventMessage = messageEvent
      ? eventDetailString(messageEvent, "message")
      : undefined;
    const message =
      eventMessage ??
      history?.question ??
      (isCurrent ? (task.turn?.message ?? task.question) : "");
    const report = history?.report ?? (isCurrent ? task.report : "");
    const revision =
      history?.turn.report.revision ??
      (isCurrent ? task.turn?.report.revision : undefined) ??
      0;
    let quality: ReportQuality =
      history?.turn.report.quality ??
      (isCurrent ? task.turn?.report.quality : undefined) ??
      "none";
    if (report.trim() && quality === "none") quality = "unreviewed";
    return {
      roundId,
      number: position + 1,
      message,
      report,
      quality,
      revision,
      status: history?.status ?? (isCurrent ? task.status : "completed"),
      events: roundEvents,
      isCurrent,
      ...(history?.completedAt ? { completedAt: history.completedAt } : {}),
      ...(history?.error ? { error: history.error } : {}),
    };
  });
}

export function mergeSourceLists(
  snapshot: EvidenceSource[],
  runSources: EvidenceSource[],
): EvidenceSource[] {
  const merged = new Map<string, EvidenceSource>();
  for (const source of [...snapshot, ...runSources]) {
    const existing = merged.get(source.id);
    merged.set(source.id, existing ? { ...existing, ...source } : source);
  }
  const local = [...merged.values()].filter(
    (source) => !/^https?:\/\//.test(source.url ?? ""),
  );
  const web = [...merged.values()].filter((source) =>
    /^https?:\/\//.test(source.url ?? ""),
  );
  const sortKey = (source: EvidenceSource) => {
    const match = /\d+$/.exec(source.id);
    return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
  };
  return [
    ...local.sort((left, right) => sortKey(left) - sortKey(right)),
    ...web.sort((left, right) => sortKey(left) - sortKey(right)),
  ];
}

export function latestEventTime(events: AuditEvent[]): number {
  return events.reduce(
    (latest, event) => Math.max(latest, eventTimestamp(event)),
    0,
  );
}
