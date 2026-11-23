import { useEffect, useState } from "react";

import { HumanResearch } from "./HumanResearch";
import { ResearchForm } from "./ResearchForm";
import { RefreshIcon, SparklesIcon } from "./icons";

type HealthState = "checking" | "online" | "offline";

function BootScreen() {
  return (
    <main
      className="status-screen"
      role="status"
      aria-label="Starting workspace"
    >
      <div className="status-card">
        <div className="brand-mark large" aria-hidden="true">
          <SparklesIcon size={20} />
        </div>
        <p className="status-eyebrow">AI Research Lab</p>
        <h1>Checking API…</h1>
        <p className="status-detail">
          Connecting to the local research service on port 3001.
        </p>
        <span className="status-loader" aria-hidden="true" />
      </div>
    </main>
  );
}

function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="status-screen" role="alert" aria-label="API unavailable">
      <div className="status-card">
        <div className="brand-mark large is-offline" aria-hidden="true">
          <SparklesIcon size={20} />
        </div>
        <p className="status-eyebrow">AI Research Lab</p>
        <h1>API unavailable</h1>
        <p className="status-detail">
          Start the research service with <code>pnpm dev</code> and the browser
          client with <code>pnpm dev:web</code>, then retry.
        </p>
        <button type="button" className="button-primary" onClick={onRetry}>
          <RefreshIcon size={14} />
          Retry connection
        </button>
      </div>
    </main>
  );
}

export function App() {
  const [health, setHealth] = useState<HealthState>("checking");
  const [human, setHuman] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function checkHealth() {
      setHealth("checking");
      try {
        const response = await fetch("/api/health", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body: unknown = await response.json();
        const healthy =
          typeof body === "object" &&
          body !== null &&
          "status" in body &&
          (body as { status?: unknown }).status === "ok";
        if (!healthy) throw new Error("unhealthy");
        setHealth("online");
        setHuman(
          "humanEnabled" in (body as object) &&
            (body as { humanEnabled?: boolean }).humanEnabled === true,
        );
      } catch {
        if (!controller.signal.aborted) setHealth("offline");
      }
    }

    void checkHealth();
    return () => controller.abort();
  }, [attempt]);

  if (health === "checking") return <BootScreen />;
  if (health === "offline")
    return (
      <OfflineScreen onRetry={() => setAttempt((current) => current + 1)} />
    );
  if (human) return <HumanResearch health="online" />;
  return <ResearchForm />;
}
