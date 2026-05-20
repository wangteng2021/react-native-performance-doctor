# AI 一人公司软件团队流水线

这是一个面向个人开发者的 local-first AI 一人公司 OS，用“软件团队角色交接”的方式，把一个想法推进到 需求、设计、开发、测试、Owner 验收、发布和反馈迭代。

当前目录包含一个本地优先的静态可视化操作台，以及一个可选的同源 Node API 用于 SQLite 角色聊天持久化：

```text
index.html
styles.css
app.js
server.js
package.json
```

直接用浏览器打开 `index.html`，仍可以使用控制台、角色流水线、当前交接、QA/验收、发布/反馈几个 hash 视图；如果没有启动后端，角色聊天区域会显示离线不可用提示，不会把新聊天写入本地。

创建项目后会自动进入 `#handoff` 的「和产品 AI 聊想法」区域。先把原始想法写成一大段自然语言，再点击「发送给产品 AI 继续聊」；系统会把项目推进到产品 AI 阶段。后端在线且已填写 API Key 时，这段想法会写入 Product AI 的 SQLite 聊天记录并请求 AI 回复。

每个角色步骤都可以持续聊天：创始人想法、产品 AI、需求确认、设计 AI、设计评审、开发 AI、测试 AI、最终验收、发布、反馈迭代各自有独立聊天记录。默认由浏览器直连 OhMyGPT 特价 OpenAI-compatible Responses API：`https://apic1.ohmycdn.com/api/v1/ai/openai/codex-omg/v1/responses`，模型名 `gpt-5.5`，temperature 默认为 `1`，并以流式打字机效果显示回复。AI 完整回复生成后再写入同源 SQLite 后端。在「当前交接」里的 AI 接入区域填入 OhMyGPT API Key 后即可请求；Key 只保存在当前页面运行内存，不写入 `localStorage`、SQLite、文件或 PM2 环境。

如果没有启动后端或后端健康检查失败，静态界面仍可渲染，角色聊天会提示离线不可用；可以使用“复制当前角色提示词”到外部客户端继续对话。

导航使用本地单页路由：`#console`、`#pipeline`、`#handoff`、`#qa`、`#launch`。刷新或复制这些链接会打开对应视图，项目元数据仍保存在同一个浏览器 `localStorage` 中；AI Key 和角色聊天不会序列化进 `oneCompanyOS.v2`。

项目元数据会保存到浏览器 `localStorage`：

```text
oneCompanyOS.v2
```

当前项目元数据会归一化为 `schemaVersion: 4`。旧项目不会被擦除；旧阶段会映射到新的角色交接流程。保存前会清理 `state.ai.apiKey` 和每个项目的 `roleChats`。

## 本地后端与 SQLite 聊天

安装 Node.js 18+ 后，在当前目录安装依赖并启动同源 API 和静态文件服务：

```bash
npm install
npm start
```

后端会创建 `.data/chat.sqlite`，并暴露：

```text
GET  /api/health
GET  /api/chats?projectId=<id>&stage=<stage>
POST /api/chats
POST /api/chat/completions
```

SQLite 由 `better-sqlite3` 提供，因此部署环境需要能安装该 native package。可用 `PORT=3000 npm start` 后让 Nginx 将同源 `/api` 转发到该进程；不要把 API Key 写入 PM2/env，前端会在每次聊天请求中通过 `Authorization` 临时传递。

## 角色交接流水线

```text
Founder Idea 创始人想法
Product AI 产品 AI
需求确认 需求确认
Design AI 设计 AI
Design Review 设计评审
Development AI 开发 AI
QA AI 测试 AI
Owner Acceptance 最终验收
Launch 发布
Feedback / Iteration 反馈迭代
```

