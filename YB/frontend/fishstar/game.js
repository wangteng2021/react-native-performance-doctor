import { packageBase, originalAssets, fishTextures, betSteps } from "./assets.js";
import { bridge, getBridgeState, on, postToHost } from "./bridge.js";
import { fishingAudio } from "./audio.js";
import { FishStarProtocol, authLogin, normalizeResult } from "./protocol.js";

const elements = {
  canvas: document.getElementById("GameCanvas"),
  decreaseBet: document.getElementById("decreaseBet"),
  increaseBet: document.getElementById("increaseBet"),
  fire: document.getElementById("fireButton"),
  sync: document.getElementById("syncButton"),
  history: document.getElementById("historyButton"),
  mute: document.getElementById("muteButton"),
  historyPanel: document.getElementById("historyPanel"),
  closeHistory: document.getElementById("closeHistory"),
  historyList: document.getElementById("historyList"),
  launchStatus: document.getElementById("launchStatus"),
  loadingGif: document.getElementById("loadingGif")
};

const context = elements.canvas.getContext("2d", { alpha: false });
elements.loadingGif.src = originalAssets.loadingGif;
elements.canvas.dataset.assetOrigin = packageBase;

const imageUrls = {
  background: originalAssets.background,
  loadingTexture: originalAssets.loadingTexture,
  button: originalAssets.button,
  coin: originalAssets.coin,
  coinButton: originalAssets.coinButton,
  purpleCoin: originalAssets.purpleCoin,
  purpleCoinButton: originalAssets.purpleCoinButton,
  cannon: originalAssets.cannon,
  ...Object.fromEntries(fishTextures.map((texture, index) => [`fish${index}`, texture.src]))
};

const images = new Map();

const canvasState = {
  width: 0,
  height: 0,
  fish: [],
  projectiles: [],
  coins: [],
  notices: [],
  hitRegions: new Map(),
  targetIndex: 0,
  lastTime: 0,
  assetsReady: false,
  assetsLoaded: 0,
  assetCount: Object.keys(imageUrls).length
};

const gameState = {
  protocol: null,
  player: null,
  balance: 0,
  betIndex: 2,
  busy: false,
  status: "Checking launch session.",
  lastResult: null,
  history: [],
  playerName: "Player"
};

function loadImages() {
  return Promise.all(Object.entries(imageUrls).map(([name, url]) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      images.set(name, image);
      canvasState.assetsLoaded += 1;
      resolve(image);
    };
    image.onerror = () => resolve(null);
    image.src = url;
  }))).then(() => {
    canvasState.assetsReady = true;
    seedFish();
  });
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function setStatus(message) {
  gameState.status = message;
  elements.launchStatus.textContent = message;
}

function setReady() {
  document.body.classList.remove("is-booting", "is-error");
  document.body.classList.add("is-ready");
}

function setError(error) {
  const message = error && error.message ? error.message : String(error);
  document.body.classList.remove("is-booting");
  document.body.classList.add("is-error");
  setStatus(message);
  postToHost("pinata.error", { message });
}

function currentBet() {
  return betSteps[gameState.betIndex];
}

function updateHud() {
  elements.fire.disabled = gameState.busy || !gameState.protocol;
  syncDomHitTargets();
}

function resizeCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvasState.width = Math.floor(window.innerWidth * ratio);
  canvasState.height = Math.floor(window.innerHeight * ratio);
  elements.canvas.width = canvasState.width;
  elements.canvas.height = canvasState.height;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  seedFish();
  syncDomHitTargets();
}

function seedFish() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const count = Math.max(12, Math.min(26, Math.floor(width / 54)));
  canvasState.fish = Array.from({ length: count }, (_, index) => createFish(index, width, height));
}

function createFish(index, width, height) {
  const direction = Math.random() > 0.5 ? 1 : -1;
  return {
    imageKey: `fish${index % fishTextures.length}`,
    label: `Fish ${index % fishTextures.length + 1}`,
    x: Math.random() * width,
    y: height * 0.16 + Math.random() * height * 0.56,
    speed: (18 + Math.random() * 38) * direction,
    drift: Math.random() * Math.PI * 2,
    width: 58 + Math.random() * 58,
    hit: 0
  };
}

function drawScene(now) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  context.clearRect(0, 0, width, height);
  drawImageCover(images.get("background"), 0, 0, width, height);

  if (!canvasState.assetsReady) {
    drawLoading(width, height);
  } else {
    drawFish(now, width, height);
    drawProjectiles();
    drawCoins();
    drawCannon(width, height);
  }

  drawHud(width, height);
  canvasState.lastTime = now;
  window.requestAnimationFrame(drawScene);
}

