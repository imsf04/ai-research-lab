import { useState } from "react";

import { duration, truncate } from "../format";
import {
  AlertIcon,
  BotIcon,
  CheckIcon,
  ChevronIcon,
  ClockIcon,
  FileTextIcon,
  GlobeIcon,
  SearchIcon,
  ShieldIcon,
  SparklesIcon,
  TerminalIcon,
  XIcon,
} from "../icons";
import type { StepIcon, RunStep } from "../run";
import type { EvidenceSource } from "../api";
import { sourceMeta } from "../markdown";

const GLYPHS: Record<StepIcon, typeof SearchIcon> = {
  search: SearchIcon,
  web: GlobeIcon,
  tool: TerminalIcon,
  document: FileTextIcon,
  verify: ShieldIcon,
  delegate: BotIcon,
  plan: SparklesIcon,
  notice: AlertIcon,
  approval: ClockIcon,
};

function StatusGlyph({ status }: { status: RunStep["status"] }) {
  if (status === "running")
    return <span className="step-spinner" aria-label="Running" />;
  if (status === "done")
    return (
      <span className="step-check" aria-label="Done">
        <CheckIcon size={10} />
      </span>
    );
  if (status === "failed")
    return (
      <span className="step-check is-failed" aria-label="Failed">
        <XIcon size={10} />
      </span>
    );
  return (
    <span className="step-check is-warning" aria-label="Attention">
      <AlertIcon size={10} />
    </span>
  );
}

export function RunSteps({
  steps,
  onSource,
}: {
  steps: RunStep[];
  onSource?: (source: EvidenceSource) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!steps.length) return null;

  return (
    <div className="run-steps" aria-label="Agent activity">
      {steps.map((step) => {
        const Glyph = GLYPHS[step.icon];
        const open = expanded === step.key;
        const canOpen = Boolean(
          step.raw || step.sources?.length || step.bullets?.length,
        );
        return (
          <div
            key={step.key}
            className={`run-step status-${step.status}${open ? " is-open" : ""}`}
          >
            <span className="run-step-icon" aria-hidden="true">
              <Glyph size={14} />
            </span>
            <button
              type="button"
              className="run-step-main"
              aria-expanded={open}
              disabled={!canOpen}
              onClick={() => setExpanded(open ? null : step.key)}
            >
              <span className="run-step-heading">
                <span className="run-step-title">
                  {step.status === "running" ? (
                    <span className="shimmer-text">{step.title}</span>
                  ) : (
                    step.title
                  )}
                </span>
                <StatusGlyph status={step.status} />
                {step.endedAt && step.startedAt && (
                  <span className="run-step-duration">
                    {duration(step.startedAt, step.endedAt)}
                  </span>
                )}
              </span>
              {step.subtitle && (
                <span className="run-step-subtitle">
                  {truncate(step.subtitle, 180)}
                </span>
              )}
            </button>
            {canOpen && (
              <button
                type="button"
                className="run-step-chevron"
                aria-label={open ? "Collapse details" : "Expand details"}
                aria-expanded={open}
                onClick={() => setExpanded(open ? null : step.key)}
              >
                <ChevronIcon size={14} />
              </button>
            )}
            {open && (
              <div className="run-step-detail">
                {step.bullets && step.bullets.length > 0 && (
                  <ul className="run-step-bullets">
                    {step.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                )}
                {step.sources && step.sources.length > 0 && (
                  <div className="run-step-sources">
                    {step.sources.slice(0, 6).map((source, index) => (
                      <button
                        key={source.id}
                        type="button"
                        className="run-source-row"
                        onClick={() => onSource?.(source)}
                      >
                        <span className="run-source-label">{index + 1}</span>
                        <span className="run-source-copy">
                          <span className="run-source-title">
                            {source.title ??
                              source.documentId ??
                              source.url ??
                              source.id}
                          </span>
                          <span className="run-source-meta">
                            {sourceMeta(source)}
                          </span>
                          <span className="run-source-quote">
                            {truncate(source.content, 180)}
                          </span>
                        </span>
                      </button>
                    ))}
                    {step.sources.length > 6 && (
                      <p className="run-step-more">
                        +{step.sources.length - 6} more sources in the panel
                      </p>
                    )}
                  </div>
                )}
                {step.raw && (
                  <details className="raw-event">
                    <summary>Raw event</summary>
                    <pre>{JSON.stringify(step.raw, null, 2)}</pre>
                  </details>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
