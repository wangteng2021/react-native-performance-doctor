(function () {
  var overlay;
  var amountNode;
  var hideTimer;
  var impactTimer;
  var lastAmount = 0;
  var audioContext;

  function formatAmount(value) {
    return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('en-US').replace(/,/g, '');
  }

  function createCoin(index) {
    var coin = document.createElement('i');
    coin.className = 'pinata-win-coin';
    coin.style.setProperty('--x', String((index * 17 + 9) % 100));
    coin.style.setProperty('--s', (18 + (index % 5) * 7) + 'px');
    coin.style.setProperty('--d', (2.1 + (index % 6) * 0.34).toFixed(2) + 's');
    coin.style.setProperty('--delay', ((index % 10) * -0.23).toFixed(2) + 's');
    coin.style.setProperty('--drift', (((index % 7) - 3) * 18) + 'px');
    return coin;
  }

  function createBill(index) {
    var bill = document.createElement('i');
    bill.className = 'pinata-win-bill';
    bill.style.setProperty('--x', String([12, 74, 20, 67, 42, 82][index % 6]));
    bill.style.setProperty('--y', String([47, 54, 61, 36, 70, 43][index % 6]));
    bill.style.setProperty('--w', (56 + (index % 3) * 14) + 'px');
    bill.style.setProperty('--r', ([-22, 18, -10, 28, 8, -34][index % 6]) + 'deg');
    bill.style.setProperty('--delay', (0.18 + index * 0.13).toFixed(2) + 's');
    return bill;
  }

  function createCandy(index) {
    var candy = document.createElement('i');
    var colors = [
      ['#ff347d', '#ffd34c'],
      ['#20d980', '#2ecbff'],
      ['#a35cff', '#ff61ca'],
      ['#ff8d22', '#fff05a']
    ];
    var color = colors[index % colors.length];
    candy.className = 'pinata-win-candy';
    candy.style.setProperty('--w', (22 + (index % 4) * 6) + 'px');
    candy.style.setProperty('--tx', (((index * 53) % 360) - 180) + 'px');
    candy.style.setProperty('--ty', (((index * 31) % 220) - 130) + 'px');
    candy.style.setProperty('--r', (((index * 47) % 140) - 70) + 'deg');
    candy.style.setProperty('--delay', (0.03 + (index % 6) * 0.025).toFixed(3) + 's');
    candy.style.setProperty('--c1', color[0]);
    candy.style.setProperty('--c2', color[1]);
    return candy;
  }

  function ensureOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'pinata-win-overlay';
    overlay.innerHTML = '' +
      '<div class="pinata-win-rays"></div>' +
      '<div class="pinata-win-impact-flash"></div>' +
      '<div class="pinata-win-impact-ring"></div>' +
      '<div class="pinata-win-shock-dust"></div>' +
      '<div class="pinata-win-smash-pinata"><i class="pinata-win-pinata-eye"></i><i class="pinata-win-pinata-mouth"></i></div>' +
      '<div class="pinata-win-candies"></div>' +
      '<div class="pinata-win-coins"></div>' +
      '<div class="pinata-win-bills"></div>' +
      '<section class="pinata-win-stage">' +
        '<div class="pinata-win-burst"></div>' +
        '<h2 class="pinata-win-title"><span class="super">SUPER</span><span>MEGA WIN</span></h2>' +
        '<div class="pinata-win-amount">0</div>' +
        '<div class="pinata-win-total">TOTAL WIN</div>' +
      '</section>';

    var coins = overlay.querySelector('.pinata-win-coins');
    for (var i = 0; i < 42; i += 1) {
      coins.appendChild(createCoin(i));
    }

    var bills = overlay.querySelector('.pinata-win-bills');
    for (var j = 0; j < 8; j += 1) {
      bills.appendChild(createBill(j));
    }

    var candies = overlay.querySelector('.pinata-win-candies');
    for (var k = 0; k < 24; k += 1) {
      candies.appendChild(createCandy(k));
    }

    amountNode = overlay.querySelector('.pinata-win-amount');
    document.body.appendChild(overlay);
    return overlay;
  }

  function getAudioContext() {
    var AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    if (!audioContext) audioContext = new AudioCtor();
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(function () {});
    }
    return audioContext;
  }

  function scheduleGain(gain, now, points) {
    gain.gain.cancelScheduledValues(now);
    points.forEach(function (point, index) {
      var method = index === 0 ? 'setValueAtTime' : 'exponentialRampToValueAtTime';
      gain.gain[method](Math.max(point[1], 0.0001), now + point[0]);
    });
  }

  function playImpactSound() {
    var ctx = getAudioContext();
    if (!ctx) return;
    var now = ctx.currentTime;
    var master = ctx.createGain();
    master.gain.setValueAtTime(0.78, now);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);
    master.connect(ctx.destination);

    var sub = ctx.createOscillator();
    var subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(112, now);
    sub.frequency.exponentialRampToValueAtTime(36, now + 0.42);
    scheduleGain(subGain, now, [[0, 0.0001], [0.012, 1.0], [0.18, 0.55], [0.9, 0.0001]]);
    sub.connect(subGain);
    subGain.connect(master);
    sub.start(now);
    sub.stop(now + 0.92);

    var thump = ctx.createOscillator();
    var thumpGain = ctx.createGain();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(185, now);
    thump.frequency.exponentialRampToValueAtTime(54, now + 0.24);
    scheduleGain(thumpGain, now, [[0, 0.0001], [0.006, 0.88], [0.09, 0.32], [0.42, 0.0001]]);
    thump.connect(thumpGain);
    thumpGain.connect(master);
    thump.start(now);
    thump.stop(now + 0.46);

    var noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.28), ctx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.3);
    }
    var noise = ctx.createBufferSource();
    var noiseFilter = ctx.createBiquadFilter();
    var noiseGain = ctx.createGain();
    noise.buffer = noiseBuffer;
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(1650, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(420, now + 0.22);
    scheduleGain(noiseGain, now, [[0, 0.0001], [0.004, 0.42], [0.24, 0.0001]]);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);
    noise.start(now);
    noise.stop(now + 0.3);

    var sparkle = ctx.createOscillator();
    var sparkleGain = ctx.createGain();
    sparkle.type = 'square';
    sparkle.frequency.setValueAtTime(920, now + 0.045);
    sparkle.frequency.exponentialRampToValueAtTime(1840, now + 0.18);
    scheduleGain(sparkleGain, now, [[0.045, 0.0001], [0.065, 0.16], [0.3, 0.0001]]);
    sparkle.connect(sparkleGain);
    sparkleGain.connect(master);
    sparkle.start(now + 0.045);
    sparkle.stop(now + 0.32);
  }

  function triggerImpact() {
    if (!overlay) return;
    overlay.classList.remove('is-impacting');
    void overlay.offsetWidth;
    overlay.classList.add('is-impacting');
    playImpactSound();
    window.setTimeout(function () {
      if (overlay) overlay.classList.remove('is-impacting');
    }, 760);
  }

  function countTo(value) {
    var target = Math.max(0, Number(value) || 0);
    var start = Math.max(0, Math.min(lastAmount, target * 0.25));
    var startedAt = performance.now();
    var duration = 3800;

    function tick(now) {
      var progress = Math.min(1, (now - startedAt) / duration);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = start + (target - start) * eased;
      amountNode.textContent = formatAmount(current);
      if (progress < 1 && overlay.classList.contains('is-active')) {
        requestAnimationFrame(tick);
      } else {
        amountNode.textContent = formatAmount(target);
      }
    }

    requestAnimationFrame(tick);
    lastAmount = target;
  }

  function show(amount) {
    var value = Number(amount) || 0;
    if (value <= 0) return;
    ensureOverlay();
    window.clearTimeout(hideTimer);
    window.clearTimeout(impactTimer);
    overlay.classList.remove('is-active');
    overlay.classList.remove('is-impacting');
    void overlay.offsetWidth;
    amountNode.textContent = '0';
    overlay.classList.add('is-active');
    impactTimer = window.setTimeout(triggerImpact, 650);
    countTo(value);
    hideTimer = window.setTimeout(function () {
      overlay.classList.remove('is-active');
    }, 5850);
  }

  function decodeResponse(xhr) {
    try {
      if (xhr.responseType === 'arraybuffer') {
        return new TextDecoder('utf-8').decode(new Uint8Array(xhr.response || new ArrayBuffer(0)));
      }
      if (!xhr.responseType || xhr.responseType === 'text') {
        return String(xhr.responseText || xhr.response || '');
      }
    } catch (error) {}
    return '';
  }

  function extractSocketEvents(text) {
    var events = [];
    var cursor = 0;
    while (cursor < text.length) {
      var marker = text.indexOf('42[', cursor);
      if (marker === -1) break;
      var start = marker + 2;
      var depth = 0;
      var inString = false;
      var escaped = false;

      for (var i = start; i < text.length; i += 1) {
        var ch = text[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') inString = true;
        else if (ch === '[') depth += 1;
        else if (ch === ']') {
          depth -= 1;
          if (depth === 0) {
            try {
              events.push(JSON.parse(text.slice(start, i + 1)));
            } catch (error) {}
            cursor = i + 1;
            break;
          }
        }
      }
      if (cursor <= marker) break;
    }
    return events;
  }

  function maybeShowFromSocket(xhr) {
    var text = decodeResponse(xhr);
    if (!text || text.indexOf('lotteryResult') === -1) return;
    extractSocketEvents(text).forEach(function (event) {
      if (!event || event[0] !== 'lotteryResult') return;
      var payload = event[1] || {};
      var result = payload.ResultData || payload.resultData || {};
      var win = Number(result.winscore || result.winScore || result.win || 0);
      if (win > 0) {
        window.setTimeout(function () { show(win); }, 900);
      }
    });
  }

  function installSocketHook() {
    if (XMLHttpRequest.prototype.__pinataWinHooked) return;
    XMLHttpRequest.prototype.__pinataWinHooked = true;
    var originalOpen = XMLHttpRequest.prototype.open;
    var originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__pinataWinUrl = String(url || '');
      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      this.addEventListener('loadend', function () {
        if (this.__pinataWinUrl && this.__pinataWinUrl.indexOf('/socket.io/') !== -1) {
          maybeShowFromSocket(this);
        }
      });
      return originalSend.apply(this, arguments);
    };
  }

  window.PinataWinEffect = { show: show };
  if (new URLSearchParams(window.location.search).get('socketWinFx') === '1') {
    installSocketHook();
  }

  if (new URLSearchParams(window.location.search).get('testWin') === '1') {
    window.setTimeout(function () { show(42500); }, 1200);
  }
})();
