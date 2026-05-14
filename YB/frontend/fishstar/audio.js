import { audioState, on } from "./bridge.js";
import { originalAssets } from "./assets.js";

class FishingAudio {
  constructor() {
    this.state = audioState();
    this.remote = new Map();
    this.music = null;
    this.prepared = false;
    on("audio", (nextState) => {
      this.state = nextState;
      this.applyVolume();
    });
  }

  unlock() {
    if (!this.prepared) this.prepareRemoteAudio();
    if (this.music && this.state.audible && this.music.paused) {
      const played = this.music.play();
      if (played && typeof played.catch === "function") played.catch(() => {});
    }
  }

  applyVolume() {
    this.remote.forEach((sample) => {
      sample.muted = !this.state.audible;
      sample.volume = this.state.volume;
    });
    if (this.music) {
      this.music.muted = !this.state.audible;
      this.music.volume = Math.min(0.42, this.state.volume * 0.42);
    }
  }

  shot() {
    this.unlock();
    this.playRemote("shot");
  }

  hit() {
    this.unlock();
    this.playRemote("hit");
  }

  win() {
    this.unlock();
    this.playRemote("coin");
  }

  miss() {
    this.unlock();
    this.playRemote("miss");
  }

  button() {
    this.unlock();
    this.playRemote("button");
  }

  prepareRemoteAudio() {
    Object.entries(originalAssets.audio).forEach(([name, url]) => {
      const sample = new Audio(url);
      sample.preload = "auto";
      sample.volume = name === "music" ? Math.min(0.42, this.state.volume * 0.42) : this.state.volume;
      sample.muted = !this.state.audible;
      if (name === "music") {
        sample.loop = true;
        this.music = sample;
      } else {
        this.remote.set(name, sample);
      }
    });
    this.prepared = true;
  }

  playRemote(name) {
    const sample = this.remote.get(name);
    if (!sample || !this.state.audible) return false;

    try {
      const instance = sample.cloneNode(true);
      instance.volume = sample.volume;
      instance.muted = sample.muted;
      const played = instance.play();
      if (played && typeof played.catch === "function") played.catch(() => {});
      return true;
    } catch (error) {
      return false;
    }
  }
}

export const fishingAudio = new FishingAudio();
