const boardElement = document.querySelector("#board");
const balanceElement = document.querySelector("#balance");
const lastWinElement = document.querySelector("#lastWin");
const lineWinElement = document.querySelector("#lineWin");
const scatterWinElement = document.querySelector("#scatterWin");
const multiplierElement = document.querySelector("#multiplier");
const freeSpinsElement = document.querySelector("#freeSpins");
const betSelect = document.querySelector("#betSelect");
const spinButton = document.querySelector("#spinButton");
const decreaseBetButton = document.querySelector("#decreaseBet");
const increaseBetButton = document.querySelector("#increaseBet");
const resetButton = document.querySelector("#resetButton");
const turboButton = document.querySelector("#turboButton");
const autoButton = document.querySelector("#autoButton");
const winTickerElement = document.querySelector("#winTicker");
const paytableElement = document.querySelector("#paytable");
const rulesElement = document.querySelector("#rules");
const roundIdElement = document.querySelector("#roundId");

let config;
let balance = 1200;
let freeSpinsRemaining = 0;
let turboEnabled = false;
let spinning = false;
let autoSpinsRemaining = 0;
let assetManifest = {};

function formatCoins(value) {
  return Number(value).toLocaleString("en-US");
}

function symbolSvg(asset) {
  const licensedAsset = assetManifest[asset];
  if (licensedAsset) {
    return `<img class="symbol-image" src="${licensedAsset}" alt="" loading="eager" />`;
  }

  return `
    <svg aria-hidden="true" focusable="false">
      <use href="./assets/symbols.svg#symbol-${asset}"></use>
    </svg>
  `;
}

async function loadAssetManifest() {
  try {
    const response = await fetch("./assets/asset-manifest.json", { cache: "no-store" });
    if (!response.ok) {
      return {};
    }
    const manifest = await response.json();
    return Object.fromEntries(
      Object.entries(manifest).filter(([, value]) => typeof value === "string" && value.trim())
    );
  } catch {
    return {};
  }
}

function winningPositionSet(wins = []) {
  const positions = new Set();
  wins.forEach((win) => {
    (win.positions || []).forEach((position) => {
      positions.add(`${position.row}:${position.reel}`);
    });
  });
  return positions;
}

function renderBoard(board, wins = []) {
  const winners = winningPositionSet(wins);
  boardElement.innerHTML = "";

  board.forEach((row, rowIndex) => {
    row.forEach((symbol, reelIndex) => {
      const cell = document.createElement("div");
      const isWin = winners.has(`${rowIndex}:${reelIndex}`);
      cell.className = [
        "symbol",
        symbol.tier,
        symbol.goldFrame ? "gold" : "",
        isWin ? "win" : ""
      ].filter(Boolean).join(" ");
      cell.title = symbol.label;
      cell.innerHTML = `
        ${symbolSvg(symbol.asset)}
        ${symbol.multiplier ? `<span class="gold-badge">x${symbol.multiplier}</span>` : ""}
      `;
      boardElement.appendChild(cell);
    });
  });
}

function renderPaytable() {
  paytableElement.innerHTML = config.symbols
    .map((symbol) => {
      const payouts = Object.entries(symbol.payouts || {})
        .map(([count, payout]) => `${count}: ${payout}x`)
        .join(" · ") || symbol.role.toUpperCase();
      return `
        <div class="pay-row">
          ${symbolSvg(symbol.asset)}
          <span class="pay-name">${symbol.label}</span>
          <strong class="pay-value">${payouts}</strong>
        </div>
      `;
    })
    .join("");
}

function updateMeters(result = {}) {
  balanceElement.textContent = formatCoins(balance);
  freeSpinsElement.textContent = freeSpinsRemaining;
  lastWinElement.textContent = formatCoins(result.totalWin || 0);
  lineWinElement.textContent = formatCoins(result.baseLineWin || 0);
  scatterWinElement.textContent = formatCoins(result.scatterWin || 0);
  multiplierElement.textContent = `${result.multiplierApplied || 1}x`;
}

function renderConfig(nextConfig) {
  config = nextConfig;
  balance = config.defaultBalance;
  betSelect.innerHTML = config.bets
    .map((bet) => `<option value="${bet}">${bet}</option>`)
    .join("");
  betSelect.value = String(config.bets[1] || config.bets[0]);

  renderPaytable();
  rulesElement.innerHTML = config.rules.map((rule) => `<li>${rule}</li>`).join("");

  const starterBoard = Array.from({ length: config.rows }, (_, rowIndex) =>
    Array.from({ length: config.reels }, (_, reelIndex) =>
      config.symbols[(rowIndex * config.reels + reelIndex) % config.symbols.length]
    )
  );
  renderBoard(starterBoard);
  updateMeters();
  winTickerElement.textContent = "Gold frames, scatters, wilds — ready to spin.";
}

