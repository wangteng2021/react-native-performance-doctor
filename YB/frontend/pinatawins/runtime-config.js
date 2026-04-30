(function () {
  var defaults = {
    bigWinMultiplier: 20,
    rtpTarget: 0.92
  };

  window.__PINATA_CONFIG__ = window.__PINATA_CONFIG__ || defaults;

  try {
    var request = new XMLHttpRequest();
    request.open('GET', '/api/strategy', false);
    request.send();
    if (request.status === 200 && request.responseText) {
      window.__PINATA_CONFIG__ = Object.assign({}, defaults, JSON.parse(request.responseText));
    }
  } catch (error) {
    window.__PINATA_CONFIG__ = defaults;
  }

  window.PinataRuntimeConfig = {
    getBigWinMultiplier: function () {
      var value = Number(window.__PINATA_CONFIG__ && window.__PINATA_CONFIG__.bigWinMultiplier);
      return Number.isFinite(value) && value > 0 ? value : defaults.bigWinMultiplier;
    }
  };
})();
