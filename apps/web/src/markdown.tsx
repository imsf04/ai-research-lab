import { useMemo, type ReactNode } from "react";

import type { EvidenceSource } from "./api";
import { hostname, isWebSource, sourceOrdinal } from "./format";

export interface CitationTarget {
  index: number;
  label: string;
  source: EvidenceSource;
}

export function buildSourceIndex(
  sources: EvidenceSource[],
): Map<string, CitationTarget> {
  const index = new Map<string, CitationTarget>();
  sources.forEach((source, position) => {
    index.set(source.id, {
      index: position,
      label: isWebSource(source)
        ? `W${position + 1}`
        : sourceOrdinal(source, position),
      source,
    });
  });
  return index;
}

function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url, window.location.origin);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol)
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

interface InlineOptions {
  citations: Map<string, CitationTarget>;
  onCitation?: (source: EvidenceSource) => void;
  sourceTitle: (source: EvidenceSource) => string;
}

function inlineNodes(
  text: string,
  options: InlineOptions,
  keyPrefix: string,
): ReactNode[] {
  const output: ReactNode[] = [];
  const pieces = text.split(/(\[(?:RAG|WEB):[^\]]+\])/g);
  pieces.forEach((piece, pieceIndex) => {
    if (!piece) return;
    const citation = /^\[((?:RAG|WEB):[^\]]+)\]$/.exec(piece);
    if (citation?.[1]) {
      const id = citation[1];
      const target = options.citations.get(id);
      if (target) {
        output.push(
          <button
            key={`${keyPrefix}-c-${pieceIndex}`}
            type="button"
            className="citation"
            title={`${target.label} · ${options.sourceTitle(target.source)}`}
            onClick={() => options.onCitation?.(target.source)}
          >
            {target.label}
          </button>,
        );
      } else {
        output.push(
          <span
            key={`${keyPrefix}-c-${pieceIndex}`}
            className="citation citation-missing"
            title="该来源不在本次运行中"
          >
            {id.replace(/^[A-Z]+:/, "")}
          </span>,
        );
      }
      return;
    }
    const inner = piece.split(
      /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|<https?:\/\/[^>]+>)/g,
    );
    inner.forEach((part, index) => {
      if (!part) return;
      const key = `${keyPrefix}-${pieceIndex}-${index}`;
      if (/^\*\*[^*]+\*\*$/.test(part)) {
        output.push(<strong key={key}>{part.slice(2, -2)}</strong>);
        return;
      }
      if (/^`[^`]+`$/.test(part)) {
        output.push(<code key={key}>{part.slice(1, -1)}</code>);
        return;
      }
      const markdownLink = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (markdownLink?.[1] && markdownLink[2]) {
        const href = safeHref(markdownLink[2]);
        output.push(
          href ? (
            <a key={key} href={href} target="_blank" rel="noreferrer">
              {markdownLink[1]}
            </a>
          ) : (
            <span key={key}>{markdownLink[1]}</span>
          ),
        );
        return;
      }
      const autoLink = /^<(https?:\/\/[^>]+)>$/.exec(part);
      if (autoLink?.[1]) {
        const href = safeHref(autoLink[1]);
        output.push(
          href ? (
            <a key={key} href={href} target="_blank" rel="noreferrer">
              {hostname(autoLink[1]) || autoLink[1]}
            </a>
          ) : (
            <span key={key}>{autoLink[1]}</span>
          ),
        );
        return;
      }
      output.push(part);
    });
  });
  return output;
}

function splitCells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}/;

export function ReportMarkdown({
  text,
  sources,
  onCitation,
}: {
  text: string;
  sources: EvidenceSource[];
  onCitation?: (source: EvidenceSource) => void;
}) {
  const citations = useMemo(() => buildSourceIndex(sources), [sources]);
  const sourceTitle = (source: EvidenceSource) =>
    source.title ?? source.url ?? source.documentId ?? source.id;

  const nodes = useMemo(() => {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const blocks: ReactNode[] = [];
    const options: InlineOptions = {
      citations,
      sourceTitle,
      ...(onCitation ? { onCitation } : {}),
    };
    let index = 0;
    let blockKey = 0;

    while (index < lines.length) {
      const line = lines[index] ?? "";
      if (!line.trim()) {
        index += 1;
        continue;
      }
      const key = `b-${blockKey++}`;

      if (/^```/.test(line.trim())) {
        const code: string[] = [];
        index += 1;
        while (
          index < lines.length &&
          !/^```/.test((lines[index] ?? "").trim())
        ) {
          code.push(lines[index] ?? "");
          index += 1;
        }
        index += 1;
        blocks.push(
          <pre key={key} className="md-code">
            {code.join("\n")}
          </pre>,
        );
        continue;
      }

      const heading = /^(#{1,4})\s+(.*)$/.exec(line);
      if (heading?.[1] && heading[2]) {
        const level = heading[1].length;
        const content = inlineNodes(heading[2], options, key);
        if (level <= 1) blocks.push(<h2 key={key}>{content}</h2>);
        else if (level === 2) blocks.push(<h3 key={key}>{content}</h3>);
        else blocks.push(<h4 key={key}>{content}</h4>);
        index += 1;
        continue;
      }

      if (/^[>\uFF1E]\s?/.test(line)) {
        const quote: string[] = [];
        while (
          index < lines.length &&
          /^[>\uFF1E]\s?/.test(lines[index] ?? "")
        ) {
          quote.push((lines[index] ?? "").replace(/^[>\uFF1E]\s?/, ""));
          index += 1;
        }
        blocks.push(
          <blockquote key={key}>
            {inlineNodes(quote.join(" "), options, key)}
          </blockquote>,
        );
        continue;
      }

      if (
        line.trim().startsWith("|") &&
        TABLE_SEPARATOR.test(lines[index + 1] ?? "")
      ) {
        const head = splitCells(line);
        index += 2;
        const rows: string[][] = [];
        while (
          index < lines.length &&
          (lines[index] ?? "").trim().startsWith("|")
        ) {
          rows.push(splitCells(lines[index] ?? ""));
          index += 1;
        }
        blocks.push(
          <div key={key} className="md-table-wrap">
            <table className="md-table">
              <thead>
                <tr>
                  {head.map((cell, cellIndex) => (
                    <th key={cellIndex}>
                      {inlineNodes(cell, options, `${key}-h-${cellIndex}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>
                        {inlineNodes(
                          cell,
                          options,
                          `${key}-${rowIndex}-${cellIndex}`,
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }

      const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
      if (bullet?.[2]) {
        const items: string[] = [];
        while (index < lines.length) {
          const next = /^(\s*)[-*+]\s+(.*)$/.exec(lines[index] ?? "");
          if (!next?.[2]) break;
          items.push(next[2]);
          index += 1;
        }
        blocks.push(
          <ul key={key}>
            {items.map((item, itemIndex) => (
              <li key={itemIndex}>
                {inlineNodes(item, options, `${key}-${itemIndex}`)}
              </li>
            ))}
          </ul>,
        );
        continue;
      }

      const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
      if (numbered?.[1]) {
        const items: string[] = [];
        while (index < lines.length) {
          const next = /^\d+[.)]\s+(.*)$/.exec(lines[index] ?? "");
          if (!next?.[1]) break;
          items.push(next[1]);
          index += 1;
        }
        blocks.push(
          <ol key={key}>
            {items.map((item, itemIndex) => (
              <li key={itemIndex}>
                {inlineNodes(item, options, `${key}-${itemIndex}`)}
              </li>
            ))}
          </ol>,
        );
        continue;
      }

      if (/^---+$/.test(line.trim())) {
        blocks.push(<hr key={key} />);
        index += 1;
        continue;
      }

      const paragraph: string[] = [];
      while (index < lines.length) {
        const next = lines[index] ?? "";
        if (
          !next.trim() ||
          /^#{1,4}\s+/.test(next) ||
          /^```/.test(next.trim()) ||
          /^(\s*)[-*+]\s+/.test(next) ||
          /^\d+[.)]\s+/.test(next) ||
          (next.trim().startsWith("|") && index + 1 < lines.length) ||
          /^[>\uFF1E]\s?/.test(next)
        ) {
          break;
        }
        paragraph.push(next.trim());
        index += 1;
      }
      blocks.push(
        <p key={key}>{inlineNodes(paragraph.join(" "), options, key)}</p>,
      );
    }
    return blocks;
  }, [text, citations, onCitation]);

  return <div className="report-markdown">{nodes}</div>;
}

export function sourceMeta(source: EvidenceSource): string {
  if (isWebSource(source)) return hostname(source.url ?? "") || "Web result";
  const lines =
    source.startLine !== undefined && source.endLine !== undefined
      ? `lines ${source.startLine}–${source.endLine}`
      : "";
  return [source.documentId, lines].filter(Boolean).join(" · ");
}
