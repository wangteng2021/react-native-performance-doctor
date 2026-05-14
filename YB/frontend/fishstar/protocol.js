function parseEnginePayload(text) {
  const packets = [];
  let cursor = 0;

  while (cursor < text.length) {
    let lengthText = "";
    while (cursor < text.length && text[cursor] !== ":") {
      if (!/[0-9]/.test(text[cursor])) break;
      lengthText += text[cursor];
      cursor += 1;
    }

    if (lengthText && text[cursor] === ":") {
      cursor += 1;
      const length = Number(lengthText);
      packets.push(text.slice(cursor, cursor + length));
      cursor += length;
      continue;
    }

    packets.push(text.slice(cursor));
    break;
  }

  return packets.filter(Boolean);
}

function encodeEnginePayload(packets) {
  return packets.map((packet) => `${packet.length}:${packet}`).join("");
}

function parseSocketPacket(packet) {
  if (packet === "2") return { type: "ping" };
  if (packet === "3") return { type: "pong" };
  if (packet === "40") return { type: "namespace" };
  if (!packet.startsWith("42")) return null;

  try {
    const data = JSON.parse(packet.slice(2));
    return { type: "event", event: data[0], payload: data[1] };
  } catch (error) {
    return null;
  }
}

export async function authLogin() {
  const response = await fetch("/authLogin", {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  if (!response.ok) throw new Error(`authLogin failed: ${response.status}`);
  const data = await response.json();
  if (!data || data.resultid !== 1 || !data.Obj) throw new Error("authLogin returned an invalid launch payload");
  return data;
}

export class FishStarProtocol extends EventTarget {
  constructor() {
    super();
    this.sid = null;
    this.closed = false;
    this.polling = false;
    this.pingTimer = 0;
    this.player = null;
    this.gameId = null;
  }

  async connect(player) {
    this.player = player;
    this.gameId = player.gameId || null;
    const openText = await this.fetchText("/socket.io/?EIO=4&transport=polling", { method: "GET" });
    const openPacket = parseEnginePayload(openText).find((packet) => packet.startsWith("0"));
    if (!openPacket) throw new Error("Socket.IO polling session did not open");

    const openData = JSON.parse(openPacket.slice(1));
    this.sid = openData.sid;
    await this.postPackets(["40"]);
    this.startPing(openData.pingInterval || 25000);
    await this.login(player);
    this.poll();
  }

  async login(player) {
    return this.emitEvent("LoginGame", {
      code: player.code || player.account || "",
      gameId: player.gameId || 1,
      phoneType: "web",
      userid: player.id
    });
  }

  async fire(bet) {
    const totalBet = Number(bet);
    return this.emitEvent("lottery", {
      nBetList: [totalBet, 1],
      bet: totalBet,
      code: this.player && (this.player.code || this.player.account) || ""
    });
  }

  async syncBalance() {
    return this.emitEvent("syncBalance", {});
  }

  async history() {
    return this.emitEvent("history", {});
  }

  close() {
    this.closed = true;
    window.clearInterval(this.pingTimer);
  }

  async emitEvent(event, payload) {
    if (!this.sid) throw new Error("Socket.IO polling session is not connected");
    await this.postPackets([`42${JSON.stringify([event, payload])}`]);
  }

  async postPackets(packets) {
    await this.fetchText(this.socketUrl(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: encodeEnginePayload(packets)
    });
  }

  async poll() {
    if (this.closed || this.polling || !this.sid) return;
    this.polling = true;

    try {
      const text = await this.fetchText(this.socketUrl(), { method: "GET" });
      parseEnginePayload(text).forEach((packet) => this.handlePacket(packet));
    } catch (error) {
      if (!this.closed) this.dispatch("error", { message: error.message });
    } finally {
      this.polling = false;
      if (!this.closed) window.setTimeout(() => this.poll(), 90);
    }
  }

  handlePacket(packet) {
    const parsed = parseSocketPacket(packet);
    if (!parsed) return;
    if (parsed.type === "ping") {
      this.postPackets(["3"]).catch((error) => this.dispatch("error", { message: error.message }));
      return;
    }
    if (parsed.type === "event") this.dispatch(parsed.event, parsed.payload);
  }

  startPing(interval) {
    window.clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => {
      if (!this.closed && this.sid) this.postPackets(["2"]).catch(() => {});
    }, Math.max(8000, interval - 2500));
  }

  socketUrl() {
    return `/socket.io/?EIO=4&transport=polling&sid=${encodeURIComponent(this.sid)}`;
  }

  async fetchText(url, options) {
    const response = await fetch(url, { credentials: "include", cache: "no-store", ...options });
    if (!response.ok) throw new Error(`Polling request failed: ${response.status}`);
    return response.text();
  }

  dispatch(event, detail) {
    this.dispatchEvent(new CustomEvent(event, { detail }));
  }
}

export function normalizeResult(payload) {
  const data = payload && payload.ResultData ? payload.ResultData : {};
  const win = Number(data.winscore || 0);
  const bet = Number(data.totalBet || 0);
  return {
    id: data.id || "--",
    balance: Number(data.userscore || 0),
    win,
    bet,
    freeCount: Number(data.freeCount || 0),
    multiplier: bet > 0 ? win / bet : 0,
    threshold: Number(data.bigWinMultiplier || 20),
    strategy: data.strategy || "random",
    betTier: data.betTier || null,
    gameId: data.gameId || null,
    viewarray: Array.isArray(data.viewarray) ? data.viewarray : []
  };
}
