/** Typed access to the durable research API used by the workspace. */

export interface ProjectCredential {
  id: string;
  key: string;
  title?: string;
  updatedAt?: string;
}

export type TaskStatus =
  | "queued"
  | "running"
  | "pending"
  | "ready"
  | "completed"
  | "failed"
  | "rejected"
  | "expired"
  | "interrupted";

export type ReportQuality =
  "none" | "unreviewed" | "reviewed" | "unverified" | "insufficient";

export interface EvidenceSource {
  id: string;
  chunkId?: string;
  documentId?: string;
  url?: string;
  title?: string;
  sourceKind?: string;
  content: string;
  sha256?: string;
  startLine?: number;
  endLine?: number;
  score?: number | null;
}

export interface Approval {
  id: string;
  kind: "clarification" | "plan" | "plan_adjustment" | "tool";
  question: string;
  query: string;
  questions: string[];
  reason: string;
  expiresAt: string;
  goal?: string;
  serves?: string;
}

export interface TurnReport {
  id: string;
  revision: number;
  quality: ReportQuality;
}

export interface TurnMeta {
  id: string;
  message: string;
  intent?: "summarize" | "edit" | "research" | "clarify" | null;
  goal?: string | null;
  query?: string | null;
  report: TurnReport;
}

export interface TaskHistory {
  turn: TurnMeta;
  question: string;
  report: string;
  status: TaskStatus;
  completedAt: string;
  error?: string;
}

export interface AuditEvent {
  seq: number;
  actor: string;
  action: string;
  created_at: string;
  detail: Record<string, unknown>;
  roundId?: string;
  kind?: "user_message" | "status" | "approval" | "tool" | "rag" | "report";
  id?: string;
}

export interface TaskSnapshot {
  next?: string;
  phase?: string;
  calls?: number;
  units?: number;
  retries?: number;
  elapsedMs?: number;
  state: {
    sources?: EvidenceSource[];
    queries?: string[];
    openQuestions?: string[];
  };
}

export interface ResearchTask {
  id: string;
  title?: string;
  question: string;
  status: TaskStatus;
  report: string;
  error: string;
  approval: Approval | null;
  snapshot?: TaskSnapshot | null;
  turn?: TurnMeta;
  history?: TaskHistory[];
  audit: AuditEvent[];
  createdAt?: string;
  updatedAt?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } finally {
    // JSON failures are handled by the caller through the rejection path.
  }
}

function messageFromBody(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const record = body as Record<string, unknown>;
  const error = record.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  const message = record.message;
  return typeof message === "string" ? message : fallback;
}

async function request<T>(
  url: string,
  init: RequestInit = {},
  fallback = "Request failed",
): Promise<T> {
  const response = await fetch(url, init);
  const body = await readBody(response).catch(() => null);
  if (!response.ok)
    throw new ApiError(messageFromBody(body, fallback), response.status);
  return body as T;
}

function jsonInit(body: Record<string, unknown>, key?: string): RequestInit {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "x-research-key": key } : {}),
    },
    body: JSON.stringify(body),
  };
}

export async function fetchTask(
  id: string,
  key: string,
  signal?: AbortSignal,
): Promise<ResearchTask> {
  return request<ResearchTask>(
    `/api/research/tasks/${id}`,
    { headers: { "x-research-key": key }, ...(signal ? { signal } : {}) },
    "无法读取项目。",
  );
}

export function parseEventStream(text: string): AuditEvent[] {
  const events: AuditEvent[] = [];
  for (const frame of text.split(/\n\n/)) {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    try {
      const value = JSON.parse(data) as Record<string, unknown>;
      if (
        typeof value.seq !== "number" ||
        typeof value.action !== "string" ||
        typeof value.actor !== "string" ||
        !value.detail ||
        typeof value.detail !== "object"
      ) {
        continue;
      }
      events.push({
        seq: value.seq,
        actor: value.actor,
        action: value.action,
        created_at:
          typeof value.created_at === "string"
            ? value.created_at
            : new Date().toISOString(),
        detail: value.detail as Record<string, unknown>,
        ...(typeof value.roundId === "string"
          ? { roundId: value.roundId }
          : {}),
        ...(typeof value.kind === "string" &&
        [
          "user_message",
          "status",
          "approval",
          "tool",
          "rag",
          "report",
        ].includes(value.kind)
          ? { kind: value.kind as NonNullable<AuditEvent["kind"]> }
          : {}),
        ...(typeof value.id === "string" ? { id: value.id } : {}),
      });
    } catch {
      // A malformed frame is skipped; later frames stay readable.
    }
  }
  return events;
}

export async function fetchEvents(
  id: string,
  key: string,
  after: number,
  signal?: AbortSignal,
): Promise<AuditEvent[]> {
  const response = await fetch(
    `/api/research/tasks/${id}/events?after=${after}`,
    {
      headers: { "x-research-key": key },
      ...(signal ? { signal } : {}),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    let message = "事件补载失败。";
    try {
      message = messageFromBody(JSON.parse(text) as unknown, message);
    } catch {
      // Keep the default message for non-JSON errors.
    }
    throw new ApiError(message, response.status);
  }
  return parseEventStream(text);
}

export async function createProject(
  question: string,
  actor: string,
): Promise<{ id: string; key: string; title?: string }> {
  return request(
    "/api/research/tasks",
    jsonInit({ message: question, actor }),
    "无法创建项目。",
  );
}

export async function followUp(
  id: string,
  key: string,
  message: string,
  actor: string,
): Promise<void> {
  await request(
    `/api/research/tasks/${id}/followup`,
    jsonInit({ message, actor }, key),
    "无法继续研究。",
  );
}

export async function decideApproval(
  id: string,
  key: string,
  action: "approve" | "reject",
  body: { actor: string; approvalId: string; value?: string },
): Promise<void> {
  await request(
    `/api/research/tasks/${id}/${action}`,
    jsonInit({ ...body }, key),
    "无法提交审批。",
  );
}

export async function resumeTask(
  id: string,
  key: string,
  actor: string,
): Promise<void> {
  await request(
    `/api/research/tasks/${id}/resume`,
    jsonInit({ actor }, key),
    "无法恢复任务。",
  );
}

export async function deleteTask(id: string, key: string): Promise<void> {
  await request(
    `/api/research/tasks/${id}`,
    { method: "DELETE", headers: { "x-research-key": key } },
    "无法删除项目。",
  );
}

export async function uploadDocument(
  file: File,
): Promise<{ name: string; chunks: number }> {
  const data = new FormData();
  data.append("file", file);
  return request(
    "/api/rag/upload",
    { method: "POST", body: data },
    "上传失败。",
  );
}

export function healthLabel(state: "checking" | "online" | "offline"): string {
  switch (state) {
    case "checking":
      return "Checking API…";
    case "online":
      return "API online";
    case "offline":
      return "API unavailable";
  }
}
