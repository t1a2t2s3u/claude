# CLAUDE.md

Guidance for Claude Code and other AI assistants working in this repository.

## Project overview

This repository is the owner's personal **AI-employee workspace**: Claude Code
sessions act as staff members with defined roles, driven by skills in
`.claude/skills/` and scheduled Routines. There is no application code to
build or run.

The 13 employees are organised into four departments. Keep this structure when
adding staff: a new employee joins a department (or a new one is declared here
and on the office board), it does not just get appended to a flat list.

### 本業 — 辰弥塗装工業 Web集客部 (`seo/`)

The owner's REAL painting business (exterior wall and roof; Akita City,
Katagami City, Minamiakita District; https://tatsumi-tosou.com/).

- **seo-director** — weekly SEO/MEO research, prioritised action list, blog
  briefs. Mondays.
- **seo-writer** — two blog articles a month from those briefs, written in
  the site's own post format and SEO-checked, delivered to the blog board as
  確認待ち. Publishes to the site branch only after the owner's OK. Tuesdays.
- **meo** — Google Business Profile posts, profile audits, review replies.
  Thursdays. The owner posts manually.

The website itself lives on another branch of this same repository:
`claude/seo-meo-automation-mvntxp` (Cloudflare serves its committed `dist/`;
`site/company.toml` mirrors the Google Business Profile and is the NAP source
of truth; blog posts are `site/posts/*.md`, drafts in `drafts/`, and that
branch's CLAUDE.md requires the owner's sign-off before publishing). The
`seo/` workspace here plans and drafts; anything that changes the live site
goes through that branch and its rules. **Nothing is published without the
owner's explicit OK** (given in chat against the blog board below); the
seo-writer skill holds the publish recipe.

`seo/business-profile.md` is the only source of facts about the company
(transcribed from `site/company.toml`; the toml wins on any conflict).
Inventing credentials, prices, past jobs, or customer voices is forbidden
(mark gaps `【要確認】`). Fake, incentivised, or scripted reviews are out of
bounds — Japan's stealth-marketing rules make that a legal risk; asking real
customers for honest reviews is fine.

### 副業 — note × SNS 編集部 (`strategy/`, `articles/`, `sns/`, `analytics/`)

- **editor-in-chief** — strategy, planning, briefs. Mondays.
- **researcher** — weekly trend reports (`strategy/research/`). Sundays.
- **writer** — note drafts into `articles/drafts/`. Tue/Thu.
- **reviewer** — proofreads and promotes to `articles/ready/`. Wed/Fri.
- **sns** — X and Threads drafts into `sns/queue.md`, three a day. Daily.
- **analyst** — owner-supplied metrics into `analytics/`. Saturdays.

Boundary: AI staff research, plan, and draft; the owner publishes to note,
sets prices, and supplies real personal experiences (drafts carry
placeholders for these — fabricating experiences or earnings is forbidden).

### 新規事業 — プロダクト開発室 (`product/`)

- **product-scout** — hunts app/tool ideas the owner could build with Claude
  Code and monetize. Wednesdays. Distinct from the note researcher: that one
  hunts article topics, this one hunts products to sell.

### 管理 — 管理部 (`TASKS.md`, `reports/`, `audit/`, `finishing/`)

- **secretary** — cross-department task board and the morning briefing.
  Weekday mornings. Any task-related request from the user goes through it.
- **auditor** — spot-checks every department's output for fabrication,
  puffery, legal risk, and rule violations; reports in `audit/` and files
  🔴 items on the task board. Saturdays. Flags, does not rewrite (except a
  `【監査保留】` hold on clear legal risks).
- **finisher** — turns every owner-only gap (`【要確認】`,
  `【あなたの体験をここに】`, review memos) into a yes/no question sheet in
  `finishing/questions.md`, then applies the owner's answers and marks items
  投稿可. Daily at noon. Never fills a gap without an answer.

## Repository structure

- `TASKS.md` — the task board the secretary maintains. Its format and section
  meanings are defined in the secretary skill; do not restructure it ad hoc.
- `reports/` — daily morning briefings written by the secretary, one file per
  day (`YYYY-MM-DD.md`).
