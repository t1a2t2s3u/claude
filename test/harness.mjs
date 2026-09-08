/* index.html の中のスクリプトを、最小限のDOMもどきの上で動かして
   税計算の関数を取り出す。ブラウザもライブラリも要らない。 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');

const m = HTML.match(/<script>\n('use strict';[\s\S]*?)\n<\/script>/);
if(!m) throw new Error('index.html からアプリのスクリプトを取り出せませんでした');
export const SRC = m[1];

function el(){
  const e = {
    className:'', id:'', innerHTML:'', textContent:'', value:'', checked:false,
    style:{}, dataset:{}, options:[], hidden:false,
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    appendChild(c){ return c; }, removeChild(c){ return c; }, remove(){},
    addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return true; },
    insertAdjacentHTML(){}, focus(){}, blur(){}, click(){}, select(){},
    setAttribute(){}, getAttribute(){ return null; }, setSelectionRange(){},
    checkValidity(){ return true; },
    getBoundingClientRect(){ return {left:0, top:0, width:0, height:0}; },
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    closest(){ return null; }
  };
  return e;
}

/* state を埋め込んだ状態でアプリを起動し、その場のスコープを返す */
export function boot(state){
  const json = JSON.stringify(state).replace(/</g, '\\u003c');
  const ctx = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    innerWidth: 400, innerHeight: 800,
    matchMedia: () => ({ matches:false, addEventListener(){}, removeEventListener(){} }),
    localStorage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
    location: { protocol:'file:', href:'file:///index.html' },
    navigator: {},
    addEventListener(){}, removeEventListener(){},
    document: {
      currentScript: { textContent: SRC },
      head: el(), body: el(), activeElement: null,
      getElementById(id){ return id === 'app-state' ? { textContent: json } : null; },
      createElement(){ return el(); },
      querySelector(){ return null; }, querySelectorAll(){ return []; },
      addEventListener(){}, removeEventListener(){}
    }
  };
  createContext(ctx);
  ctx.window = ctx;
  ctx.globalThis = ctx;
  runInContext(SRC, ctx, { filename: 'index.html' });
  /* let/const で宣言されたもの（state・view・TAX など）は
     コンテキストのプロパティにならないので、式で取り出せるようにしておく */
  ctx.$ = expr => runInContext('(' + expr + ')', ctx);
  return ctx;
}
