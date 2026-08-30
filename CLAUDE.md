# CLAUDE.md

Guidance for Claude Code and other AI assistants working in this repository.

## Project overview

This repository hosts a content operation for a note (note.com) publication,
run by scheduled AI assistants ("Routines") acting as staff: a writer
(Tue/Thu 8:00 JST) drafts articles, an editor-in-chief (Mon 8:00 JST)
reviews and promotes them. Publishing to note itself and posting to social
media are manual, human steps.

There is no application code, build system, or test suite. The deliverables
are Markdown articles under `note事業部/`.

## Repository structure

- `note事業部/` — the content operation. See `note事業部/README.md` for the
  workflow and folder layout (`drafts/`, `published/`, `research/`, `sns/`).
- `note事業部/編集方針.md` — editorial policy. All assistants writing or
  editing articles must follow it.

## Conventions

- Articles are Japanese Markdown files named `YYYY-MM-DD-slug.md` with YAML
  front matter (`title`, `date`, `status`, `author`).
- The writer pushes to `claude/writer-draft-YYYYMMDD` branches; the editor
  pushes to `claude/editor-review-YYYYMMDD` branches.

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
