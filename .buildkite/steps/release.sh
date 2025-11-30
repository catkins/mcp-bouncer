#!/usr/bin/env bash
set -euo pipefail

TAG="${BUILDKITE_TAG:-}"

if [[ -z "${TAG}" ]]; then
  echo "BUILDKITE_TAG is required; this pipeline should only run on tagged builds." >&2
  exit 1
fi

if [[ ! "${TAG}" =~ ^v[0-9]+ ]]; then
  echo "Tag '${TAG}' does not match the expected pattern '^v\\d+'; skipping release." >&2
  exit 0
fi

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "GITHUB_TOKEN is not set; cannot publish GitHub release." >&2
  exit 1
fi

CHECKOUT_DIR="${BUILDKITE_BUILD_CHECKOUT_PATH:-$(pwd)}"
cd "${CHECKOUT_DIR}"

if ! command -v gh >/dev/null 2>&1; then
  echo "Installing GitHub CLI..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y gh
  else
    echo "apt-get not available; cannot install GitHub CLI." >&2
    exit 1
  fi
fi

echo "Authenticating with GitHub..."
echo "${GITHUB_TOKEN}" | gh auth login --with-token >/dev/null 2>&1

REPO_URL=$(git config --get remote.origin.url)
if [[ "${REPO_URL}" =~ github.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
  OWNER="${BASH_REMATCH[1]}"
  REPO="${BASH_REMATCH[2]}"
  GITHUB_REPO="${OWNER}/${REPO}"
else
  echo "Unable to parse GitHub repository from remote.origin.url='${REPO_URL}'." >&2
  exit 1
fi

echo "Using repository ${GITHUB_REPO}"
echo "Installing dependencies and building artifacts..."

npm ci
npm run build:bridge:release
cargo tauri build --verbose

ARTIFACT_ROOT="src-tauri/target/release/bundle"
if [[ ! -d "${ARTIFACT_ROOT}" ]]; then
  echo "Bundle directory not found at ${ARTIFACT_ROOT}." >&2
  exit 1
fi

mapfile -t ARTIFACTS < <(find "${ARTIFACT_ROOT}" -type f)

if [[ ${#ARTIFACTS[@]} -eq 0 ]]; then
  echo "No release artifacts were found under ${ARTIFACT_ROOT}." >&2
  exit 1
fi

if ! gh release view "${TAG}" --repo "${GITHUB_REPO}" >/dev/null 2>&1; then
  echo "Creating release ${TAG}..."
  gh release create "${TAG}" --repo "${GITHUB_REPO}" --title "mcp-bouncer ${TAG}" --notes "Automated release for ${TAG}" --verify-tag
else
  echo "Release ${TAG} already exists; uploading assets with clobber."
fi

echo "Uploading ${#ARTIFACTS[@]} artifact(s) to GitHub release ${TAG}..."
gh release upload "${TAG}" "${ARTIFACTS[@]}" --repo "${GITHUB_REPO}" --clobber

echo "Release upload completed."