成熟框架不再作为顶层看板，而是内置在角色里：产品 AI 使用 JTBD、Continuous Discovery、Lean Startup；设计 AI 使用 Double Diamond、信息架构和用户流；开发 AI 使用 Shape Up、SDLC、CI/CD；测试 AI 使用黑盒测试和 QA Release Gates；反馈迭代使用 AARRR、DORA 和 Decision Logs。

## 旧阶段迁移

```text
Idea -> Product AI
Strategy / Discovery / Validation -> Product AI
MVP / Shaping -> 需求确认
Build / Delivery -> Development AI
QA / QA Gate -> QA AI
Launch -> Launch
Marketing / Growth / Metrics / Learning / Iteration -> Feedback / Iteration
```

内部仍保留 `project.stage` 字段和 `oneCompanyOS.v2` 存储 key，以兼容已有本地项目。

## 目录结构

```text
00-inbox/        临时收集想法、链接、用户反馈、灵感
01-ideas/        旧 Idea Brief，可作为创始人想法和产品 AI 输入
02-validation/   旧验证计划，可作为产品 AI 访谈和需求验证 SOP
03-mvp/          旧 MVP 规格，可作为 需求确认和验收标准 SOP
04-build/        旧 Build 计划，可作为开发 AI 执行任务 SOP
05-qa/           QA Gate 测试计划、验收用例、上线前检查
06-launch/       Launch 清单、定价、部署、回滚方案
07-marketing/    旧 Marketing 计划，可作为反馈迭代实验库
08-analytics/    反馈指标复盘、转化率、留存、AI 成本
09-iteration/    迭代决策日志、继续/砍掉/转向记录
99-archive/      归档的想法、废弃项目、已完成实验
templates/       仍然有效的 legacy SOP 模板，已在 UI 中映射到新模块
```

## 每天怎么用

1. 你先在界面创建项目，应用会直接进入“当前交接”，在大文本框里写原始想法并发送给产品 AI。
2. Product AI 会在同一个角色聊天记录里持续追问需求，逐步产出 需求草案、用户故事、范围和验收标准；也可以把 `00-inbox/capture.md` 的内容粘进原始想法框。
3. 需求确认 通过后，Design AI 基于需求 产出页面结构、用户流和设计规范。
4. 设计评审通过后，Development AI 根据需求 + 设计拆任务并实现。
5. QA AI 根据需求、设计和实现结果生成测试用例、bug 和 QA Gate。
6. Owner Acceptance 由你最终验收，通过后才进入 Launch。
7. 发布后进入 Feedback / Iteration，用用户反馈、AARRR、DORA 和决策日志决定下一轮。

## OpenCode 使用方式

在当前目录启动：

```bash
opencode
```

推荐提问格式：

```text
我有一个产品想法：xxx。
请先以 Product AI 的角色追问我需求，然后生成 需求草案、用户故事、范围、非目标和验收标准。
暂时不要进入设计和开发。
```

开发阶段推荐格式：

```text
根据需求 和设计方案进入 Development AI 阶段。
要求：先读需求、设计交付物和验收标准，再拆任务，实现后交给 QA AI 生成测试报告。
```

## 决策原则

- 先发现和验证需求，再进入完整交付。
- 先做能收费、能证明需求或能降低最大风险的 需求范围。
- QA Gate 是发布门禁，不能用“只是小改动”绕过。
- 反馈迭代实验必须绑定可观察指标，不只记录渠道动作。
- 每个项目都要记录：假设、验证信号、设计/开发风险、QA 状态、收入/成本、下一步迭代决策。
- AI 负责提速，但最终产品方向和商业判断由人决定。

## 安全规则

- 不在 Markdown、模板或源码里写入密钥、token、支付凭证或用户隐私。
- OhMyGPT API Key 只在你主动填写后保存在当前页面运行内存，刷新或关闭页面即丢失；后端只在本次请求中读取 `Authorization`，不会持久化或打印 Key。
- 涉及生产环境、数据库、支付、远程推送、删除数据时，必须先确认。
- 任何上线前都要有最小回滚方案。
