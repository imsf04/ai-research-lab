import { useEffect, useMemo, useRef, useState } from "react";

import type {
  AuditEvent,
  EvidenceSource,
  ReportQuality,
  TaskStatus,
} from "./api";
import { Composer } from "./components/Composer";
import { SourcesRail } from "./components/SourcesRail";
import { Thread } from "./components/Thread";
import { Welcome } from "./components/Welcome";
import { PanelIcon, SparklesIcon } from "./icons";
import { readResearchStream, type ResearchEvent } from "./research-stream";
import { buildRun, mergeSourceLists, type TurnView } from "./run";

type StreamStatus =
  "idle" | "starting" | "running" | "completed" | "failed" | "cancelled";

function toTurnStatus(status: StreamStatus): TaskStatus {
  const mapped = toTaskStatus(status);
  return mapped === "idle" ? "queued" : mapped;
}

function toTaskStatus(status: StreamStatus): TaskStatus | "idle" {
  switch (status) {
    case "starting":
      return "queued";
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "rejected";
    default:
      return "idle";
  }
}

function kindFor(type: string): NonNullable<AuditEvent["kind"]> {
  if (type.startsWith("TOOL") || type.startsWith("MCP")) return "tool";
  if (type.startsWith("RETRIEVAL")) return "rag";
  if (type.startsWith("REPORT") || type === "AGENT_COMPLETED") return "report";
  return "status";
}

function toAudit(event: ResearchEvent): AuditEvent {
  const timestamp = (event as { timestamp?: string }).timestamp;
  return {
    seq: event.sequence,
    actor: "system",
    action: event.type,
    created_at: timestamp ?? new Date().toISOString(),
    detail: {
      ...event,
      ...(event.message ? { message: event.message } : {}),
      ...(event.sources ? { sources: event.sources } : {}),
    } as Record<string, unknown>,
    kind: kindFor(event.type),
  };
}

