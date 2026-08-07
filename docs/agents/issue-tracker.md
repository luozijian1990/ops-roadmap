# Issue tracker: GitHub

Issues and PRDs for this repository live in GitHub Issues for `luozijian1990/ops-roadmap`. Use the `gh` CLI for issue operations and infer the repository from the configured `origin` remote.

## Conventions

- Create an issue with `gh issue create --title "..." --body "..."`.
- Read an issue with `gh issue view <number> --comments` and fetch its labels when triaging.
- List issues with `gh issue list`, adding explicit state, label, and JSON filters as needed.
- Comment with `gh issue comment <number> --body "..."`.
- Apply or remove labels with `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close an issue with `gh issue close <number> --comment "..."`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

Pull requests are not included in issue triage unless this flag is changed to `yes` later.

## Skill terminology

- When a skill says "publish to the issue tracker", create a GitHub issue.
- When a skill says "fetch the relevant ticket", run `gh issue view <number> --comments`.
