const STORAGE_KEY = "oneCompanyOS.v2";
const SCHEMA_VERSION = 4;

const STAGES = [
  "FounderIdea",
  "ProductAI",
  "PRDGate",
  "DesignAI",
  "DesignReview",
  "DevelopmentAI",
  "QAAI",
  "OwnerAcceptance",
  "Launch",
  "FeedbackIteration"
];

const STAGE_LABELS = {
  FounderIdea: "创始人想法",
  ProductAI: "产品 AI",
  PRDGate: "需求确认",
  DesignAI: "设计 AI",
  DesignReview: "设计评审",
  DevelopmentAI: "开发 AI",
  QAAI: "测试 AI",
  OwnerAcceptance: "最终验收",
  Launch: "发布",
  FeedbackIteration: "反馈迭代"
};

const STAGE_MIGRATIONS = {
  Idea: "ProductAI",
  Strategy: "ProductAI",
  Discovery: "ProductAI",
  Validation: "ProductAI",
  MVP: "PRDGate",
  Shaping: "PRDGate",
  Build: "DevelopmentAI",
  Delivery: "DevelopmentAI",
  QA: "QAAI",
  QAGate: "QAAI",
  Launch: "Launch",
  Marketing: "FeedbackIteration",
  Growth: "FeedbackIteration",
  Metrics: "FeedbackIteration",
  Analytics: "FeedbackIteration",
  Learning: "FeedbackIteration",
  Iteration: "FeedbackIteration"
};

const MODULE_DESCRIPTIONS = {
  FounderIdea: "你提出要做什么、为什么做、最初约束和想解决的问题。",
  ProductAI: "产品 AI 用 JTBD、Continuous Discovery、Lean Startup 追问需求并形成需求草案。",
  PRDGate: "确认用户故事、范围、非目标和验收标准，避免边做边漂移。",
  DesignAI: "设计 AI 根据需求草案产出信息架构、用户流、页面结构和设计规范。",
  DesignReview: "对设计稿/交互方案做评审，确认是否满足需求和验收标准。",
  DevelopmentAI: "开发 AI 根据需求 + 设计交付实现，内部使用 Shape Up、SDLC、CI/CD 思路。",
  QAAI: "测试 AI 根据需求、设计和实现生成黑盒用例、bug 报告和发布检查。",
  OwnerAcceptance: "你作为 Owner 做最终验收：通过、打回、补需求或决定发布。",
  Launch: "发布清单、回滚方案、首批用户和上线后观察。",
  FeedbackIteration: "收集反馈、AARRR/DORA 指标和 Decision Logs，决定继续、转向、砍掉或加倍投入。"
};

const FRAMEWORK_MODEL = "产品 AI 内部使用 JTBD / Continuous Discovery / Lean Startup；设计 AI 内部使用 Double Diamond / 信息架构 / 用户流；开发 AI 内部使用 Shape Up / SDLC / CI-CD；测试 AI 内部使用黑盒测试 / QA Release Gates；反馈迭代内部使用 AARRR / DORA / Decision Logs。";

const DEFAULT_RELEASE_GATES = [
  "P0 用户路径通过",
  "没有打开的阻断级/P0 bug",
  "边界和错误场景已复核",
  "回滚计划可执行"
];

const STATUS_LABELS = {
  pass: "通过",
  fail: "失败",
  pending: "待处理",
  open: "打开",
  resolved: "已解决",
  done: "完成",
  blocked: "阻塞",
  ready: "就绪",
  required: "必需"
};

const DECISION_LABELS = {
  continue: "继续",
  pivot: "转向",
  kill: "砍掉",
  "double down": "加倍投入"
};

const SEVERITY_LABELS = {
  Blocker: "阻断",
  P0: "P0",
  P1: "P1",
  P2: "P2"
};

const SOP_LINKS = [
  { title: "创始人想法简报", path: "templates/01-idea-brief.md" },
  { title: "产品 AI 访谈与验证", path: "templates/02-validation-plan.md" },
  { title: "需求确认 / 验收标准", path: "templates/03-mvp-spec.md" },
  { title: "开发交付计划", path: "templates/04-build-plan.md" },
  { title: "测试 AI 用例计划", path: "templates/05-test-plan.md" },
  { title: "发布与回滚清单", path: "templates/06-launch-checklist.md" },
  { title: "反馈增长实验", path: "templates/07-marketing-plan.md" },
  { title: "指标复盘", path: "templates/08-metrics-review.md" },
  { title: "迭代决策日志", path: "templates/09-iteration-log.md" }
];

const METHOD_OPTIONS = ["场景法", "等价类划分", "边界值分析", "因果图", "状态迁移", "错误推测"];
const PRIORITY_OPTIONS = ["P0", "P1", "P2"];
const SEVERITY_OPTIONS = ["Blocker", "P0", "P1", "P2"];
const DECISIONS = ["continue", "pivot", "kill", "double down"];

const AI_DEFAULTS = {
  baseUrl: "https://apic1.ohmycdn.com/api/v1/ai/openai/codex-omg/v1",
  model: "gpt-5.5",
  temperature: 1
};

const LEGACY_AI_BASE_URLS = new Set([
  "https://api.ohmygpt.com/v1",
  "https://api.ohmygpt.com/v1/chat/completions"
]);

const API_BASE = "/api";
const MODEL_TIMEOUT_MS = 300000;
const FIRST_TOKEN_TIMEOUT_MS = 20000;
const runtimeAi = { apiKey: "" };
const chatCache = new Map();
const chatLoads = new Map();
let apiStatus = { checked: false, available: false, message: "正在检测后端 /api 聊天服务。" };

const ROLE_CHAT_INSTRUCTIONS = {
  FounderIdea: "你帮助创始人把模糊想法讲清楚，只追问动机、用户、场景、约束和成功信号，不提前做方案。",
  ProductAI: "你是产品 AI。持续追问 JTBD、替代方案、付费动机、范围和验收标准，把对话沉淀为需求草案。",
  PRDGate: "你是需求确认助手。检查用户故事、范围、非目标、验收标准和风险是否足够清楚，不清楚就继续追问。",
  DesignAI: "你是设计 AI。基于已确认需求反复讨论信息架构、用户流、页面结构、状态和交互细节。",
  DesignReview: "你是设计评审。检查设计是否覆盖需求、边界状态、可访问性和开发交付清晰度。",
  DevelopmentAI: "你是开发 AI。根据需求和设计持续拆任务、澄清实现方案、识别依赖和交付风险。",
  QAAI: "你是测试 AI。用黑盒方法持续生成用例、bug、边界条件、状态迁移和发布阻断判断。",
  OwnerAcceptance: "你是 Owner 验收助手。帮助创始人判断是否通过、打回、补需求或延后发布。",
  Launch: "你是发布负责人。持续检查发布清单、回滚方案、首批用户、监控和上线后风险。",
  FeedbackIteration: "你是反馈迭代 AI。基于反馈、AARRR、DORA、收入和成本持续建议继续、转向、砍掉或加倍投入。"
};

const VIEW_ROUTES = ["console", "pipeline", "handoff", "qa", "launch"];
const LEGACY_ROUTES = {
  dashboard: "console",
  "dashboard-panel": "pipeline",
  workspace: "handoff"
};
const DEFAULT_VIEW = "console";

const seedData = {
  schemaVersion: SCHEMA_VERSION,
  ai: { ...AI_DEFAULTS },
  activeProjectId: "meetfriends",
  projects: [
    {
      id: "meetfriends",
      name: "meetfriends",
      stage: "FounderIdea",
      rawIdea: "",
      targetUser: "先写清你想服务的用户，以及他们会在什么场景下使用。",
      pain: "等待填写原始想法。",
      promise: "等待产品 AI 从原始想法中收敛可验证承诺。",
      pricing: "待确认",
      mvpGoal: "先写原始想法，再交给产品 AI 追问。",
      nextAction: "在当前交接里写一段原始想法，发送给产品 AI。",
      tasks: [],
      qa: {
        tests: [],
        bugs: [],
        automatedChecks: [],
        releaseGates: DEFAULT_RELEASE_GATES.map((title, index) => ({ id: `gate-seed-${index + 1}`, title, done: false }))
      },
      launch: {
        checklist: [],
        rollbackPlan: ""
      },
      marketing: {
        channels: [],
        hooks: [],
        experiments: []
      },
      metrics: {
        funnel: [],
        revenue: 0,
        cost: 0,
        decision: "continue"
      }
    }
  ]
};

const REMOVED_DEMO_PROJECT_IDS = new Set(["landing-auditor", "qa-gate-keeper", "starter-project"]);

let state = loadState();
persistStateSilently();

const byId = (id) => document.getElementById(id);

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function h(value) {
  return escapeHTML(value);
}

function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function stageLabel(stage) {
  return STAGE_LABELS[stage] || stage;
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function decisionLabel(decision) {
  return DECISION_LABELS[decision] || decision;
}

function severityLabel(severity) {
  return SEVERITY_LABELS[severity] || severity;
}

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return clone(seedData);
    const parsed = JSON.parse(stored);
    if (!parsed || !Array.isArray(parsed.projects) || !parsed.projects.length) return clone(seedData);
    return normalizeState(parsed);
  } catch (error) {
    console.warn("加载本地一人公司 OS 状态失败。", error);
    return clone(seedData);
  }
}

function normalizeStage(stage) {
  if (STAGES.includes(stage)) return stage;
  return STAGE_MIGRATIONS[stage] || "FounderIdea";
}

