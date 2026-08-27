// お客様にお渡しする「建物診断結果のご報告」を生成する。
//
// 使い方: node docs/shindan/report.js <データ.json>
//   → 同じ場所に <データ名>.docx を書き出す
//
// データの形は sample-data.json を参照。診断書（手書き）と現地写真を
// もとに、1件ずつ JSON を作って渡す。写真は 4:3・横向きに揃えておくこと
// （スマホ写真はそのままでよいが、縦写真は事前に回転・トリミングする）。
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType, ImageRun, VerticalAlign,
} = require("docx");

const DEEP = "0B4A5F";
const ACCENT = "E2661F";
const MUTED = "566871";
const LINE = "BBCDD4";
const TINT = "EAF4F7";
const FONT = "Yu Gothic";

const LEVELS = {
  ok: { label: "良好", color: "00758F" },
  watch: { label: "経過観察", color: "B07A00" },
  repair: { label: "要補修", color: "BD4F12" },
};
const VERDICTS = {
  ok: "現時点で、塗り替えの必要はありません",
  watch: "1〜2年のうちに、ご検討をおすすめします",
  repair: "早めの補修・塗り替えをおすすめします",
  partial: "部分補修で対応できます",
};

const dataPath = process.argv[2];
if (!dataPath) {
  console.error("使い方: node report.js <データ.json>");
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
const baseDir = path.dirname(path.resolve(dataPath));
const ROOT = path.resolve(__dirname, "..", "..");
const logo = fs.readFileSync(path.join(ROOT, "site/assets/logo.png"));

// JPEG/PNG の寸法を読む（縦横比を保って配置するため）
function imageSize(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return { w: 4, h: 3 };
}

const CONTENT_W = 9800;
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const thin = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const allThin = { top: thin, bottom: thin, left: thin, right: thin };
const allNone = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

const run = (text, opts = {}) => new TextRun({ text, font: FONT, size: 18, ...opts });
const p = (children, opts = {}) => new Paragraph({ children, spacing: { after: 60 }, ...opts });
const cell = (children, width, opts = {}) => new TableCell({
  children, borders: allThin, verticalAlign: VerticalAlign.CENTER,
  width: { size: width, type: WidthType.DXA },
  margins: { top: 60, bottom: 60, left: 100, right: 100 },
  ...opts,
});

// --- ヘッダー -------------------------------------------------------------
const children = [
  new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [2600, 7200],
    borders: allNone,
    rows: [new TableRow({
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
            new Paragraph({ alignment: AlignmentType.RIGHT,
              children: [run("建物診断結果のご報告", { bold: true, size: 40, color: DEEP })] }),
            new Paragraph({ alignment: AlignmentType.RIGHT,
              children: [run("現地にて拝見した状態を、写真とあわせてご報告します", { size: 15, color: MUTED })] }),
          ],
          borders: allNone, verticalAlign: VerticalAlign.CENTER,
          width: { size: 7200, type: WidthType.DXA },
        }),
      ],
    })],
  }),
  new Paragraph({
    children: [], spacing: { after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 1 } },
  }),
];

if (data.sample_note) {
  children.push(p([run("※ この書類はレイアウト確認用の見本です。記載内容・写真は実在のお客様のものではありません。",
    { bold: true, color: "B00000", size: 16 })], { spacing: { after: 120 } }));
}

// --- 基本情報 -------------------------------------------------------------
const infoRow = (l1, v1, l2, v2) => new TableRow({
  children: [
    cell([p([run(l1, { bold: true, color: DEEP })])], 1500, { shading: { type: ShadingType.CLEAR, fill: TINT } }),
    cell([p([run(v1 || "")])], 3400),
    cell([p([run(l2, { bold: true, color: DEEP })])], 1500, { shading: { type: ShadingType.CLEAR, fill: TINT } }),
    cell([p([run(v2 || "")])], 3400),
  ],
});
children.push(new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: [1500, 3400, 1500, 3400],
  rows: [
    infoRow("お客様名", `${data.customer}`, "診断日", data.date),
    infoRow("建物ご住所", data.address, "診断者", `辰弥塗装工業　${data.inspector || "浅利辰也"}`),
    infoRow("築年数", data.built_years, "前回の塗装", data.last_paint),
  ],
}));
children.push(new Paragraph({ children: [], spacing: { after: 140 } }));

