// localStorage への保存・復元。状態はすべて素の JSON なのでそのまま載せられる。

import { SAVE_VERSION } from './engine.js';

const KEY = 'stock-sim:v3';

export function save(state) {
  try {
    // 実データモードの market は dataset から作り直せる導出値で、
    // 500 銘柄ぶん保存すると localStorage の容量を超えるため落とす
    const payload = state.mode === 'real' ? { ...state, market: null } : state;
    localStorage.setItem(KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false; // 容量超過やプライベートモードでは黙って諦める
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (state?.version !== SAVE_VERSION) return null;
    return state;
  } catch {
    return null;
  }
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
