const listeners = new Map();
let queue = [];

const bridgeState = {
  user: null,
  balance: null,
  language: "en",
  muted: false,
  sound: true,
  volume: 0.72,
  musicVolume: 1,
  effectsVolume: 1
};

function emitLocal(event, payload) {
  const callbacks = listeners.get(event);
  if (!callbacks) return;
  callbacks.forEach((callback) => callback(payload));
}

function sendAndroid(message) {
  const target = window.PinataGameAndroid;
  if (target && typeof target.postMessage === "function") {
    target.postMessage(JSON.stringify(message));
    return true;
  }
  return false;
}

function sendIos(message) {
  const handlers = window.webkit && window.webkit.messageHandlers;
  const target = handlers && handlers.PinataGame;
  if (target && typeof target.postMessage === "function") {
    target.postMessage(message);
    return true;
  }
  return false;
}

function sendUrlScheme(message) {
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = `pinatagame://${encodeURIComponent(message.event)}?payload=${encodeURIComponent(JSON.stringify(message.payload))}`;
  document.documentElement.appendChild(iframe);
  window.setTimeout(() => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }, 100);
  return true;
}

function dispatchBridgeEvent(name, detail) {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch (error) {
    // Old WebViews may not support CustomEvent construction.
  }
}

export function postToHost(event, payload = {}) {
  const message = { event: String(event || ""), payload: payload || {}, ts: Date.now() };
  try {
    const sent = sendIos(message) || sendAndroid(message) || sendUrlScheme(message);
    dispatchBridgeEvent("fishstar:host-event", message);
    return sent;
  } catch (error) {
    queue.push(message);
    return false;
  }
}

export function on(event, callback) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(callback);
  return () => off(event, callback);
}

export function off(event, callback) {
  if (!callback) {
    listeners.delete(event);
    return;
  }
  const callbacks = listeners.get(event);
  if (!callbacks) return;
  callbacks.delete(callback);
  if (!callbacks.size) listeners.delete(event);
}

export function getBridgeState() {
  return { ...bridgeState };
}

function applyAudioState() {
  const nextState = audioState();
  try {
    document.querySelectorAll("audio, video").forEach((element) => {
      element.muted = !nextState.audible;
      if (Number.isFinite(Number(element.volume))) element.volume = nextState.volume;
    });
  } catch (error) {
    // Non-DOM test environments can ignore media element updates.
  }
  window._pinataMuted = bridgeState.muted;
  window._pinataMusicVolume = bridgeState.musicVolume;
  window._pinataEffectsVolume = bridgeState.effectsVolume;
  dispatchBridgeEvent("pinata:audio-state", getAudioState());
  emitLocal("audio", nextState);
}

export function bridge(method, payload = {}) {
  const data = payload || {};

  if (method === "setUser") {
    bridgeState.user = { ...data };
    window._pinataUser = bridgeState.user;
    if (Number.isFinite(Number(data.balance))) bridgeState.balance = Number(data.balance);
    emitLocal("user", bridgeState.user);
    return { ok: true };
  }

  if (method === "setBalance") {
    bridgeState.balance = Number(data.balance);
    window._pinataBalance = data;
    const detail = { balance: bridgeState.balance };
    dispatchBridgeEvent("pinata:balance-set", detail);
    emitLocal("balance", detail);
    return { ok: true };
  }

  if (method === "setLanguage") {
    bridgeState.language = String(data.lang || data.language || "en");
    emitLocal("language", { language: bridgeState.language });
    return { ok: true };
  }

  if (method === "forceClose") {
    dispatchBridgeEvent("pinata:force-close", {});
    postToHost("pinata.close", { reason: "force-close-acked", gameId: data.gameId || null });
    emitLocal("close", { reason: "force-close-acked" });
    return { ok: true };
  }

  if (method === "setMute") {
    bridgeState.muted = Boolean(data.value ?? data.muted);
    applyAudioState();
    postToHost("pinata.audio.update", getAudioState());
    return { ok: true };
  }

  if (method === "setSound") {
    if (typeof data.on === "boolean") bridgeState.sound = data.on;
    else if (typeof data.enabled === "boolean") bridgeState.sound = data.enabled;
    else bridgeState.sound = Boolean(data.value ?? data.sound ?? true);
    applyAudioState();
    postToHost("pinata.audio.update", getAudioState());
    return { ok: true };
  }

  if (method === "setVolume") {
    const nextVolume = Number(data.value ?? data.volume);
    if (Number.isFinite(nextVolume)) bridgeState.volume = Math.max(0, Math.min(1, nextVolume));
    if (Number.isFinite(Number(data.music))) bridgeState.musicVolume = Math.max(0, Math.min(1, Number(data.music)));
    if (Number.isFinite(Number(data.effects))) bridgeState.effectsVolume = Math.max(0, Math.min(1, Number(data.effects)));
    applyAudioState();
    postToHost("pinata.audio.update", getAudioState());
    return { ok: true };
  }

  emitLocal(method, data);
  return { ok: true };
}

export function audioState() {
  return {
    muted: bridgeState.muted,
    sound: bridgeState.sound,
    volume: bridgeState.volume,
    audible: bridgeState.sound && !bridgeState.muted && bridgeState.volume > 0
  };
}

function getAudioState() {
  return {
    muted: bridgeState.muted,
    musicVolume: bridgeState.musicVolume,
    effectsVolume: bridgeState.effectsVolume,
    sound: bridgeState.sound,
    volume: bridgeState.volume
  };
}

function flushQueue() {
  const copy = queue.slice();
  queue = [];
  copy.forEach((message) => postToHost(message.event, message.payload));
}

window.PinataGame = Object.assign(window.PinataGame || {}, {
  _installed: true,
  bridge,
  postToHost,
  on,
  off,
  flushQueue,
  getState: getBridgeState,
  notifyReady(extra = {}) {
    postToHost("pinata.ready", extra);
  },
  notifyBalanceUpdate(balance, extra = {}) {
    postToHost("pinata.balance.update", { balance, ...extra });
  },
  notifyBigWin(info = {}) {
    postToHost("pinata.bigwin", info);
  },
  notifyClose(reason = "user-close") {
    postToHost("pinata.close", { reason });
  },
  notifyError(error) {
    postToHost("pinata.error", { message: String((error && error.message) || error) });
  },
  getAudioState,
  mute() {
    bridge("setMute", { muted: true });
  },
  unmute() {
    bridge("setMute", { muted: false });
  }
});

if (document.readyState === "complete" || document.readyState === "interactive") {
  window.setTimeout(() => window.PinataGame.notifyReady({ gameId: "fishstar" }), 50);
} else {
  window.addEventListener("DOMContentLoaded", () => window.PinataGame.notifyReady({ gameId: "fishstar" }));
}
