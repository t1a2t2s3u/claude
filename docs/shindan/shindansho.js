// 現地調査で使う「外壁・屋根 診断書」(A4・2ページ) を生成する。
// 手書きで記入できるチェックリスト形式。配色はサイトと共通。
// 作り直すときは: node docs/shindan/shindansho.js
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType, ImageRun, VerticalAlign,
  PageBreak,
} = require("docx");

const DEEP = "0B4A5F";
const ACCENT = "E2661F";
const MUTED = "566871";
const LINE = "BBCDD4";
const TINT = "EAF4F7";
const FONT = "Yu Gothic";

const ROOT = path.resolve(__dirname, "..", "..");
const logo = fs.readFileSync(path.join(ROOT, "site/assets/logo.png"));
const lineQr = fs.readFileSync(path.join(ROOT, "site/assets/line-qr.png"));

const CONTENT_W = 9800; // A4 幅 11906 − 余白 (1053×2)

const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const thin = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const allThin = { top: thin, bottom: thin, left: thin, right: thin };
const allNone = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function run(text, opts = {}) {
  return new TextRun({ text, font: FONT, size: 18, ...opts });
}
function p(children, opts = {}) {
  return new Paragraph({ children, spacing: { after: 60 }, ...opts });
}
function cell(children, width, opts = {}) {
  return new TableCell({
    children, borders: allThin, verticalAlign: VerticalAlign.CENTER,
    width: { size: width, type: WidthType.DXA },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    ...opts,
  });
}
function headCell(text, width) {
  return cell([p([run(text, { bold: true, color: "FFFFFF", size: 18 })])], width, {
    shading: { type: ShadingType.CLEAR, fill: DEEP },
  });
}
function label(text) {
  return run(text, { bold: true, color: DEEP });
}

// --- ヘッダー -------------------------------------------------------------
const header = new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: [2600, 7200],
  borders: allNone,
  rows: [
    new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [
            new ImageRun({ type: "png", data: logo, transformation: { width: 130, height: 63 } }),
          ] })],
          borders: allNone, verticalAlign: VerticalAlign.CENTER,
          width: { size: 2600, type: WidthType.DXA },
        }),
        new TableCell({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [run("外壁・屋根 診断書", { bold: true, size: 40, color: DEEP })],
            }),
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [run("無料診断 ｜ 本書は建物の状態を記録するもので、工事をお勧めするものではありません", { size: 15, color: MUTED })],
            }),
          ],
          borders: allNone, verticalAlign: VerticalAlign.CENTER,
          width: { size: 7200, type: WidthType.DXA },
        }),
      ],
    }),
  ],
});

// --- 基本情報 -------------------------------------------------------------
function infoRow(l1, v1, l2, v2) {
  return new TableRow({
    children: [
      cell([p([label(l1)])], 1500, { shading: { type: ShadingType.CLEAR, fill: TINT } }),
      cell([p([run(v1)])], 3400),
      cell([p([label(l2)])], 1500, { shading: { type: ShadingType.CLEAR, fill: TINT } }),
      cell([p([run(v2)])], 3400),
    ],
  });
}
const info = new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: [1500, 3400, 1500, 3400],
  rows: [
    infoRow("お客様名", "　　　　　　　　　様", "診断日", "　　　　年　　月　　日"),
    infoRow("建物ご住所", "", "診断者", "辰弥塗装工業　　　　　　"),
    infoRow("築年数", "約　　　　年", "前回の塗装", "約　　　年前 ／ ☐不明 ☐なし"),
    new TableRow({
      children: [
        cell([p([label("外壁材")])], 1500, { shading: { type: ShadingType.CLEAR, fill: TINT } }),
        cell([p([run("☐窯業系サイディング　☐金属サイディング　☐モルタル　☐その他（　　　　）")])], 3400, { columnSpan: 3 }),
      ],
    }),
    new TableRow({
      children: [
        cell([p([label("屋根材")])], 1500, { shading: { type: ShadingType.CLEAR, fill: TINT } }),
        cell([p([run("☐スレート　☐金属　☐瓦　☐その他（　　　　）　／　屋根：☐目視 ☐点検できず")])], 3400, { columnSpan: 3 }),
      ],
    }),
  ],
});

// --- 診断結果 -------------------------------------------------------------
const CHECKS = [
  ["外壁", [
    ["チョーキング（触ると白い粉がつく）", "塗膜の防水機能が切れかけているサイン"],
    ["ひび割れ（クラック）", "幅約（　　　）mm ／ 場所："],
    ["塗膜の剥がれ・膨れ", ""],
    ["色褪せ・ツヤ引け", ""],
    ["藻・カビ・コケ", "日の当たらない面に出やすい"],
  ]],
  ["コーキング", [
    ["ひび割れ・痩せ", "外壁材より先に寿命が来る部位"],
    ["剥離・隙間", "雨水が壁の裏に入る恐れ"],
  ]],
  ["屋根", [
    ["色褪せ・苔", ""],
    ["サビ・板金の浮き", "潮風の影響を受けやすい部位"],
    ["雪止めの状態", "落雪への備え"],
  ]],
  ["付帯部", [
    ["雨樋（割れ・歪み・金具）", ""],
    ["破風・軒天", ""],
    ["ベランダ・手すり等のサビ", ""],
  ]],
];

