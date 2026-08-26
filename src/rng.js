// 決定論的な擬似乱数生成器（mulberry32）。
// 内部状態が 32bit 整数ひとつだけなので、そのままセーブデータに載せられる。
// 同じシード・同じ呼び出し回数なら必ず同じ系列になる＝リプレイ可能。

export function createRng(seed = 1) {
  let s = seed >>> 0;

  return {
    /** [0, 1) の一様乱数 */
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },

    /** 標準正規分布（Box-Muller。2 値目は捨てて状態を単純に保つ） */
    normal() {
      let u = 0;
      while (u === 0) u = this.next(); // log(0) を避ける
      const v = this.next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },

    /** [min, max] の整数 */
    int(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    },

    /** 配列からひとつ選ぶ */
    pick(arr) {
      return arr[this.int(0, arr.length - 1)];
    },

    /** 確率 p で true */
    chance(p) {
      return this.next() < p;
    },

    getState() {
      return s >>> 0;
    },

    setState(state) {
      s = state >>> 0;
    },
  };
}
