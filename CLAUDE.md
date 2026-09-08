# CLAUDE.md

Guidance for Claude Code and other AI assistants working in this repository.

## Project overview

「Sonae」(そなえ) — a single-file web app for monthly recurring payments,
freelance income/expense records, and Japanese tax estimation. Everything
lives in `index.html`: markup, styles, and script are inline, with Google
Fonts as the only external dependency. UI copy is Japanese.

Design decision a newcomer would get wrong: the app republishes **itself** to
persist data. State is embedded as JSON in
`<script type="application/json" id="app-state">`, and on save the script
rebuilds the whole document from its own source
(`document.currentScript.textContent`) via `docFor()` and calls the Claude
Artifact runtime's `artifact.publish()`. When that runtime is absent (file
opened directly), it falls back to `localStorage`. Consequences:

- Never write a literal `</script>` inside the inline script (it is always
  split as `'</scr' + 'ipt>'`), and keep the `docFor()` head template in sync
  with the real `<head>`.
- The embedded JSON escapes the `<` character as the unicode escape `\u003c` when serialized.

Tax parameters (income-tax brackets, R7/R8 basic deduction table, pension)
live in the `TAX` constant near the top of the inline script; NHI rates are
in `NHI_STD` (33 prefectures' standard rates) and `NHI_PRESETS` (exact city
rates) — update them when fiscal years roll over, and move `TAX.basisYear`
with them: past it the app warns that its rates are stale. State is v3:
`{payments, biz, saves, invoices, taxPaid, profile}` (`profile.ded` holds the 所得控除); `migrate()` upgrades older
embedded state (v3 income becomes `paid:true`, since it predates 入金管理).

The iOS/PWA head tags live in `APP_META` (including a base64 apple-touch-icon)
and are emitted both in the real `<head>` and by `docFor()` — change them in
one place only by editing `APP_META` and the head to match. `release/` holds
the manifest and service worker for self-hosting; the script registers them
only when `window.claude` is absent, so the Artifact is unaffected.

`calcDeductions()` returns every 所得控除 with separate `it` and `rt` amounts —
they genuinely differ (生命保険料 12万/7万, 扶養 38万/33万 …), so never collapse
them into one number. It also returns `human`, the sum of the 人的控除の差, which
`residentAdjust()` needs; a flat 調整控除 is wrong once there are dependents.
`furusato()` handles ふるさと納税, which is an 所得控除 for 所得税 but a 税額控除
for 住民税, and derives the 実質2,000円 ceiling from the 住民税所得割.

`calcTax(y)` calls itself once for `y-1` to find 予定納税 — pass
`{noPrev:true}` to stop that recursing further. `lossCarry()` walks the years
forward so intervening profits consume a loss before it expires.

`taxTips()` builds the 節税 advice from `calcTax()`'s output and
`marginalRates()`. It hard-codes filing deadlines and the 2026 end of the
消費税 2割特例, so it needs a pass whenever tax rules change — a tip that no
longer applies is worse than no tip. Effect amounts come from the marginal
rate, and expenses vs. income deductions are deliberately kept apart
(expenses also reduce 国保 and 個人事業税; income deductions do not).

## Repository structure

- `index.html` — the entire application.
- `README.md` — user-facing description (Japanese).

## Development workflow

No build, no dependencies. Open `index.html` in a browser to run it.

Quick syntax check after editing the inline script:
extract the `<script>` body and run `node --check` on it.

**Run `node test/tax.test.mjs` after touching anything the tax engine reads.**
It boots `index.html` inside `node:vm` on a stub DOM (no browser, no packages)
and checks ~90 hand-verified amounts. A failure means the tax numbers moved:
confirm the new figure by hand before updating the expected value, never the
other way round. `let`/`const` bindings are not context properties — reach
`state`, `view` and `TAX` through the harness's `$('expr')`.

## Conventions

- Keep it a single self-contained file; inline any new CSS/JS.
- Theme tokens: full light palette on bare `:root`; dark overrides live in
  `@media (prefers-color-scheme: dark)` guarded with
  `:root:not([data-theme="light"])` **and** duplicated under
  `:root[data-theme="dark"]`. Never give a color its only definition inside
  one of those blocks.
- Escape all user-entered text through `esc()` before interpolating into HTML.

## Git workflow

- Development happens on feature branches; do not commit directly to the
  default branch.
- Push with `git push -u origin <branch-name>`.
- Never force-push or rewrite history on a branch owned by someone else.
- Open a pull request only when explicitly asked.

## Notes for assistants

- Prefer reading the code over trusting this file where the two disagree, and
  fix this file when you find a discrepancy.
- Keep this document short and specific.

## Audience

Sonae is for sole proprietors of any trade. Keep UI copy free of
occupation-specific vocabulary (現場, 工事, 塗装 and the like) — a job-site
grouping feature was removed for exactly this reason. Statutory wording such as
the 簡易課税 第3種「製造業・建設業など」 label is not copy and stays as written.
