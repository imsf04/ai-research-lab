import {
  DatabaseIcon,
  GlobeIcon,
  ShieldIcon,
  SparklesIcon,
  TerminalIcon,
} from "../icons";

const SUGGESTIONS = [
  {
    title: "Can WebAssembly replace parts of Electron?",
    detail:
      "Weigh performance, tooling and migration cost against current evidence.",
  },
  {
    title: "Compare pgvector, Qdrant and LanceDB at 10M chunks",
    detail: "Build a decision memo from recall, latency and operating cost.",
  },
  {
    title: "What does the evidence say about agent approval gates?",
    detail: "Trace claims back to source passages with verifiable citations.",
  },
];

export function Welcome({ onPick }: { onPick: (question: string) => void }) {
  return (
    <section className="welcome" aria-label="New research">
      <div className="welcome-glow" aria-hidden="true" />
      <div className="welcome-mark" aria-hidden="true">
        <SparklesIcon size={22} />
      </div>
      <p className="welcome-eyebrow">AI Research Lab · Agent workspace</p>
      <h2>What should we research?</h2>
      <p className="welcome-sub">
        Ask a question and the agent plans sub-questions, searches local
        evidence and the web, reads MCP documents, then writes a report with
        traceable citations.
      </p>

      <div className="capability-row" aria-label="Capabilities">
        <span className="capability">
          <DatabaseIcon size={13} /> Local RAG
        </span>
        <span className="capability">
          <GlobeIcon size={13} /> Brave web search
        </span>
        <span className="capability">
          <TerminalIcon size={13} /> MCP tools
        </span>
        <span className="capability">
          <ShieldIcon size={13} /> Human approval
        </span>
      </div>

      <div className="suggestions" aria-label="Suggested research questions">
        {SUGGESTIONS.map((suggestion, index) => (
          <button
            key={suggestion.title}
            type="button"
            className="suggestion"
            onClick={() => onPick(suggestion.title)}
          >
            <span className="suggestion-index">0{index + 1}</span>
            <span className="suggestion-title">{suggestion.title}</span>
            <span className="suggestion-detail">{suggestion.detail}</span>
            <span className="suggestion-arrow" aria-hidden="true">
              ↗
            </span>
          </button>
        ))}
      </div>

      <p className="welcome-note">
        Durable projects · every run is resumable and every citation is
        inspectable.
      </p>
    </section>
  );
}