function normalizeState(savedState) {
  const localizedState = localizeLegacyDemoState(savedState);
  const retainedProjects = localizedState.projects.filter((project) => !REMOVED_DEMO_PROJECT_IDS.has(project.id));
  const sourceProjects = retainedProjects.length ? retainedProjects : seedData.projects;
  const normalizedState = {
    ...localizedState,
    schemaVersion: SCHEMA_VERSION,
    ai: normalizeAiConfig(localizedState.ai),
    activeProjectId: retainedProjects.length ? localizedState.activeProjectId : seedData.activeProjectId,
    projects: sourceProjects.map((project) => normalizeProject(project))
  };
  if (!normalizedState.projects.some((project) => project.id === normalizedState.activeProjectId)) {
    normalizedState.activeProjectId = normalizedState.projects[0].id;
  }
  return normalizedState;
}

function normalizeAiConfig(config = {}) {
  const incoming = config || {};
  const baseUrl = String(incoming.baseUrl || AI_DEFAULTS.baseUrl).trim() || AI_DEFAULTS.baseUrl;
  return {
    baseUrl: LEGACY_AI_BASE_URLS.has(baseUrl.replace(/\/+$/, "")) ? AI_DEFAULTS.baseUrl : baseUrl,
    model: String(incoming.model || AI_DEFAULTS.model).trim() || AI_DEFAULTS.model,
    temperature: clampNumber(incoming.temperature ?? AI_DEFAULTS.temperature, 0, 2)
  };
}

function localizeLegacyDemoState(savedState) {
  const localizedState = clone(savedState);
  const chineseDemoById = Object.fromEntries(seedData.projects.map((project) => [project.id, project]));
  localizedState.projects = localizedState.projects.map((project) => {
    const chineseDemo = chineseDemoById[project.id];
    if (!chineseDemo) return project;

    const legacyText = [project.name, project.targetUser, project.pain, project.promise, project.mvpGoal, project.nextAction]
      .filter(Boolean)
      .join(" ");
    const isOldEnglishDemo = /Micro-SaaS|Landing Auditor|QA Gate Keeper|Solo founders|Solo developers|Founder completes|Launch readiness/.test(legacyText);

    return isOldEnglishDemo ? clone(chineseDemo) : project;
  });
  return localizedState;
}

function normalizeProject(project) {
  const fallback = clone(seedData.projects[0]);
  const incoming = clone(project);
  const normalized = { ...fallback, ...incoming };

  normalized.stage = normalizeStage(incoming.stage);
  normalized.tasks = Array.isArray(incoming.tasks) ? incoming.tasks : [];
  normalized.qa = { ...fallback.qa, ...(incoming.qa || {}) };
  normalized.qa.tests = Array.isArray(normalized.qa.tests) ? normalized.qa.tests : [];
  normalized.qa.bugs = Array.isArray(normalized.qa.bugs) ? normalized.qa.bugs : [];
  normalized.qa.automatedChecks = Array.isArray(normalized.qa.automatedChecks) ? normalized.qa.automatedChecks : [];
  normalized.qa.releaseGates = Array.isArray(normalized.qa.releaseGates) ? normalized.qa.releaseGates : DEFAULT_RELEASE_GATES.map((title) => ({ id: uid("gate"), title, done: false }));
  normalized.launch = { ...fallback.launch, ...(incoming.launch || {}) };
  normalized.launch.checklist = Array.isArray(normalized.launch.checklist) ? normalized.launch.checklist : [];
  normalized.marketing = { ...fallback.marketing, ...(incoming.marketing || incoming.growth || {}) };
  normalized.marketing.channels = Array.isArray(normalized.marketing.channels) ? normalized.marketing.channels : [];
  normalized.marketing.hooks = Array.isArray(normalized.marketing.hooks) ? normalized.marketing.hooks : [];
  normalized.marketing.experiments = Array.isArray(normalized.marketing.experiments) ? normalized.marketing.experiments : [];
  normalized.metrics = { ...fallback.metrics, ...(incoming.metrics || {}) };
  normalized.metrics.funnel = Array.isArray(normalized.metrics.funnel) ? normalized.metrics.funnel : [];
  normalized.metrics.decision = DECISIONS.includes(normalized.metrics.decision) ? normalized.metrics.decision : "continue";
  normalized.rawIdea = normalizeRawIdea(incoming);
  delete normalized.roleChats;
  normalized.chatStage = STAGES.includes(incoming.chatStage) ? incoming.chatStage : normalized.stage;

  return normalized;
}

function normalizeRoleChats(chats = {}) {
  const normalized = {};
  STAGES.forEach((stage) => {
    const messages = Array.isArray(chats[stage]) ? chats[stage] : [];
    normalized[stage] = messages
      .filter((message) => message && ["user", "assistant"].includes(message.role) && String(message.content || "").trim())
      .map((message) => ({
        id: String(message.id || uid("msg")),
        role: message.role,
        content: String(message.content || ""),
        createdAt: String(message.createdAt || new Date().toISOString())
      }));
  });
  return normalized;
}

function roleMessages(project, stage = project.stage) {
  const key = chatKey(project.id, stage);
  if (!chatCache.has(key)) chatCache.set(key, []);
  return chatCache.get(key);
}

function chatKey(projectId, stage) {
  return `${projectId}::${stage}`;
}

function currentChatStage(project) {
  if (!STAGES.includes(project.chatStage)) project.chatStage = project.stage;
  return project.chatStage;
}

