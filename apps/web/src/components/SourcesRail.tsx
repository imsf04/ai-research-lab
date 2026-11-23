import { useEffect, useState } from "react";

import type { AuditEvent, EvidenceSource } from "../api";
import { classNames, clockTime, isWebSource, sourceOrdinal } from "../format";
import {
  ChevronIcon,
  ClockIcon,
  CopyIcon,
  GlobeIcon,
  FileTextIcon,
  XIcon,
} from "../icons";
import { sourceMeta } from "../markdown";

function sourceKey(id: string) {
  return `source-${encodeURIComponent(id)}`;
}

function SourceCard({
  source,
  index,
  active,
  onSelect,
  onToast,
}: {
  source: EvidenceSource;
  index: number;
  active: boolean;
  onSelect: (source: EvidenceSource) => void;
  onToast: (message: string, tone?: "info" | "error") => void;
}) {
  const [open, setOpen] = useState(active);
  const web = isWebSource(source);
  const number = sourceOrdinal(source, index);

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  async function copyCitation() {
    try {
      await navigator.clipboard.writeText(`[${source.id}]`);
      onToast(`Copied [${source.id}]`);
    } catch {
      onToast("Copy failed", "error");
    }
  }

  return (
    <article
      id={sourceKey(source.id)}
      className={classNames(
        "source-card",
        active && "is-active",
        open && "is-open",
      )}
    >
      <button
        type="button"
        className="source-card-head"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          onSelect(source);
        }}
      >
        <span
          className={classNames("source-type", web ? "is-web" : "is-local")}
        >
          {web ? <GlobeIcon size={13} /> : <FileTextIcon size={13} />}
        </span>
        <span className="source-head-copy">
          <span className="source-title">
            <span className="source-number">{number}</span>
            {source.title ?? source.documentId ?? source.url ?? source.id}
          </span>
          <span className="source-meta">{sourceMeta(source)}</span>
        </span>
        <ChevronIcon size={13} />
      </button>
      {open && (
        <div className="source-card-body">
          <blockquote>{source.content}</blockquote>
          <div className="source-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => void copyCitation()}
            >
              <CopyIcon size={12} /> [{source.id}]
            </button>
            {typeof source.score === "number" && (
              <span className="source-score">
                score {source.score.toFixed(3)}
              </span>
            )}
            {web && source.url && (
              <a href={source.url} target="_blank" rel="noreferrer">
                Open result ↗
              </a>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export function SourcesRail({
  sources,
  events,
  tab,
  activeSourceId,
  onTab,
  onSelect,
  onClose,
  onToast,
}: {
  sources: EvidenceSource[];
  events: AuditEvent[];
  tab: "sources" | "activity";
  activeSourceId: string | null;
  onTab: (tab: "sources" | "activity") => void;
  onSelect: (source: EvidenceSource) => void;
  onClose: () => void;
  onToast: (message: string, tone?: "info" | "error") => void;
}) {
  const local = sources.filter((source) => !isWebSource(source));
  const web = sources.filter(isWebSource);

  useEffect(() => {
    if (tab !== "sources" || !activeSourceId) return;
    const node = document.getElementById(sourceKey(activeSourceId));
    node?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [tab, activeSourceId]);

  return (
    <aside className="sources-rail" aria-label="Sources and activity">
      <header className="rail-head">
        <div className="rail-tabs" role="tablist" aria-label="Inspector">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "sources"}
            className={classNames("rail-tab", tab === "sources" && "is-active")}
            onClick={() => onTab("sources")}
          >
            Sources <span>{sources.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "activity"}
            className={classNames(
              "rail-tab",
              tab === "activity" && "is-active",
            )}
            onClick={() => onTab("activity")}
          >
            Activity <span>{events.length}</span>
          </button>
        </div>
        <button
          type="button"
          className="icon-button rail-close"
          aria-label="Close sources panel"
          onClick={onClose}
        >
          <XIcon size={14} />
        </button>
      </header>

      {tab === "sources" ? (
        <div className="rail-body">
          {sources.length === 0 ? (
            <div className="rail-empty">
              <span className="rail-empty-icon">
                <FileTextIcon size={20} />
              </span>
              <p>No sources yet.</p>
              <small>
                Retrieved passages and web results appear here as the agent
                reads.
              </small>
            </div>
          ) : (
            <>
              {local.length > 0 && (
                <section className="source-group">
                  <h4>
                    Local documents <span>{local.length}</span>
                  </h4>
                  {local.map((source, index) => (
                    <SourceCard
                      key={source.id}
                      source={source}
                      index={index}
                      active={activeSourceId === source.id}
                      onSelect={onSelect}
                      onToast={onToast}
                    />
                  ))}
                </section>
              )}
              {web.length > 0 && (
                <section className="source-group">
                  <h4>
                    Web results <span>{web.length}</span>
                  </h4>
                  {web.map((source, index) => (
                    <SourceCard
                      key={source.id}
                      source={source}
                      index={local.length + index}
                      active={activeSourceId === source.id}
                      onSelect={onSelect}
                      onToast={onToast}
                    />
                  ))}
                </section>
              )}
              <p className="rail-note">
                Web entries are search summaries, not the full page. Citations
                show where a claim came from — not that every sentence was
                independently verified.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="rail-body">
          {events.length === 0 ? (
            <div className="rail-empty">
              <span className="rail-empty-icon">
                <ClockIcon size={20} />
              </span>
              <p>No activity yet.</p>
              <small>
                Tool calls, plans and approvals will stream in here.
              </small>
            </div>
          ) : (
            <ol className="activity-list" aria-label="Raw event timeline">
              {[...events]
                .sort((left, right) => right.seq - left.seq)
                .map((event) => {
                  const message =
                    event.detail &&
                    typeof event.detail === "object" &&
                    typeof event.detail.message === "string"
                      ? event.detail.message
                      : "";
                  return (
                    <li key={event.seq} className="activity-item">
                      <details>
                        <summary>
                          <span className="activity-time">
                            {clockTime(event.created_at)}
                          </span>
                          <span className="activity-action">
                            {event.action}
                          </span>
                          <span className="activity-seq">#{event.seq}</span>
                        </summary>
                        <p className="activity-message">
                          {message ||
                            `${event.actor} · ${event.kind ?? "status"}`}
                        </p>
                        <pre>{JSON.stringify(event.detail, null, 2)}</pre>
                      </details>
                    </li>
                  );
                })}
            </ol>
          )}
        </div>
      )}
    </aside>
  );
}
