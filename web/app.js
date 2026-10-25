// ====== CONFIG: put your Supabase values here (the ANON key is public by design) ======
const SUPABASE_URL = "https://lowausbdxhjsebejbbeh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NjHAhKays4OAjrsrqhX7og_fTyeQetK";
const REFRESH_MS = 60 * 1000;
const STALE_MIN = 20; // mark data stale after this many minutes
// =====================================================================================

const $ = (id) => document.getElementById(id);
const fmt = (n, d = 2) =>
  Number(n).toLocaleString("ar-EG", { minimumFractionDigits: d, maximumFractionDigits: d });

function row(label, value) {
  return `<div class="row"><span>${label}</span><b>${value}</b></div>`;
}

function render(snap, fromCache) {
  $("ounce").textContent = fmt(snap.global.ounce_usd);
  $("usd").textContent = fmt(snap.global.usd_egp);
  $("pound-sell").textContent = fmt(snap.gold_pound_egp.sell, 0);
  $("pound-buy").textContent = fmt(snap.gold_pound_egp.buy, 0);

  $("karats").innerHTML = Object.entries(snap.egypt_gold_per_gram_egp)
    .map(([k, v]) => `<div class="item"><div class="name">عيار ${k}</div>${row("بيع", fmt(v.sell))}${row("شراء", fmt(v.buy))}</div>`)
    .join("");

  $("currencies").innerHTML = Object.entries(snap.currencies_vs_egp)
    .map(([code, v]) => `<div class="item"><div class="name">${v.name_ar} <small>${code}</small></div>${row("جنيه", fmt(v.egp, 3))}</div>`)
    .join("");

  const t = new Date(snap.updated_at);
  const ageMin = (Date.now() - t.getTime()) / 60000;
  const stale = fromCache || ageMin > STALE_MIN;
  $("dot").className = "dot " + (stale ? "stale" : "ok");
  $("updated").textContent =
    "آخر تحديث: " + t.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) +
    (stale ? " (قديم)" : "");
}

async function load() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/prices?id=eq.1&select=data`, {
      headers: SUPABASE_ANON_KEY.startsWith("eyJ")
        ? { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
        : { apikey: SUPABASE_ANON_KEY },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const rows = await res.json();
    if (!rows.length) throw new Error("no data");
    render(rows[0].data, false);
    try { localStorage.setItem("igold-last", JSON.stringify(rows[0].data)); } catch (e) {}
  } catch (err) {
    // offline or server problem: show the last good copy, marked as stale
    try {
      const last = JSON.parse(localStorage.getItem("igold-last"));
      if (last) return render(last, true);
    } catch (e) {}
    $("updated").textContent = "تعذر تحميل الأسعار";
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

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
