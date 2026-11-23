import type { RefObject } from "react";

import type { EvidenceSource, TaskStatus } from "../api";
import { clockTime } from "../format";
import { BotIcon, ChevronIcon, ClockIcon } from "../icons";
import type { RunSummary, TurnView } from "../run";
import { ReportCard } from "./ReportCard";
import { RunSteps } from "./RunSteps";
import { StatusBadge } from "./StatusBadge";

function ThinkingRow({ label }: { label: string }) {
  return (
    <div className="thinking-row" aria-label={label}>
      <span className="thinking-orbit" aria-hidden="true">
        <span />
      </span>
      <span className="shimmer-text">{label}</span>
    </div>
  );
}

export function Thread({
  turns,
  runs,
  sources,
  status,
  taskError,
  error,
  scrollRef,
  onCitation,
  onOpenSources,
  onToast,
}: {
  turns: TurnView[];
  runs: RunSummary[];
  sources: EvidenceSource[];
  status: TaskStatus | "idle";
  taskError: string;
  error: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  onCitation: (source: EvidenceSource) => void;
  onOpenSources: () => void;
  onToast: (message: string, tone?: "info" | "error") => void;
}) {
  return (
    <main
      className="conversation"
      ref={scrollRef}
      role="log"
      aria-label="研究对话"
      tabIndex={0}
    >
      <div className="conversation-inner">
        {turns.map((turn, index) => {
          const run = runs[index] ?? { steps: [], sources: [], hidden: 0 };
          const firstTime = turn.events[0]?.created_at;
          const running =
            turn.isCurrent &&
            ["queued", "ready", "running"].includes(turn.status);
          const pending = turn.isCurrent && turn.status === "pending";
          return (
            <section
              className="turn"
              key={turn.roundId}
              aria-label={`Turn ${turn.number}`}
            >
              <div className="user-message">
                <div className="user-label">
                  <span className="user-avatar" aria-hidden="true">
                    Y
                  </span>
                  <span>You</span>
                  {firstTime && <time>{clockTime(firstTime)}</time>}
                </div>
                <p>{turn.message}</p>
              </div>

              {(run.steps.length > 0 || running || turn.report) && (
                <div className="agent-run">
                  <div className="agent-run-head">
                    <span className="agent-avatar" aria-hidden="true">
                      <BotIcon size={14} />
                    </span>
                    <span className="agent-name">Research agent</span>
                    <StatusBadge
                      status={turn.isCurrent ? status : turn.status}
                      compact
                    />
                    {turn.events.length > 0 && (
                      <span className="agent-time">
                        <ClockIcon size={11} />
                        {clockTime(
                          turn.events[turn.events.length - 1]?.created_at,
                        )}
                      </span>
                    )}
                  </div>

                  <RunSteps steps={run.steps} onSource={onCitation} />

                  {running && run.steps.length === 0 && (
                    <ThinkingRow
                      label={
                        status === "queued"
                          ? "Queued · waiting for a worker"
                          : "Planning the next step"
                      }
                    />
                  )}
                  {running &&
                    run.steps.some((step) => step.status === "running") && (
                      <p className="run-live-note">
                        <span className="live-dot" aria-hidden="true" />
                        Working — new steps stream in automatically.
                      </p>
                    )}

                  {pending && (
                    <div className="approval-marker">
                      <span className="approval-marker-icon" aria-hidden="true">
                        <ClockIcon size={13} />
                      </span>
                      <span>
                        Waiting for your approval. Review the request above the
                        composer.
                      </span>
                      <ChevronIcon size={13} />
                    </div>
                  )}

                  {turn.report && (
                    <ReportCard
                      report={turn.report}
                      quality={turn.quality}
                      revision={turn.revision}
                      sources={sources}
                      status={turn.isCurrent ? status : turn.status}
                      turnNumber={turn.number}
                      onCitation={onCitation}
                      onOpenSources={onOpenSources}
                      onToast={onToast}
                    />
                  )}

                  {!turn.report && turn.status === "completed" && (
                    <p className="run-finished-note">
                      Run finished without a report.
                    </p>
                  )}

                  {(turn.error || (turn.isCurrent && taskError)) && (
                    <div className="error-banner" role="alert">
                      {turn.error || taskError}
                    </div>
                  )}

                  {run.hidden > 0 && (
                    <p className="run-hidden-note">
                      {run.hidden} low-level event{run.hidden === 1 ? "" : "s"}{" "}
                      in Activity
                    </p>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {error && (
          <div className="error-banner global" role="alert">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
