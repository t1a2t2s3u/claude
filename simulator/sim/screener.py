"""「キオクシア型」銘柄スクリーナー。

キオクシア(285A)は2024年12月上場の大型IPOで、上場後しばらく公開価格近辺で
放置されたのち、AIメモリ需要の追い風で2025年に急騰した。このモジュールは
「急騰前のキオクシアが持っていた特徴」を4因子に分解して点数化し、
銘柄マスタ全体から同じ"型"の銘柄を探す。

 1. freshness  大型なのに若い(上場からの年数 × 時価総額)
 2. undervalue 出遅れ・低評価(低PBR・低PER)
 3. momentum   点火の兆し(52週レンジ内の位置 × 出来高急増)
 4. theme      テーマ(半導体・AI・エレクトロニクス、またはユーザー指定語)

重要: これは「過去に急騰した銘柄と似た状態」を探すだけで、将来の上昇を
予測・保証するものではない(UI側にも必ず明記する)。

財務データはyfinanceの info から取得し、SQLiteに24時間キャッシュする。
取得失敗も短いTTLでキャッシュして、再スキャン時に同じ銘柄で止まらないようにする。
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta

FUND_TTL_SEC = 24 * 3600      # 取得成功データのキャッシュ(24時間)
ERROR_TTL_SEC = 6 * 3600      # 取得失敗のキャッシュ(6時間)
USDJPY_ASSUMED = 150.0        # 時価総額の規模分け専用の概算レート(精度不要)

# yfinance info から保存するキー
INFO_FIELDS = [
    "longName",
    "shortName",
    "currency",
    "marketCap",
    "trailingPE",
    "forwardPE",
    "priceToBook",
    "regularMarketPrice",
    "currentPrice",
    "fiftyTwoWeekHigh",
    "fiftyTwoWeekLow",
    "averageVolume",
    "averageVolume10days",
    "firstTradeDateEpochUtc",
    "sector",
    "industry",
]

DEFAULT_WEIGHTS = {"freshness": 30, "undervalue": 25, "momentum": 30, "theme": 15}

# テーマ判定語(小文字で部分一致)。strong=直撃 / weak=周辺
THEME_STRONG = ["semiconductor", "半導体"]
THEME_WEAK = [
    "electronic", "hardware", "computer", "communication equipment",
    "information technology", "software", "technology",
]


def _fetch_info(ticker: str) -> dict:
    """yfinanceからinfoの必要なキーだけ取り出す。失敗は {'error': メッセージ}。"""
    import yfinance as yf

    try:
        info = yf.Ticker(ticker).info or {}
    except Exception as exc:
        return {"error": str(exc)[:200]}
    if not info.get("regularMarketPrice") and not info.get("currentPrice"):
        return {"error": "価格情報なし(上場廃止・データ未整備の可能性)"}
    return {k: info.get(k) for k in INFO_FIELDS}


def get_fundamentals(conn, ticker: str, force: bool = False) -> dict:
    """キャッシュ付きで財務データを返す。"""
    row = conn.execute(
        "SELECT data, fetched_at FROM fundamentals WHERE ticker = ?", (ticker,)
    ).fetchone()
    if row and not force:
        data = json.loads(row["data"])
        ttl = ERROR_TTL_SEC if "error" in data else FUND_TTL_SEC
        if datetime.now() - datetime.fromisoformat(row["fetched_at"]) < timedelta(seconds=ttl):
            return data

    data = _fetch_info(ticker)
    conn.execute(
        "INSERT INTO fundamentals(ticker, data, fetched_at) VALUES(?, ?, ?) "
        "ON CONFLICT(ticker) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at",
        (ticker, json.dumps(data, ensure_ascii=False), datetime.now().isoformat(timespec="seconds")),
    )
    conn.commit()
    return data


def load_autodata_fundamentals(conn, data_dir=None) -> dict | None:
    """同梱の自動収集財務データ(autodata/fundamentals.json)をキャッシュに取り込む。

    自動収集データの生成時刻より新しいキャッシュは上書きしない。
    戻り値: {"loaded": 取込件数, "generated_at": 生成時刻} / データが無ければ None。
    """
    from pathlib import Path

    base = Path(data_dir) if data_dir else Path(__file__).resolve().parent.parent / "autodata"
    fund_path = base / "fundamentals.json"
    if not fund_path.exists():
        return None
    try:
        funds = json.loads(fund_path.read_text(encoding="utf-8"))
        meta = json.loads((base / "meta.json").read_text(encoding="utf-8"))
        generated_at = datetime.fromisoformat(meta["generated_at"]).replace(tzinfo=None)
    except Exception:
        return None

    existing = {
        r["ticker"]: datetime.fromisoformat(r["fetched_at"])
        for r in conn.execute("SELECT ticker, fetched_at FROM fundamentals").fetchall()
    }
    stamp = generated_at.isoformat(timespec="seconds")
    loaded = 0
    for ticker, data in funds.items():
        if ticker in existing and existing[ticker] >= generated_at:
            continue  # アプリ側でより新しく取得済みなら尊重する
        conn.execute(
            "INSERT INTO fundamentals(ticker, data, fetched_at) VALUES(?, ?, ?) "
            "ON CONFLICT(ticker) DO UPDATE SET data = excluded.data, "
            "fetched_at = excluded.fetched_at",
            (ticker, json.dumps(data, ensure_ascii=False), stamp),
        )
        loaded += 1
    conn.commit()
    return {"loaded": loaded, "generated_at": generated_at}


def cached_fundamentals(conn) -> dict[str, dict]:
    """キャッシュ済みの全データ(エラーを含む)。ランキングはここから計算する。"""
    rows = conn.execute("SELECT ticker, data FROM fundamentals").fetchall()
    return {r["ticker"]: json.loads(r["data"]) for r in rows}


def pending_tickers(conn, tickers: list[str]) -> list[str]:
    """未取得またはTTL切れの銘柄だけを返す(スキャンの「続きから」用)。"""
    rows = conn.execute("SELECT ticker, data, fetched_at FROM fundamentals").fetchall()
    fresh = set()
    now = datetime.now()
    for r in rows:
        data = json.loads(r["data"])
        ttl = ERROR_TTL_SEC if "error" in data else FUND_TTL_SEC
        if now - datetime.fromisoformat(r["fetched_at"]) < timedelta(seconds=ttl):
            fresh.add(r["ticker"])
    return [t for t in tickers if t not in fresh]


def scan(conn, tickers: list[str], progress_cb=None) -> dict:
    """銘柄リストの財務データを取得してキャッシュする。戻り値は件数の内訳。"""
    ok = err = 0
    for i, ticker in enumerate(tickers):
        data = get_fundamentals(conn, ticker)
        if "error" in data:
            err += 1
        else:
            ok += 1
        if progress_cb:
            progress_cb(i + 1, len(tickers), ticker)
    return {"ok": ok, "error": err}


# ── スコアリング ─────────────────────────────────────────

def mcap_jpy(fund: dict) -> float:
    """時価総額を円換算(規模の段階分け専用の概算)。"""
    mcap = fund.get("marketCap") or 0
    if (fund.get("currency") or "").upper() == "USD":
        return mcap * USDJPY_ASSUMED
    return mcap


def ipo_years(fund: dict, now: datetime | None = None) -> float | None:
    ts = fund.get("firstTradeDateEpochUtc")
    if not ts:
        return None
    try:
        first = datetime.fromtimestamp(ts)
    except (OSError, OverflowError, ValueError):
        return None
    return ((now or datetime.now()) - first).days / 365.25


# 英字入り証券コード(例: 167A, 285A)は2024年1月以降の新規上場にのみ付与される。
# yfinanceに上場日が無い日本株が多いため、「若さ」の代替シグナルとして使う
NEW_CODE_RE = re.compile(r"^\d{3}[A-Z]\.T$")


def _score_freshness(fund: dict, now: datetime | None, ticker: str | None = None) -> float:
    years = ipo_years(fund, now)
    if years is None:
        if not (ticker and NEW_CODE_RE.match(ticker)):
            return 0.0
        age = 1.0  # 英字入りコード = 2024年以降の上場
    else:
        age = 1.0 if years <= 3 else 0.6 if years <= 5 else 0.15
    m = mcap_jpy(fund)
    size = (
        1.0 if m >= 1e12 else 0.85 if m >= 3e11 else 0.6 if m >= 1e11
        else 0.3 if m >= 3e10 else 0.1
    )
    return age * size


def _score_undervalue(fund: dict) -> float:
    pbr = fund.get("priceToBook")
    per = fund.get("trailingPE")
    s_pbr = (
        1.0 if pbr and 0 < pbr <= 1.0 else 0.8 if pbr and pbr <= 1.5
        else 0.55 if pbr and pbr <= 2.0 else 0.25 if pbr and pbr <= 3.0 else 0.0
    )
    s_per = (
        0.9 if per and 0 < per <= 10 else 0.65 if per and per <= 15
        else 0.3 if per and per <= 25 else 0.0
    )
    return max(s_pbr, s_per)


def _score_momentum(fund: dict) -> float:
    price = fund.get("regularMarketPrice") or fund.get("currentPrice")
    hi = fund.get("fiftyTwoWeekHigh")
    lo = fund.get("fiftyTwoWeekLow")
    pos = 0.0
    if price and hi and lo and hi > lo:
        p = (price - lo) / (hi - lo)
        pos = 1.0 if p >= 0.85 else 0.7 if p >= 0.65 else 0.35 if p >= 0.45 else 0.1
    surge = 0.0
    avg = fund.get("averageVolume")
    recent = fund.get("averageVolume10days")
    if avg and recent and avg > 0:
        ratio = recent / avg
        surge = min(1.0, ratio / 2.0)  # 直近出来高が平常の2倍で満点
    return 0.7 * pos + 0.3 * surge


def _score_theme(fund: dict, extra_keywords: list[str] | None = None) -> float:
    text = f"{fund.get('sector') or ''} {fund.get('industry') or ''}".lower()
    for kw in extra_keywords or []:
        if kw and kw.lower() in text:
            return 1.0
    if any(kw in text for kw in THEME_STRONG):
        return 1.0
    if any(kw in text for kw in THEME_WEAK):
        return 0.5
    return 0.0


def score(fund: dict, weights: dict | None = None,
          extra_keywords: list[str] | None = None,
          now: datetime | None = None, ticker: str | None = None) -> dict:
    """1銘柄のキオクシア型スコア(0〜100)と因子の内訳を返す。"""
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    comps = {
        "freshness": _score_freshness(fund, now, ticker),
        "undervalue": _score_undervalue(fund),
        "momentum": _score_momentum(fund),
        "theme": _score_theme(fund, extra_keywords),
    }
    total_w = sum(w.values()) or 1
    total = sum(w[k] * comps[k] for k in comps) / total_w * 100
    return {"total": round(total, 1), "components": comps}


def rank(conn, universe: list, weights: dict | None = None,
         extra_keywords: list[str] | None = None,
         min_mcap_jpy: float = 0, now: datetime | None = None) -> list[dict]:
    """キャッシュ済みデータからランキングを作る(universeは銘柄マスタの行)。

    再取得なしで重み変更が即座に反映されるよう、スキャンとは分離している。
    """
    cache = cached_fundamentals(conn)
    results = []
    for stock in universe:
        fund = cache.get(stock["ticker"])
        if not fund or "error" in fund:
            continue
        if mcap_jpy(fund) < min_mcap_jpy:
            continue
        s = score(fund, weights, extra_keywords, now, ticker=stock["ticker"])
        years = ipo_years(fund, now)
        results.append(
            {
                "ticker": stock["ticker"],
                "name": stock["name"],
                "market": stock["market"],
                "score": s["total"],
                "components": s["components"],
                "mcap_jpy": mcap_jpy(fund),
                "pbr": fund.get("priceToBook"),
                "per": fund.get("trailingPE"),
                "ipo_years": round(years, 1) if years is not None else None,
                "sector": fund.get("sector"),
                "industry": fund.get("industry"),
                "price": fund.get("regularMarketPrice") or fund.get("currentPrice"),
                "high52": fund.get("fiftyTwoWeekHigh"),
                "low52": fund.get("fiftyTwoWeekLow"),
            }
        )
    results.sort(key=lambda r: r["score"], reverse=True)
    return results