async function checkApiStatus() {
  try {
    const response = await fetch(`${API_BASE}/health`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    apiStatus = { checked: true, available: true, message: "后端 /api 已连接，角色聊天会写入 SQLite。" };
  } catch (error) {
    apiStatus = { checked: true, available: false, message: "未连接后端 /api：角色聊天不会写入本地存储。请启动 Node 后端后再发送。" };
  }
  render();
}

function ensureRoleMessagesLoaded(project, stage) {
  const key = chatKey(project.id, stage);
  if (chatLoads.has(key)) return;
  chatLoads.set(key, true);
  fetch(`${API_BASE}/chats?projectId=${encodeURIComponent(project.id)}&stage=${encodeURIComponent(stage)}`, { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((payload) => {
      chatCache.set(key, normalizeRoleChats({ [stage]: payload.messages || [] })[stage]);
      apiStatus = { checked: true, available: true, message: "后端 /api 已连接，角色聊天会写入 SQLite。" };
      render();
      scrollActiveChatToBottom();
    })
    .catch(() => {
      apiStatus = { checked: true, available: false, message: "未连接后端 /api：角色聊天不会写入本地存储。请启动 Node 后端后再发送。" };
      render();
    });
}

function promptModeForStage(stage) {
  if (["FounderIdea", "ProductAI", "PRDGate"].includes(stage)) return "product";
  if (["DesignAI", "DesignReview"].includes(stage)) return "design";
  if (stage === "DevelopmentAI") return "build";
  if (stage === "QAAI") return "qa";
  if (["OwnerAcceptance", "Launch"].includes(stage)) return "launch";
  return "metrics";
}

function normalizeRawIdea(project) {
  const explicitIdea = String(project.rawIdea ?? project.idea ?? "").trim();
  if (explicitIdea) return explicitIdea;
  return [project.pain, project.promise].filter(Boolean).join("\n").trim();
}

function applyRawIdeaToProject(project, rawIdea) {
  const idea = rawIdea.trim();
  project.rawIdea = idea;
  project.stage = "ProductAI";
  project.chatStage = "ProductAI";
  project.targetUser = "待产品 AI 从原始想法中追问确认：谁最痛、使用场景、JTBD 和现有替代方案。";
  project.pain = `原始想法：${idea}`;
  project.promise = "等待产品 AI 把原始想法收敛成可验证承诺、用户故事、范围、非目标和验收标准。";
  project.mvpGoal = "先不要进入设计/开发；下一步只做产品 AI 追问、需求验证和需求草案。";
  if (!String(project.pricing || "").trim()) {
    project.pricing = "待产品 AI 追问付费动机、预算和定价假设。";
  }
  project.nextAction = "和产品 AI 聊想法：复制产品 AI 追问提示词，回答追问后再进入需求确认。";
}

function persistStateSilently() {
  try {
    state.schemaVersion = SCHEMA_VERSION;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storageSafeState(state)));
  } catch (error) {
    console.warn("保存本地一人公司 OS 状态失败。", error);
  }
}

function saveState(message = "已保存到本地") {
  persistStateSilently();
  toast(message);
}

function storageSafeState(source) {
  const safeState = clone(source);
  safeState.schemaVersion = SCHEMA_VERSION;
  safeState.ai = normalizeAiConfig(safeState.ai);
  safeState.projects = safeState.projects.map((project) => {
    const safeProject = { ...project };
    delete safeProject.roleChats;
    return safeProject;
  });
  return safeState;
}

function activeProject() {
  return state.projects.find((project) => project.id === state.activeProjectId) || state.projects[0];
}

function ensureActiveProject() {
  const project = activeProject();
  state.activeProjectId = project.id;
  return project;
}

function toast(message) {
  const region = byId("toastRegion");
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  region.appendChild(item);
  window.setTimeout(() => item.remove(), 2600);
}

function optionList(options, selected, labels = {}) {
  return options.map((option) => `<option value="${h(option)}"${option === selected ? " selected" : ""}>${h(labels[option] || option)}</option>`).join("");
}

function statusClass(status) {
  if (status === "pass" || status === "done" || status === true) return "status-pass";
  if (status === "fail" || status === "blocked" || status === false) return "status-fail";
  return "status-warn";
}

function ensureReleaseGates(project) {
  if (!project.qa) project.qa = {};
  if (!Array.isArray(project.qa.releaseGates)) {
    project.qa.releaseGates = DEFAULT_RELEASE_GATES.map((title) => ({ id: uid("gate"), title, done: false }));
  }
  return project.qa.releaseGates;
}

function getQaStats(project) {
  const tests = project.qa.tests || [];
  const bugs = project.qa.bugs || [];
  const checks = project.qa.automatedChecks || [];
  const gates = ensureReleaseGates(project);
  const passedTests = tests.filter((test) => test.status === "pass").length;
  const failedP0Tests = tests.filter((test) => test.priority === "P0" && test.status !== "pass").length;
  const openBlockers = bugs.filter((bug) => bug.open && ["Blocker", "P0"].includes(bug.severity)).length;
  const openBugs = bugs.filter((bug) => bug.open).length;
  const failedChecks = checks.filter((check) => check.status === "fail").length;
  const pendingChecks = checks.filter((check) => check.status === "pending").length;
  const passedGates = gates.filter((gate) => gate.done).length;
  const testScore = tests.length ? Math.round((passedTests / tests.length) * 55) : 0;
  const checkScore = checks.length ? Math.round((checks.filter((check) => check.status === "pass").length / checks.length) * 15) : 0;
  const gateScore = gates.length ? Math.round((passedGates / gates.length) * 20) : 0;
  const bugPenalty = Math.min(25, openBlockers * 12 + Math.max(0, openBugs - openBlockers) * 4 + failedP0Tests * 10 + failedChecks * 10);
  const score = clampNumber(testScore + checkScore + gateScore + 10 - bugPenalty, 0, 100);
  const blockers = openBlockers + failedP0Tests + failedChecks;
  return { tests: tests.length, passedTests, openBugs, openBlockers, failedP0Tests, failedChecks, pendingChecks, gates: gates.length, passedGates, score, blockers };
}

function getLaunchStats(project) {
  const qa = getQaStats(project);
  const checklist = project.launch.checklist || [];
  const done = checklist.filter((item) => item.done).length;
  const checklistScore = checklist.length ? Math.round((done / checklist.length) * 100) : 0;
  const readiness = Math.round(checklistScore * 0.55 + qa.score * 0.45);
  const ready = readiness >= 85 && qa.blockers === 0 && checklist.every((item) => item.done);
  return { done, total: checklist.length, checklistScore, readiness, ready };
}

function stageIndex(stage) {
  return Math.max(0, STAGES.indexOf(stage));
}

function getViewFromHash() {
  const hash = window.location.hash.replace(/^#/, "").trim();
  const view = LEGACY_ROUTES[hash] || hash;
  return VIEW_ROUTES.includes(view) ? view : DEFAULT_VIEW;
}

function setActiveView(view = getViewFromHash()) {
  const currentHash = window.location.hash.replace(/^#/, "").trim();
  if (currentHash !== view) {
    window.history.replaceState(null, "", `#${view}`);
  }

  document.querySelectorAll("[data-view]").forEach((panel) => {
    const isActive = panel.dataset.view === view;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });

  document.querySelectorAll("[data-route]").forEach((link) => {
    const isActive = link.dataset.route === view;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function render() {
  const project = ensureActiveProject();
  renderProjectSelector(project);
  renderDashboard(project);
  renderPipeline();
  renderSopLinks();
  renderIdeaBoard(project);
  renderWorkspace(project);
  renderQa(project);
  renderLaunch(project);
  renderMarketing(project);
  renderMetrics(project);
  setActiveView();
}

function renderProjectSelector(project) {
  byId("projectSelector").innerHTML = state.projects
    .map((item) => `<option value="${h(item.id)}"${item.id === project.id ? " selected" : ""}>${h(item.name)} · ${h(stageLabel(item.stage))}</option>`)
    .join("");
  byId("activeProjectName").textContent = project.name;
}

function renderDashboard(project) {
  const qa = getQaStats(project);
  const launch = getLaunchStats(project);
  const net = Number(project.metrics.revenue || 0) - Number(project.metrics.cost || 0);
  const nextStage = STAGES[stageIndex(project.stage) + 1];
  const stateLabel = launch.ready ? statusLabel("ready") : statusLabel("blocked");
  byId("dashboardSummary").innerHTML = `
    <div class="summary-row">
      <span>当前角色</span>
      <strong>${h(stageLabel(project.stage))}</strong>
    </div>
    <div class="summary-row">
      <span>下一动作</span>
      <strong>${h(project.nextAction)}</strong>
    </div>
    <div class="summary-row">
      <span>QA / 发布</span>
      <strong>QA ${qa.score} · ${qa.blockers} 个阻断 · <span class="status-pill ${launch.ready ? "status-pass" : "status-blocked"}">${stateLabel}</span></strong>
    </div>
  `;

  byId("insightGrid").innerHTML = `
    <article class="insight-card is-accent">
      <span class="eyebrow">第一步</span>
      <strong>和产品 AI 聊想法</strong>
      <p class="card-copy">${project.rawIdea ? h(project.rawIdea) : "把脑中的模糊想法先写成一段话，产品 AI 会帮你追问用户、场景、痛点和验证方式。"}</p>
      <a class="button primary" href="#handoff">打开原始想法输入</a>
    </article>
    <article class="insight-card">
      <span class="eyebrow">Current Role</span>
      <strong>${h(stageLabel(project.stage))}</strong>
      <p class="card-copy">下一站：${nextStage ? h(stageLabel(nextStage)) : "反馈复盘"}</p>
    </article>
    <article class="insight-card">
      <span class="eyebrow">QA Gate</span>
      <strong>${qa.score}</strong>
      <p class="card-copy">${qa.passedTests}/${qa.tests} 测试通过，${qa.openBugs} 个打开 bug。</p>
    </article>
    <article class="insight-card">
      <span class="eyebrow">Launch</span>
      <strong>${launch.readiness}%</strong>
      <p class="card-copy">${launch.done}/${launch.total} 清单完成；净额 $${h(net)}。</p>
    </article>
  `;
}

function renderPipeline() {
  byId("pipelineBoard").innerHTML = STAGES.map((stage, index) => {
    const projects = state.projects.filter((project) => project.stage === stage);
    const activeProject = projects.find((project) => project.id === state.activeProjectId);
    const isActive = Boolean(activeProject);
    return `
      <article class="pipeline-column ${isActive ? "is-active" : ""}" title="${h(MODULE_DESCRIPTIONS[stage])}">
        <div class="pipeline-head">
          <div>
            <span class="eyebrow">${String(index + 1).padStart(2, "0")}</span>
            <h3>${h(stageLabel(stage))}</h3>
          </div>
          <span class="stage-index">${projects.length}</span>
        </div>
        ${isActive ? renderPipelineCard(activeProject) : `<p class="muted">${projects.length ? `${projects.length} 个项目在此角色` : "等待交接"}</p>`}
      </article>
    `;
  }).join("");
}

function renderPipelineCard(project) {
  const qa = getQaStats(project);
  const currentIndex = stageIndex(project.stage);
  const prevStage = STAGES[currentIndex - 1];
  const nextStage = STAGES[currentIndex + 1];
  return `
    <div class="pipeline-card">
      <div>
        <span class="stage-mini">当前项目</span>
        <h3>${h(project.name)}</h3>
        <p class="muted">${h(project.nextAction)}</p>
      </div>
      <div class="chip-row">
        <span class="tag ${qa.blockers ? "risk" : "hot"}">QA ${qa.score}</span>
        <span class="tag ${qa.blockers ? "risk" : "watch"}">${qa.blockers} 个阻断</span>
      </div>
      <div class="tiny-actions">
        <button class="button ghost" type="button" data-action="select-project" data-id="${h(project.id)}">聚焦</button>
        ${prevStage ? `<button class="button ghost" type="button" data-action="move-stage" data-id="${h(project.id)}" data-stage="${h(prevStage)}">← ${h(stageLabel(prevStage))}</button>` : ""}
        ${nextStage ? `<button class="button ghost" type="button" data-action="move-stage" data-id="${h(project.id)}" data-stage="${h(nextStage)}">${h(stageLabel(nextStage))} →</button>` : ""}
      </div>
    </div>
  `;
}

function renderSopLinks() {
  byId("sopLinks").innerHTML = SOP_LINKS.map((link) => `<a href="${h(link.path)}">${h(link.title)}</a>`).join("");
}

function renderIdeaBoard(project) {
  byId("ideaBoard").innerHTML = `
    <article class="card">
      <span class="eyebrow">原始想法</span>
      <p>${project.rawIdea ? h(project.rawIdea) : "还没写原始想法。先到下方和产品 AI 聊想法。"}</p>
    </article>
    <article class="card">
      <span class="eyebrow">问题</span>
      <p>${h(project.pain)}</p>
    </article>
    <article class="card">
      <span class="eyebrow">需求承诺</span>
      <p>${h(project.promise)}</p>
    </article>
    <article class="card">
      <span class="eyebrow">商业假设</span>
      <p>${h(project.pricing)}</p>
    </article>
  `;
}

function renderWorkspace(project) {
  byId("workspaceGrid").innerHTML = `
    <article class="workspace-card is-full product-intake">
      <span class="eyebrow">和产品 AI 聊想法</span>
      <h3>第一步：先写一大段原始想法</h3>
      <p class="muted">不用拆成目标用户、痛点、承诺。像发消息一样把你想做什么、为什么想做、脑中例子和不确定点写下来；发送后会进入产品 AI 阶段，并把这段话放进产品 AI 的持续聊天记录。</p>
      <form class="stack-form" data-form="raw-idea">
        <textarea class="textarea raw-idea-textarea" name="rawIdea" aria-label="原始产品想法" placeholder="比如：我想做一个 Figma 插件，能尽量还原设计稿到代码。现在的问题是设计师和独立开发者反复改样式太慢，我不确定先服务谁、该收多少钱、MVP 要做到什么程度……">${h(project.rawIdea)}</textarea>
        <div class="intake-actions">
          <button class="button primary" type="submit">发送给产品 AI 继续聊</button>
          <button class="button secondary" type="button" data-action="copy-prompt" data-prompt="product">复制产品 AI 提示词</button>
          <span class="muted">已配置 Key 且后端在线时会请求 GPT-5.5；否则可复制提示词到外部客户端。</span>
        </div>
      </form>
      <div class="prompt-box" id="productPromptPreview">${h(buildPrompt(project, "product"))}</div>
    </article>
    ${renderAiSettings()}
    ${renderRoleChat(project)}
    <article class="workspace-card is-wide">
      <span class="eyebrow">项目简报</span>
      <h3>${h(project.name)}</h3>
      <div class="detail-grid">
        ${projectField("原始想法", project.rawIdea || "还没写原始想法")}
        ${projectField("目标用户", project.targetUser)}
        ${projectField("痛点", project.pain)}
        ${projectField("可验证承诺", project.promise)}
        ${projectField("商业/定价假设", project.pricing)}
        ${projectField("需求 / 设计 / 开发目标", project.mvpGoal)}
        ${projectField("下一步", project.nextAction)}
      </div>
    </article>
    <article class="workspace-card">
      <span class="eyebrow">编辑当前上下文</span>
      <form class="stack-form" data-form="project-details">
        <input class="field" name="name" maxlength="80" value="${h(project.name)}" aria-label="项目名称">
        <select class="field select-field" name="stage" aria-label="当前角色">${optionList(STAGES, project.stage, STAGE_LABELS)}</select>
        <textarea class="textarea" name="targetUser" aria-label="目标用户">${h(project.targetUser)}</textarea>
        <textarea class="textarea" name="pain" aria-label="痛点">${h(project.pain)}</textarea>
        <textarea class="textarea" name="promise" aria-label="承诺">${h(project.promise)}</textarea>
        <input class="field" name="pricing" maxlength="120" value="${h(project.pricing)}" aria-label="商业和定价假设">
        <textarea class="textarea" name="mvpGoal" aria-label="需求、设计和开发目标">${h(project.mvpGoal)}</textarea>
        <textarea class="textarea" name="nextAction" aria-label="下一步动作">${h(project.nextAction)}</textarea>
        <button class="button primary" type="submit">保存项目上下文</button>
      </form>
    </article>
    <article class="workspace-card">
      <span class="eyebrow">辅助 SOP</span>
      <h3>安静参考</h3>
      <div class="sop-list">${SOP_LINKS.map((link) => `<a href="${h(link.path)}">${h(link.title)}</a>`).join("")}</div>
    </article>
    <article class="workspace-card is-wide">
      <span class="eyebrow">任务</span>
      <h3>本地执行队列</h3>
      <form class="inline-form" data-form="add-task">
        <input class="field" name="title" maxlength="140" placeholder="添加下一条具体任务">
        <button class="button secondary" type="submit">添加任务</button>
      </form>
      <div class="task-list">
        ${(project.tasks || []).map((task) => `
          <div class="task-row ${task.done ? "is-done" : ""}">
            <span><strong>${h(task.title)}</strong><br><span class="muted">${task.done ? "完成" : "打开"}</span></span>
            <button class="button ghost" type="button" data-action="toggle-task" data-id="${h(task.id)}">${task.done ? "重新打开" : "标记完成"}</button>
          </div>
        `).join("") || `<p class="muted">暂无任务。</p>`}
      </div>
    </article>
    <article class="workspace-card">
      <span class="eyebrow">本地 AI 动作</span>
      <h3>开发 AI 提示词</h3>
      <p class="muted">本地生成提示词，不调用 API；用于把需求、设计和任务交给开发 AI。</p>
      <button class="button secondary" type="button" data-action="copy-prompt" data-prompt="build">复制开发提示词</button>
      <div class="prompt-box" id="buildPromptPreview">${h(buildPrompt(project, "build"))}</div>
    </article>
  `;
}

function renderAiSettings() {
  const ai = normalizeAiConfig(state.ai);
  const configured = Boolean(runtimeAi.apiKey.trim());
  return `
    <article class="workspace-card is-full ai-settings-card">
      <span class="eyebrow">AI 接入</span>
      <h3>OhMyGPT · GPT-5.5</h3>
      <p class="muted">默认用当前浏览器直接请求 <code>${h(modelRequestUrl(ai))}</code> 和模型 <code>${h(ai.model)}</code>，拿到回复后写入 SQLite。API Key 只保存在当前页面运行内存，刷新后需要重新填写。</p>
      <form class="settings-grid" data-form="ai-settings">
        <label>Base URL<input class="field" name="baseUrl" value="${h(ai.baseUrl)}" autocomplete="off"></label>
        <label>模型<input class="field" name="model" value="${h(ai.model)}" autocomplete="off"></label>
        <label>API Key<input class="field" name="apiKey" type="password" placeholder="${configured ? "本页内存已有 Key；留空继续使用" : "粘贴 OhMyGPT API Key"}" autocomplete="off"></label>
        <label>温度<input class="field" name="temperature" type="number" min="0" max="2" step="0.1" value="${h(ai.temperature)}"></label>
        <div class="settings-actions">
          <button class="button primary" type="submit">保存非密设置</button>
          <button class="button ghost" type="button" data-action="clear-api-key">清除 Key</button>
          <span class="status-pill ${configured ? "status-pass" : "status-blocked"}">${configured ? "Key 在内存中，可直接聊天" : "未配置 Key，不能请求 AI"}</span>
        </div>
      </form>
    </article>
  `;
}

function renderRoleChat(project) {
  const stage = currentChatStage(project);
  ensureRoleMessagesLoaded(project, stage);
  const messages = roleMessages(project, stage);
  const configured = Boolean(runtimeAi.apiKey.trim());
  const canSend = apiStatus.available && configured;
  const notice = apiStatus.available
    ? "聊天后端已连接；消息按项目和角色保存在 SQLite。"
    : apiStatus.message;
  return `
    <article class="workspace-card is-full role-chat-card">
      <div class="split-heading">
        <div>
          <span class="eyebrow">角色对话工作台</span>
          <h3>和 ${h(stageLabel(stage))} 持续聊</h3>
          <p class="muted">每个步骤都有独立聊天记录。后端可用时，用户和 AI 消息按项目 + 角色写入 SQLite。</p>
        </div>
        <span class="status-pill ${apiStatus.available ? "status-pass" : "status-blocked"}">${apiStatus.available ? "SQLite 聊天已连接" : "聊天后端未连接"}</span>
      </div>
      <p class="api-notice ${apiStatus.available ? "is-ok" : "is-warning"}">${h(notice)}</p>
      <div class="role-tabs" aria-label="选择聊天角色">
        ${STAGES.map((item) => `<button class="button ghost ${item === stage ? "is-active" : ""}" type="button" data-action="select-chat-stage" data-stage="${h(item)}">${h(stageLabel(item))}</button>`).join("")}
      </div>
      <div class="chat-thread" data-chat-thread aria-label="${h(stageLabel(stage))} 聊天记录">
        ${messages.length ? messages.map(renderChatMessage).join("") : `<div class="chat-empty">${apiStatus.available ? `还没有和 ${h(stageLabel(stage))} 聊过。先发一句你的问题、补充或修改意见。` : "聊天后端不可用，当前角色聊天记录无法加载。"}</div>`}
      </div>
      <form class="chat-form" data-form="role-chat">
        <input type="hidden" name="stage" value="${h(stage)}">
        <textarea class="textarea" name="message" aria-label="发送给${h(stageLabel(stage))}" placeholder="继续和 ${h(stageLabel(stage))} 聊。比如：这个范围太大了，帮我缩到 3 天能做完的 MVP。" ${canSend ? "" : "disabled"}></textarea>
        <div class="intake-actions">
          <button class="button primary" type="submit" ${canSend ? "" : "disabled"}>发送给 ${h(stageLabel(stage))}</button>
          <button class="button secondary" type="button" data-action="copy-role-prompt" data-stage="${h(stage)}">复制当前角色提示词</button>
          <span class="muted">${canSend ? "会通过后端代理请求 OhMyGPT GPT-5.5。" : "离线或未填 Key 时不保存新聊天；可复制提示词到外部客户端。"}</span>
        </div>
      </form>
    </article>
  `;
}

function renderChatMessage(message) {
  const stateClass = message.status === "pending" ? " is-pending" : message.status === "streaming" ? " is-streaming" : message.status === "error" ? " is-error" : "";
  const speaker = message.role === "user" ? "你" : message.status === "pending" ? "AI 正在思考" : "AI";
  return `
    <div class="chat-message ${message.role === "user" ? "is-user" : "is-assistant"}${stateClass}">
      <span>${speaker} · ${h(formatTime(message.createdAt))}</span>
      <p>${h(message.content)}</p>
    </div>
  `;
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function scrollActiveChatToBottom() {
  window.requestAnimationFrame(() => {
    const thread = document.querySelector(".view.is-active [data-chat-thread]") || document.querySelector("[data-chat-thread]");
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  });
}

function projectField(label, value) {
  return `<div class="project-kv"><span>${h(label)}</span><strong>${h(value)}</strong></div>`;
}

function renderQa(project) {
  const qa = getQaStats(project);
  byId("qaCenter").innerHTML = `
    <article class="qa-card">
      <span class="eyebrow">推导 QA 分数</span>
      <div class="score-ring" style="--score-angle: ${qa.score * 3.6}deg"><span>${qa.score}</span></div>
      <p class="muted">${qa.passedTests}/${qa.tests} 个测试通过 · ${qa.passedGates}/${qa.gates} 个门禁通过 · ${qa.openBugs} 个打开 bug · ${qa.blockers} 个发布阻断项。</p>
    </article>
    <article class="qa-card">
      <span class="eyebrow">发布门禁</span>
      <h3>满足后才允许发布</h3>
      <div class="check-list">${ensureReleaseGates(project).map((gate) => `
        <div class="check-row ${gate.done ? "is-done" : ""}">
          <span><strong>${h(gate.title)}</strong><br><span class="muted">${gate.done ? "通过" : "必需"}</span></span>
          <button class="button ghost" type="button" data-action="toggle-gate" data-id="${h(gate.id)}">${gate.done ? "重新打开" : "通过门禁"}</button>
        </div>
      `).join("")}</div>
    </article>
    <article class="qa-card is-wide">
      <span class="eyebrow">添加测试用例</span>
      <form class="stack-form" data-form="add-test">
        <div class="form-row">
          <input class="field" name="module" maxlength="80" placeholder="模块" required>
          <select class="field select-field" name="priority">${optionList(PRIORITY_OPTIONS, "P1")}</select>
          <select class="field select-field" name="method">${optionList(METHOD_OPTIONS, "场景法")}</select>
        </div>
        <input class="field" name="title" maxlength="140" placeholder="测试标题" required>
        <input class="field" name="precondition" maxlength="180" placeholder="前置条件">
        <textarea class="textarea" name="steps" placeholder="测试步骤"></textarea>
        <textarea class="textarea" name="expected" placeholder="预期结果"></textarea>
        <button class="button primary" type="submit">添加 QA 测试用例</button>
      </form>
    </article>
    <article class="qa-card is-wide">
      <span class="eyebrow">测试矩阵</span>
      <div class="test-list">${project.qa.tests.map((test) => renderTestCase(test)).join("") || `<p class="muted">暂无测试用例。</p>`}</div>
    </article>
    <article class="qa-card">
      <span class="eyebrow">Bug 队列</span>
      <form class="stack-form" data-form="add-bug">
        <input class="field" name="title" maxlength="140" placeholder="Bug 标题" required>
        <select class="field select-field" name="severity">${optionList(SEVERITY_OPTIONS, "P1", SEVERITY_LABELS)}</select>
        <button class="button secondary" type="submit">添加 Bug</button>
      </form>
      <div class="bug-list">${project.qa.bugs.map((bug) => renderBug(bug)).join("") || `<p class="muted">暂无 bug 记录。</p>`}</div>
    </article>
    <article class="qa-card">
      <span class="eyebrow">自动检查</span>
      <p class="muted">用于零依赖检查和人工验证状态的本地占位。</p>
      <div class="auto-list">${project.qa.automatedChecks.map((check) => renderAutoCheck(check)).join("")}</div>
    </article>
    <article class="qa-card">
      <span class="eyebrow">本地 AI 动作</span>
      <h3>QA 提示词</h3>
      <p class="muted">包含 P0 流程、边界/错误场景、状态迁移和发布阻断项。</p>
      <button class="button secondary" type="button" data-action="copy-prompt" data-prompt="qa">复制 QA 提示词</button>
    </article>
  `;
}

function renderTestCase(test) {
  return `
    <div class="test-case is-${h(test.status)}">
      <div class="command-card-top">
        <span>${h(test.id)} · ${h(test.module)}</span>
        <span class="status-pill ${statusClass(test.status)}">${h(statusLabel(test.status))}</span>
      </div>
      <form class="stack-form" data-form="update-test" data-id="${h(test.id)}">
        <div class="form-row">
          <input class="field" name="module" maxlength="80" value="${h(test.module)}" aria-label="测试模块">
          <select class="field select-field" name="priority">${optionList(PRIORITY_OPTIONS, test.priority)}</select>
          <select class="field select-field" name="method">${optionList(METHOD_OPTIONS, test.method)}</select>
        </div>
        <input class="field" name="title" maxlength="140" value="${h(test.title)}" aria-label="测试标题">
        <input class="field" name="precondition" maxlength="180" value="${h(test.precondition)}" aria-label="测试前置条件">
        <textarea class="textarea" name="steps" aria-label="测试步骤">${h(test.steps)}</textarea>
        <textarea class="textarea" name="expected" aria-label="预期结果">${h(test.expected)}</textarea>
        <button class="button secondary" type="submit">保存测试用例</button>
      </form>
      <div class="button-row">
        <button class="button ghost ${test.status === "pass" ? "is-active" : ""}" type="button" data-action="set-test" data-id="${h(test.id)}" data-status="pass">通过</button>
        <button class="button ghost ${test.status === "fail" ? "is-active" : ""}" type="button" data-action="set-test" data-id="${h(test.id)}" data-status="fail">失败</button>
        <button class="button ghost ${test.status === "pending" ? "is-active" : ""}" type="button" data-action="set-test" data-id="${h(test.id)}" data-status="pending">待处理</button>
      </div>
    </div>
  `;
}

function renderBug(bug) {
  return `
    <div class="bug-row ${bug.open ? "" : "is-resolved"}">
      <form class="stack-form" data-form="update-bug" data-id="${h(bug.id)}">
        <input class="field" name="title" maxlength="140" value="${h(bug.title)}" aria-label="Bug 标题">
        <select class="field select-field" name="severity" aria-label="Bug 严重度">${optionList(SEVERITY_OPTIONS, bug.severity, SEVERITY_LABELS)}</select>
        <button class="button secondary" type="submit">保存 Bug</button>
      </form>
      <div>
        <span class="status-pill ${bug.open ? "status-fail" : "status-pass"}">${bug.open ? "打开" : "已解决"}</span>
        <button class="button ghost" type="button" data-action="toggle-bug" data-id="${h(bug.id)}">${bug.open ? "标记解决" : "重新打开"}</button>
      </div>
    </div>
  `;
}

function renderAutoCheck(check) {
  return `
    <div class="auto-row is-${h(check.status)}">
      <span><strong>${h(check.name)}</strong><br><span class="muted">${h(statusLabel(check.status))}</span></span>
      <div class="tiny-actions">
        <button class="button ghost" type="button" data-action="set-check" data-id="${h(check.id)}" data-status="pass">通过</button>
        <button class="button ghost" type="button" data-action="set-check" data-id="${h(check.id)}" data-status="fail">失败</button>
        <button class="button ghost" type="button" data-action="set-check" data-id="${h(check.id)}" data-status="pending">待处理</button>
      </div>
    </div>
  `;
}

function renderLaunch(project) {
  const qa = getQaStats(project);
  const launch = getLaunchStats(project);
  byId("launchCenter").innerHTML = `
    <article class="launch-card">
      <span class="eyebrow">就绪度</span>
      <h3>${launch.readiness}% ${launch.ready ? "就绪" : "阻塞"}</h3>
      <div class="progress-track"><div class="progress-fill" style="width: ${launch.readiness}%"></div></div>
      <p class="muted">由 QA 分数、阻断项数量和必需清单推导。${qa.blockers ? `${qa.blockers} 个阻断项必须关闭。` : "没有 QA 阻断项。"}</p>
      <span class="gate-pill ${launch.ready ? "gate-pass" : "gate-fail"}">${launch.ready ? "可以发布" : "发布阻塞"}</span>
    </article>
    <article class="launch-card is-wide">
      <span class="eyebrow">必需发布清单</span>
      <div class="check-list">${project.launch.checklist.map((item) => `
        <div class="check-row ${item.done ? "is-done" : ""}">
          <span><strong>${h(item.title)}</strong><br><span class="muted">${item.done ? "完成" : "必需"}</span></span>
          <button class="button ghost" type="button" data-action="toggle-launch" data-id="${h(item.id)}">${item.done ? "标记为必需" : "标记完成"}</button>
        </div>
      `).join("")}</div>
    </article>
    <article class="launch-card is-wide">
      <span class="eyebrow">回滚计划</span>
      <form class="stack-form" data-form="rollback-plan">
        <textarea class="textarea" name="rollbackPlan" aria-label="回滚计划">${h(project.launch.rollbackPlan)}</textarea>
        <button class="button secondary" type="submit">保存回滚计划</button>
      </form>
    </article>
    <article class="launch-card">
      <span class="eyebrow">本地 AI 动作</span>
      <h3>发布提示词</h3>
      <p class="muted">复制包含当前阻断项和回滚计划的发布清单复核提示词。</p>
      <button class="button secondary" type="button" data-action="copy-prompt" data-prompt="launch">复制发布提示词</button>
    </article>
  `;
}

function renderMarketing(project) {
  byId("marketingGrid").innerHTML = `
    <article class="marketing-card">
      <span class="eyebrow">反馈渠道</span>
      <h3>AARRR / PLG 优先级地图</h3>
      <div class="channel-list">
        ${project.marketing.channels.map((channel) => `
          <div class="bar-line">
            <span>${h(channel.name)}</span>
            <div class="bar-track"><div class="bar-fill" style="width: ${clampNumber(channel.score, 0, 100)}%"></div></div>
            <strong>${h(channel.score)}</strong>
          </div>
        `).join("")}
      </div>
    </article>
    <article class="marketing-card">
      <span class="eyebrow">反馈循环</span>
      <h3>待测试反馈钩子</h3>
      <div class="hook-list">${project.marketing.hooks.map((hook) => `<p class="project-kv"><strong>“${h(hook)}”</strong></p>`).join("")}</div>
    </article>
    <article class="marketing-card is-wide">
      <span class="eyebrow">反馈迭代实验</span>
      <form class="stack-form" data-form="add-experiment">
        <input class="field" name="name" maxlength="90" placeholder="实验名称" required>
        <input class="field" name="action" maxlength="180" placeholder="执行动作">
        <input class="field" name="goal" maxlength="90" placeholder="成功指标 / AARRR 指标">
        <button class="button primary" type="submit">添加实验</button>
      </form>
      <div class="experiment-list">
        ${project.marketing.experiments.map((experiment) => `
          <div class="task-row">
            <span><strong>${h(experiment.name)}</strong><br><span class="muted">${h(experiment.action)}</span></span>
            <span class="chip">${h(experiment.goal)}</span>
          </div>
        `).join("") || `<p class="muted">暂无增长实验。</p>`}
      </div>
    </article>
    <article class="marketing-card">
      <span class="eyebrow">本地 AI 动作</span>
      <h3>反馈迭代提示词</h3>
      <p class="muted">复制针对渠道、AARRR、PLG 和反馈循环的实验提示词。</p>
      <button class="button secondary" type="button" data-action="copy-prompt" data-prompt="marketing">复制反馈提示词</button>
    </article>
  `;
}

function renderMetrics(project) {
  const maxValue = Math.max(...project.metrics.funnel.map((item) => Number(item.value) || 0), 1);
  const net = Number(project.metrics.revenue || 0) - Number(project.metrics.cost || 0);
  byId("metricsGrid").innerHTML = `
    <article class="metric-card is-wide">
      <span class="eyebrow">反馈指标</span>
      <h3>DORA + 产品漏斗复盘</h3>
      <div class="funnel-list">
        ${project.metrics.funnel.map((step) => `
          <div class="funnel-row">
            <span>${h(step.step)}</span>
            <div class="bar-track"><div class="bar-fill" style="width: ${Math.round((Number(step.value) || 0) / maxValue * 100)}%"></div></div>
            <strong>${h(step.value)}</strong>
          </div>
        `).join("")}
      </div>
    </article>
    <article class="metric-card">
      <span class="eyebrow">商业指标</span>
      <h3>$${h(net)} 净额</h3>
      <form class="stack-form" data-form="metrics">
        <input class="field" name="revenue" type="number" min="0" step="1" value="${h(project.metrics.revenue)}" aria-label="收入">
        <input class="field" name="cost" type="number" min="0" step="1" value="${h(project.metrics.cost)}" aria-label="成本">
        <button class="button secondary" type="submit">保存指标</button>
      </form>
    </article>
    <article class="metric-card is-wide">
      <span class="eyebrow">迭代决策日志</span>
      <h3>继续、转向、砍掉或加倍投入</h3>
      <div class="segmented">
        ${DECISIONS.map((decision) => `<button class="button decision-button ${project.metrics.decision === decision ? "is-active" : ""}" type="button" data-action="set-decision" data-decision="${h(decision)}">${h(decisionLabel(decision))}</button>`).join("")}
      </div>
      <p class="muted">当前决策：<strong>${h(decisionLabel(project.metrics.decision))}</strong>。该选择会保存到本地，并进入控制台/反馈迭代上下文。</p>
    </article>
    <article class="metric-card">
      <span class="eyebrow">本地 AI 动作</span>
      <h3>指标与迭代提示词</h3>
      <p class="muted">复制包含漏斗、收入、成本、DORA/QA 风险和发布状态的决策复盘提示词。</p>
      <button class="button secondary" type="button" data-action="copy-prompt" data-prompt="metrics">复制指标与迭代提示词</button>
    </article>
  `;
}

function getProjectById(id) {
  return state.projects.find((project) => project.id === id);
}

function updateAndSave(message) {
  saveState(message);
  render();
}

function addProject(name) {
  const trimmed = name.trim();
  if (!trimmed) {
    toast("请输入项目名称");
    return;
  }
  const project = clone(seedData.projects[0]);
  project.id = uid("project");
  project.name = trimmed;
  project.stage = "FounderIdea";
  project.chatStage = "ProductAI";
  project.rawIdea = "";
  project.targetUser = "先写清你想服务的用户，以及他们会在什么场景下使用。";
  project.pain = "把原始想法交给产品 AI 追问：用户问题、JTBD、替代方案、付费动机。";
  project.promise = "产品 AI 需要把想法整理成可验证承诺、用户故事和验收标准。";
  project.pricing = "先写一个商业/定价假设，后续由产品 AI 验证。";
  project.mvpGoal = "需求确认后交给设计 AI，再交给开发 AI 和测试 AI。";
  project.nextAction = "和产品 AI 对话，生成第一版需求草案。";
  project.tasks = [];
  project.qa.tests = [];
  project.qa.bugs = [];
  project.qa.releaseGates = DEFAULT_RELEASE_GATES.map((title) => ({ id: uid("gate"), title, done: false }));
  project.qa.automatedChecks = [{ id: uid("CHK"), name: "人工冒烟检查尚未开始", status: "pending" }];
  project.launch.checklist = [
    { id: uid("launch"), title: "P0 测试通过", done: false },
    { id: uid("launch"), title: "没有打开的阻断级或 P0 bug", done: false },
    { id: uid("launch"), title: "回滚计划已写入", done: false }
  ];
  project.marketing.experiments = [];
  project.marketing.channels = [];
  project.marketing.hooks = [];
  project.metrics.revenue = 0;
  project.metrics.cost = 0;
  project.metrics.decision = "continue";
  state.projects.push(project);
  state.activeProjectId = project.id;
  updateAndSave("项目已创建到本地");
  window.location.hash = "handoff";
}

async function handleSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const project = activeProject();
  const data = new FormData(form);
  const type = form.dataset.form;

  if (type === "ai-settings") {
    const submittedKey = String(data.get("apiKey") || "").trim();
    if (submittedKey) runtimeAi.apiKey = submittedKey;
    state.ai = normalizeAiConfig({
      baseUrl: data.get("baseUrl"),
      model: data.get("model"),
      temperature: data.get("temperature")
    });
    updateAndSave(submittedKey ? "非密 AI 设置已保存；Key 仅保存在当前页面内存" : "非密 AI 设置已保存");
  }

  if (type === "role-chat") {
    const stage = STAGES.includes(String(data.get("stage"))) ? String(data.get("stage")) : currentChatStage(project);
    const message = String(data.get("message") || "").trim();
    if (!message) return toast("请输入要发送给角色的内容");
    form.reset();
    await sendRoleMessage(project, stage, message);
  }

  if (type === "project-details") {
    project.name = String(data.get("name") || project.name).trim() || project.name;
    project.stage = STAGES.includes(String(data.get("stage"))) ? String(data.get("stage")) : project.stage;
    project.chatStage = project.stage;
    project.targetUser = String(data.get("targetUser") || "").trim();
    project.pain = String(data.get("pain") || "").trim();
    project.promise = String(data.get("promise") || "").trim();
    project.pricing = String(data.get("pricing") || "").trim();
    project.mvpGoal = String(data.get("mvpGoal") || "").trim();
    project.nextAction = String(data.get("nextAction") || "").trim();
    updateAndSave("项目上下文已保存");
  }

  if (type === "raw-idea") {
    const rawIdea = String(data.get("rawIdea") || "").trim();
    if (!rawIdea) return toast("请先写下原始想法");
    applyRawIdeaToProject(project, rawIdea);
    saveState("原始想法已保存到项目元数据");
    render();
    await sendRoleMessage(project, "ProductAI", rawIdea);
  }

  if (type === "add-task") {
    const title = String(data.get("title") || "").trim();
    if (!title) return toast("请输入任务标题");
    project.tasks.push({ id: uid("task"), title, done: false });
    form.reset();
    updateAndSave("任务已添加");
  }

  if (type === "add-test") {
    const title = String(data.get("title") || "").trim();
    const module = String(data.get("module") || "").trim();
    if (!title || !module) return toast("请输入测试模块和标题");
    project.qa.tests.push({
      id: `TC-${String(project.qa.tests.length + 1).padStart(3, "0")}`,
      module,
      title,
      method: String(data.get("method") || METHOD_OPTIONS[0]),
      precondition: String(data.get("precondition") || "").trim(),
      steps: String(data.get("steps") || "").trim(),
      expected: String(data.get("expected") || "").trim(),
      priority: String(data.get("priority") || "P1"),
      status: "pending"
    });
    form.reset();
    updateAndSave("QA 测试用例已添加");
  }

  if (type === "update-test") {
    const test = project.qa.tests.find((item) => item.id === form.dataset.id);
    if (!test) return;
    const title = String(data.get("title") || "").trim();
    const module = String(data.get("module") || "").trim();
    if (!title || !module) return toast("请输入测试模块和标题");
    test.module = module;
    test.title = title;
    test.method = String(data.get("method") || test.method);
    test.precondition = String(data.get("precondition") || "").trim();
    test.steps = String(data.get("steps") || "").trim();
    test.expected = String(data.get("expected") || "").trim();
    test.priority = String(data.get("priority") || test.priority);
    updateAndSave("QA 测试用例已保存");
  }

  if (type === "add-bug") {
    const title = String(data.get("title") || "").trim();
    if (!title) return toast("请输入 Bug 标题");
    project.qa.bugs.push({ id: uid("BUG"), title, severity: String(data.get("severity") || "P1"), open: true });
    form.reset();
    updateAndSave("Bug 已添加");
  }

  if (type === "update-bug") {
    const bug = project.qa.bugs.find((item) => item.id === form.dataset.id);
    if (!bug) return;
    const title = String(data.get("title") || "").trim();
    if (!title) return toast("请输入 Bug 标题");
    bug.title = title;
    bug.severity = String(data.get("severity") || bug.severity);
    updateAndSave("Bug 已保存");
  }

  if (type === "rollback-plan") {
    project.launch.rollbackPlan = String(data.get("rollbackPlan") || "").trim();
    updateAndSave("回滚计划已保存");
  }

  if (type === "add-experiment") {
    const name = String(data.get("name") || "").trim();
    if (!name) return toast("请输入实验名称");
    project.marketing.experiments.push({
      id: uid("exp"),
      name,
      action: String(data.get("action") || "定义下一条增长动作。").trim(),
      goal: String(data.get("goal") || "定义成功指标").trim(),
      status: "planned"
    });
    form.reset();
    updateAndSave("实验已添加");
  }

  if (type === "metrics") {
    project.metrics.revenue = clampNumber(data.get("revenue"), 0, 1000000);
    project.metrics.cost = clampNumber(data.get("cost"), 0, 1000000);
    updateAndSave("指标已保存");
  }
}

function handleClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const project = activeProject();
  const action = button.dataset.action;

  if (action === "select-project") {
    state.activeProjectId = button.dataset.id;
    updateAndSave("已聚焦项目");
  }

  if (action === "move-stage") {
    const target = getProjectById(button.dataset.id);
    if (target && STAGES.includes(button.dataset.stage)) {
      target.stage = button.dataset.stage;
      target.chatStage = button.dataset.stage;
      state.activeProjectId = target.id;
      updateAndSave(`已移动到${stageLabel(button.dataset.stage)}角色`);
    }
  }

  if (action === "toggle-task") {
    const task = project.tasks.find((item) => item.id === button.dataset.id);
    if (task) {
      task.done = !task.done;
      updateAndSave(task.done ? "任务已完成" : "任务已重新打开");
    }
  }

  if (action === "set-test") {
    const test = project.qa.tests.find((item) => item.id === button.dataset.id);
    if (test && ["pass", "fail", "pending"].includes(button.dataset.status)) {
      test.status = button.dataset.status;
      updateAndSave(`测试已标记为${statusLabel(test.status)}`);
    }
  }

  if (action === "toggle-bug") {
    const bug = project.qa.bugs.find((item) => item.id === button.dataset.id);
    if (bug) {
      bug.open = !bug.open;
      updateAndSave(bug.open ? "Bug 已重新打开" : "Bug 已解决");
    }
  }

  if (action === "set-check") {
    const check = project.qa.automatedChecks.find((item) => item.id === button.dataset.id);
    if (check && ["pass", "fail", "pending"].includes(button.dataset.status)) {
      check.status = button.dataset.status;
      updateAndSave(`检查已标记为${statusLabel(check.status)}`);
    }
  }

  if (action === "toggle-gate") {
    const gate = ensureReleaseGates(project).find((item) => item.id === button.dataset.id);
    if (gate) {
      gate.done = !gate.done;
      updateAndSave(gate.done ? "发布门禁已通过" : "发布门禁已重新打开");
    }
  }

  if (action === "toggle-launch") {
    const item = project.launch.checklist.find((entry) => entry.id === button.dataset.id);
    if (item) {
      item.done = !item.done;
      updateAndSave(item.done ? "发布清单项已完成" : "发布清单项已重新打开");
    }
  }

  if (action === "set-decision") {
    if (DECISIONS.includes(button.dataset.decision)) {
      project.metrics.decision = button.dataset.decision;
      updateAndSave(`决策已设为${decisionLabel(project.metrics.decision)}`);
    }
  }

  if (action === "select-chat-stage") {
    if (STAGES.includes(button.dataset.stage)) {
      project.chatStage = button.dataset.stage;
      updateAndSave(`已切换到${stageLabel(project.chatStage)}对话`);
      refreshActiveChat();
    }
  }

  if (action === "clear-api-key") {
    runtimeAi.apiKey = "";
    updateAndSave("AI Key 已从当前页面内存清除");
  }

  if (action === "copy-role-prompt") {
    const stage = STAGES.includes(button.dataset.stage) ? button.dataset.stage : currentChatStage(project);
    copyPrompt(buildRoleSystemPrompt(project, stage));
  }

  if (action === "copy-prompt") {
    copyPrompt(buildPrompt(project, button.dataset.prompt));
  }
}

async function sendRoleMessage(project, stage, content) {
  project.chatStage = stage;
  if (!apiStatus.available) {
    toast("聊天后端不可用；消息不会写入本地，请稍后重试或复制提示词");
    return;
  }
  if (!runtimeAi.apiKey.trim()) {
    toast("请先填写 API Key；Key 只保存在当前页面内存");
    return;
  }

  let pendingMessage = null;
  try {
    const userMessage = await persistRoleMessage(project, stage, "user", content);
    const messages = roleMessages(project, stage);
    pendingMessage = {
      id: uid("thinking"),
      role: "assistant",
      content: "AI 正在思考中，稍等一下。",
      createdAt: new Date().toISOString(),
      status: "pending"
    };
    messages.push(userMessage, pendingMessage);
    saveState("消息已写入 SQLite，AI 正在思考");
    render();
    scrollActiveChatToBottom();

    const assistantMessage = await requestAssistantMessage(project, stage, (streamedContent) => {
      if (!pendingMessage) return;
      pendingMessage.content = streamedContent || "AI 正在思考中，稍等一下。";
      pendingMessage.status = streamedContent ? "streaming" : "pending";
      render();
      scrollActiveChatToBottom();
    });
    const pendingIndex = messages.findIndex((message) => message.id === pendingMessage.id);
    if (pendingIndex >= 0) {
      messages.splice(pendingIndex, 1, assistantMessage);
    } else {
      messages.push(assistantMessage);
    }
    saveState("AI 回复已写入 SQLite");
    render();
    scrollActiveChatToBottom();
  } catch (error) {
    const failureMessage = `AI 回复失败：${error.message || String(error)}。API Key 仍只保存在当前页面内存；你可以稍后重试，或复制当前角色提示词到外部客户端。`;
    let persistedFailure = null;
    try {
      persistedFailure = await persistRoleMessage(project, stage, "assistant", failureMessage);
    } catch (persistError) {
      console.warn("保存 AI 失败消息失败。", persistError);
    }
    if (pendingMessage) {
      pendingMessage.content = persistedFailure?.content || failureMessage;
      pendingMessage.createdAt = persistedFailure?.createdAt || new Date().toISOString();
      pendingMessage.status = "error";
    } else {
      roleMessages(project, stage).push({ id: persistedFailure?.id || uid("error"), role: "assistant", content: persistedFailure?.content || failureMessage, createdAt: persistedFailure?.createdAt || new Date().toISOString(), status: "error" });
    }
    toast("AI 回复失败，已显示在对话里");
    render();
    scrollActiveChatToBottom();
  }
}

async function persistRoleMessage(project, stage, role, content) {
  const response = await fetch(`${API_BASE}/chats`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${runtimeAi.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ projectId: project.id, stage, role, content })
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) throw new Error(payload?.error || payload?.message || `HTTP ${response.status}`);
  return normalizeRoleChats({ [stage]: [payload.message] })[stage][0];
}

async function requestRoleReply(project, stage) {
  const ai = normalizeAiConfig(state.ai);
  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${runtimeAi.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      projectId: project.id,
      stage,
      baseUrl: ai.baseUrl,
      model: ai.model,
      temperature: ai.temperature,
      messages: buildRoleChatPayload(project, stage)
    })
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) throw new Error(payload?.error || payload?.message || `HTTP ${response.status}`);
  if (!payload?.message) throw new Error("后端没有返回 AI 消息");
  return normalizeRoleChats({ [stage]: [payload.message] })[stage][0];
}

async function requestAssistantMessage(project, stage, onStreamContent) {
  const directReply = await requestBrowserRoleReplyStream(project, stage, onStreamContent);
  const assistantMessage = await persistRoleMessage(project, stage, "assistant", directReply);
  return assistantMessage;
}

async function requestBrowserRoleReplyStream(project, stage, onStreamContent) {
  const ai = normalizeAiConfig(state.ai);
  const controller = new AbortController();
  let firstTokenTimedOut = false;
  let fullTimedOut = false;
  const timeout = window.setTimeout(() => {
    fullTimedOut = true;
    controller.abort();
  }, MODEL_TIMEOUT_MS);
  const firstTokenTimeout = window.setTimeout(() => {
    firstTokenTimedOut = true;
    controller.abort();
  }, FIRST_TOKEN_TIMEOUT_MS);
  let reply = "";
  try {
    const response = await fetch(modelRequestUrl(ai), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${runtimeAi.apiKey}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify(buildModelRequestBody(ai, project, stage, true))
    });
    if (!response.ok) {
      const payload = await readJsonResponse(response);
      throw new Error(payload?.error?.message || payload?.message || `浏览器直连 HTTP ${response.status}`);
    }
    if (!response.body?.getReader) {
      window.clearTimeout(timeout);
      return requestBrowserRoleReply(project, stage);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        const doneStreaming = parseOpenAiStreamLine(line, (chunk) => {
          if (!reply) window.clearTimeout(firstTokenTimeout);
          reply += chunk;
          onStreamContent?.(reply);
        });
        if (doneStreaming) return finishStreamedReply(reply);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const doneStreaming = parseOpenAiStreamLine(buffer, (chunk) => {
        if (!reply) window.clearTimeout(firstTokenTimeout);
        reply += chunk;
        onStreamContent?.(reply);
      });
      if (doneStreaming) return finishStreamedReply(reply);
    }
    return finishStreamedReply(reply);
  } catch (error) {
    if (firstTokenTimedOut && !reply) {
      return requestBrowserRoleReply(project, stage);
    }
    if (fullTimedOut || error?.name === "AbortError") {
      throw new Error(`模型响应超过 ${Math.round(MODEL_TIMEOUT_MS / 1000)} 秒，已停止等待。可以再发一次，或换一个更快的模型。`);
    }
    if (!reply) return requestBrowserRoleReply(project, stage);
    throw error;
  } finally {
    window.clearTimeout(timeout);
    window.clearTimeout(firstTokenTimeout);
  }
}

function parseOpenAiStreamLine(line, onChunk) {
  const trimmed = String(line || "").trim();
  if (!trimmed || trimmed.startsWith(":")) return false;
  if (!trimmed.startsWith("data:")) return false;
  const data = trimmed.replace(/^data:\s*/, "");
  if (!data) return false;
  if (data === "[DONE]") return true;
  let payload = null;
  try {
    payload = JSON.parse(data);
  } catch (error) {
    throw new Error(`流式响应片段不是 JSON：${data.slice(0, 120)}`);
  }
  const chunk = payload?.choices?.[0]?.delta?.content
    ?? payload?.choices?.[0]?.message?.content
    ?? payload?.choices?.[0]?.text
    ?? (String(payload?.type || "").includes("delta") ? payload?.delta : "")
    ?? payload?.text
    ?? "";
  if (chunk) onChunk(String(chunk));
  return data === "[DONE]" || payload?.type === "response.completed";
}

function finishStreamedReply(reply) {
  const content = String(reply || "").trim();
  if (!content) throw new Error("浏览器直连没有返回 AI 回复");
  return content;
}

async function requestBrowserRoleReply(project, stage) {
  const ai = normalizeAiConfig(state.ai);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    const response = await fetch(modelRequestUrl(ai), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${runtimeAi.apiKey}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify(buildModelRequestBody(ai, project, stage, false))
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) throw new Error(payload?.error?.message || payload?.message || `浏览器直连 HTTP ${response.status}`);
    const reply = extractModelReply(payload);
    if (!String(reply).trim()) throw new Error("浏览器直连没有返回 AI 回复");
    return String(reply).trim();
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      throw new Error(`模型响应超过 ${Math.round(MODEL_TIMEOUT_MS / 1000)} 秒，已停止等待。可以再发一次，或换一个更快的模型。`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function modelRequestUrl(ai = normalizeAiConfig(state.ai)) {
  const base = String(ai.baseUrl || AI_DEFAULTS.baseUrl).trim().replace(/\/+$/, "");
  if (usesResponsesApi(base)) return base.endsWith("/responses") ? base : `${base}/responses`;
  return chatCompletionUrl(ai);
}

function usesResponsesApi(aiOrBase = normalizeAiConfig(state.ai)) {
  const base = typeof aiOrBase === "string" ? aiOrBase : String(aiOrBase.baseUrl || "");
  return base.endsWith("/responses") || base.includes("/codex-omg/");
}

function buildModelRequestBody(ai, project, stage, stream) {
  const baseBody = {
    model: ai.model,
    temperature: ai.temperature,
    stream
  };
  if (!usesResponsesApi(ai)) {
    return { ...baseBody, messages: buildRoleChatPayload(project, stage) };
  }
  return {
    ...baseBody,
    instructions: buildRoleSystemPrompt(project, stage),
    input: buildResponsesInput(project, stage)
  };
}

function buildResponsesInput(project, stage) {
  return buildRoleChatPayload(project, stage)
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content
    }));
}

