# AI Research Lab：科研 Agent 的智能搜索模块

### TODO

| 成员 | 姓名 | 学号 | 具体贡献（每人一行） |
| --- | --- | --- | --- |
| 1 | ZHAO Yipeng | 21352858 | 负责选定技术架构，从langGraph模板搭建agent框架，实现基本工具，编写基础循环和服务命令，编排agent loop，实现最小可循环demo |
| 2 | PENG You | 21360635 | 负责嵌入接口抽象与质量保障：设计 Embedder 适配层与检索降级，完成索引重灌与启动检查；逐个 PR 走查各成员模块并修复，审核合并 3 个功能 PR，跑通全量检查与真实服务验收。 |
| 3 | | | |
| 4 | | | |
| 5 | | | |

## 用户、任务与 AI 作用

本工具面向需要查找、整理和核查研究资料的学生与科研人员，以及对证据来源要求较高的普通用户。定位为科研 Agent 的智能搜索模块。输入研究问题，系统规划检索、获取本地文档或联网搜索摘要、整理带引用的报告，并记录证据缺口。用户可通过 `/continue [补充指令]` 将上一轮缺口转为新一轮研究任务。

AI 负责查询规划、证据整理和审查；程序负责工具权限、引用校验、预算限制和状态保存。搜索摘要不等于完整论文，引用匹配也不等于结论正确，输出仍需人工核验。

## 运行方法

需要 Node.js 24、pnpm 11.22.0，以及 Docker 中的 PostgreSQL 17／pgvector。无 Docker 时可使用项目内置的 PGlite。

```bash
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
```

编辑 `apps/api/.env`，填写 HKUST 网关密钥与 Brave Search 密钥。以下配置覆盖模板中的同名项：

```dotenv
LLM_PROVIDER=openai
OPENAI_API_KEY=<自行填写>
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://hkust.azure-api.net/hkust-genai/v1
OPENAI_API_STYLE=chat-completions
OPENAI_AUTH_HEADER=api-key
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
EMBEDDING_BASE_URL=https://hkust.azure-api.net/hkust-genai/v1
EMBEDDING_AUTH_HEADER=api-key
BRAVE_SEARCH_API_KEY=<自行填写>
WEB_SEARCH_ENABLED=true
HUMAN_ENABLED=true
```

聊天与嵌入共用 `OPENAI_API_KEY`。保留模板中的 RAG、研究循环和多角色开关。

```bash
# 启动数据库并建立默认本地文档索引
 docker compose up -d --wait
 pnpm --filter @research-lab/api rag:ingest

# 在两个终端分别运行 API 和 Web
 pnpm dev
 pnpm dev:web

# 可在第三个终端启动 CLI
 pnpm cli
```

Web 地址以 Vite 输出为准，默认 `http://localhost:5173`；API 默认 `http://localhost:3001`。首次输入问题后，批准检索计划以继续。已有报告后使用 `/continue` 或 `/continue 优先查找独立对照实验`。每次命令推进一轮，仍需审批。

无 Docker 时，在 `.env` 设置以下选项，跳过启动 Docker 的命令。索引命令与 API 不要同时占用 PGlite 目录。

```dotenv
DATABASE_DRIVER=pglite
PGLITE_DATA_DIR=.pglite
```

更换嵌入模型后执行 `pnpm --filter @research-lab/api rag:reindex` 并重启 API；PGlite 模式下先停止 API。更多配置见 [网关说明](docs/hkust-api.md)。

## 主要模块与接口

```text
Web / CLI → HTTP 任务与审批 API → LangGraph 检索工作流
                                  ├─ 模型适配：规划、整理、审查
                                  ├─ RAG / MCP：检索本地资料
                                  ├─ Brave：联网搜索摘要
                                  └─ PostgreSQL / PGlite：状态、报告、向量
API → 任务状态与 SSE 事件 → Web / CLI
```

## 示例与验证

| 类型 | 输入／操作 | 已验证结果 | 代码位置 |
| --- | --- | --- | --- |
| 代表用例 1 | 研究“original”，审批时改为“adjusted query” | 批准前不检索；批准后使用修改后的查询，生成含原文依据的报告 | `apps/api/test/human.test.ts`：`pauses before retrieval...` |
| 代表用例 2 | 上轮缺口为“独立测量同步成本”，执行 `/continue`，可附“优先找近三年的对照实验” | 创建新轮次，保留历史与补充指令；审批后生成报告；下一次续研使用最新缺口 | 同文件：`continues from report evidence...` |
| 失败用例 | 本地检索抛出数据库不可用错误 | 切换 MCP 前重新审批；拒绝后不读取文档，批准后从快照继续 | 同文件：`pauses for MCP approval...`、`never reads MCP documents...` |

```bash
pnpm --filter @research-lab/api exec vitest run test/human.test.ts test/continuation.test.ts
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

提交前还需保存两个真实代表输入、一个失败输入及对应结果到提交包，用于展示工具价值与局限。尚未量化检索准确率、模型成本和长期续研收益。

## 协作与交接

接口约定和持久化快照便于将前端、检索与审批分别测试；交接时需同时核对查询、来源编号和恢复状态。实际成员交接记录：

PENG You：负责嵌入与索引链路的接口收敛，新增提供方只需实现适配器，索引配置变化后要重灌并重启 API。验收材料在 `docs/verification/` 下，覆盖类型检查、测试、构建与真实嵌入服务调用，少数用例受本机环境限制；同时逐个 PR 走查各成员模块，审核 3 个功能 PR，提出修改建议后合并。接手时按查询、来源编号与恢复状态逐项核对，再确认降级事件与索引配置一致。

### TODO

## AI 辅助与复用声明

开发中使用 Codex 辅助基础代码的编写和测试，整体技术方案由团队设计，最终效果由团队复核。项目复用 React、Vite、Hono、LangGraph、OpenAI SDK、MCP SDK、PostgreSQL、pgvector、PGlite 等组件及外部模型／搜索服务。项目实现的应用层包括检索路由、证据与引用管理、审批恢复、续研命令和 Web／CLI 交互；未自行训练基础模型。