function drawImageCover(image, x, y, width, height) {
  if (!image || !image.naturalWidth || !image.naturalHeight) {
    context.fillStyle = "#04101b";
    context.fillRect(x, y, width, height);
    return;
  }

  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawImageContain(image, x, y, width, height) {
  if (!image || !image.naturalWidth || !image.naturalHeight) return;
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawLoading(width, height) {
  const panelWidth = Math.min(320, width - 32);
  const panelHeight = 140;
  const panelX = (width - panelWidth) / 2;
  const panelY = (height - panelHeight) / 2;
  drawPanelTexture(panelX, panelY, panelWidth, panelHeight);
  drawText(`Loading assets ${canvasState.assetsLoaded}/${canvasState.assetCount}`, width / 2, panelY + 82, 14, "center");
}

function drawFish(now, width, height) {
  const seconds = Math.max(0.001, (now - canvasState.lastTime) / 1000);
  canvasState.fish.forEach((fish, index) => {
    fish.x += fish.speed * seconds;
    fish.y += Math.sin(now / 850 + fish.drift) * 0.2;
    fish.hit = Math.max(0, fish.hit - seconds * 2.6);

    if (fish.speed > 0 && fish.x > width + fish.width) fish.x = -fish.width;
    if (fish.speed < 0 && fish.x < -fish.width) fish.x = width + fish.width;
    if (fish.y < height * 0.12 || fish.y > height * 0.78) fish.y = height * 0.18 + Math.random() * height * 0.5;
    drawSingleFish(fish, index === canvasState.targetIndex);
  });
}

function drawSingleFish(fish, targeted) {
  const image = images.get(fish.imageKey);
  if (!image || !image.naturalWidth || !image.naturalHeight) return;
  const direction = fish.speed >= 0 ? 1 : -1;
  const drawWidth = fish.width * (targeted ? 1.12 : 1);
  const drawHeight = drawWidth * image.naturalHeight / image.naturalWidth;

  context.save();
  context.translate(fish.x, fish.y);
  context.scale(direction, 1);
  context.globalAlpha = fish.hit ? 0.72 + fish.hit * 0.28 : 0.96;
  if (targeted) drawImageContain(images.get("coinButton"), -drawWidth * 0.75, -drawHeight * 0.85, drawWidth * 1.5, drawHeight * 1.7);
  context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  context.restore();
}

function drawProjectiles() {
  const bulletImage = images.get("purpleCoin");
  canvasState.projectiles = canvasState.projectiles.filter((projectile) => projectile.life > 0);
  canvasState.projectiles.forEach((projectile) => {
    projectile.x += projectile.vx;
    projectile.y += projectile.vy;
    projectile.life -= 1;
    drawImageContain(bulletImage, projectile.x - 11, projectile.y - 11, 22, 22);
  });
}

function drawCoins() {
  const coinImage = images.get("coin");
  canvasState.coins = canvasState.coins.filter((coin) => coin.life > 0);
  canvasState.coins.forEach((coin) => {
    coin.x += coin.vx;
    coin.y += coin.vy;
    coin.vy += 0.08;
    coin.life -= 1;
    context.save();
    context.globalAlpha = Math.min(1, coin.life / 18);
    drawImageContain(coinImage, coin.x - coin.size / 2, coin.y - coin.size / 2, coin.size, coin.size);
    context.restore();
  });
}

function drawCannon(width, height) {
  const cannonWidth = Math.min(190, Math.max(116, width * 0.18));
  const cannonHeight = cannonWidth;
  drawImageContain(images.get("cannon"), width / 2 - cannonWidth / 2, height - cannonHeight + 24, cannonWidth, cannonHeight);
}

function drawHud(width, height) {
  canvasState.hitRegions.clear();
  drawTopHud(width);
  drawBottomControls(width, height);
  drawNotices(width, height);
  syncDomHitTargets();
}

function drawTopHud(width) {
  const top = Math.max(12, Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("padding-top"), 10) || 12);
  const leftPanelWidth = Math.min(420, width * 0.46);
  drawPanelTexture(12, top, leftPanelWidth, 76);
  drawText("FishStar", 30, top + 28, 22, "left");
  drawText(gameState.playerName, 30, top + 54, 13, "left");

  const balanceText = `Balance ${formatAmount(gameState.balance)}`;
  drawImageContain(images.get("coin"), leftPanelWidth - 62, top + 22, 30, 30);
  drawText(balanceText, leftPanelWidth - 72, top + 52, 13, "right");

  const statusWidth = Math.min(520, width - 24);
  drawPanelTexture(width - statusWidth - 12, top, statusWidth, 76);
  drawText(gameState.status, width - statusWidth + 8, top + 30, 13, "left", statusWidth - 32);
  const round = gameState.lastResult ? gameState.lastResult.id : "--";
  const free = gameState.lastResult ? formatAmount(gameState.lastResult.freeCount) : "0";
  drawText(`Round ${round}   Free ${free}`, width - statusWidth + 8, top + 56, 13, "left", statusWidth - 32);
}

function drawBottomControls(width, height) {
  const bottom = height - Math.max(92, Math.min(124, height * 0.15));
  const fireSize = Math.min(116, Math.max(88, width * 0.11));
  const fireRegion = { x: width / 2 - fireSize / 2, y: bottom - 10, width: fireSize, height: fireSize };
  drawImageContain(images.get(gameState.busy ? "purpleCoinButton" : "coinButton"), fireRegion.x, fireRegion.y, fireRegion.width, fireRegion.height);
  drawText("Fire", width / 2, fireRegion.y + fireSize * 0.6, 15, "center");
  setHitRegion("fire", fireRegion, elements.fire);

  const betX = Math.max(18, width / 2 - fireSize / 2 - 238);
  drawAssetButton("decreaseBet", "Bet -", betX, fireRegion.y + 20, 82, 50, elements.decreaseBet);
  drawPanelTexture(betX + 88, fireRegion.y + 18, 104, 54);
  drawText("Bet", betX + 140, fireRegion.y + 39, 12, "center");
  drawText(formatAmount(currentBet()), betX + 140, fireRegion.y + 61, 15, "center");
  drawAssetButton("increaseBet", "Bet +", betX + 198, fireRegion.y + 20, 82, 50, elements.increaseBet);

  const utilityWidth = 86;
  const gap = 10;
  const utilityX = Math.min(width - (utilityWidth * 3 + gap * 2) - 18, width / 2 + fireSize / 2 + 56);
  drawAssetButton("sync", "Sync", utilityX, fireRegion.y + 21, utilityWidth, 48, elements.sync);
  drawAssetButton("history", "History", utilityX + utilityWidth + gap, fireRegion.y + 21, utilityWidth, 48, elements.history);
  drawAssetButton("mute", getBridgeState().muted ? "Muted" : "Sound", utilityX + (utilityWidth + gap) * 2, fireRegion.y + 21, utilityWidth, 48, elements.mute);
}

function drawPanelTexture(x, y, width, height) {
  const texture = images.get("loadingTexture") || images.get("button");
  context.save();
  context.globalAlpha = 0.92;
  drawImageCover(texture, x, y, width, height);
  context.fillStyle = "rgba(4, 16, 27, 0.36)";
  context.fillRect(x, y, width, height);
  context.restore();
}

function drawAssetButton(name, label, x, y, width, height, element) {
  drawImageCover(images.get("button"), x, y, width, height);
  drawText(label, x + width / 2, y + height / 2 + 5, 13, "center");
  setHitRegion(name, { x, y, width, height }, element);
}

function drawText(text, x, y, size, align = "left", maxWidth = 0) {
  context.save();
  context.font = `700 ${size}px sans-serif`;
  context.textAlign = align;
  context.textBaseline = "middle";
  context.lineWidth = 3;
  context.strokeStyle = "rgba(4, 16, 27, 0.82)";
  context.fillStyle = "#f8fbff";
  if (maxWidth > 0) {
    const clipped = clipText(text, maxWidth, context);
    context.strokeText(clipped, x, y);
    context.fillText(clipped, x, y);
  } else {
    context.strokeText(text, x, y);
    context.fillText(text, x, y);
  }
  context.restore();
}

function clipText(text, maxWidth, ctx) {
  const value = String(text);
  if (ctx.measureText(value).width <= maxWidth) return value;
  let clipped = value;
  while (clipped.length > 3 && ctx.measureText(`${clipped}...`).width > maxWidth) clipped = clipped.slice(0, -1);
  return `${clipped}...`;
}

function setHitRegion(name, region, element) {
  canvasState.hitRegions.set(name, region);
  if (element) {
    element.style.left = `${region.x}px`;
    element.style.top = `${region.y}px`;
    element.style.width = `${region.width}px`;
    element.style.height = `${region.height}px`;
  }
}

function syncDomHitTargets() {
  canvasState.hitRegions.forEach((region, name) => {
    const element = elements[name];
    if (!element) return;
    element.style.left = `${region.x}px`;
    element.style.top = `${region.y}px`;
    element.style.width = `${region.width}px`;
    element.style.height = `${region.height}px`;
  });
}

function drawNotices(width, height) {
  canvasState.notices = canvasState.notices.filter((notice) => Date.now() < notice.until);
  canvasState.notices.forEach((notice, index) => {
    const panelWidth = Math.min(360, width - 32);
    const x = (width - panelWidth) / 2;
    const y = height * 0.32 + index * 66;
    drawPanelTexture(x, y, panelWidth, 58);
    drawText(notice.label, width / 2, y + 22, 14, "center");
    drawText(notice.value, width / 2, y + 43, 18, "center");
  });
}

function showNotice(label, value, duration = 1500) {
  canvasState.notices.push({ label, value, until: Date.now() + duration });
}

function pickTargetFromResult(result) {
  const card = result.viewarray[0] && result.viewarray[0].nHandCards;
  const sum = Array.isArray(card) ? card.reduce((total, value) => total + Number(value || 0), 0) : Date.now();
  const winBoost = result.win > 0 ? Math.ceil(result.multiplier) : 0;
  return (sum + winBoost) % Math.max(1, fishTextures.length);
}

function fireVisual(target) {
  const startX = window.innerWidth / 2;
  const startY = window.innerHeight - 72;
  canvasState.projectiles.push({
    x: startX,
    y: startY,
    vx: (target.x - startX) / 24,
    vy: (target.y - startY) / 24,
    life: 28
  });
  fishingAudio.shot();
}

function resolveVisual(result) {
  const targetIndex = pickTargetFromResult(result);
  const target = canvasState.fish.find((fish) => fish.imageKey === `fish${targetIndex}`) || canvasState.fish[canvasState.targetIndex];
  if (!target) return;
  canvasState.targetIndex = canvasState.fish.indexOf(target);
  target.hit = result.win > 0 ? 1 : 0.45;

  if (result.win > 0) {
    const coinCount = Math.max(8, Math.min(26, Math.ceil(result.multiplier * 3)));
    for (let index = 0; index < coinCount; index += 1) {
      canvasState.coins.push({
        x: target.x,
        y: target.y,
        vx: (Math.random() - 0.5) * 7,
        vy: -Math.random() * 5 - 1,
        size: 18 + Math.random() * 18,
        life: 44 + Math.random() * 24
      });
    }
    fishingAudio.hit();
    fishingAudio.win(result.multiplier);
    showNotice(result.multiplier >= result.threshold ? "Big Catch" : "Catch", `+${formatAmount(result.win)}`);
  } else {
    fishingAudio.miss();
    showNotice("Miss", "No catch", 1000);
  }
}

async function fire() {
  if (gameState.busy || !gameState.protocol) return;
  fishingAudio.unlock();
  const target = canvasState.fish[canvasState.targetIndex] || canvasState.fish[0] || { x: window.innerWidth / 2, y: window.innerHeight * 0.4 };
  fireVisual(target);
  gameState.busy = true;
  setStatus("Fire sent. Waiting for result.");
  updateHud();

  try {
    await gameState.protocol.fire(currentBet());
  } catch (error) {
    gameState.busy = false;
    setError(error);
    updateHud();
  }
}

function handleLottery(payload) {
  const result = normalizeResult(payload);
  gameState.lastResult = result;
  gameState.balance = result.balance;
  gameState.busy = false;
  gameState.history.unshift({ id: result.id, bet: result.bet, win: result.win, time: Date.now() });
  gameState.history = gameState.history.slice(0, 20);
  setStatus(result.win > 0 ? `Win ${formatAmount(result.win)}.` : "No catch on this shot.");
  resolveVisual(result);
  updateHud();
  renderHistory();
  postToHost("pinata.balance.update", {
    balance: result.balance,
    bet: result.bet,
    win: result.win,
    roundId: result.id,
    gameId: result.gameId || gameState.player.gameId || null
  });
  if (result.multiplier >= result.threshold && result.win > 0) {
    postToHost("pinata.bigwin", {
      amount: result.win,
      bet: result.bet,
      multiplier: result.multiplier,
      threshold: result.threshold,
      roundId: result.id,
      gameId: result.gameId || gameState.player.gameId || null
    });
  }
}

function handleHistory(payload) {
  const rows = payload && Array.isArray(payload.Result) ? payload.Result : [];
  gameState.history = rows.map((row) => ({
    id: row.id,
    bet: row.score_linescore,
    win: row.score_win,
    time: row.lotteryTime
  }));
  renderHistory();
  elements.historyPanel.classList.add("is-open");
}

function handleSync(payload) {
  const balance = payload && payload.Result ? Number(payload.Result.balance) : NaN;
  if (Number.isFinite(balance)) {
    gameState.balance = balance;
    setStatus("Balance synchronized.");
    updateHud();
  }
}

function renderHistory() {
  if (!gameState.history.length) {
    elements.historyList.innerHTML = "<li>No rounds yet.</li>";
    return;
  }
  elements.historyList.innerHTML = gameState.history.map((row) => {
    const result = Number(row.win || 0) > 0 ? `+${formatAmount(row.win)}` : "miss";
    return `<li><strong>${escapeHtml(row.id || "--")}</strong> bet ${formatAmount(row.bet)} ${result}</li>`;
  }).join("");
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bindControls() {
  elements.canvas.addEventListener("pointerdown", handleCanvasPointer);
  elements.fire.addEventListener("click", fire);
  elements.decreaseBet.addEventListener("click", decreaseBet);
  elements.increaseBet.addEventListener("click", increaseBet);
  elements.sync.addEventListener("click", syncBalance);
  elements.history.addEventListener("click", requestHistory);
  elements.closeHistory.addEventListener("click", () => elements.historyPanel.classList.remove("is-open"));
  elements.mute.addEventListener("click", toggleMute);
  on("audio", (state) => {
    elements.mute.textContent = state.audible ? "Sound On" : "Muted";
    elements.mute.setAttribute("aria-pressed", String(!state.audible));
  });
  on("balance", (payload) => {
    if (Number.isFinite(Number(payload.balance))) {
      gameState.balance = Number(payload.balance);
      updateHud();
    }
  });
  window.addEventListener("resize", resizeCanvas);
}

function handleCanvasPointer(event) {
  const rect = elements.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  for (const [name, region] of canvasState.hitRegions.entries()) {
    if (x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height) {
      event.preventDefault();
      invokeControl(name);
      return;
    }
  }
}

function invokeControl(name) {
  if (name === "fire") fire();
  if (name === "decreaseBet") decreaseBet();
  if (name === "increaseBet") increaseBet();
  if (name === "sync") syncBalance();
  if (name === "history") requestHistory();
  if (name === "mute") toggleMute();
}

function decreaseBet() {
  fishingAudio.button();
  gameState.betIndex = Math.max(0, gameState.betIndex - 1);
  updateHud();
}

function increaseBet() {
  fishingAudio.button();
  gameState.betIndex = Math.min(betSteps.length - 1, gameState.betIndex + 1);
  updateHud();
}

function syncBalance() {
  fishingAudio.button();
  if (gameState.protocol) gameState.protocol.syncBalance();
}

function requestHistory() {
  fishingAudio.button();
  if (gameState.protocol) gameState.protocol.history();
  else elements.historyPanel.classList.add("is-open");
}

function toggleMute() {
  const nextMuted = !getBridgeState().muted;
  bridge("setMute", { value: nextMuted });
}

async function boot() {
  bindControls();
  resizeCanvas();
  window.requestAnimationFrame(drawScene);
  updateHud();
  loadImages().catch(() => {});

  try {
    setStatus("Authenticating launch session.");
    const auth = await authLogin();
    gameState.player = auth.Obj;
    gameState.balance = Number(auth.Obj.score || 0);
    gameState.playerName = auth.Obj.nickname || `Player ${auth.Obj.id}`;
    bridge("setUser", {
      extUserId: auth.Obj.externalUserId,
      nickname: auth.Obj.nickname,
      balance: gameState.balance
    });
    updateHud();

    setStatus("Opening FishStar polling socket.");
    gameState.protocol = new FishStarProtocol();
    gameState.protocol.addEventListener("loginGameResult", () => {
      setStatus("FishStar online. Choose bet and fire.");
      showNotice("Ready", "FishStar online", 1100);
      setReady();
      postToHost("pinata.ready", { gameId: auth.Obj.gameId || null });
    });
    gameState.protocol.addEventListener("lotteryResult", (event) => handleLottery(event.detail));
    gameState.protocol.addEventListener("historyResult", (event) => handleHistory(event.detail));
    gameState.protocol.addEventListener("syncBalanceResult", (event) => handleSync(event.detail));
    gameState.protocol.addEventListener("error", (event) => setError(event.detail));
    await gameState.protocol.connect(auth.Obj);
  } catch (error) {
    setError(error);
  }
}

boot();
