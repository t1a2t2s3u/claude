# CLAUDE.md

Guidance for Claude Code and other AI assistants working in this repository.

## Project overview

This repository is the owner's personal **AI-employee workspace**: Claude Code
sessions act as staff members with defined roles, driven by skills in
`.claude/skills/` and scheduled Routines. There is no application code to
build or run.

The first employee is the **task-management secretary** — see
`.claude/skills/secretary/SKILL.md` for its full job description. Any
task-related request from the user (adding, checking, or reorganizing tasks)
goes through that skill.

## Repository structure

- `TASKS.md` — the task board the secretary maintains. Its format and section
  meanings are defined in the secretary skill; do not restructure it ad hoc.
- `reports/` — daily morning briefings written by the secretary, one file per
  day (`YYYY-MM-DD.md`).
- `.claude/skills/` — one directory per AI employee. New employees get a new
  skill directory here, not more sections in existing skills.

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
