# CLAUDE.md

Guidance for Claude Code and other AI assistants working in this repository.

## Project overview

This repository hosts the owner's AI-employee workspace: a note (note.com)
monetization team of seven scheduled AI staff (editor-in-chief, writer,
reviewer, SNS, analyst, researcher, task secretary). Each member runs as a
persistent session that its Routine delivers into, and pushes to the team
branch `claude/ai-employee-claude-code-d99jvr` — that branch's CLAUDE.md,
`.claude/skills/`, and `strategy/` are the authoritative team docs.
Publishing to note and posting to social media are manual, human steps.

## Repository structure

- Team workspace (branch `claude/ai-employee-claude-code-d99jvr`):
  `articles/` (drafts → ready → published), `strategy/` (editorial policy,
  calendar, briefs), `sns/`, `analytics/`, `TASKS.md`, `reports/`.
- `note事業部/` (this branch) — a retired earlier setup, merged into the
  team workspace on 2026-09-06; kept as a record only.

## Conventions

- Articles are Japanese Markdown files named `YYYY-MM-DD-slug.md`.
- Routines must deliver into persistent sessions with a declared outcome
  branch; throwaway per-fire sessions cannot push and must not be used.

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
