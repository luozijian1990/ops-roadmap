# Repository instructions

## Project overview

This repository is a public collection of Chinese operations, SRE, and platform-engineering learning notes.

- Markdown files under `topics/` are the source documents.
- `*-roadmap.html` files are generated learning-roadmap views of those Markdown files.
- `index.html` is the public catalog and must link every roadmap HTML.
- `README.md` is the GitHub-facing project introduction and topic catalog.

## Content conventions

- Keep public paths lowercase and kebab-case.
- Keep each topic under `topics/<category>/<topic>/`.
- A learning note must start with exactly one H1 title.
- Use H2 for chapters, H3 for roadmap sections, and H4 for internal knowledge points.
- Put chapter introductions inside the first H3 section; text between H2 and the first H3 is not collected by the roadmap parser.
- Keep Mermaid diagrams, tables, code examples, and meaningful Markdown line breaks intact.
- Split unusually large notes along natural chapter boundaries; target fewer than 5,000 lines per Markdown file.

The Markdown structure and writing style follow:

- `learning-notes-builder`: https://github.com/luozijian1990/personal-skill/tree/main/skills/learning-notes-builder
- `learning-roadmap`: https://github.com/luozijian1990/personal-skill/tree/main/skills/learning-roadmap

## Generated roadmaps

Regenerate standard roadmap HTML from the repository root with:

```bash
./scripts/build-roadmaps.sh
```

After regeneration, verify that:

- every formal Markdown note has one matching `*-roadmap.html`;
- every roadmap has a relative `../../../index.html` back link;
- every roadmap is linked from the root `index.html`;
- the embedded `<script id="data" type="application/json">` payload is valid JSON.

`topics/cloud-native/kubernetes/full-animated-roadmap.html` is the preserved complete animation edition. Do not overwrite it with the standard roadmap builder. Keep its `roadmap-animations/` sidecar and screenshots together with it.

## Change discipline

- Preserve unrelated user changes in a dirty worktree.
- Prefer bounded edits and explicit file staging.
- Treat Markdown as the source of truth; do not hand-edit generated roadmap content when the source note can be fixed and regenerated.
- Keep `README.md`, `index.html`, topic paths, and generated files synchronized after renames or splits.
- Do not push, publish, or change GitHub settings unless the user explicitly asks.

## Agent skills

### Issue tracker

Issues for this repository live in GitHub Issues for `luozijian1990/ops-roadmap`. Use the `gh` CLI for issue operations and infer the repository from the configured `origin` remote. Pull requests are not an issue-triage request surface by default. See `docs/agents/issue-tracker.md`.

### Domain docs

This is a single-context repository. If `CONTEXT.md` or files under `docs/adr/` are added later, read the relevant documents before changing the affected area. If they do not exist, proceed without requiring them. See `docs/agents/domain.md`.
