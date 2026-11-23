import { useState } from "react";

import { healthLabel } from "../api";
import { classNames, relativeTime, statusLabel, statusTone } from "../format";
import {
  SearchIcon,
  SparklesIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
  ShieldIcon,
} from "../icons";
import type { ProjectItem } from "../projects";

export function Sidebar({
  projects,
  activeId,
  health,
  open,
  now,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: {
  projects: ProjectItem[];
  activeId: string | undefined;
  health: "checking" | "online" | "offline";
  open: boolean;
  now: number;
  onSelect: (project: ProjectItem) => void;
  onNew: () => void;
  onDelete: (project: ProjectItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? projects.filter((project) =>
        (project.title ?? "Untitled research").toLowerCase().includes(needle),
      )
    : projects;

  return (
    <aside
      className={classNames("sidebar", open && "is-open")}
      aria-label="Projects"
    >
      <div className="sidebar-brand">
        <div className="brand-mark" aria-hidden="true">
          <SparklesIcon size={17} />
        </div>
        <div className="brand-copy">
          <span className="brand-name">AI Research Lab</span>
          <span className="brand-sub">Agent workspace</span>
        </div>
        <button
          type="button"
          className="icon-button sidebar-close"
          aria-label="Close sidebar"
          onClick={onClose}
        >
          <XIcon size={16} />
        </button>
      </div>

      <button type="button" className="new-project" onClick={onNew}>
        <PlusIcon size={15} />
        <span>New research</span>
        <kbd>⌘N</kbd>
      </button>

      <label className="sidebar-search">
        <SearchIcon size={14} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search projects"
          aria-label="Search projects"
          autoComplete="off"
        />
      </label>

      <div className="sidebar-section">
        <span>Projects</span>
        <span className="sidebar-count">{visible.length}</span>
      </div>

      <div className="project-list" role="list" aria-label="Research projects">
        {visible.length === 0 ? (
          <p className="projects-empty">
            {projects.length === 0
              ? "No projects yet. Start with a question."
              : "No projects match this search."}
          </p>
        ) : (
          visible.map((project) => {
            const title = project.title ?? "Untitled research";
            const active = project.id === activeId;
            return (
              <div
                key={project.id}
                role="listitem"
                className={classNames("project-row", active && "is-active")}
              >
                <button
                  type="button"
                  className="project-open"
                  onClick={() => onSelect(project)}
                  title={title}
                >
                  <span
                    className={`project-pip tone-${statusTone(project.status ?? "idle")}`}
                    aria-hidden="true"
                  />
                  <span className="project-copy">
                    <span className="project-title">{title}</span>
                    <span className="project-meta">
                      {relativeTime(project.updatedAt, now) || "New"}
                      {project.status
                        ? ` · ${statusLabel(project.status)}`
                        : ""}
                    </span>
                  </span>
                </button>
                {confirmId === project.id ? (
                  <button
                    type="button"
                    className="project-confirm"
                    onClick={() => {
                      setConfirmId(null);
                      onDelete(project);
                    }}
                    onBlur={() => setConfirmId(null)}
                  >
                    Delete?
                  </button>
                ) : (
                  <button
                    type="button"
                    className="project-delete"
                    aria-label={`Delete ${title}`}
                    title="Delete project"
                    onClick={() => setConfirmId(project.id)}
                  >
                    <TrashIcon size={14} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="sidebar-foot">
        <div className="api-state" data-state={health}>
          <span className="status-pip" aria-hidden="true" />
          <span>{healthLabel(health)}</span>
        </div>
        <div className="local-note">
          <ShieldIcon size={12} />
          <span>Local workspace · keys stay in this browser</span>
        </div>
      </div>
    </aside>
  );
}