- `strategy/` — the note team's editorial policy, weekly content calendar,
  and per-article writing briefs (`briefs/`). Owned by the editor-in-chief;
  lane-level changes to `editorial-policy.md` need the user's approval.
- `articles/` — article drafts and published copies; see `articles/README.md`
  for the flow.
- `sns/` — the X/Threads posting queue (`queue.md`) maintained by the sns
  employee.
- `analytics/` — the KPI log (`kpi.md`), owner-supplied data drops (`inbox/`),
  and the analyst's weekly reports (`reports/`).
- `product/` — the app-idea pipeline (`pipeline.md`), the scout's weekly
  research (`reports/`), and per-idea planning memos (`ideas/`).
- `seo/` — the painting business's SEO/MEO workspace: `business-profile.md`
  (the fact base), `tasks.md` (action list), `photo-requests.md` (the
  standing list of photos the owner needs to shoot), `reports/`, `briefs/`,
  `articles/` (site-format drafts plus `.memo.md` sidecars; see its README),
  and `gbp/queue.md` (Business Profile post drafts).
- `office/` — HTML sources of the published boards (office, blog board,
  finishing sheet).
- `audit/` — the auditor's weekly reports (`YYYY-MM-DD.md`).
- `finishing/` — the finisher's living question sheet (`questions.md`).
- `.claude/skills/` — one directory per AI employee. New employees get a new
  skill directory here, not more sections in existing skills.

## Office board

A live status dashboard ("AI社員オフィス") is published as a Claude
artifact: https://claude.ai/code/artifact/c7d8805a-a816-41b8-b2f8-f8c401d90f6c

Each employee's skill includes a reporting step that updates the board's
database (via the Artifact tool's `write_db`) at the end of a run:
`employees/<id>` for status, `activity/<YYYYMMDD-HHMM>` for the feed, and
`office/stats` (secretary only) for task-board counts. Reporting is
best-effort — sessions without the Artifact tool skip it.

## Delivery board

A copy-ready page of the SNS employee's unposted drafts (X and Threads
versions, each with a copy button):
https://claude.ai/code/artifact/57204c23-dcaa-4df7-93db-6d67648fb985

The sns skill refreshes it at the end of each run from `sns/queue.md`
(read the published HTML, swap the post data and header counts, republish
to the same URL). Best-effort, like the office board.

## Blog board

The painting company's pre-publication blog review page (full text, SEO
targets, owner questions per article; statuses 確認待ち / 公開予約 / 公開済み):
https://claude.ai/code/artifact/f489999f-7e8e-4453-984a-3a193aab70fd

Source: `office/blog-board.html`. The seo-writer adds a card for every new
article and flips it to 公開済み after publishing; the owner approves in chat
(「ブログ <slug> OK」). Best-effort republish, like the other boards.

## Briefing board

The morning briefing as a one-tap page (highlight of the day, today's tasks,
owner action items, board counts, team activity):
https://claude.ai/code/artifact/35755c24-c2e8-4945-b2d9-fb2f515f9e00

Source: `office/briefing-board.html`. The secretary rewrites it each weekday
morning from that day's `reports/YYYY-MM-DD.md` and republishes it to the
same URL. Best-effort republish, like the other boards.

## Finishing board

The finisher's question sheet as a page (owner answers by pasting the reply
template into chat):
https://claude.ai/code/artifact/a2022666-784a-45e2-b650-c67103b3d4df

The finisher republishes it from `finishing/questions.md` after each run.
Best-effort, like the other boards.

## Conventions

- User-facing content (task board, reports, skill instructions) is written in
  Japanese; this file stays in English.
- Commits by an employee are prefixed with its role, e.g.
  `secretary: add two tasks to inbox`.
- Employees manage and report; they do not execute the user's tasks for them
  unless the user explicitly asks.

## Git workflow

- Development happens on feature branches; do not commit directly to the
  default branch.
- Push with `git push -u origin <branch-name>`.
- Never force-push or rewrite history on a branch owned by someone else.
- Open a pull request only when explicitly asked.

## Notes for assistants

- Prefer reading the code over trusting this file where the two disagree, and
  fix this file when you find a discrepancy.
- Keep this document short and specific. Sections that restate general good
  practice should be deleted rather than expanded.