async function loadGame() {
  assetManifest = await loadAssetManifest();

  if (assetManifest.background) {
    document.body.style.setProperty("--licensed-bg", `url(${assetManifest.background})`);
    document.body.classList.add("has-licensed-bg");
  }

  const response = await fetch("/api/game");
  if (!response.ok) {
    throw new Error("Unable to load game config");
  }
  renderConfig(await response.json());
}

function setControlsDisabled(disabled) {
  spinning = disabled;
  spinButton.disabled = disabled;
  decreaseBetButton.disabled = disabled;
  increaseBetButton.disabled = disabled;
  betSelect.disabled = disabled;
  autoButton.disabled = disabled && autoSpinsRemaining === 0;
}

function describeResult(result) {
  if (result.freeSpinsAwarded > 0) {
    return `FREE SPINS! ${result.freeSpinsAwarded} spins awarded · win ${formatCoins(result.totalWin)}.`;
  }

  if (result.totalWin > 0 && result.collectedMultipliers.length > 0) {
    const values = result.collectedMultipliers.map((multiplier) => `x${multiplier.value}`).join(" + ");
    return `Gold multiplier ${values} = x${result.multiplierApplied}. Total win ${formatCoins(result.totalWin)}.`;
  }

  if (result.totalWin > 0) {
    return `${result.wins.length} winning hit${result.wins.length > 1 ? "s" : ""}! Total win ${formatCoins(result.totalWin)}.`;
  }

  return result.freeSpin ? "Free spin landed no win. Keep the fiesta going." : "No win. Watch reels 2–4 for gold frames.";
}

async function spin() {
  if (spinning || !config) {
    return;
  }

  const freeSpin = freeSpinsRemaining > 0;
  if (freeSpin) {
    freeSpinsRemaining -= 1;
  }

  setControlsDisabled(true);
  updateMeters();
  winTickerElement.textContent = freeSpin ? "Free spin in progress…" : "Reels are rolling…";
  boardElement.querySelectorAll(".symbol").forEach((cell) => cell.classList.add("spinning"));

  const response = await fetch("/api/spin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bet: Number(betSelect.value), balance, freeSpin })
  });
  const result = await response.json();

  await new Promise((resolve) => setTimeout(resolve, turboEnabled ? 160 : 680));

  if (!result.accepted) {
    if (freeSpin) {
      freeSpinsRemaining += 1;
    }
    winTickerElement.textContent = result.reason;
    setControlsDisabled(false);
    updateMeters();
    return;
  }

  balance = result.balance;
  freeSpinsRemaining += result.freeSpinsAwarded || 0;
  roundIdElement.textContent = result.roundId;
  renderBoard(result.board, result.wins);
  updateMeters(result);
  winTickerElement.textContent = describeResult(result);
  setControlsDisabled(false);
}

function changeBet(direction) {
  const currentIndex = config.bets.indexOf(Number(betSelect.value));
  const nextIndex = Math.max(0, Math.min(config.bets.length - 1, currentIndex + direction));
  betSelect.value = String(config.bets[nextIndex]);
}

async function runAutoSpins() {
  if (spinning) {
    return;
  }

  autoSpinsRemaining = 5;
  autoButton.textContent = "Auto running";
  while (autoSpinsRemaining > 0) {
    await spin();
    autoSpinsRemaining -= 1;
    if (balance < Number(betSelect.value) && freeSpinsRemaining === 0) {
      break;
    }
  }
  autoSpinsRemaining = 0;
  autoButton.textContent = "Auto ×5";
}

decreaseBetButton.addEventListener("click", () => changeBet(-1));
increaseBetButton.addEventListener("click", () => changeBet(1));

turboButton.addEventListener("click", () => {
  turboEnabled = !turboEnabled;
  turboButton.textContent = turboEnabled ? "Turbo On" : "Turbo Off";
});

autoButton.addEventListener("click", () => {
  runAutoSpins().catch((error) => {
    winTickerElement.textContent = error.message;
    setControlsDisabled(false);
    autoSpinsRemaining = 0;
    autoButton.textContent = "Auto ×5";
  });
});

resetButton.addEventListener("click", () => {
  balance = config.defaultBalance;
  freeSpinsRemaining = 0;
  roundIdElement.textContent = "Ready";
  updateMeters();
  winTickerElement.textContent = "Balance and free spins reset.";
});

spinButton.addEventListener("click", () => {
  spin().catch((error) => {
    winTickerElement.textContent = error.message;
    setControlsDisabled(false);
  });
});

loadGame().catch((error) => {
  winTickerElement.textContent = error.message;
});
