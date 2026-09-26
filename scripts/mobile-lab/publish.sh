#!/usr/bin/env bash
# Publishes a mobile-lab run to the `mobile-runs` branch as runs/<name>/, so
# anyone can read it on GitHub or `git fetch origin mobile-runs`.
#
#   scripts/mobile-lab/publish.sh <results dir> <run name>
#
# The branch is one orphan commit, rewritten on every publish with the newest
# $MOBILE_RUNS_KEEP runs (default 40): old screenshots and videos drop out of
# history instead of piling up, and main never sees them. Runs from parallel
# jobs race; a lost race (the lease fails) rebuilds on the new tip and retries.
set -euo pipefail

src=$(cd "$1" && pwd)
name=$2
keep=${MOBILE_RUNS_KEEP:-40}
branch=mobile-runs
export GIT_AUTHOR_NAME=${GIT_AUTHOR_NAME:-github-actions[bot]}
export GIT_AUTHOR_EMAIL=${GIT_AUTHOR_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}
export GIT_COMMITTER_NAME=$GIT_AUTHOR_NAME
export GIT_COMMITTER_EMAIL=$GIT_AUTHOR_EMAIL

index=$(mktemp)
trap 'rm -f "$index"' EXIT
export GIT_INDEX_FILE=$index

for attempt in 1 2 3 4 5 6; do
  rm -f "$index"
  if git fetch -q --depth=1 origin "+refs/heads/$branch:refs/remotes/origin/$branch" 2>/dev/null; then
    old=$(git rev-parse "refs/remotes/origin/$branch")
    git read-tree "$old"
  else
    old=""
    git read-tree --empty
  fi

  # This run's files.
  git rm -r -q --cached --ignore-unmatch "runs/$name" >/dev/null
  (cd "$src" && find . -type f ! -name '.*' | sed 's|^\./||') | while read -r rel; do
    blob=$(git hash-object -w "$src/$rel")
    git update-index --add --cacheinfo "100644,$blob,runs/$name/$rel"
  done

  # Keep the newest runs (names start with a UTC timestamp). No mapfile:
  # macOS runners have bash 3.
  git ls-files runs | cut -d/ -f2 | sort -u -r | tail -n +"$((keep + 1))" | while read -r old_run; do
    git rm -r -q --cached "runs/$old_run" >/dev/null
  done

  # The front page: every run, newest first, with its result.
  readme=$(mktemp)
  {
    echo "# Mobile lab runs"
    echo
    echo "Results of \`scripts/mobile-lab\` (docs/MOBILE-TESTING.md on main): one folder per run, each with a README.md (screenshots and what every step measured), summary.json (the full probes) and a recording per scenario."
    echo
    echo "| Run | Engine | Result | URL |"
    echo "|---|---|---|---|"
    git ls-files runs | cut -d/ -f2 | sort -u -r | while read -r run; do
      result=$(git cat-file -p ":runs/$run/RESULT" 2>/dev/null || echo "?")
      echo "| [$run](runs/$run/README.md) | $(echo "$result" | sed -n 2p) | $(echo "$result" | sed -n 1p) | $(echo "$result" | sed -n 3p) |"
    done
  } >"$readme"
  git update-index --add --cacheinfo "100644,$(git hash-object -w "$readme"),README.md"
  rm -f "$readme"

  tree=$(git write-tree)
  commit=$(git commit-tree "$tree" -m "Mobile lab: $name")
  if git push -q --force-with-lease="refs/heads/$branch:$old" origin "$commit:refs/heads/$branch"; then
    echo "Published runs/$name to $branch"
    exit 0
  fi
  echo "Lost a race for $branch (attempt $attempt); retrying"
  sleep $((attempt * 3))
done
echo "Couldn't publish to $branch" >&2
exit 1
