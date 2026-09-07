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
in `NHI_STD` (31 prefectures' standard rates) and `NHI_PRESETS` (exact city
rates) — update them when fiscal years roll over. State is v3:
`{payments, biz, profile}`; `migrate()` upgrades older embedded state.

## Repository structure

- `index.html` — the entire application.
- `README.md` — user-facing description (Japanese).

## Development workflow

No build, no dependencies. Open `index.html` in a browser to run it.

Quick syntax check after editing the inline script:
extract the `<script>` body and run `node --check` on it.

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