function extractModelReply(payload) {
  const chatReply = payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.text || "";
  if (String(chatReply).trim()) return String(chatReply);
  if (String(payload?.output_text || "").trim()) return String(payload.output_text);
  const output = Array.isArray(payload?.output) ? payload.output : [];
  return output
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .map((part) => part?.text || part?.content || "")
    .join("")
    .trim();
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`接口返回的不是 JSON：${text.slice(0, 160)}`);
  }
}

function refreshActiveChat() {
  const project = activeProject();
  const stage = currentChatStage(project);
  chatLoads.delete(chatKey(project.id, stage));
  ensureRoleMessagesLoaded(project, stage);
}

function chatCompletionUrl(ai = normalizeAiConfig(state.ai)) {
  const base = String(ai.baseUrl || AI_DEFAULTS.baseUrl).trim().replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  if (base.endsWith("/v1")) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

function buildRoleChatPayload(project, stage) {
  const messages = roleMessages(project, stage)
    .filter((message) => !["pending", "streaming", "error"].includes(message.status))
    .filter((message) => !String(message.content || "").startsWith("AI 正在思考"))
    .filter((message) => !String(message.content || "").startsWith("AI 回复失败"))
    .slice(-14)
    .map((message) => ({ role: message.role, content: message.content }));
  return [{ role: "system", content: buildRoleSystemPrompt(project, stage) }, ...messages];
}

function buildRoleSystemPrompt(project, stage) {
  return `${ROLE_CHAT_INSTRUCTIONS[stage] || MODULE_DESCRIPTIONS[stage] || "按软件团队角色职责推进。"}\n\n${buildPrompt(project, promptModeForStage(stage))}\n\n持续对话规则：\n- 先回应用户当前这句话，不要假设一次就完成。\n- 可以追问、打回、建议修改，但每次都要给出下一步。\n- 如果信息不足，优先问 1-3 个关键问题。\n- 输出要能被当前项目继续迭代使用。`;
}

function buildPrompt(project, mode) {
  const qa = getQaStats(project);
  const launch = getLaunchStats(project);
  const headers = {
    product: "你是产品 AI。请先和创始人聊想法，不要直接进入设计或开发。",
    design: "你是设计 AI。请根据已确认需求反复澄清页面结构、用户流、状态、交互和设计交付物。",
    build: "你是开发 AI。请根据需求、设计约束和验收标准制定实现计划。",
    qa: "你是测试 AI。请根据需求、设计和实现结果设计黑盒发布检查。",
    launch: "你是发布负责人。请复核最终验收、发布就绪度和回滚风险。",
    marketing: "你是反馈迭代 AI。请根据首批用户反馈和 AARRR 指标生成下一轮实验。",
    metrics: "你是复盘 AI。请根据 DORA、漏斗、收入和成本写出继续/转向/砍掉/加倍投入建议。"
  };
  const productInstructions = mode === "product" ? "\n\n产品 AI 要求：\n- 先用 5-8 个追问澄清目标用户、真实场景、现有替代方案、付费动机和成功标准。\n- 再输出需求草案：用户故事、范围、非目标、验收标准、验证计划和最大风险。\n- 明确哪些信息仍是假设，哪些可以进入需求确认。" : "";
  return `${headers[mode] || headers.build}\n\n团队流水线：创始人想法 -> 产品 AI -> 需求确认 -> 设计 AI -> 设计评审 -> 开发 AI -> 测试 AI -> 最终验收 -> 发布 -> 反馈迭代\n角色内置方法：${FRAMEWORK_MODEL}\n项目：${project.name}\n当前角色：${stageLabel(project.stage)}\n角色职责：${MODULE_DESCRIPTIONS[project.stage] || "按 AI 软件团队交接流程推进。"}\n原始创始人想法：${project.rawIdea || "尚未填写，请先追问创始人。"}\n目标用户 / JTBD：${project.targetUser}\n用户问题 / 需求追问：${project.pain}\n需求候选承诺：${project.promise}\n商业与定价假设：${project.pricing}\n需求 / 设计 / 开发目标：${project.mvpGoal}\n下一步动作：${project.nextAction}\n\nQA 分数：${qa.score}\n发布阻断项：${qa.blockers}\n发布就绪度：${launch.readiness}%（${launch.ready ? "就绪" : "阻塞"}）\n当前反馈迭代决策：${decisionLabel(project.metrics.decision)}${productInstructions}\n\n约束：\n- local-first，除非明确要求，不假设外部 API。\n- 每个角色必须说明输入、输出、交付物和打回条件。\n- 覆盖 P0 流程、边界/错误场景、状态迁移、发布阻断项和回滚。\n- 输出具体下一步，不要泛泛建议。`;
}

async function copyPrompt(prompt) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(prompt);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = prompt;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    toast("提示词已复制到本地剪贴板");
  } catch (error) {
    console.warn("复制失败", error);
    toast("复制失败；提示词已显示在卡片中");
  }
}

