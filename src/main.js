// エントリポイント。保存済みの状態があれば復元し、なければ新しい相場を作る。

import { createEngine, DEFAULT_CASH } from './engine.js';
import { createApp } from './ui.js';
import * as storage from './storage.js';

const state = storage.load() ?? createEngine({ cash: DEFAULT_CASH });
createApp(state).start();
