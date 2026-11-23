import { useEffect, useState } from "react";

import type { Approval } from "../api";
import { AlertIcon, CheckIcon, ClockIcon, XIcon } from "../icons";

const KIND_TITLES: Record<Approval["kind"], string> = {
  clarification: "Clarify the research scope",
  plan: "Approve the research plan",
  plan_adjustment: "Approve the follow-up research",
  tool: "Approve tool access",
};

function remaining(expiresAt: string, now: number): string {
  const ms = Date.parse(expiresAt) - now;
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "Expired";
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d ${hours % 24}h`;
  if (hours >= 1) return `${hours}h ${minutes % 60}m`;
  return `${Math.max(1, minutes)}m`;
}

export function ApprovalDock({
  approval,
  value,
  onChange,
  onApprove,
  onReject,
  busy,
}: {
  approval: Approval;
  value: string;
  onChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const expiry = remaining(approval.expiresAt, now);
  const clarification = approval.kind === "clarification";

  return (
    <section className="approval-dock" aria-label="待审批请求">
      <div className="approval-card">
        <div className="approval-head">
          <span className="approval-icon" aria-hidden="true">
            <AlertIcon size={16} />
          </span>
          <div className="approval-title">
            <span className="approval-eyebrow">Approval required</span>
            <h3>{KIND_TITLES[approval.kind]}</h3>
          </div>
          <span className="approval-expiry">
            <ClockIcon size={12} />
            {expiry}
          </span>
        </div>

        <p className="approval-reason">{approval.reason}</p>
        {approval.goal && (
          <p className="approval-context">
            <span>Goal</span> {approval.goal}
          </p>
        )}
        {approval.serves && (
          <p className="approval-context">
            <span>Answers</span> {approval.serves}
          </p>
        )}
        {approval.questions.length > 0 && (
          <ul className="approval-questions">
            {approval.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        )}

        <label className="approval-query">
          <span>
            {clarification ? "Clarified question" : "Query to run (editable)"}
          </span>
          <textarea
            rows={2}
            maxLength={8000}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                (event.metaKey || event.ctrlKey) &&
                !busy &&
                value.trim()
              ) {
                event.preventDefault();
                onApprove();
              }
            }}
          />
        </label>

        <div className="approval-actions">
          <button
            type="button"
            className="button-primary"
            disabled={busy || !value.trim()}
            onClick={onApprove}
          >
            <CheckIcon size={14} />
            Approve & continue
          </button>
          <button
            type="button"
            className="button-ghost"
            disabled={busy}
            onClick={onReject}
          >
            <XIcon size={14} />
            Reject
          </button>
          <span className="approval-shortcut">⌘↵ to approve</span>
        </div>
      </div>
    </section>
  );
}
