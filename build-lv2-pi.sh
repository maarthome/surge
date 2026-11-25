#!/usr/bin/env bash
# Update the local checkout and build Surge XT as LV2 on a Raspberry Pi 5 (aarch64).
#
# Usage (run from anywhere):
#   ./build-lv2-pi.sh              update, build, install to ~/.lv2
#   ./build-lv2-pi.sh --no-update  skip git pull / submodule update
#   ./build-lv2-pi.sh --clean      remove the build folder first
#   ./build-lv2-pi.sh --deps       also apt-install build dependencies
#   JOBS=2 ./build-lv2-pi.sh       change parallel jobs (default 3)

set -euo pipefail

BRANCH="My_adaptions"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$REPO_DIR/build-lv2"
LV2_DIR="$HOME/.lv2"
DATA_DIR="$HOME/.local/share/surge-xt"
JOBS="${JOBS:-3}"

DO_UPDATE=1
DO_CLEAN=0
DO_DEPS=0
for arg in "$@"; do
  case "$arg" in
    --no-update) DO_UPDATE=0 ;;
    --clean)     DO_CLEAN=1 ;;
    --deps)      DO_DEPS=1 ;;
    -h|--help)   sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

cd "$REPO_DIR"

if [[ $DO_DEPS -eq 1 ]]; then
  echo "==> Installing build dependencies"
  sudo apt-get update
  sudo apt-get install -y build-essential cmake git pkg-config \
    libcairo2-dev libxkbcommon-x11-dev libxkbcommon-dev libxcb-cursor-dev \
    libxcb-keysyms1-dev libxcb-util-dev libxrandr-dev libxinerama-dev \
    libxcursor-dev libasound2-dev libjack-jackd2-dev libfreetype-dev \
    libfontconfig1-dev
fi

if [[ $DO_UPDATE -eq 1 ]]; then
  echo "==> Updating local checkout ($BRANCH)"
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Local uncommitted changes found; stashing them first."
    git stash push -m "build-lv2-pi autostash $(date +%F_%T)"
  fi
  git fetch origin
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
  echo "==> Updating submodules"
  git submodule sync --recursive
  git submodule update --init --recursive
fi

if [[ $DO_CLEAN -eq 1 ]]; then
  echo "==> Removing $BUILD_DIR"
  rm -rf "$BUILD_DIR"
fi

echo "==> Configuring (LV2 on, standalone and VST3 off)"
cmake -S "$REPO_DIR" -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DSURGE_BUILD_LV2=TRUE \
  -DSURGE_SKIP_VST3=TRUE \
  -DSURGE_SKIP_STANDALONE=TRUE

echo "==> Building with $JOBS jobs (this takes a while on a Pi)"
cmake --build "$BUILD_DIR" --config Release --target surge-xt_LV2 surge-fx_LV2 -j "$JOBS"

PRODUCTS="$BUILD_DIR/surge_xt_products"
echo "==> Installing LV2 bundles to $LV2_DIR"
mkdir -p "$LV2_DIR"
for bundle in "Surge XT.lv2" "Surge XT Effects.lv2"; do
  if [[ -d "$PRODUCTS/$bundle" ]]; then
    rm -rf "$LV2_DIR/$bundle"
    cp -r "$PRODUCTS/$bundle" "$LV2_DIR/"
    echo "    installed $bundle"
  else
    echo "    WARNING: $PRODUCTS/$bundle not found"
  fi
done

echo "==> Installing factory data (patches, wavetables) to $DATA_DIR"
mkdir -p "$DATA_DIR"
cp -r "$REPO_DIR/resources/data/." "$DATA_DIR/"

echo "==> Done. Commit: $(git rev-parse --short HEAD)"
