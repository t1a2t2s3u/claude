// localStorage への保存・復元。状態はすべて素の JSON なのでそのまま載せられる。

import { SAVE_VERSION } from './engine.js';

const KEY = 'stock-sim:v2';

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
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
