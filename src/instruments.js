// 架空の上場銘柄マスタ。実在企業とは無関係。
//
// drift  : 年率の期待リターン（β 経由の市場感応分を除いた固有ドリフト）
// vol    : 年率の固有ボラティリティ（市場・セクター要因を除いた分）
// beta   : 市場全体への感応度
// yield_ : 年間配当利回りの目安（3 月・9 月の年 2 回、半分ずつ支払う）
// lot    : 売買単位（株）

export const SECTORS = ['電機', '機械', '金融', '食品', '情報', '医薬', '電力', '商社', '自動車', '不動産'];

export const INSTRUMENTS = [
  { symbol: '1010', name: 'アクシス電機',       sector: '電機',   start: 2480, beta: 1.15, drift: 0.05,  vol: 0.24, yield_: 0.021, lot: 100 },
  { symbol: '1102', name: '光和機械',           sector: '機械',   start: 1830, beta: 1.05, drift: 0.04,  vol: 0.22, yield_: 0.025, lot: 100 },
  { symbol: '1205', name: '相模銀行',           sector: '金融',   start:  786, beta: 1.20, drift: 0.02,  vol: 0.20, yield_: 0.045, lot: 100 },
  { symbol: '1308', name: '日本トラスト食品',   sector: '食品',   start: 3450, beta: 0.55, drift: 0.03,  vol: 0.13, yield_: 0.022, lot: 100 },
  { symbol: '1411', name: 'みらいテック',       sector: '情報',   start: 5620, beta: 1.45, drift: 0.11,  vol: 0.42, yield_: 0.000, lot: 100 },
  { symbol: '1523', name: '山田薬品',           sector: '医薬',   start: 4180, beta: 0.70, drift: 0.04,  vol: 0.19, yield_: 0.018, lot: 100 },
  { symbol: '1640', name: '東京エナジー',       sector: '電力',   start: 1124, beta: 0.60, drift: 0.01,  vol: 0.16, yield_: 0.040, lot: 100 },
  { symbol: '1755', name: '六甲商事',           sector: '商社',   start: 2960, beta: 1.10, drift: 0.06,  vol: 0.23, yield_: 0.034, lot: 100 },
  { symbol: '1868', name: '蒼空モビリティ',     sector: '自動車', start: 1642, beta: 1.30, drift: 0.05,  vol: 0.30, yield_: 0.028, lot: 100 },
  { symbol: '1972', name: '常磐地所',           sector: '不動産', start:  932, beta: 0.95, drift: 0.03,  vol: 0.26, yield_: 0.031, lot: 100 },
];
