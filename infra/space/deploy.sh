#!/usr/bin/env bash
# Builds the Hugging Face Space repo for the API and, with --push, pushes it.
#
#   bash infra/space/deploy.sh                          # bundle only, prints the folder
#   bash infra/space/deploy.sh --push <user>/<space>    # bundle and push to the Space
#
# The bundle is a small, text-only subset of the committed repo (what infra/space/Dockerfile
# COPYs) with that Dockerfile and infra/space/README.md (the Space card) at its root.
# It is taken from HEAD with `git archive`, so uncommitted files and .env never leave the machine.
# Pushing asks for a username and password: use your Hugging Face username and a token
# with write access (https://huggingface.co/settings/tokens).
set -euo pipefail

root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
space=""
if [ "${1:-}" = "--push" ]; then
  space="${2:?usage: deploy.sh --push <user>/<space>}"
fi

tmp="${TMPDIR:-/tmp}"
out="$(mktemp -d "${tmp%/}/shadow-space.XXXXXX")"
git -C "$root" archive --format=tar HEAD -- \
  package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json .dockerignore \
  apps/api apps/edge/package.json apps/web/package.json packages seed infra/space/start.sh |
  tar -x -C "$out"
cp "$root/infra/space/Dockerfile" "$out/Dockerfile"
cp "$root/infra/space/README.md" "$out/README.md"
commit="$(git -C "$root" rev-parse --short HEAD)"
echo "Bundle for $commit: $out"

if [ -n "$space" ]; then
  cd "$out"
  git init -q -b main
  git add -A
  git -c user.name="${GIT_AUTHOR_NAME:-shadow-deploy}" -c user.email="${GIT_AUTHOR_EMAIL:-deploy@localhost}" \
    commit -q -m "Deploy Shadow API from $commit"
  # --force: the Space repo is generated; its history is not kept.
  git push --force "https://huggingface.co/spaces/$space" main
  echo "Pushed. Build logs: https://huggingface.co/spaces/$space?logs=build"
fi
