// data/ に書き出された実データ（tools/fetch-prices.js の出力）を読み込む。
// 容量を抑えるためファイル側は配列で持っているので、ここで足のオブジェクトに戻す。

export const DATA_BASE = './data';

function toBar([date, open, high, low, close, volume]) {
  return { date, open, high, low, close, volume };
}

export async function loadUniverse(base = DATA_BASE) {
  const res = await fetch(`${base}/universe.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`データがありません（${base}/universe.json: HTTP ${res.status}）`);
  const universe = await res.json();
  if (universe.version !== 1) throw new Error('データ形式のバージョンが違います');
  if (!universe.symbols?.length || !universe.calendar?.length) throw new Error('データが空です');
  return universe;
}

async function loadSeries(base, entry) {
  const res = await fetch(`${base}/${entry.file}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${entry.symbol}: HTTP ${res.status}`);
  const raw = await res.json();
  const bars = raw.bars.map(toBar);
  return {
    symbol: entry.symbol,
    bars,
    byDate: new Map(bars.map((bar) => [bar.date, bar])),
    dividends: new Map((raw.dividends ?? []).map(([date, amount]) => [date, amount])),
  };
}

/**
 * 全銘柄の時系列を読み込んだデータセットを返す。
 * 銘柄数ぶんのリクエストになるため、同時実行数を絞って進捗を返す。
 */
export async function loadDataset(base = DATA_BASE, { onProgress, concurrency = 6 } = {}) {
  const universe = await loadUniverse(base);
  const series = new Map();
  let done = 0;

  const entries = [...universe.symbols];
  const workers = Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
    while (entries.length > 0) {
      const entry = entries.shift();
      series.set(entry.symbol, await loadSeries(base, entry));
      onProgress?.(++done, universe.symbols.length);
    }
  });
  await Promise.all(workers);

  return {
    universe,
    calendar: universe.calendar,
    series,
    barAt(symbol, date) {
      return series.get(symbol)?.byDate.get(date) ?? null;
    },
    dividendAt(symbol, date) {
      return series.get(symbol)?.dividends.get(date) ?? 0;
    },
    /** 最後に取り込んだ日付 */
    get lastDate() {
      return universe.calendar.at(-1);
    },
  };
}

/** universe の銘柄定義を、エンジンが使う銘柄マスタの形に整える */
export function toInstruments(universe) {
  return universe.symbols.map((s) => ({
    symbol: s.symbol,
    name: s.name,
    sector: s.sector ?? '—',
    market: s.market,
    currency: universe.baseCurrency,
    sourceCurrency: s.sourceCurrency,
    lot: s.lot ?? 1,
    yield_: 0, // 実データでは配当は実際の権利落ち日に支払う
  }));
}
