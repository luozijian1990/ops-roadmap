#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
topics_root="${repo_root}/topics"
failures=0

fail() {
  echo "ERROR: $*" >&2
  failures=$((failures + 1))
}

while IFS= read -r -d '' topic_dir; do
  note_count="$(find "${topic_dir}" -maxdepth 1 -type f -name '*.md' ! -name 'outline.md' ! -name 'README.md' | wc -l | tr -d ' ')"
  if [[ "${note_count}" -gt 0 ]]; then
    readme="${topic_dir}/README.md"
    [[ -f "${readme}" ]] || fail "missing README.md: ${topic_dir#"${repo_root}/"}"
    if [[ -f "${readme}" ]]; then
      h1_count="$(rg -c '^# ' "${readme}" || true)"
      [[ "${h1_count}" -eq 1 ]] || fail "README must have exactly one H1: ${readme#"${repo_root}/"}"
      [[ ! -e "${topic_dir}/README-roadmap.html" ]] || fail "README-roadmap.html must not exist: ${topic_dir#"${repo_root}/"}"
    fi
    while IFS= read -r -d '' note; do
      roadmap="${note%.md}-roadmap.html"
      [[ -f "${roadmap}" ]] || fail "missing roadmap for ${note#"${repo_root}/"}"
    done < <(find "${topic_dir}" -maxdepth 1 -type f -name '*.md' ! -name 'outline.md' ! -name 'README.md' -print0)
  fi
done < <(find "${topics_root}" -mindepth 2 -maxdepth 2 -type d -print0 | sort -z)

if [[ "${failures}" -gt 0 ]]; then
  echo "Topic README validation failed (${failures} issue(s))." >&2
  exit 1
fi

echo "Topic README validation passed."
