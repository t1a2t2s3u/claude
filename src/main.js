// エントリポイント。保存済みの状態があれば復元し、なければ架空市場で新規に始める。
// 実データモードで保存されていた場合は、data/ を読み直して続きから再生する。

import { createEngine, createRealEngine, rebindDataset, DEFAULT_CASH } from './engine.js';
import { loadDataset, DATA_BASE } from './dataset.js';
import { createApp } from './ui.js';
import * as storage from './storage.js';

const saved = storage.load();
let state = saved;
let dataset = null;

if (saved?.mode === 'real') {
  try {
    dataset = await loadDataset(DATA_BASE);
    if (!rebindDataset(saved, dataset).ok) {
      // 取り込み直しでカレンダーが変わっていたら、同じデータで最初から始める
      state = createRealEngine(dataset, { cash: DEFAULT_CASH });
    }
  } catch {
    state = null; // データが消えていたら架空市場に戻す
    dataset = null;
  }
}

if (!state) state = createEngine({ cash: DEFAULT_CASH });

createApp({ state, dataset }).start();
