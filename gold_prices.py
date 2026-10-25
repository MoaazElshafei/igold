#!/usr/bin/env python3
"""
gold_prices.py - Estimated Egyptian gold prices from global data.

Formula:
    gram24_fair = (XAU/USD ounce / 31.1035) * USD/EGP
    karat price = gram24_fair * karat / 24
    sell = fair * (1 + MARGIN_SELL)     buy = fair * (1 + MARGIN_BUY)
    gold pound  = 21K gram * 8

Sources (free, no key needed):
    Gold ounce : https://api.gold-api.com/price/XAU
                 (optional fallback: goldapi.io, set env GOLDAPI_KEY)
    Currencies : https://open.er-api.com/v6/latest/USD

Usage:
    python gold_prices.py                       # run once, write prices.json
    python gold_prices.py --loop 300            # refresh every 5 minutes
    python gold_prices.py --calibrate 7182.75 7125.75
        # give the real 24K sell/buy price (e.g. from iSagha) and it prints
        # the margins that match it right now. Put them in CONFIG below.

No third-party packages required (Python 3.8+).
"""
import argparse
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone, timedelta

# ----------------------------- CONFIG -----------------------------
MARGIN_SELL = 0.0100   # local sell price above "fair" price (1.00%)
MARGIN_BUY = 0.0046    # local buy price above "fair" price (0.46%)
OUTPUT_FILE = "prices.json"
OUNCE_GRAMS = 31.1035
KARATS = [24, 22, 21, 18, 14]
POUND_KARAT = 21       # gold pound = 8 grams of 21K
POUND_GRAMS = 8

# Currencies shown against the Egyptian pound. Edit freely
# (any code supported by open.er-api.com).
CURRENCIES = {
    "USD": "الدولار الأمريكي",
    "EUR": "اليورو",
    "GBP": "الجنيه الإسترليني",
    "SAR": "الريال السعودي",
    "AED": "الدرهم الإماراتي",
    "KWD": "الدينار الكويتي",
    "QAR": "الريال القطري",
    "OMR": "الريال العماني",
    "BHD": "الدينار البحريني",
    "JOD": "الدينار الأردني",
    "TRY": "الليرة التركية",
}

TIMEOUT = 15
RETRIES = 3
CAIRO = timezone(timedelta(hours=3))  # change if you need DST handling
# ------------------------------------------------------------------


def http_get_json(url, headers=None):
    last_err = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "gold-prices-app/1.0", **(headers or {})}
            )
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:  # network, HTTP, JSON errors
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"GET {url} failed: {last_err}")


def fetch_ounce_usd():
    """Spot gold price in USD per troy ounce."""
    try:
        data = http_get_json("https://api.gold-api.com/price/XAU")
        return float(data["price"]), "gold-api.com"
    except Exception as first_err:
        key = os.environ.get("GOLDAPI_KEY")
        if not key:
            raise RuntimeError(f"gold ounce fetch failed: {first_err}")
        data = http_get_json(
            "https://www.goldapi.io/api/XAU/USD", headers={"x-access-token": key}
        )
        return float(data["price"]), "goldapi.io"


def fetch_rates():
    """Return dict: currency code -> units of that currency per 1 USD."""
    data = http_get_json("https://open.er-api.com/v6/latest/USD")
    if data.get("result") != "success":
        raise RuntimeError(f"rates API error: {data}")
    return data["rates"]


def gram24_fair(ounce_usd, usd_egp):
    return ounce_usd / OUNCE_GRAMS * usd_egp


def compute_gold(ounce_usd, usd_egp, margin_sell=MARGIN_SELL, margin_buy=MARGIN_BUY):
    fair24 = gram24_fair(ounce_usd, usd_egp)
    karats = {}
    for k in KARATS:
        fair = fair24 * k / 24
        karats[str(k)] = {
            "fair": round(fair, 2),
            "sell": round(fair * (1 + margin_sell), 2),
            "buy": round(fair * (1 + margin_buy), 2),
        }
    pf = fair24 * POUND_KARAT / 24 * POUND_GRAMS
    pound = {
        "fair": round(pf, 2),
        "sell": round(pf * (1 + margin_sell), 2),
        "buy": round(pf * (1 + margin_buy), 2),
    }
    return karats, pound


def compute_currencies(rates):
    """Price of 1 unit of each currency in EGP (mid-market rate)."""
    egp_per_usd = rates["EGP"]
    out = {}
    for code, name in CURRENCIES.items():
        if code not in rates:
            continue
        out[code] = {
            "name_ar": name,
            "egp": round(egp_per_usd / rates[code], 4),
        }
    return out


def build_snapshot():
    ounce, ounce_src = fetch_ounce_usd()
    rates = fetch_rates()
    usd_egp = rates["EGP"]
    karats, pound = compute_gold(ounce, usd_egp)
    return {
        "updated_at": datetime.now(CAIRO).isoformat(timespec="seconds"),
        "is_estimate": True,
        "notes": "أسعار استرشادية محسوبة من السعر العالمي، بدون مصنعية أو ضرائب",
        "sources": {"gold": ounce_src, "currencies": "open.er-api.com"},
        "margins": {"sell": MARGIN_SELL, "buy": MARGIN_BUY},
        "global": {"ounce_usd": round(ounce, 2), "usd_egp": round(usd_egp, 4)},
        "egypt_gold_per_gram_egp": karats,
        "gold_pound_egp": pound,
        "currencies_vs_egp": compute_currencies(rates),
    }


def save_atomic(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)  # readers never see a half-written file


def upload_supabase(snap):
    """Upsert the snapshot into Supabase table `prices` (id=1).
    Needs env SUPABASE_URL and SUPABASE_SERVICE_KEY. Skipped if not set."""
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return False
    body = json.dumps({"id": 1, "data": snap, "updated_at": snap["updated_at"]}).encode()
    req = urllib.request.Request(
        f"{url}/rest/v1/prices?on_conflict=id",
        data=body,
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        if resp.status >= 300:
            raise RuntimeError(f"supabase upload failed: HTTP {resp.status}")
    return True


def run_once():
    snap = build_snapshot()
    save_atomic(OUTPUT_FILE, snap)
    if upload_supabase(snap):
        print("uploaded to Supabase")
    k21 = snap["egypt_gold_per_gram_egp"]["21"]
    print(
        f"[{snap['updated_at']}] ounce=${snap['global']['ounce_usd']} "
        f"USD/EGP={snap['global']['usd_egp']} | 21K sell={k21['sell']} buy={k21['buy']}"
    )


def calibrate(real_sell24, real_buy24):
    ounce, _ = fetch_ounce_usd()
    usd_egp = fetch_rates()["EGP"]
    fair = gram24_fair(ounce, usd_egp)
    print(f"fair 24K gram now: {fair:.2f} EGP")
    print(f"MARGIN_SELL = {real_sell24 / fair - 1:.4f}")
    print(f"MARGIN_BUY  = {real_buy24 / fair - 1:.4f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--loop", type=int, metavar="SECONDS", help="refresh forever")
    ap.add_argument("--calibrate", nargs=2, type=float, metavar=("SELL24", "BUY24"))
    args = ap.parse_args()

    if args.calibrate:
        calibrate(*args.calibrate)
        return

    if not args.loop:
        run_once()
        return

    while True:
        try:
            run_once()
        except Exception as e:
            # keep the last good prices.json; the app should show its timestamp
            print(f"update failed, keeping last file: {e}", file=sys.stderr)
        time.sleep(max(args.loop, 60))


if __name__ == "__main__":
    main()
