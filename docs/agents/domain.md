# Domain docs

This repository uses a single-context domain-document layout.

## Before exploring

- Read `CONTEXT.md` at the repository root if it exists.
- Read relevant ADRs under `docs/adr/` if that directory exists.
- If neither exists, proceed silently; do not require placeholder documents before working.

## Layout

```text
/
├── CONTEXT.md
├── docs/adr/
└── topics/
```

`CONTEXT.md` is the shared glossary and domain overview. Files under `docs/adr/` record repository-wide decisions.

## Vocabulary and decisions

- Use the terminology defined in `CONTEXT.md` in issue titles, plans, checks, and documentation changes.
- If a needed concept is missing, reconsider whether it belongs to the project vocabulary or note the gap for later domain modeling.
- If proposed work conflicts with an ADR, surface the conflict explicitly instead of silently overriding the decision.
