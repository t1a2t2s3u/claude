# CLAUDE.md

Guidance for Claude Code and other AI assistants working in this repository.

## Project overview

This repository is the owner's personal **AI-employee workspace**: Claude Code
sessions act as staff members with defined roles, driven by skills in
`.claude/skills/` and scheduled Routines. There is no application code to
build or run.

Current employees:

- **secretary** (`.claude/skills/secretary/`) — task management. Any
  task-related request from the user (adding, checking, or reorganizing
  tasks) goes through that skill.
- **editor-in-chief** (`.claude/skills/editor-in-chief/`) — strategy,
  planning, and writing briefs for the note monetization team.
- **researcher** (`.claude/skills/researcher/`) — weekly trend research
  reports (`strategy/research/`) feeding the editor's Monday meeting.
- **writer** (`.claude/skills/writer/`) — drafts note articles from the
  editor's briefs into `articles/drafts/`.
- **reviewer** (`.claude/skills/reviewer/`) — proofreads drafts and promotes
  passing ones to `articles/ready/` with a review memo.
- **sns** (`.claude/skills/sns/`) — drafts X (Twitter) and Threads promo
  posts into the `sns/queue.md` posting queue; the owner posts them manually.
- **analyst** (`.claude/skills/analyst/`) — records owner-supplied metrics in
  `analytics/` and writes improvement proposals for the editor. Never invents
  numbers.
- **product-scout** (`.claude/skills/product-scout/`) — hunts for app/tool
  ideas the owner could actually build with Claude Code and monetize; writes
  weekly reports and idea memos under `product/`. Separate from the note team:
  the researcher hunts article topics, the scout hunts products to sell.

The note team's boundary: AI staff research, plan, and draft; the owner
personally publishes to note, sets prices, and supplies real personal
experiences (drafts contain placeholders for these — fabricating
experiences or earnings figures is forbidden).

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