function internalSelfCheck() {
  const project = activeProject();
  const qa = getQaStats(project);
  const launch = getLaunchStats(project);
  return {
    storageKey: STORAGE_KEY,
    projectCount: state.projects.length,
    activeProject: project.name,
    schemaVersion: state.schemaVersion,
    stagesPresent: STAGES.length === 10,
    stageLabelsChinese: STAGES.map(stageLabel).join("|") === "创始人想法|产品 AI|需求确认|设计 AI|设计评审|开发 AI|测试 AI|最终验收|发布|反馈迭代",
    oldStagesMapped: ["Idea", "Strategy", "Discovery", "Validation", "MVP", "Build", "QA", "Marketing", "Iteration"].map(normalizeStage).join("|") === "ProductAI|ProductAI|ProductAI|ProductAI|PRDGate|DevelopmentAI|QAAI|FeedbackIteration|FeedbackIteration",
    frameworkModelIncluded: FRAMEWORK_MODEL.includes("JTBD") && FRAMEWORK_MODEL.includes("Decision Logs"),
    productPromptIncluded: buildPrompt(project, "product").includes("你是产品 AI") && buildPrompt(project, "product").includes("原始创始人想法"),
    rawIdeaNormalized: typeof project.rawIdea === "string",
    aiDefaults: normalizeAiConfig(state.ai).baseUrl === AI_DEFAULTS.baseUrl && normalizeAiConfig(state.ai).model === AI_DEFAULTS.model,
    apiKeyNotSerialized: !JSON.stringify(storageSafeState(state)).includes("apiKey"),
    roleChatsNotSerialized: !JSON.stringify(storageSafeState(state)).includes("roleChats"),
    roleChatReady: STAGES.every((stage) => Array.isArray(roleMessages(project, stage))),
    chatEndpoint: `${API_BASE}/chat/completions`,
    activeView: getViewFromHash(),
    routeCount: VIEW_ROUTES.length,
    decisionLabelsChinese: DECISIONS.map(decisionLabel).join("|") === "继续|转向|砍掉|加倍投入",
    userContentEscaped: h("<script>x</script>") === "&lt;script&gt;x&lt;/script&gt;",
    qaScore: qa.score,
    blockers: qa.blockers,
    launchReady: launch.ready,
    sopLinks: SOP_LINKS.map((link) => link.path)
  };
}

byId("projectSelector").addEventListener("change", (event) => {
  state.activeProjectId = event.target.value;
  updateAndSave("当前项目已切换");
  refreshActiveChat();
});

byId("newProjectForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = byId("newProjectName");
  addProject(input.value);
  input.value = "";
});

byId("resetDemoData").addEventListener("click", () => {
  if (window.confirm("确定要重置 oneCompanyOS.v2 的全部本地演示数据吗？此操作无法撤销。")) {
    state = clone(seedData);
    updateAndSave("演示数据已重置");
  }
});

document.addEventListener("submit", handleSubmit);
document.addEventListener("click", handleClick);
window.addEventListener("hashchange", () => setActiveView());

window.oneCompanyOSSelfCheck = internalSelfCheck;

if (!window.location.hash) {
  window.history.replaceState(null, "", "#console");
}

render();
checkApiStatus().then(refreshActiveChat);