const checkRows = [
  new TableRow({
    tableHeader: true,
    children: [
      headCell("部位", 1300),
      headCell("診断項目", 4100),
      headCell("良好", 800),
      headCell("経過\n観察", 800),
      headCell("要補修", 800),
      headCell("メモ", 2000),
    ],
  }),
];
for (const [area, items] of CHECKS) {
  items.forEach(([item, note], i) => {
    const children = [
      cell([p([run(item)]), ...(note ? [p([run(note, { size: 14, color: MUTED })], { spacing: { after: 0 } })] : [])], 4100),
      cell([p([run("☐", { size: 24 })], { alignment: AlignmentType.CENTER })], 800),
      cell([p([run("☐", { size: 24 })], { alignment: AlignmentType.CENTER })], 800),
      cell([p([run("☐", { size: 24 })], { alignment: AlignmentType.CENTER })], 800),
      cell([p([run("")])], 2000),
    ];
    if (i === 0) {
      children.unshift(cell([p([label(area)])], 1300, {
        rowSpan: items.length,
        shading: { type: ShadingType.CLEAR, fill: TINT },
      }));
    }
    checkRows.push(new TableRow({ children }));
  });
}
const checkTable = new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: [1300, 4100, 800, 800, 800, 2000],
  rows: checkRows,
});

// --- 総合判定 -------------------------------------------------------------
const verdict = new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: [CONTENT_W],
  rows: [
    new TableRow({ children: [cell([p([run("総合判定（いずれかに ✓）", { bold: true, color: "FFFFFF" })])], CONTENT_W, { shading: { type: ShadingType.CLEAR, fill: DEEP } })] }),
    new TableRow({
      children: [cell([
        p([run("☐ 現時点で、塗り替えの必要はありません（次回の目安：約　　　年後）")]),
        p([run("☐ 1〜2年のうちに、ご検討をおすすめします")]),
        p([run("☐ 早めの補修・塗り替えをおすすめします（劣化が進行中のため）")]),
        p([run("☐ 部分補修で対応できます（場所：　　　　　　　　　　　　）")], { spacing: { after: 0 } }),
      ], CONTENT_W)],
    }),
  ],
});

const findings = new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: [CONTENT_W],
  rows: [
    new TableRow({ children: [cell([p([run("所見（気になった箇所・その理由・撮影した写真の番号など）", { bold: true, color: "FFFFFF" })])], CONTENT_W, { shading: { type: ShadingType.CLEAR, fill: DEEP } })] }),
    ...Array.from({ length: 9 }, (_, i) => new TableRow({
      height: { value: 500, rule: "atLeast" },
      children: [new TableCell({
        children: [p([run("")], { spacing: { after: 0 } })],
        width: { size: CONTENT_W, type: WidthType.DXA },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        borders: {
          left: thin, right: thin,
          top: i === 0 ? thin : { style: BorderStyle.SINGLE, size: 4, color: "D9E7ED" },
          bottom: thin,
        },
      })],
    })),
  ],
});

// --- フッター -------------------------------------------------------------
const footer = new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: [8300, 1500],
  borders: allNone,
  rows: [
    new TableRow({
      children: [
        new TableCell({
          children: [
            p([run("辰弥塗装工業（代表　浅利辰也）", { bold: true, size: 20, color: DEEP })], { spacing: { after: 40 } }),
            p([run("〒011-0931 秋田県秋田市将軍野東2丁目15-60-5", { size: 16 })], { spacing: { after: 20 } }),
            p([run("☎ 080-7706-5395（平日 8:00〜20:00／土曜 8:30〜19:00）", { size: 16 })], { spacing: { after: 20 } }),
            p([run("https://tatsumi-tosou.com ｜ 診断・お見積りは無料です。ご不明な点はいつでもご連絡ください。", { size: 16, color: MUTED })], { spacing: { after: 0 } }),
          ],
          borders: allNone, verticalAlign: VerticalAlign.CENTER,
          width: { size: 8300, type: WidthType.DXA },
        }),
        new TableCell({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new ImageRun({ type: "png", data: lineQr, transformation: { width: 62, height: 62 } })],
              spacing: { after: 0 },
            }),
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [run("LINEで相談", { size: 13, color: MUTED })],
              spacing: { after: 0 },
            }),
          ],
          borders: allNone, verticalAlign: VerticalAlign.CENTER,
          width: { size: 1500, type: WidthType.DXA },
        }),
      ],
    }),
  ],
});

const spacer = (after = 140) => new Paragraph({ children: [], spacing: { after } });

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: 18 } } } },
  sections: [{
    properties: {
      page: { margin: { top: 700, bottom: 600, left: 1053, right: 1053 } },
    },
    children: [
      header,
      new Paragraph({
        children: [],
        spacing: { after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 1 } },
      }),
      info,
      spacer(),
      p([run("診断結果　", { bold: true, size: 22, color: DEEP }),
         run("※「経過観察」は今すぐの工事は不要で、次回の点検で変化を見る項目です", { size: 14, color: MUTED })],
        { spacing: { after: 80 } }),
      checkTable,
      new Paragraph({ children: [new PageBreak()] }),
      verdict,
      spacer(),
      findings,
      spacer(120),
      new Paragraph({
        children: [run("本診断は塗装業者としての目視点検です。診断の結果にかかわらず、工事をご契約いただく義務はありません。", { size: 14, color: MUTED })],
        spacing: { after: 80 },
      }),
      footer,
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, "shindansho.docx");
  fs.writeFileSync(out, buf);
  console.log("書き出しました:", out);
});
