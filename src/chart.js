// Canvas によるチャート描画。外部ライブラリは使わない。
// 日本の慣習にあわせて陽線＝赤、陰線＝青で描く。

export const THEME = {
  up: '#e0484d',
  down: '#3b7ddd',
  grid: 'rgba(255,255,255,0.07)',
  axis: 'rgba(233,238,248,0.45)',
  text: '#9aa4b8',
  sma5: '#f2b544',
  sma25: '#7c5cff',
  equity: '#3ecf8e',
  equityFill: 'rgba(62,207,142,0.14)',
  base: 'rgba(233,238,248,0.25)',
};

const PAD = { top: 12, right: 62, bottom: 22, left: 8 };

/** DPR を考慮して canvas の実ピクセルを整え、描画コンテキストを返す */
function setup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));

  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  return { ctx, width, height };
}

function niceTicks(min, max, count = 5) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
  return ticks;
}

function formatAxis(v) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 10_000) return `${Math.round(v / 1000)}k`;
  return v >= 1000 ? Math.round(v).toLocaleString('ja-JP') : v.toFixed(0);
}

/**
 * ローソク足チャートを描く。
 * bars: [{date, open, high, low, close, volume}]、overlays: [{ values, color, label }]
 * 戻り値の hitTest(x) で、マウス位置から足のインデックスを引ける。
 */
export function drawCandles(canvas, bars, overlays = []) {
  const { ctx, width, height } = setup(canvas);
  if (!bars.length) return { hitTest: () => -1 };

  const volH = Math.round(height * 0.18);
  const plotTop = PAD.top;
  const plotBottom = height - PAD.bottom - volH - 6;
  const plotLeft = PAD.left;
  const plotRight = width - PAD.right;
  const plotH = Math.max(1, plotBottom - plotTop);
  const plotW = Math.max(1, plotRight - plotLeft);

  let min = Infinity;
  let max = -Infinity;
  for (const b of bars) {
    min = Math.min(min, b.low);
    max = Math.max(max, b.high);
  }
  for (const o of overlays) {
    for (const v of o.values) {
      if (v == null) continue;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  const pad = (max - min) * 0.06 || 1;
  min -= pad;
  max += pad;

  const y = (v) => plotBottom - ((v - min) / (max - min)) * plotH;
  const slot = plotW / bars.length;
  const bodyW = Math.max(1, Math.min(11, slot * 0.66));
  const x = (i) => plotLeft + slot * (i + 0.5);

  // グリッドと価格軸
  ctx.strokeStyle = THEME.grid;
  ctx.fillStyle = THEME.text;
  ctx.lineWidth = 1;
  ctx.textAlign = 'left';
  for (const tick of niceTicks(min, max)) {
    const ty = Math.round(y(tick)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(plotLeft, ty);
    ctx.lineTo(plotRight, ty);
    ctx.stroke();
    ctx.fillText(formatAxis(tick), plotRight + 6, ty);
  }

  // 出来高
  const maxVol = Math.max(...bars.map((b) => b.volume), 1);
  const volTop = height - PAD.bottom - volH;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const up = b.close >= b.open;
    const h = (b.volume / maxVol) * volH;
    ctx.fillStyle = up ? 'rgba(224,72,77,0.38)' : 'rgba(59,125,221,0.38)';
    ctx.fillRect(x(i) - bodyW / 2, volTop + (volH - h), bodyW, h);
  }

  // ローソク足
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const up = b.close >= b.open;
    const color = up ? THEME.up : THEME.down;
    const cx = Math.round(x(i)) + 0.5;

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, y(b.high));
    ctx.lineTo(cx, y(b.low));
    ctx.stroke();

    const top = y(Math.max(b.open, b.close));
    const bottom = y(Math.min(b.open, b.close));
    ctx.fillRect(cx - bodyW / 2, top, bodyW, Math.max(1, bottom - top));
  }

  // 移動平均線
  for (const o of overlays) {
    ctx.strokeStyle = o.color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < o.values.length; i++) {
      const v = o.values[i];
      if (v == null) {
        started = false;
        continue;
      }
      const px = x(i);
      const py = y(v);
      if (started) ctx.lineTo(px, py);
      else {
        ctx.moveTo(px, py);
        started = true;
      }
    }
    ctx.stroke();
  }

  // 日付ラベル（左端・中央・右端）
  ctx.fillStyle = THEME.text;
  ctx.lineWidth = 1;
  const labelIdx = [0, Math.floor(bars.length / 2), bars.length - 1];
  for (const i of labelIdx) {
    if (i < 0 || i >= bars.length) continue;
    const label = bars[i].date.slice(2).replace(/-/g, '/');
    ctx.textAlign = i === 0 ? 'left' : i === bars.length - 1 ? 'right' : 'center';
    ctx.fillText(label, Math.min(plotRight, Math.max(plotLeft, x(i))), height - PAD.bottom / 2);
  }

  return {
    hitTest(px) {
      const i = Math.floor((px - plotLeft) / slot);
      return i >= 0 && i < bars.length ? i : -1;
    },
  };
}

/** 資産推移などの折れ線。baseline を渡すとその水準に基準線を引く */
export function drawLine(canvas, points, { color = THEME.equity, fill = THEME.equityFill, baseline = null } = {}) {
  const { ctx, width, height } = setup(canvas);
  if (points.length < 2) {
    ctx.fillStyle = THEME.text;
    ctx.textAlign = 'center';
    ctx.fillText('データがありません', width / 2, height / 2);
    return;
  }

  const plotTop = PAD.top;
  const plotBottom = height - PAD.bottom;
  const plotLeft = PAD.left;
  const plotRight = width - PAD.right;
  const plotH = Math.max(1, plotBottom - plotTop);
  const plotW = Math.max(1, plotRight - plotLeft);

  const values = points.map((p) => p.value);
  let min = Math.min(...values, baseline ?? Infinity);
  let max = Math.max(...values, baseline ?? -Infinity);
  const pad = (max - min) * 0.08 || Math.abs(max) * 0.02 || 1;
  min -= pad;
  max += pad;

  const y = (v) => plotBottom - ((v - min) / (max - min)) * plotH;
  const x = (i) => plotLeft + (plotW * i) / (points.length - 1);

  ctx.strokeStyle = THEME.grid;
  ctx.fillStyle = THEME.text;
  ctx.textAlign = 'left';
  for (const tick of niceTicks(min, max)) {
    const ty = Math.round(y(tick)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(plotLeft, ty);
    ctx.lineTo(plotRight, ty);
    ctx.stroke();
    ctx.fillText(formatAxis(tick), plotRight + 6, ty);
  }

  if (baseline != null) {
    ctx.strokeStyle = THEME.base;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(plotLeft, y(baseline));
    ctx.lineTo(plotRight, y(baseline));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(x(i), y(p.value)) : ctx.lineTo(x(i), y(p.value))));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  ctx.lineTo(x(points.length - 1), plotBottom);
  ctx.lineTo(x(0), plotBottom);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.fillStyle = THEME.text;
  ctx.textAlign = 'left';
  ctx.fillText(points[0].date.slice(2).replace(/-/g, '/'), plotLeft, height - PAD.bottom / 2);
  ctx.textAlign = 'right';
  ctx.fillText(points[points.length - 1].date.slice(2).replace(/-/g, '/'), plotRight, height - PAD.bottom / 2);
}