// --- 総合判定 -------------------------------------------------------------
children.push(new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: [2200, 7600],
  rows: [new TableRow({
    children: [
      cell([p([run("総合判定", { bold: true, color: "FFFFFF", size: 22 })], { alignment: AlignmentType.CENTER })],
        2200, { shading: { type: ShadingType.CLEAR, fill: DEEP } }),
      cell([
        p([run(VERDICTS[data.verdict] || data.verdict, { bold: true, size: 22, color: DEEP })],
          { spacing: { after: data.verdict_note ? 40 : 0 } }),
        ...(data.verdict_note ? [p([run(data.verdict_note, { size: 16, color: MUTED })], { spacing: { after: 0 } })] : []),
      ], 7600),
    ],
  })],
}));
children.push(new Paragraph({ children: [], spacing: { after: 100 } }));

if (data.summary) {
  children.push(p([run("全体の所見", { bold: true, size: 20, color: DEEP })], { spacing: { after: 60 } }));
  for (const para of data.summary.split("\n\n")) {
    children.push(p([run(para)], { spacing: { after: 80, line: 300 } }));
  }
}

// --- 箇所ごとのご報告 -----------------------------------------------------
children.push(new Paragraph({ children: [], spacing: { after: 60 } }));
children.push(p([run("拝見した箇所のご報告", { bold: true, size: 22, color: DEEP })], { spacing: { after: 100 } }));

data.findings.forEach((f, idx) => {
  const photoBuf = fs.readFileSync(path.resolve(baseDir, f.photo));
  const { w, h } = imageSize(photoBuf);
  const photoW = 250;
  const photoH = Math.round(photoW * h / w);
  const level = LEVELS[f.level] || LEVELS.watch;
  const type = f.photo.toLowerCase().endsWith(".png") ? "png" : "jpg";

  const textParas = [
    p([
      run(`${idx + 1}. ${f.area}　`, { bold: true, size: 20, color: DEEP }),
      run(f.symptom, { bold: true, size: 20 }),
      run(`　［${level.label}］`, { bold: true, size: 18, color: level.color }),
    ], { spacing: { after: 80 } }),
    p([run("現在の状態：", { bold: true, color: DEEP, size: 17 }), run(f.state, { size: 17 })],
      { spacing: { after: 60, line: 280 } }),
  ];
  if (f.risk) {
    textParas.push(p([run("このままにすると：", { bold: true, color: DEEP, size: 17 }), run(f.risk, { size: 17 })],
      { spacing: { after: 60, line: 280 } }));
  }
  if (f.action) {
    textParas.push(p([run("おすすめの対処：", { bold: true, color: ACCENT, size: 17 }), run(f.action, { size: 17 })],
      { spacing: { after: 0, line: 280 } }));
  }

  children.push(new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [4300, 5500],
    rows: [new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [new ImageRun({ type, data: photoBuf, transformation: { width: photoW, height: photoH } })],
              spacing: { after: 20 },
            }),
            ...(f.photo_caption ? [p([run(f.photo_caption, { size: 14, color: MUTED })], { spacing: { after: 0 } })] : []),
          ],
          borders: allThin, verticalAlign: VerticalAlign.CENTER,
          width: { size: 4300, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
        }),
        new TableCell({
          children: textParas,
          borders: allThin, verticalAlign: VerticalAlign.TOP,
          width: { size: 5500, type: WidthType.DXA },
          margins: { top: 100, bottom: 100, left: 140, right: 140 },
        }),
      ],
    })],
  }));
  children.push(new Paragraph({ children: [], spacing: { after: 140 } }));
});

// --- 締め・会社情報 -------------------------------------------------------
children.push(p([run("本診断は塗装業者としての目視点検です。診断の結果にかかわらず、工事をご契約いただく義務はありません。ご不明な点は、どんな小さなことでもお気軽にお尋ねください。", { size: 14, color: MUTED })], { spacing: { after: 100 } }));
children.push(new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: [CONTENT_W],
  borders: allNone,
  rows: [new TableRow({
    children: [new TableCell({
      children: [
        p([run("辰弥塗装工業（代表　浅利辰也）", { bold: true, size: 20, color: DEEP })], { spacing: { after: 40 } }),
        p([run("〒011-0931 秋田県秋田市将軍野東2丁目15-60-5", { size: 16 })], { spacing: { after: 20 } }),
        p([run("☎ 080-7706-5395（平日 8:00〜20:00／土曜 8:30〜19:00）｜ https://tatsumi-tosou.com", { size: 16 })], { spacing: { after: 0 } }),
      ],
      borders: allNone,
      shading: { type: ShadingType.CLEAR, fill: TINT },
      margins: { top: 140, bottom: 140, left: 200, right: 200 },
      width: { size: CONTENT_W, type: WidthType.DXA },
    })],
  })],
}));

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: 18 } } } },
  sections: [{
    properties: { page: { margin: { top: 700, bottom: 600, left: 1053, right: 1053 } } },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(baseDir, path.basename(dataPath).replace(/\.json$/, "") + ".docx");
  fs.writeFileSync(out, buf);
  console.log("書き出しました:", out);
});
