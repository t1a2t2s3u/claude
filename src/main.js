// エントリポイント。保存済みの状態があれば復元し、なければ架空市場で新規に始める。
// 実データモードの market（チャート履歴）は保存されないので、data/ を読み直して組み立てる。

import { createEngine, createRealEngine, rebindDataset, rebuildMarket } from './engine.js';
import { loadDataset, DATA_BASE } from './dataset.js';
import { createApp } from './ui.js';
import * as storage from './storage.js';

const saved = storage.load();
let state = saved;
let dataset = null;

if (saved?.mode === 'real') {
  try {
    dataset = await loadDataset(DATA_BASE);
    if (rebindDataset(saved, dataset).ok) {
      rebuildMarket(saved, dataset);
    } else {
      // 取り込み直しでカレンダーが変わっていたら、同じデータで最初から始める
      state = createRealEngine(dataset);
    }
  } catch {
    state = null; // データが消えていたら架空市場に戻す
    dataset = null;
  }
}

if (!state) state = createEngine();

createApp({ state, dataset }).start();
