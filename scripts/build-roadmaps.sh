#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
roadmap_builder="${LEARNING_ROADMAP_BUILDER:-${HOME}/.skills/learning-roadmap/scripts/build_roadmap.py}"

if [[ ! -f "${roadmap_builder}" ]]; then
  echo "learning-roadmap builder not found: ${roadmap_builder}" >&2
  echo "Set LEARNING_ROADMAP_BUILDER to the build_roadmap.py path." >&2
  exit 1
fi

while IFS= read -r -d '' note; do
  output="${note%.md}-roadmap.html"
  python3 "${roadmap_builder}" "${note}" "${output}"
  perl -0pi -e 's{<div class="meta">\s*}{<div class="meta">\n    <a class="back" href="../../../index.html">← 返回总览</a>\n    }' "${output}"
done < <(
  find "${repo_root}/topics" -type f -name '*.md' \
    ! -name 'outline.md' \
    ! -path '*/roadmap-animations/*' \
    -print0 | sort -z
)
