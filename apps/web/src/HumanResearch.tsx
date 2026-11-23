import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createProject,
  decideApproval,
  deleteTask,
  fetchEvents,
  fetchTask,
  followUp,
  resumeTask,
  type AuditEvent,
  type ProjectCredential,
  type ResearchTask,
  type TaskStatus,
} from "./api";
import { ApprovalDock } from "./components/ApprovalDock";
import { Composer } from "./components/Composer";
import { Sidebar } from "./components/Sidebar";
import { SourcesRail } from "./components/SourcesRail";
import { Thread } from "./components/Thread";
import { TopBar } from "./components/TopBar";
import { Welcome } from "./components/Welcome";
import { classNames, maxSeq, mergeEvents } from "./format";
import {
  loadCredential,
  loadProjects,
  mergeProjectMeta,
  saveCredential,
  saveProjects,
  sortProjects,
  upsertProject,
  type ProjectItem,
} from "./projects";
import { buildRun, buildTurns, mergeSourceLists } from "./run";

const ACTOR = "本机用户";

type HealthState = "checking" | "online" | "offline";

interface Toast {
  id: number;
  message: string;
  tone: "info" | "error";
}

function summarizeTitle(message: string): string {
  const withoutAttachments = message
    .split(/\n请优先检索本地上传资料：/)[0]!
    .trim();
  const firstClause =
    withoutAttachments
      .split(/[\n。？！?!；;]+/)
      .map((part) => part.trim())
      .find((part) => part.length > 0) ?? withoutAttachments;
  const stripped = firstClause
    .replace(
      /^(请问一下|请问|请帮我|帮我|请解释一下|请解释|解释一下|请分析一下|请分析|分析一下|请研究一下|研究一下|调研一下|调查一下|告诉我|我想知道)\s*/i,
      "",
    )
    .replace(/[？?。！!，,、：:]+$/g, "")
    .trim();
  const text = stripped || firstClause || "未命名项目";
  return text.length > 28 ? `${text.slice(0, 28)}…` : text;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function initialProjects(): ProjectItem[] {
  const projects = sortProjects(loadProjects());
  const active = loadCredential();
  if (!active || projects.some((project) => project.id === active.id)) {
    return projects;
  }
  return [
    {
      id: active.id,
      key: active.key,
      title: active.title ?? "Untitled research",
      ...(active.updatedAt ? { updatedAt: active.updatedAt } : {}),
    },
    ...projects,
  ];
}

export function HumanResearch({ health = "online" }: { health?: HealthState }) {
  const [projects, setProjects] = useState<ProjectItem[]>(initialProjects);
  const [credential, setCredential] = useState<ProjectCredential | null>(
    loadCredential,
  );
  const [task, setTask] = useState<ResearchTask | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(loadCredential()));
  const [question, setQuestion] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [approvalValue, setApprovalValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(() => window.innerWidth >= 1180);
  const [railTab, setRailTab] = useState<"sources" | "activity">("sources");
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const stickToBottom = useRef(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTaskState = useRef("");

  const notify = useCallback(
    (message: string, tone: "info" | "error" = "info") => {
      setToast({ id: Date.now(), message, tone });
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 2600);
    },
    [],
  );

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  useEffect(() => saveProjects(projects), [projects]);
  useEffect(() => saveCredential(credential), [credential]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Poll the durable task plus its event cursor. The stream is finite, so a
  // failed tick only delays the next attempt; research keeps running server-side.
  useEffect(() => {
    if (!credential) return;
    const controller = new AbortController();
    let cancelled = false;
    let cursor = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);

    const poll = async () => {
      try {
        const [freshTask, freshEvents] = await Promise.all([
          fetchTask(credential.id, credential.key, controller.signal),
          fetchEvents(credential.id, credential.key, cursor, controller.signal),
        ]);
        if (cancelled) return;
        const combined = mergeEvents(freshTask.audit ?? [], freshEvents);
        cursor = maxSeq(combined);
        setTask(freshTask);
        if (freshEvents.length > 0) {
          setEvents((current) => mergeEvents(current, freshEvents));
        }
        if (combined.length > 0) {
          setEvents((current) => mergeEvents(current, combined));
        }
        setLoading(false);
        setError("");
        setProjects((current) =>
          mergeProjectMeta(current, credential.id, {
            ...(freshTask.title ? { title: freshTask.title } : {}),
            status: freshTask.status,
            ...(freshTask.updatedAt ? { updatedAt: freshTask.updatedAt } : {}),
          }),
        );
        setCredential((current) =>
          current &&
          current.id === credential.id &&
          freshTask.title &&
          current.title !== freshTask.title
            ? { ...current, title: freshTask.title }
            : current,
        );
      } catch (caught) {
        if (cancelled || controller.signal.aborted) return;
        setLoading(false);
        setError(errorText(caught, "无法连接 API，正在重试…"));
      } finally {
        if (!cancelled) timer = setTimeout(() => void poll(), 1500);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [credential?.id, credential?.key, refreshTick]);

  useEffect(() => {
    if (!task?.approval) return;
    setApprovalValue(
      task.approval.kind === "clarification"
        ? task.approval.question
        : task.approval.query,
    );
  }, [task?.approval?.id]);

  useEffect(() => {
    stickToBottom.current = true;
    const node = scrollRef.current;
    node?.scrollTo?.({ top: 0 });
  }, [credential?.id]);

  const turns = useMemo(
    () => (task ? buildTurns(task, events) : []),
    [task, events],
  );
  const runs = useMemo(
    () => turns.map((turn) => buildRun(turn.events)),
    [turns],
  );
  const sources = useMemo(() => {
    const snapshot = task?.snapshot?.state.sources ?? [];
    const collected = runs.flatMap((run) => run.sources);
    return mergeSourceLists(snapshot, collected);
  }, [task, runs]);

  // Completed runs open at the top of their latest report instead of the very
  // bottom of a long scroll, so the verdict badge and title are visible first.
  useEffect(() => {
    if (!task) {
      lastTaskState.current = "";
      return;
    }
    const stamp = `${task.id}:${task.status}`;
    if (lastTaskState.current === stamp) return;
    lastTaskState.current = stamp;
    if (task.status !== "completed" || !task.report || !stickToBottom.current) {
      return;
    }
    const node = scrollRef.current;
    const cards = node?.querySelectorAll<HTMLElement>(".report-card");
    const card = cards?.[cards.length - 1];
    if (!node || !card) return;
    const offset =
      card.getBoundingClientRect().top -
      node.getBoundingClientRect().top +
      node.scrollTop;
    node.scrollTop = Math.max(0, offset - 18);
  }, [task?.id, task?.status]);

  useEffect(() => {
    if (!stickToBottom.current) return;
    if (task?.status === "completed") return;
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [events.length, task?.report, task?.status, turns.length, approvalValue]);

  const status: TaskStatus | "idle" =
    task?.status ?? (credential ? "queued" : "idle");
  const title =
    task?.title ??
    credential?.title ??
    (credential ? "Untitled research" : "New research");
  const approval =
    task?.approval && task.status === "pending" ? task.approval : null;
  const disabled =
    Boolean(credential) &&
    ["queued", "ready", "running", "pending"].includes(status);
  const disabledReason = approval
    ? "Review and approve the request above to continue."
    : status === "running" || status === "queued" || status === "ready"
      ? "The agent is researching. New steps stream in automatically."
      : undefined;

  const openProject = useCallback((project: ProjectItem) => {
    setCredential({
      id: project.id,
      key: project.key,
      ...(project.title ? { title: project.title } : {}),
      ...(project.updatedAt ? { updatedAt: project.updatedAt } : {}),
    });
    setTask(null);
    setEvents([]);
    setError("");
    setActiveSourceId(null);
    setApprovalValue("");
    setAttachments([]);
    setQuestion("");
    setSidebarOpen(false);
    setLoading(true);
  }, []);

  const startNew = useCallback(() => {
    setCredential(null);
    setTask(null);
    setEvents([]);
    setError("");
    setQuestion("");
    setAttachments([]);
    setActiveSourceId(null);
    setSidebarOpen(false);
    setLoading(false);
    setTimeout(() => composerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        startNew();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startNew]);

  async function submit() {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError("");
    const prompt = attachments.length
      ? `${trimmed}\n请优先检索本地上传资料：${attachments.join("、")}`
      : trimmed;
    try {
      if (credential) {
        await followUp(credential.id, credential.key, prompt, ACTOR);
      } else {
        const created = await createProject(prompt, ACTOR);
        const project: ProjectItem = {
          id: created.id,
          key: created.key,
          title: created.title ?? summarizeTitle(trimmed),
          updatedAt: new Date().toISOString(),
          status: "queued",
        };
        setProjects((current) => sortProjects(upsertProject(current, project)));
        setCredential(project);
        setTask(null);
        setEvents([]);
        setLoading(true);
      }
      setQuestion("");
      setAttachments([]);
      setRefreshTick((tick) => tick + 1);
    } catch (caught) {
      setError(errorText(caught, "操作失败"));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!credential || !task?.approval || !approvalValue.trim()) return;
    setBusy(true);
    setError("");
    try {
      await decideApproval(credential.id, credential.key, "approve", {
        actor: ACTOR,
        approvalId: task.approval.id,
        value: approvalValue.trim(),
      });
      setRefreshTick((tick) => tick + 1);
    } catch (caught) {
      setError(errorText(caught, "审批失败"));
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!credential || !task?.approval) return;
    setBusy(true);
    setError("");
    try {
      await decideApproval(credential.id, credential.key, "reject", {
        actor: ACTOR,
        approvalId: task.approval.id,
      });
      setRefreshTick((tick) => tick + 1);
    } catch (caught) {
      setError(errorText(caught, "审批失败"));
    } finally {
      setBusy(false);
    }
  }

  async function resume() {
    if (!credential) return;
    setBusy(true);
    setError("");
    try {
      await resumeTask(credential.id, credential.key, ACTOR);
      setRefreshTick((tick) => tick + 1);
    } catch (caught) {
      setError(errorText(caught, "无法恢复任务"));
    } finally {
      setBusy(false);
    }
  }

  async function removeProject(project: ProjectItem) {
    setBusy(true);
    try {
      await deleteTask(project.id, project.key);
      setProjects((current) =>
        current.filter((item) => item.id !== project.id),
      );
      if (credential?.id === project.id) startNew();
      notify("Project deleted");
    } catch (caught) {
      setError(errorText(caught, "删除失败"));
      notify(errorText(caught, "删除失败"), "error");
    } finally {
      setBusy(false);
    }
  }

  function refresh() {
    setRefreshing(true);
    setRefreshTick((tick) => tick + 1);
    setTimeout(() => setRefreshing(false), 700);
  }

  function handleCitation(source: { id: string }) {
    setActiveSourceId(source.id);
    setRailTab("sources");
    setRailOpen(true);
  }

  function handleScroll() {
    const node = scrollRef.current;
    if (!node) return;
    stickToBottom.current =
      node.scrollHeight - node.scrollTop - node.clientHeight < 140;
  }

  const railVisible = railOpen && Boolean(credential);

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar
        projects={projects}
        activeId={credential?.id}
        health={health}
        open={sidebarOpen}
        now={now}
        onSelect={openProject}
        onNew={startNew}
        onDelete={(project) => void removeProject(project)}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="workspace">
        <TopBar
          title={title}
          status={status}
          isNew={!credential}
          turnCount={turns.length}
          sourceCount={sources.length}
          railOpen={railVisible}
          refreshing={refreshing}
          onMenu={() => setSidebarOpen(true)}
          onRefresh={refresh}
          onToggleRail={() => setRailOpen((open) => !open)}
        />

        <div className={classNames("stage", railVisible && "has-rail")}>
          <div className="thread-pane">
            {!credential ? (
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
            ) : loading && !task ? (
              <main
                className="conversation"
                role="status"
                aria-label="Loading project"
              >
                <div className="loading-thread">
                  <span className="skeleton line-lg" />
                  <span className="skeleton line-md" />
                  <div className="loading-steps">
                    <span className="skeleton step" />
                    <span className="skeleton step" />
                    <span className="skeleton step" />
                  </div>
                  <span className="loading-label">Loading project…</span>
                </div>
              </main>
            ) : task ? (
              <Thread
                turns={turns}
                runs={runs}
                sources={sources}
                status={status}
                taskError={task.error}
                error={error}
                scrollRef={scrollRef}
                onCitation={handleCitation}
                onOpenSources={() => {
                  setRailTab("sources");
                  setRailOpen(true);
                }}
                onToast={notify}
              />
            ) : (
              <main className="conversation" role="status">
                <div className="loading-label">
                  Waiting for the first event…
                </div>
              </main>
            )}
            <div className="scroll-fade" aria-hidden="true" />
          </div>

          {railVisible && (
            <SourcesRail
              sources={sources}
              events={events}
              tab={railTab}
              activeSourceId={activeSourceId}
              onTab={setRailTab}
              onSelect={handleCitation}
              onClose={() => setRailOpen(false)}
              onToast={notify}
            />
          )}
        </div>

        {(status === "interrupted" || status === "ready") && task && (
          <div className="resume-bar">
            <span>
              {status === "interrupted"
                ? "This run stopped mid-flight to avoid replaying an uncertain tool call."
                : "This project is ready to resume."}
            </span>
            <button
              type="button"
              className="button-ghost"
              disabled={busy}
              onClick={() => void resume()}
            >
              Resume run
            </button>
          </div>
        )}

        {approval && (
          <ApprovalDock
            approval={approval}
            value={approvalValue}
            onChange={setApprovalValue}
            onApprove={() => void approve()}
            onReject={() => void reject()}
            busy={busy}
          />
        )}

        <div className="dock" aria-label="研究操作区">
          <Composer
            value={question}
            onChange={setQuestion}
            onSubmit={() => void submit()}
            busy={busy}
            disabled={disabled}
            {...(disabledReason ? { disabledReason } : {})}
            attachments={attachments}
            onUploaded={(name) => {
              setAttachments((items) => [...new Set([...items, name])]);
              notify(`${name} added to the knowledge base`);
            }}
            onRemoveAttachment={(name) =>
              setAttachments((items) => items.filter((item) => item !== name))
            }
            placeholder={
              approval
                ? "Waiting for your approval…"
                : credential
                  ? status === "running"
                    ? "The agent is working — draft your next question"
                    : "Ask a follow-up, or refine the report…"
                  : "Ask a research question…"
            }
            mode={credential ? "followup" : "new"}
            inputRef={composerRef}
          />
        </div>
      </div>

      {toast && (
        <div
          className={`toast tone-${toast.tone}`}
          role="status"
          key={toast.id}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