export function ResearchForm() {
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [taskId, setTaskId] = useState("");
  const [question, setQuestion] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [report, setReport] = useState("");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [sources, setSources] = useState<EvidenceSource[]>([]);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [quality, setQuality] = useState<ReportQuality>("none");
  const [railOpen, setRailOpen] = useState(() => window.innerWidth >= 1180);
  const [railTab, setRailTab] = useState<"sources" | "activity">("sources");
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone: "info" | "error";
  } | null>(null);

  const current = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const stick = useRef(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => current.current?.abort(), []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  function notify(message: string, tone: "info" | "error" = "info") {
    setToast({ message, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

  const busy = status === "starting" || status === "running";
  const run = useMemo(() => buildRun(events, true), [events]);
  const mergedSources = useMemo(
    () => mergeSourceLists(sources, run.sources),
    [sources, run],
  );

  const turn: TurnView = {
    roundId: "one-off",
    number: 1,
    message: submitted,
    report,
    quality,
    revision: 1,
    status: toTurnStatus(status),
    events,
    isCurrent: true,
  };
  const turns = status === "idle" ? [] : [turn];

  useEffect(() => {
    if (!stick.current) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [events.length, report, status]);

  async function submit() {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    const controller = new AbortController();
    current.current = controller;
    setSubmitted(trimmed);
    setStatus("starting");
    setTaskId("");
    setReport("");
    setEvents([]);
    setSources([]);
    setError("");
    setQuality("none");
    setActiveSourceId(null);
    setQuestion("");
    stick.current = true;
    try {
      const response = await fetch("/api/research/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: attachments.length
            ? `${trimmed}\n请优先检索本地上传资料：${attachments.join("、")}`
            : trimmed,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          response.status === 503
            ? "请先配置模型服务。"
            : `请求失败（HTTP ${response.status}）`,
        );
      }
      setAttachments([]);
      await readResearchStream(response, (event) => {
        if (controller.signal.aborted) return;
        setTaskId(event.taskId);
        setEvents((items) => [...items, toAudit(event)]);
        if (event.type === "AGENT_STARTED" || event.type === "task_started") {
          setStatus("running");
        }
        if (event.type === "RETRIEVAL_COMPLETED") {
          setSources(event.sources ?? []);
        }
        if (event.type === "CITATIONS_VALIDATED") setQuality("reviewed");
        if (event.type === "REPORT_PREVIEW") {
          setReport(event.report ?? "");
          setQuality("unreviewed");
        }
        if (event.type === "REPORT_DELTA") {
          setReport((value) => value + (event.text ?? ""));
          setQuality("unreviewed");
        }
        if (
          event.type === "AGENT_COMPLETED" ||
          event.type === "task_completed"
        ) {
          if (event.report) setReport(event.report);
          setStatus("completed");
          setQuality((current) =>
            current === "none" ? "unreviewed" : current,
          );
        }
        if (event.type === "AGENT_FAILED" || event.type === "task_failed") {
          setStatus("failed");
          setError(event.message ?? "研究失败");
        }
        if (event.type === "TASK_CANCELLED") setStatus("cancelled");
      });
    } catch (caught) {
      if (controller.signal.aborted) {
        setStatus("cancelled");
      } else {
        setStatus("failed");
        setError(caught instanceof Error ? caught.message : "请求失败");
      }
    } finally {
      current.current = null;
    }
  }

  function cancel() {
    current.current?.abort();
  }

  function handleScroll() {
    const node = scrollRef.current;
    if (!node) return;
    stick.current =
      node.scrollHeight - node.scrollTop - node.clientHeight < 140;
  }

  function selectSource(source: EvidenceSource) {
    setActiveSourceId(source.id);
    setRailTab("sources");
    setRailOpen(true);
  }

  const railVisible = railOpen && status !== "idle";

  return (
    <div className="app-shell one-off-shell">
      <div className="workspace one-off-workspace">
        <header className="one-off-top">
          <div className="brand-inline">
            <span className="brand-mark" aria-hidden="true">
              <SparklesIcon size={15} />
            </span>
            <span className="brand-name">AI Research Lab</span>
            <span className="mode-chip">One-off mode</span>
          </div>
          <div className="one-off-top-right">
            <span className="api-state is-online">
              <span className="status-pip" aria-hidden="true" />
              API online
            </span>
            {status !== "idle" && (
              <button
                type="button"
                className={`rail-toggle${railVisible ? " is-on" : ""}`}
                aria-label="Toggle sources panel"
                aria-pressed={railVisible}
                onClick={() => setRailOpen((open) => !open)}
              >
                <PanelIcon size={15} />
                <span>Sources</span>
                <span className="rail-count">{mergedSources.length}</span>
              </button>
            )}
          </div>
        </header>

        <div className={`stage${railVisible ? " has-rail" : ""}`}>
          <div className="thread-pane">
            {status === "idle" ? (
              <main
                className="conversation welcome-scroll"
                ref={scrollRef}
                onScroll={handleScroll}
              >
                <Welcome
                  onPick={(suggestion) => {
                    setQuestion(suggestion);
                    composerRef.current?.focus();
                  }}
                />
              </main>
            ) : (
              <Thread
                turns={turns}
                runs={[run]}
                sources={mergedSources}
                status={toTaskStatus(status)}
                taskError={error}
                error=""
                scrollRef={scrollRef}
                onCitation={selectSource}
                onOpenSources={() => {
                  setRailTab("sources");
                  setRailOpen(true);
                }}
                onToast={notify}
              />
            )}
          </div>
          {railVisible && (
            <SourcesRail
              sources={mergedSources}
              events={events}
              tab={railTab}
              activeSourceId={activeSourceId}
              onTab={setRailTab}
              onSelect={selectSource}
              onClose={() => setRailOpen(false)}
              onToast={notify}
            />
          )}
        </div>

        <div className="one-off-meta">
          <span role="status">研究状态：{status}</span>
          {taskId && <small>任务 ID：{taskId}</small>}
          {busy && (
            <button
              type="button"
              className="button-ghost small"
              onClick={cancel}
            >
              取消
            </button>
          )}
        </div>

        <div className="dock" aria-label="研究操作区">
          <Composer
            value={question}
            onChange={setQuestion}
            onSubmit={() => void submit()}
            busy={busy}
            disabled={busy}
            attachments={attachments}
            onUploaded={(name) =>
              setAttachments((items) => [...new Set([...items, name])])
            }
            onRemoveAttachment={(name) =>
              setAttachments((items) => items.filter((item) => item !== name))
            }
            placeholder={
              status === "idle"
                ? "Ask a research question…"
                : busy
                  ? "Research is running…"
                  : "Ask another question to start a new run…"
            }
            mode="new"
            inputRef={composerRef}
            submitLabel="开始研究"
          />
        </div>
      </div>

      {toast && (
        <div className={`toast tone-${toast.tone}`} role="status">
          {toast.message}
        </div>
      )}
    </div>
  );
}
