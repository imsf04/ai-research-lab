import type { TaskStatus } from "../api";
import { MenuIcon, PanelIcon, RefreshIcon } from "../icons";
import { StatusBadge } from "./StatusBadge";

export function TopBar({
  title,
  status,
  isNew,
  turnCount,
  sourceCount,
  railOpen,
  refreshing,
  onMenu,
  onRefresh,
  onToggleRail,
}: {
  title: string;
  status: TaskStatus | "idle";
  isNew: boolean;
  turnCount: number;
  sourceCount: number;
  railOpen: boolean;
  refreshing: boolean;
  onMenu: () => void;
  onRefresh: () => void;
  onToggleRail: () => void;
}) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-button menu-button"
        aria-label="Open sidebar"
        onClick={onMenu}
      >
        <MenuIcon size={17} />
      </button>
      <div className="topbar-title">
        <span className="topbar-eyebrow">
          {isNew ? "Workspace" : "Project"}
        </span>
        <h1 title={title}>{title}</h1>
      </div>
      {!isNew && (
        <div className="topbar-meta">
          <StatusBadge status={status} compact />
          <span className="topbar-stat">
            <strong>{turnCount}</strong> turn{turnCount === 1 ? "" : "s"}
          </span>
          <span className="topbar-stat">
            <strong>{sourceCount}</strong> source{sourceCount === 1 ? "" : "s"}
          </span>
        </div>
      )}
      {!isNew && (
        <div className="topbar-actions">
          <button
            type="button"
            className={`icon-button${refreshing ? " is-spinning" : ""}`}
            aria-label="Refresh project"
            title="Refresh"
            onClick={onRefresh}
          >
            <RefreshIcon size={16} />
          </button>
          <button
            type="button"
            className={`rail-toggle${railOpen ? " is-on" : ""}`}
            aria-label="Toggle sources panel"
            aria-pressed={railOpen}
            onClick={onToggleRail}
          >
            <PanelIcon size={15} />
            <span>Sources</span>
            <span className="rail-count">{sourceCount}</span>
          </button>
        </div>
      )}
    </header>
  );
}
