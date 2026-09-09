#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cases_root="${repo_root}/cases"
errors=0

fail() {
  echo "ERROR: $*" >&2
  errors=$((errors + 1))
}

while IFS= read -r -d '' case_file; do
  relative="${case_file#"${cases_root}/"}"
  category="${relative%%/*}"
  filename="${relative##*/}"

  if [[ ! "${filename}" =~ ^[a-z0-9]+(-[a-z0-9]+)*\.md$ ]]; then
    fail "non-kebab-case path: cases/${relative}"
  fi

  h1_count="$(awk 'BEGIN { fence=0; count=0 } /^```/ { fence=!fence; next } !fence && /^# / { count++ } END { print count }' "${case_file}")"
  if [[ "${h1_count}" != "1" ]]; then
    fail "expected exactly one H1, found ${h1_count}: cases/${relative}"
  fi

  first_line="$(sed -n '1p' "${case_file}")"
  if [[ ! "${first_line}" =~ ^#\  ]]; then
    fail "first line is not H1: cases/${relative}"
  fi

  if ! rg -Fq "(./${filename})" "${cases_root}/${category}/README.md"; then
    fail "missing from category README: cases/${relative}"
  fi
done < <(
  find "${cases_root}" -mindepth 2 -maxdepth 2 -type f -name '*.md' ! -name 'README.md' -print0 | sort -z
)

case_count="$(find "${cases_root}" -mindepth 2 -maxdepth 2 -type f -name '*.md' ! -name 'README.md' | wc -l | tr -d ' ')"

if (( errors > 0 )); then
  echo "Case validation failed: ${errors} error(s)." >&2
  exit 1
fi

echo "Case validation passed: ${case_count} case files."
