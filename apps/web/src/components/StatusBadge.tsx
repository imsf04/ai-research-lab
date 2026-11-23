import type { TaskStatus } from "../api";
import { statusLabel, statusTone } from "../format";

export function StatusBadge({
  status,
  compact = false,
}: {
  status: TaskStatus | "idle";
  compact?: boolean;
}) {
  return (
    <span
      className={`status-badge tone-${statusTone(status)}${compact ? " compact" : ""}`}
      data-status={status}
    >
      <span className="status-pip" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}
