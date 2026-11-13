(function () {
  "use strict";

  var PRIMARY_URL = "https://open.er-api.com/v6/latest/HKD";
  var FALLBACK_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/hkd.min.json";
  var RATES_KEY = "hkd-usd-kzt.rates";
  var AMOUNT_KEY = "hkd-usd-kzt.amount";
  var CURRENCIES = ["HKD", "USD", "KZT"];
  var SOURCES = {
    primary: "ExchangeRate-API",
    fallback: "fawazahmed0 currency-api",
  };

  var state = {
    quote: null,
    origin: "empty",
    phase: "loading",
    active: "HKD",
    raw: "",
  };
  var requestId = 0;

  var statusEl = document.getElementById("status");
  var ratesEl = document.getElementById("rates");
  var sourceEl = document.getElementById("source");
  var refreshButton = document.getElementById("refresh");
  var inputs = {
    HKD: document.getElementById("amount-hkd"),
    USD: document.getElementById("amount-usd"),
    KZT: document.getElementById("amount-kzt"),
  };

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      /* Private mode and full storage still leave the current view usable. */
    }
  }

  function parseAmount(raw) {
    var cleaned = String(raw).replace(/[\s,]/g, "");
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
    var amount = Number(cleaned);
    if (!Number.isFinite(amount) || Math.abs(amount) >= 1e12) return null;
    return amount;
  }

  function formatAmount(amount) {
    var abs = Math.abs(amount);
    var maxDigits = 2;
    if (abs > 0 && abs < 0.01) maxDigits = 6;
    else if (abs > 0 && abs < 1) maxDigits = 4;
    return amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: maxDigits,
    });
  }

  function formatRate(amount) {
    return amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  }

  function formatTimestamp(iso) {
    var date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    var formatted = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Hong_Kong",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
    return formatted + " Hong Kong time";
  }

  function formatRateDate(isoDate) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || "");
    if (!match) return "";
    var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  function whenLabel(quote) {
    if (quote.asOf) {
      var timestamp = formatTimestamp(quote.asOf);
      if (timestamp) return timestamp;
    }
    if (quote.asOfDate) {
      var rateDate = formatRateDate(quote.asOfDate);
      if (rateDate) return "rate date " + rateDate;
    }
    return "";
  }

  function isQuote(value) {
    if (!value || typeof value !== "object") return false;
    if (!(Number(value.usdPerHkd) > 0) || !(Number(value.kztPerHkd) > 0)) return false;
    if (value.source !== SOURCES.primary && value.source !== SOURCES.fallback) return false;
    if (value.asOf && formatTimestamp(value.asOf)) return true;
    if (value.asOfDate && formatRateDate(value.asOfDate)) return true;
    return false;
  }

  function loadQuote() {
    var raw = storageGet(RATES_KEY);
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      return isQuote(parsed) ? parsed : null;
    } catch (err) {
      return null;
    }
  }

  function saveQuote(quote) {
    storageSet(RATES_KEY, JSON.stringify(quote));
  }

  function loadAmount() {
    var raw = storageGet(AMOUNT_KEY);
    if (!raw) return;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || CURRENCIES.indexOf(parsed.currency) === -1) return;
      if (typeof parsed.raw !== "string") return;
      state.active = parsed.currency;
      state.raw = parsed.raw;
      inputs[state.active].value = parsed.raw;
    } catch (err) {
      /* Ignore a damaged saved amount. */
    }
  }

  function saveAmount() {
    storageSet(AMOUNT_KEY, JSON.stringify({
      currency: state.active,
      raw: state.raw,
    }));
  }

  function convert(amount, from, to, quote) {
    if (from === to) return amount;
    var inHkd = amount;
    if (from === "USD") inHkd = amount / quote.usdPerHkd;
    if (from === "KZT") inHkd = amount / quote.kztPerHkd;
    if (to === "HKD") return inHkd;
    if (to === "USD") return inHkd * quote.usdPerHkd;
    return inHkd * quote.kztPerHkd;
  }

  function renderAmounts() {
    CURRENCIES.forEach(function (currency) {
      var input = inputs[currency];
      if (currency === state.active) return;
      if (!state.quote) {
        input.value = "";
        return;
      }
      var amount = parseAmount(state.raw);
      input.value = amount === null ? "" : formatAmount(convert(amount, state.active, currency, state.quote));
    });
  }

  function renderStatus() {
    var when = state.quote ? whenLabel(state.quote) : "";
    statusEl.className = "status";
    if (state.phase === "loading" && !state.quote) {
      statusEl.textContent = "Fetching live rates…";
      statusEl.classList.add("is-loading");
    } else if (state.origin === "live") {
      statusEl.textContent = when ? "Live mid-market rates · " + when : "Live mid-market rates";
      statusEl.classList.add("is-live");
    } else if (state.origin === "cached") {
      var cached = when ? "Cached rates · " + when : "Cached rates";
      statusEl.textContent = state.phase === "failed"
        ? cached + ". A fresh fetch did not succeed."
        : cached;
      statusEl.classList.add("is-cached");
    } else {
      statusEl.textContent = "Rates are unavailable. Check your connection and tap Refresh rates.";
      statusEl.classList.add("is-error");
    }

    ratesEl.replaceChildren();
    if (state.quote) {
      [
        "1 HKD = " + formatRate(state.quote.usdPerHkd) + " USD",
        "1 HKD = " + formatRate(state.quote.kztPerHkd) + " KZT",
        "1 USD = " + formatRate(state.quote.kztPerHkd / state.quote.usdPerHkd) + " KZT",
      ].forEach(function (line) {
        var item = document.createElement("li");
        item.textContent = line;
        ratesEl.appendChild(item);
      });
    }

    if (!state.quote) {
      sourceEl.textContent = "";
    } else if (state.origin === "cached") {
      sourceEl.textContent = "Source: " + state.quote.source + " · saved on this device";
    } else {
      sourceEl.textContent = "Source: " + state.quote.source;
    }
  }

  function render() {
    renderAmounts();
    renderStatus();
  }

  function onInput(currency) {
    state.active = currency;
    state.raw = inputs[currency].value;
    saveAmount();
    renderAmounts();
  }

  function onBlur(currency) {
    if (state.active !== currency) return;
    var amount = parseAmount(inputs[currency].value);
    if (amount === null) return;
    inputs[currency].value = formatAmount(amount);
    state.raw = inputs[currency].value;
    saveAmount();
  }

  async function getJson(url) {
    var response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  }

  function parsePrimary(data) {
    if (!data || data.result !== "success" || !data.rates) {
      throw new Error("ExchangeRate-API did not return rates");
    }
    var usd = Number(data.rates.USD);
    var kzt = Number(data.rates.KZT);
    if (!(usd > 0) || !(kzt > 0)) throw new Error("ExchangeRate-API rates were incomplete");
    var unix = Number(data.time_last_update_unix);
    var asOf = Number.isFinite(unix) && unix > 0
      ? new Date(unix * 1000).toISOString()
      : "";
    if (!asOf && typeof data.time_last_update_utc === "string") {
      var parsed = new Date(data.time_last_update_utc);
      if (!Number.isNaN(parsed.getTime())) asOf = parsed.toISOString();
    }
    if (!formatTimestamp(asOf)) throw new Error("ExchangeRate-API timestamp was missing");
    return {
      usdPerHkd: usd,
      kztPerHkd: kzt,
      asOf: asOf,
      asOfDate: "",
      source: SOURCES.primary,
    };
  }

  function parseFallback(data) {
    var table = data && data.hkd;
    var usd = Number(table && table.usd);
    var kzt = Number(table && table.kzt);
    if (!(usd > 0) || !(kzt > 0)) throw new Error("Fallback rates were incomplete");
    var asOfDate = typeof data.date === "string" ? data.date : "";
    if (!formatRateDate(asOfDate)) throw new Error("Fallback rate date was missing");
    return {
      usdPerHkd: usd,
      kztPerHkd: kzt,
      asOf: "",
      asOfDate: asOfDate,
      source: SOURCES.fallback,
    };
  }

  async function fetchQuote() {
    try {
      return parsePrimary(await getJson(PRIMARY_URL));
    } catch (primaryError) {
      return parseFallback(await getJson(FALLBACK_URL));
    }
  }

  async function refresh() {
    var id = ++requestId;
    refreshButton.disabled = true;
    state.phase = "loading";
    renderStatus();
    try {
      var quote = await fetchQuote();
      if (id !== requestId) return;
      state.quote = quote;
      state.origin = "live";
      state.phase = "ready";
      saveQuote(quote);
    } catch (err) {
      if (id !== requestId) return;
      var cached = loadQuote();
      if (cached) {
        state.quote = cached;
        state.origin = "cached";
        state.phase = "failed";
      } else {
        state.quote = null;
        state.origin = "empty";
        state.phase = "failed";
      }
    } finally {
      if (id === requestId) {
        refreshButton.disabled = false;
        render();
      }
    }
  }

  CURRENCIES.forEach(function (currency) {
    inputs[currency].addEventListener("input", function () {
      onInput(currency);
    });
    inputs[currency].addEventListener("blur", function () {
      onBlur(currency);
    });
  });
  refreshButton.addEventListener("click", function () {
    refresh();
  });

  var saved = loadQuote();
  if (saved) {
    state.quote = saved;
    state.origin = "cached";
    state.phase = "loading";
  }
  loadAmount();
  render();
  refresh();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {
        /* The converter still works when the service worker cannot install. */
      });
    });
  }
})();
