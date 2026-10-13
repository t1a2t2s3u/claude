// お問い合わせフォームの受け口。
//
// サイト本体 (dist/) は Cloudflare の静的アセットとして配信される。この
// Worker は /api/contact への POST だけを処理し、それ以外はアセットへ
// そのまま流す。フォームの送信先を他社のサービスにしないのは、お客様が
// 書いた内容（住所・電話番号）を預ける先を増やさないため。
//
// メールの送信には Cloudflare の send_email バインディングを使う。外部の
// メール配信サービスを契約しなくても、検証済みの宛先に送れる。

import { EmailMessage } from "cloudflare:email";

// 受け取る本文の上限。これを超えるものは読まずに捨てる。
const MAX_BODY_BYTES = 32 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") {
        // 直接URLを開かれた場合。フォームへ戻す。
        return Response.redirect(new URL("/contact/", url).toString(), 303);
      }
      return handleContact(request, env, url);
    }

    // それ以外はサイトの静的ファイル。
    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request, env, url) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) {
    return errorPage(url, "ご相談内容が長すぎます。短くしてもう一度お試しください。");
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return errorPage(url, "送信内容を読み取れませんでした。もう一度お試しください。");
  }

  const value = (key, limit) => String(form.get(key) ?? "").trim().slice(0, limit);
  const name = value("name", 60);
  const tel = value("tel", 20);
  const email = value("email", 120);
  const area = value("area", 20);
  const message = value("message", 2000);
  const estimate = value("estimate", 10);
  const honeypot = value("company", 100);

  // 人には見えない欄が埋まっていれば機械。お客様には成功に見せず、
  // かといって理由も明かさずに、静かに受け流す。
  if (honeypot) {
    return Response.redirect(new URL("/thanks/", url).toString(), 303);
  }

  if (!name || !message) {
    return errorPage(url, "お名前とご相談内容は必ず入力してください。");
  }
  if (!tel && !email) {
    return errorPage(url, "折り返しのご連絡先として、電話番号かメールアドレスのどちらかを入力してください。");
  }

  const body = [
    "ホームページのお問い合わせフォームから送信がありました。",
    "",
    `お名前　　　： ${name}`,
    `電話番号　　： ${tel || "（未入力）"}`,
    `メール　　　： ${email || "（未入力）"}`,
    `市町村　　　： ${area || "（未選択）"}`,
    `他社見積り　： ${estimate ? "あり（診断の希望あり）" : "なし"}`,
    `受信日時　　： ${jstNow()}`,
    "",
    "--- ご相談内容 ---",
    message,
    "",
    "------------------",
    email
      ? "このメールにそのまま返信すると、お客様へ届きます。"
      : "お客様のメールアドレスの入力はありません。お電話でご連絡ください。",
  ].join("\n");

  const subject = `【ホームページ】お問い合わせ（${name.slice(0, 20)} 様）`;
  const from = env.CONTACT_FROM;
  const to = env.CONTACT_TO;

  // 宛先が未設定のまま公開された場合。黙って捨てずに、別の連絡手段を出す。
  if (!to || to.includes("要記入") || !from) {
    console.error("contact mail not configured");
    return errorPage(
      url,
      "ただいまフォームからの送信を受け付けられません。お手数ですが、お電話かLINEでご連絡ください。"
    );
  }

  try {
    await env.CONTACT_MAIL.send(
      new EmailMessage(from, to, mime({ from, to, subject, body, replyTo: email }))
    );
  } catch (err) {
    console.error("contact mail failed", err);
    return errorPage(
      url,
      "送信処理でエラーが起きました。お手数ですが、お電話かLINEでご連絡ください。"
    );
  }

  return Response.redirect(new URL("/thanks/", url).toString(), 303);
}

// ---------------------------------------------------------------- メール本文

function jstNow() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function base64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// 日本語のヘッダはそのまま書けない (RFC 2047 のエンコード済み語にする)。
function encodeHeader(text) {
  return `=?UTF-8?B?${base64(new TextEncoder().encode(text))}?=`;
}

function mime({ from, to, subject, body, replyTo }) {
  const encoded = base64(new TextEncoder().encode(body)).replace(/(.{76})/g, "$1\r\n");
  const headers = [
    `From: ${encodeHeader("辰弥塗装工業 お問い合わせ")} <${from}>`,
    `To: <${to}>`,
    // 迷惑メール判定を避けるため、返信先は検証済みの差出人とは別に持つ。
    replyTo ? `Reply-To: <${replyTo}>` : null,
    `Subject: ${encodeHeader(subject)}`,
    `Message-ID: <${crypto.randomUUID()}@tatsumi-tosou.com>`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean);
  return `${headers.join("\r\n")}\r\n\r\n${encoded}\r\n`;
}

// ---------------------------------------------------------------- エラー画面

// 入力し直してもらう画面。サイトのCSSをそのまま読むので見た目は揃う。
// 「戻る」で入力内容が残るブラウザが多いため、やり直しを促す。
function errorPage(url, reason) {
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>送信できませんでした｜辰弥塗装工業</title>
<link rel="stylesheet" href="/assets/style.css">
</head>
<body>
<main id="main">
  <div class="wrap prose-wrap" style="padding-block:3rem">
    <div class="prose">
      <h1>送信できませんでした</h1>
      <p>${escapeHtml(reason)}</p>
      <p>お手数ですが、ブラウザの「戻る」で前の画面に戻って、もう一度お試しください。</p>
      <p><a href="/contact/#form">お問い合わせフォームへ戻る</a></p>
    </div>
  </div>
</main>
</body>
</html>`;
  return new Response(html, {
    status: 400,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
