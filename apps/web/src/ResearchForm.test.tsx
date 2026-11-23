// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ResearchForm } from "./ResearchForm";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("submits a question and displays its completed report, steps and sources", async () => {
  const events = [
    { type: "AGENT_STARTED" },
    { type: "AGENT_DECISION", message: "路径选择：MCP 文档工具" },
    { type: "TOOLS_DISCOVERED", message: "MCP 已发现资料工具" },
    { type: "TOOL_RESULT", message: "读取成功：storage.md" },
    {
      type: "RETRIEVAL_COMPLETED",
      sources: [
        {
          id: "RAG:1",
          chunkId: "RAG:stable-hash",
          documentId: "storage.md",
          content: "原始证据片段",
          sha256: "a".repeat(64),
          startLine: 2,
          endLine: 4,
          score: null,
        },
      ],
    },
    { type: "EVIDENCE_ASSESSED", message: "证据评估：证据足够" },
    { type: "RESEARCH_STOPPED", message: "取证结束：证据足够" },
    { type: "A2A_DISCOVERED", message: "A2A 已发现 researcher" },
    { type: "A2A_PROGRESS", message: "A2A researcher：正在处理" },
    { type: "ROLE_DELEGATED", message: "Coordinator：委派研究执行者" },
    { type: "CRITIC_REVIEWED", message: "Critic：需要修订引用" },
    { type: "COORDINATOR_COMPLETED", message: "Coordinator：审查通过" },
    { type: "REPORT_DELTA", text: "Analysis" },
    { type: "LOOP_PLAN", message: "计划：查明存储理由" },
    { type: "AGENT_COMPLETED", report: "Analysis [RAG:1]" },
  ];
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          events
            .map(
              (event, index) =>
                `data: ${JSON.stringify({ taskId: "test-task", sequence: index + 1, ...event })}\n\n`,
            )
            .join(""),
        ),
      ),
  );
  render(<ResearchForm />);
  fireEvent.change(screen.getByLabelText("研究问题"), {
    target: { value: "Compare designs" },
  });
  fireEvent.click(screen.getByText("开始研究"));

  expect(await screen.findByText("研究状态：completed")).toBeTruthy();
  expect(screen.getByText("任务 ID：test-task")).toBeTruthy();
  expect(screen.getAllByText(/Analysis/).length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole("button", { name: "1" }));
  expect(await screen.findByText("原始证据片段")).toBeTruthy();
  expect(screen.getAllByText(/storage\.md · lines 2–4/).length).toBeGreaterThan(
    0,
  );

  for (const message of [
    "路径选择：MCP 文档工具",
    "MCP 已发现资料工具",
    "读取成功：storage.md",
    "证据评估：证据足够",
    "取证结束：证据足够",
    "A2A 已发现 researcher",
    "A2A researcher：正在处理",
    "Coordinator：委派研究执行者",
    "Critic：需要修订引用",
    "Coordinator：审查通过",
    "计划：查明存储理由",
  ]) {
    expect(
      screen.getAllByText(message, { exact: false }).length,
    ).toBeGreaterThan(0);
  }
});

it("cancels a pending request", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("cancelled", "AbortError")),
            { once: true },
          );
        }),
    ),
  );
  render(<ResearchForm />);
  fireEvent.change(screen.getByLabelText("研究问题"), {
    target: { value: "Compare designs" },
  });
  fireEvent.click(screen.getByText("开始研究"));
  fireEvent.click(await screen.findByText("取消"));
  expect(await screen.findByText("研究状态：cancelled")).toBeTruthy();
});
