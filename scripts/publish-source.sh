#!/usr/bin/env bash
# Publishes the source of this commit to the public repository as one commit "Kipple vX.Y.Z" and tags it
# vX.Y.Z there, so the release made from that tag points at exactly the code it was built from.
# Paths in .publicignore stay private. Used by .github/workflows/release.yml when RELEASE_REPO is set.
#
# Usage: scripts/publish-source.sh <owner/repo> <version>   (needs PUBLIC_REPO_TOKEN in the environment)
# Prints the public commit sha. Safe to re-run for the same version: if the tag already holds the same
# files it is reused; if it has no release yet (an earlier run failed later) it is moved to the new
# commit; a tag that already has a release is never touched.
set -euo pipefail

REPO="${1:?owner/repo}"
VERSION="${2:?version}"
TAG="v$VERSION"
: "${PUBLIC_REPO_TOKEN:?PUBLIC_REPO_TOKEN is not set}"

SRC="$(git rev-parse --show-toplevel)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
URL="${PUBLIC_REPO_URL:-https://github.com/${REPO}.git}"
# The token goes in a header for this script's git calls only, never into a URL or .git/config.
AUTH="$(printf 'x-access-token:%s' "$PUBLIC_REPO_TOKEN" | base64 -w0)"
[ -n "${GITHUB_ACTIONS:-}" ] && echo "::add-mask::$AUTH" >&2  # stdout carries only the sha
pgit() { git -c http.extraheader="AUTHORIZATION: basic $AUTH" "$@"; }

# The tree to publish: every tracked file at HEAD except the .publicignore paths.
EXCLUDES=()
while IFS= read -r line; do
  line="${line%%#*}"; line="$(echo "$line" | xargs)"
  [ -n "$line" ] && EXCLUDES+=(":(exclude)$line")
done < "$SRC/.publicignore"
mkdir "$WORK/tree"
git -C "$SRC" archive --format=tar HEAD -- . "${EXCLUDES[@]}" | tar -x -C "$WORK/tree"
# release.yml sets the version in tauri.conf.json before this runs; publish the file as built.
cp "$SRC/src-tauri/tauri.conf.json" "$WORK/tree/src-tauri/tauri.conf.json"
for p in "${EXCLUDES[@]}"; do
  if [ -e "$WORK/tree/${p#:(exclude)}" ]; then echo "::error::$p leaked into the snapshot" >&2; exit 1; fi
done

# The public repository: its main branch if it has one, else a fresh history.
git init -q "$WORK/pub"
cd "$WORK/pub"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git remote add origin "$URL"
rc=0; pgit ls-remote --exit-code --heads origin main >/dev/null || rc=$?
case "$rc" in
  0) pgit fetch -q --depth=1 origin main && git checkout -q -B main FETCH_HEAD ;;
  2) git checkout -q --orphan main ;;  # an empty repository: start its history
  *) echo "::error::Cannot read $REPO (exit $rc): check PUBLIC_REPO_TOKEN and the repository name" >&2; exit 1 ;;
esac
git rm -rq --ignore-unmatch . >/dev/null
cp -a "$WORK/tree/." .
git add -A

existing="$(pgit ls-remote origin "refs/tags/$TAG" | cut -f1)"
if [ -n "$existing" ]; then
  pgit fetch -q --depth=1 origin "refs/tags/$TAG:refs/tags/$TAG"
  if git diff --quiet --cached "$TAG" -- 2>/dev/null; then
    echo "$TAG already holds this source, reusing it" >&2
    git rev-parse "$TAG^{commit}"; exit 0
  fi
  code="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $PUBLIC_REPO_TOKEN" \
    "https://api.github.com/repos/$REPO/releases/tags/$TAG")"
  if [ "$code" != "404" ]; then
    echo "::error::$REPO already has a release $TAG with other source. Use a new version." >&2; exit 1
  fi
  echo "$TAG exists without a release, moving it to the new source" >&2
fi

if git rev-parse -q --verify HEAD >/dev/null && git diff --quiet --cached HEAD; then
  echo "No source changes since the last snapshot" >&2
else
  git commit -qm "Kipple $TAG"
fi
git tag -f "$TAG" >/dev/null
pgit push origin main >&2
pgit push --force origin "refs/tags/$TAG" >&2
git rev-parse HEAD
