#!/usr/bin/env bash
set -euo pipefail

upstream='Stirling-Tools/Stirling-PDF'
branch='feature/adobe-legacy-release'
baseline='v0.0.0-snapshot-baseline'
baseline_sha='2bdfa19e8821cda40965d00288643ce3a57061d8'
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
for command in git gh; do
  command -v "$command" >/dev/null || { printf '%s is required.\n' "$command" >&2; exit 1; }
done
gh auth status >/dev/null
owner="$(gh api user --jq .login)"
fork="$owner/Stirling-PDF"
if ! gh api "repos/$fork" >/dev/null 2>&1; then
  gh repo fork "$upstream" --clone=false
fi
parent="$(gh api "repos/$fork" --jq '.parent.full_name')"
[[ "$parent" == "$upstream" ]] || { printf 'Destination is not a fork of %s.\n' "$upstream" >&2; exit 1; }
if [[ -d "$script_dir/.git" ]]; then
  project="$script_dir"
else
  project="$script_dir/Stirling-PDF"
  if [[ ! -d "$project/.git" ]]; then git clone "https://github.com/$fork.git" "$project"; fi
fi
cd "$project"
if git remote get-url upstream >/dev/null 2>&1; then
  [[ "$(git remote get-url upstream)" == "https://github.com/$upstream.git" ]] || { printf 'Unexpected upstream remote.\n' >&2; exit 1; }
else
  git remote add upstream "https://github.com/$upstream.git"
fi
if git remote get-url origin >/dev/null 2>&1; then
  [[ "$(git remote get-url origin)" == "https://github.com/$fork.git" ]] || { printf 'Unexpected origin remote.\n' >&2; exit 1; }
else
  git remote add origin "https://github.com/$fork.git"
fi
git fetch upstream "$baseline_sha"
if git show-ref --verify --quiet "refs/tags/$baseline"; then
  [[ "$(git rev-parse "$baseline^{commit}")" == "$baseline_sha" ]] || { printf 'Baseline tag already exists at another commit; refusing to move it.\n' >&2; exit 1; }
else
  git tag "$baseline" "$baseline_sha"
fi
if git show-ref --verify --quiet "refs/heads/$branch"; then
  git switch "$branch"
elif git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
  git fetch origin "$branch"
  git switch --track -c "$branch" "origin/$branch"
else
  [[ -z "$(git status --porcelain)" ]] || { printf 'Uncommitted files must be preserved before branching.\n' >&2; exit 1; }
  git switch -c "$branch" "$baseline_sha"
fi
printf 'Workspace: %s\nBranch: %s\nBaseline: %s\n' "$project" "$branch" "$baseline_sha"
