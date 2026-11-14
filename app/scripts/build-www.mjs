/* Web版の index.html とアイコンを、そのまま www/ に並べる。
   アプリ版のために本体を書き換えることはしない（1枚ものを保つ）。
   Service Worker と manifest は入れない。アプリの更新はストア経由なので、
   キャッシュが古い本体を抱え込むと更新が届かなくなる。 */
import { mkdir, rm, copyFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = dirname(here);
const repo = dirname(appDir);
const www = join(appDir, 'www');

await rm(www, { recursive: true, force: true });
await mkdir(www, { recursive: true });

const html = await readFile(join(repo, 'index.html'), 'utf8');
if (!html.includes('id="app-state"')) {
  throw new Error('index.html に app-state が見当たりません。取り違えていませんか');
}
/* 誰かの記録が混ざったまま配布しないための歯止め */
const state = /<script type="application\/json" id="app-state">([\s\S]*?)<\/script>/.exec(html);
const parsed = JSON.parse(state[1]);
if ((parsed.biz || []).length || (parsed.payments || []).length) {
  throw new Error('index.html に記録が埋め込まれたままです。空の状態で配布してください');
}
await writeFile(join(www, 'index.html'), html);

for (const icon of ['icon-180.png', 'icon-192.png', 'icon-512.png']) {
  await copyFile(join(repo, 'release', icon), join(www, icon));
}
console.log('www/ を作りました（index.html + アイコン3枚）');
