// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { HumanResearch } from "./HumanResearch";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const credential = { id: "task-1", key: "a".repeat(64) };
const pendingTask = {
  id: "task-1",
  question: "why",
  status: "pending",
  report: "",
  error: "",
  approval: {
    id: "approval-1",
    kind: "plan",
    question: "why",
    query: "original",
    questions: ["选型理由"],
    reason: "需要本地资料",
    expiresAt: new Date(Date.now() + 10_000).toISOString(),
  },
  audit: [{ seq: 1, actor: "Alice", action: "created", created_at: "now" }],
};

function mockTask(task: Record<string, unknown>, events = "") {
  return vi.fn<typeof fetch>(async (input, init) => {
    if (init?.method === "POST") return Response.json({ ok: true });
    if (String(input).includes("/events?")) {
      return new Response(events, {
        headers: { "Content-Type": "text/event-stream" },
      });
    }
    return Response.json(task);
  });
}

it("restores a pending approval after refresh and submits an edited query with its version and key", async () => {
  localStorage.setItem("human-research", JSON.stringify(credential));
  const fetcher = mockTask(pendingTask);
  vi.stubGlobal("fetch", fetcher);
  render(<HumanResearch />);

  expect(await screen.findByText("需要本地资料")).toBeTruthy();
  const query = (await screen.findByLabelText(
    "Query to run (editable)",
  )) as HTMLTextAreaElement;
  await waitFor(() => expect(query.value).toBe("original"));
  fireEvent.change(query, { target: { value: "changed" } });
  fireEvent.click(screen.getByText("Approve & continue"));

  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/approve") &&
          JSON.parse(String(init?.body)).value === "changed",
      ),
    ).toBe(true),
  );
  const post = fetcher.mock.calls.find(([url]) =>
    String(url).endsWith("/approve"),
  )!;
  expect(post[1]?.headers).toMatchObject({ "x-research-key": credential.key });
  expect(JSON.parse(String(post[1]?.body))).toMatchObject({
    approvalId: "approval-1",
    actor: "本机用户",
  });
});

it("can reject an approval and shows the terminal state plus the activity log", async () => {
  localStorage.setItem("human-research", JSON.stringify(credential));
  let rejected = false;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input, init) => {
      if (init?.method === "POST") {
        rejected = true;
        return Response.json({ ok: true });
      }
      if (String(input).includes("/events?")) {
        return new Response("", {
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return Response.json(
        rejected
          ? { ...pendingTask, status: "rejected", approval: null }
          : pendingTask,
      );
    }),
  );
  render(<HumanResearch />);
  fireEvent.click(await screen.findByText("Reject"));
  expect((await screen.findAllByText("Rejected")).length).toBeGreaterThan(0);

  fireEvent.click(screen.getByLabelText("Toggle sources panel"));
  fireEvent.click(screen.getByRole("tab", { name: /Activity/ }));
  expect(screen.getByText("created")).toBeTruthy();
});

it("shows expired approvals without an approve action", async () => {
  localStorage.setItem("human-research", JSON.stringify(credential));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) =>
      String(input).includes("/events?")
        ? new Response("", { headers: { "Content-Type": "text/event-stream" } })
        : Response.json({ ...pendingTask, status: "expired", approval: null }),
    ),
  );
  render(<HumanResearch />);
  expect((await screen.findAllByText("Expired")).length).toBeGreaterThan(0);
  expect(screen.queryByText("Approve & continue")).toBeNull();
});

it("replays research events as expandable steps and keeps the approval in the dock", async () => {
  localStorage.setItem("human-research", JSON.stringify(credential));
  vi.stubGlobal(
    "fetch",
    mockTask(
      pendingTask,
      'id: 2\nevent: research\ndata: {"seq":2,"actor":"system","action":"LOOP_PLAN","created_at":"2026-11-06T08:00:00Z","detail":{"message":"计划检索公开资料","round":1}}\n\n',
    ),
  );
  render(<HumanResearch />);

  expect(await screen.findByText("计划检索公开资料")).toBeTruthy();
  expect(screen.getByRole("log")).toBeTruthy();
  expect(screen.getByLabelText("待审批请求")).toBeTruthy();
  expect(screen.getByText("Plan · round 1")).toBeTruthy();
  expect(screen.getByLabelText("研究操作区")).toBeTruthy();
  expect(
    within(screen.getByLabelText("待审批请求")).getByText("Approve & continue"),
  ).toBeTruthy();
});

it("renders tool calls and a report whose citation opens the matching source", async () => {
  localStorage.setItem("human-research", JSON.stringify(credential));
  const completed = {
    id: "task-1",
    title: "Wasm in Electron",
    question: "Can WebAssembly replace parts of Electron?",
    status: "completed",
    report: "## Findings\n\nWasm can offload hot paths [RAG:1].",
    error: "",
    approval: null,
    snapshot: {
      state: {
        sources: [
          {
            id: "RAG:1",
            documentId: "storage.md",
            content: "storage.md evidence passage",
            startLine: 2,
            endLine: 4,
          },
        ],
      },
    },
    audit: [
      {
        seq: 1,
        actor: "system",
        action: "created",
        created_at: "2026-11-22T10:00:00Z",
        detail: { message: "Can WebAssembly replace parts of Electron?" },
        kind: "user_message",
      },
      {
        seq: 2,
        actor: "system",
        action: "RETRIEVAL_STARTED",
        created_at: "2026-11-22T10:00:01Z",
        detail: {
          action: "local",
          query: "wasm electron",
          message: "开始检索",
        },
        kind: "rag",
      },
      {
        seq: 3,
        actor: "system",
        action: "RETRIEVAL_COMPLETED",
        created_at: "2026-11-22T10:00:04Z",
        detail: {
          action: "local",
          query: "wasm electron",
          message: "累计 1/40 个片段",
          sources: [
            {
              id: "RAG:1",
              chunkId: "chunk-1",
              documentId: "storage.md",
              content: "storage.md evidence passage",
              sha256: "a".repeat(64),
              startLine: 2,
              endLine: 4,
              score: 0.82,
            },
          ],
        },
        kind: "rag",
      },
      {
        seq: 4,
        actor: "system",
        action: "TOOL_CALLED",
        created_at: "2026-11-22T10:00:05Z",
        detail: { tool: "read_document", arguments: { id: "notes.md" } },
        kind: "tool",
      },
      {
        seq: 5,
        actor: "system",
        action: "TOOL_RESULT",
        created_at: "2026-11-22T10:00:06Z",
        detail: { tool: "read_document", message: "读取成功：storage.md" },
        kind: "tool",
      },
    ],
  };
  const fetcher = mockTask(completed);
  vi.stubGlobal("fetch", fetcher);
  render(<HumanResearch />);

  expect(await screen.findByText("Searched local evidence")).toBeTruthy();
  expect(screen.getByText("Called read_document")).toBeTruthy();
  expect((await screen.findAllByText("Completed")).length).toBeGreaterThan(0);
  expect(screen.getByText(/Wasm can offload hot paths/)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "1" }));
  expect(await screen.findByText("storage.md evidence passage")).toBeTruthy();
  expect(screen.getByText(/score 0\.820/)).toBeTruthy();
});
