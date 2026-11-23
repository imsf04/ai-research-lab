import type { EvidenceSource, ReportQuality, TaskStatus } from "../api";
import { CopyIcon, DownloadIcon, FileTextIcon, LayersIcon } from "../icons";
import { ReportMarkdown } from "../markdown";
import { StatusBadge } from "./StatusBadge";

function qualityLabel(quality: ReportQuality): string {
  switch (quality) {
    case "reviewed":
      return "Citations reviewed";
    case "unverified":
      return "Unverified";
    case "insufficient":
      return "Insufficient evidence";
    case "unreviewed":
      return "Draft";
    default:
      return "Draft";
  }
}

function qualityTone(quality: ReportQuality): string {
  switch (quality) {
    case "reviewed":
      return "success";
    case "insufficient":
      return "danger";
    case "unverified":
    case "unreviewed":
      return "warning";
    default:
      return "neutral";
  }
}

export function ReportCard({
  report,
  quality,
  revision,
  sources,
  status,
  turnNumber,
  onCitation,
  onOpenSources,
  onToast,
}: {
  report: string;
  quality: ReportQuality;
  revision: number;
  sources: EvidenceSource[];
  status: TaskStatus | "idle";
  turnNumber: number;
  onCitation: (source: EvidenceSource) => void;
  onOpenSources: () => void;
  onToast: (message: string, tone?: "info" | "error") => void;
}) {
  const hasDraftBanner = quality === "unreviewed" || quality === "unverified";

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report);
      onToast("Report copied to clipboard");
    } catch {
      onToast("Copy failed — select the text manually", "error");
    }
  }

  function downloadReport() {
    try {
      const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `research-report-turn-${turnNumber}.md`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      onToast("Download unavailable in this browser", "error");
    }
  }

  return (
    <article className="report-card" aria-label="Research report">
      <header className="report-head">
        <div className="report-title">
          <span className="report-icon" aria-hidden="true">
            <FileTextIcon size={16} />
          </span>
          <div>
            <h3>Research report</h3>
            <p>
              Turn {turnNumber}
              {revision > 0 ? ` · revision ${revision}` : ""}
            </p>
          </div>
        </div>
        <div className="report-head-actions">
          <span className={`quality-pill tone-${qualityTone(quality)}`}>
            {qualityLabel(quality)}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Copy report"
            title="Copy Markdown"
            onClick={() => void copyReport()}
          >
            <CopyIcon size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Download report"
            title="Download Markdown"
            onClick={downloadReport}
          >
            <DownloadIcon size={15} />
          </button>
        </div>
      </header>

      {hasDraftBanner && (
        <div className="report-banner">
          <span className="report-banner-dot" aria-hidden="true" />
          Draft · citations and conclusions have not been fully verified. Open a
          citation to inspect the exact passage.
        </div>
      )}

      <div className="report-body">
        <ReportMarkdown
          text={report}
          sources={sources}
          onCitation={onCitation}
        />
      </div>

      <footer className="report-foot">
        <span>
          <LayersIcon size={13} />
          {sources.length} source{sources.length === 1 ? "" : "s"} available
        </span>
        <StatusBadge status={status} compact />
        {sources.length > 0 && (
          <button type="button" className="text-button" onClick={onOpenSources}>
            View sources
          </button>
        )}
      </footer>
    </article>
  );
}
