// Supabase values live in config.js (so this file can be replaced without touching your keys)
const CFG = window.IGOLD_CONFIG || {};
const REFRESH_MS = 60 * 1000;
const STALE_MIN = 20; // mark data stale after this many minutes
const TZ = "Africa/Cairo";

const $ = (id) => document.getElementById(id);
const nf = (n, d = 2) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

function authHeaders() {
  const k = CFG.key || "";
  return k.startsWith("eyJ") ? { apikey: k, Authorization: `Bearer ${k}` } : { apikey: k };
}

/* ---------- history helpers: points are [unix_ts, ounce, usd_egp, sell21] ---------- */
function baselinePoint(hist, nowTs) {
  if (!hist || hist.length < 2) return null;
  const target = nowTs - 24 * 3600;
  let best = null;
  for (const p of hist) if (p[0] <= target) best = p; // latest point at/before 24h ago
  if (best) return { p: best, full: true };
  const first = hist[0];
  const span = nowTs - first[0];
  if (span >= 20 * 3600) return { p: first, full: true }; // about a full day
  return span >= 1800 ? { p: first, full: false } : null; // need >= 30 min of data
}

function diff(cur, base) {
  if (base == null || !isFinite(base) || base === 0) return null;
  const d = cur - base;
  return { d, pct: (d / base) * 100 };
}

function setChange(el, ch) {
  if (!ch) { el.textContent = "—"; el.className = "chg"; return; }
  const up = ch.d >= 0;
  el.className = "chg " + (up ? "up" : "down");
  el.textContent = `${up ? "▲ +" : "▼ -"}${nf(Math.abs(ch.d))} (${nf(Math.abs(ch.pct))}%)`;
}

/* ---------- chart ---------- */
function hourLabel(ts) {
  return new Date(ts * 1000).toLocaleTimeString("en-US", { hour: "numeric", hour12: true, timeZone: TZ });
}

function drawChart(hist) {
  const svg = $("chart");
  const pts = (hist || []).filter((p) => p[3] > 0);
  if (pts.length < 2) {
    svg.innerHTML = ""; $("ticks").innerHTML = ""; $("chart-empty").hidden = false; return;
  }
  $("chart-empty").hidden = true;
  const W = 300, H = 80, pad = 6;
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
  let min = Math.min(...pts.map((p) => p[3])), max = Math.max(...pts.map((p) => p[3]));
  if (max - min < 1) { max += 0.5; min -= 0.5; }
  const x = (t) => pad + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * pad);
  const y = (v) => H - pad - ((v - min) / (max - min)) * (H - 2 * pad);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)} ${y(p[3]).toFixed(1)}`).join(" ");
  const area = `${line} L${x(t1).toFixed(1)} ${H} L${x(t0).toFixed(1)} ${H} Z`;
  const last = pts[pts.length - 1];
  svg.innerHTML =
    `<defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e0b43a" stop-opacity=".35"/>` +
    `<stop offset="1" stop-color="#e0b43a" stop-opacity="0"/></linearGradient></defs>` +
    `<path d="${area}" fill="url(#cg)"/><path d="${line}" fill="none" stroke="#e0b43a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="${x(last[0]).toFixed(1)}" cy="${y(last[3]).toFixed(1)}" r="3.5" fill="#f3d46e"/>`;
  $("ticks").innerHTML = [0, 1, 2, 3].map((i) => `<span>${hourLabel(t0 + ((t1 - t0) * i) / 3)}</span>`).join("");
}

/* ---------- render ---------- */
const KARATS = ["24", "22", "21", "18", "14"];

function renderTable(snap) {
  const g = snap.egypt_gold_per_gram_egp;
  let html = `<div class="tr th"><span>العيار</span><span>بيع</span><span>شراء</span></div>`;
  for (const k of KARATS) {
    const v = g[k]; if (!v) continue;
    html += `<div class="tr"><span class="nm"><i class="badge">${k}</i>عيار ${k}</span><b>${nf(v.sell)}</b><b class="up">${nf(v.buy)}</b></div>`;
  }
  const p = snap.gold_pound_egp;
  if (p) html += `<div class="tr"><span class="nm"><i class="badge">8g</i>جنيه ذهب</span><b>${nf(p.sell, 0)}</b><b class="up">${nf(p.buy, 0)}</b></div>`;
  $("karats").innerHTML = html;
}

function render(snap, fromCache) {
  const g = snap.egypt_gold_per_gram_egp;
  $("ounce").textContent = nf(snap.global.ounce_usd);
  $("usd").textContent = nf(snap.global.usd_egp);
  if (g["21"]) {
    $("h21").textContent = nf(g["21"].sell);
    $("h21-sell").textContent = nf(g["21"].sell);
    $("h21-buy").textContent = nf(g["21"].buy);
  }
  renderTable(snap);

  // display order: USD/EUR, SAR/AED, QAR/KWD, then the rest
  const FX_ORDER = ["USD", "EUR", "SAR", "AED", "QAR", "KWD"];
  const rank = (c) => { const i = FX_ORDER.indexOf(c); return i < 0 ? 99 : i; };
  $("currencies").innerHTML = Object.entries(snap.currencies_vs_egp || {})
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([code, v]) => `<div class="cur"><div class="cn">${v.name_ar} <small>${code}</small></div><div class="cv"><b>${nf(v.egp, 3)}</b><span>جنيه</span></div></div>`)
    .join("");

  // changes vs 24h ago (or since recording started)
  const hist = snap.history || [];
  const now = Math.floor(new Date(snap.updated_at).getTime() / 1000);
  const base = baselinePoint(hist, now);
  setChange($("ounce-chg"), base && diff(snap.global.ounce_usd, base.p[1]));
  setChange($("usd-chg"), base && diff(snap.global.usd_egp, base.p[2]));
  const c21 = base && g["21"] && diff(g["21"].sell, base.p[3]);
  const cc = $("chart-chg");
  if (c21) {
    const up = c21.d >= 0;
    cc.textContent = `${up ? "+" : "-"}${nf(Math.abs(c21.pct))}%`;
    cc.className = up ? "up" : "down";
    $("chart-lbl").textContent = base.full ? "خلال 24 ساعة" : "منذ بدء التسجيل";
  } else {
    cc.textContent = "—"; cc.className = ""; $("chart-lbl").textContent = "جاري جمع البيانات";
  }
  drawChart(hist);

  const t = new Date(snap.updated_at);
  const stale = fromCache || (Date.now() - t.getTime()) / 60000 > STALE_MIN;
  $("dot").className = "dot " + (stale ? "stale" : "ok");
  $("updated").textContent =
    t.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: TZ }) + (stale ? " (قديم)" : "");
}

async function load() {
  try {
    if (!CFG.url || !CFG.key) throw new Error("config.js missing");
    const res = await fetch(`${CFG.url}/rest/v1/prices?id=eq.1&select=data`, { headers: authHeaders() });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const rows = await res.json();
    if (!rows.length) throw new Error("no data");
    render(rows[0].data, false);
    try { localStorage.setItem("igold-last", JSON.stringify(rows[0].data)); } catch (e) {}
  } catch (err) {
    try {
      const last = JSON.parse(localStorage.getItem("igold-last"));
      if (last) return render(last, true);
    } catch (e) {}
    $("updated").textContent = "تعذر التحميل";
  }
}

document.querySelectorAll(".tab").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    $("gold").hidden = btn.dataset.tab !== "gold";
    $("fx").hidden = btn.dataset.tab !== "fx";
  })
);

load();
setInterval(load, REFRESH_MS);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
