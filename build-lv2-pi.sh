#!/usr/bin/env bash
# Update the local checkout and build Surge XT as LV2 on a Raspberry Pi 5 (aarch64).
#
# Usage (run from anywhere):
#   ./build-lv2-pi.sh              update, build, install to ~/.lv2
#   ./build-lv2-pi.sh --no-update  skip git pull / submodule update
#   ./build-lv2-pi.sh --clean      remove the build folder first
#   ./build-lv2-pi.sh --deps       also apt-install build dependencies
#   ./build-lv2-pi.sh --no-swap    don't create the temporary swap file
#   ./build-lv2-pi.sh --deploy     also copy the plugins to the pi-Stomp
#   ./build-lv2-pi.sh --deploy-only  only copy (no update/build)
#   PISTOMP=pistomp@pistomp.local  pi-Stomp ssh target (this is the default)
#   JOBS=2 ./build-lv2-pi.sh       change parallel jobs (default: all cores)
#   SWAP_GB=8 ./build-lv2-pi.sh    change temporary swap size (default 6)
#
# A temporary swap file is created for the build and always removed again
# when the script ends (also on error or Ctrl+C). Needs sudo.

set -euo pipefail

BRANCH="My_adaptions"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$REPO_DIR/build-lv2"
LV2_DIR="$HOME/.lv2"
DATA_DIR="$HOME/.local/share/surge-xt"
JOBS="${JOBS:-$(nproc)}"
SWAP_GB="${SWAP_GB:-6}"
SWAP_FILE="/var/swap-surge-build"
SWAP_ACTIVE=0
PISTOMP="${PISTOMP:-pistomp@pistomp.local}"

DO_UPDATE=1
DO_CLEAN=0
DO_DEPS=0
DO_SWAP=1
DO_DEPLOY=0
DO_BUILD=1
for arg in "$@"; do
  case "$arg" in
    --no-update) DO_UPDATE=0 ;;
    --clean)     DO_CLEAN=1 ;;
    --deps)      DO_DEPS=1 ;;
    --no-swap)   DO_SWAP=0 ;;
    --deploy)    DO_DEPLOY=1 ;;
    --deploy-only) DO_DEPLOY=1; DO_BUILD=0; DO_UPDATE=0; DO_SWAP=0 ;;
    -h|--help)   sed -n '2,19p' "$0"; exit 0 ;;
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

install_modgui() {
  # Adds the MOD UI panel (resources/modgui/surge-xt) to the built "Surge XT.lv2" bundle
  local bundle="$1"
  local src="$REPO_DIR/resources/modgui/surge-xt"
  local dst="$bundle/modgui"
  echo "==> Adding MOD UI panel to $(basename "$bundle")"
  mkdir -p "$dst"
  cp "$src/icon-surge-xt.html" "$src/stylesheet-surge-xt.css" \
     "$src/screenshot-surge-xt.png" "$src/thumbnail-surge-xt.png" "$dst/"
  python3 "$src/gen-patchlist.py" "$REPO_DIR/resources/data" \
     "$src/javascript-surge-xt.js" "$dst/javascript-surge-xt.js"
  cp "$src/modgui.ttl" "$bundle/modgui.ttl"
  if ! grep -q "modgui.ttl" "$bundle/manifest.ttl"; then
    printf '\n<https://surge-synthesizer.github.io/lv2/surge-xt>\n    rdfs:seeAlso <modgui.ttl> .\n' >> "$bundle/manifest.ttl"
  fi
}

deploy_pistomp() {
  local products="$BUILD_DIR/surge_xt_products"
  echo "==> Deploying to pi-Stomp ($PISTOMP)"
  ssh "$PISTOMP" 'mkdir -p ~/.lv2 ~/.local/share/surge-xt'
  for bundle in "Surge XT.lv2" "Surge XT Effects.lv2"; do
    if [[ -d "$products/$bundle" ]]; then
      rsync -a --delete "$products/$bundle/" "$PISTOMP:.lv2/$bundle/"
      echo "    copied $bundle"
    else
      echo "    WARNING: $products/$bundle not found (build first)"
    fi
  done
  echo "==> Copying factory data (patches, wavetables)"
  rsync -a "$REPO_DIR/resources/data/" "$PISTOMP:.local/share/surge-xt/"
  echo "==> Restarting MOD on the pi-Stomp so it finds the new plugins"
  ssh -t "$PISTOMP" 'sudo systemctl restart mod-host mod-ui'
}

if [[ $DO_BUILD -eq 1 ]]; then
  remove_swap() {
    if [[ $SWAP_ACTIVE -eq 1 ]]; then
      echo "==> Removing temporary swap file $SWAP_FILE"
      sudo swapoff "$SWAP_FILE" || true
      SWAP_ACTIVE=0
    fi
    if [[ -e "$SWAP_FILE" ]]; then
      sudo rm -f "$SWAP_FILE"
    fi
  }

  if [[ $DO_SWAP -eq 1 ]]; then
    # Clean up a leftover file from an interrupted earlier run
    if swapon --show=NAME --noheadings | grep -qx "$SWAP_FILE"; then
      sudo swapoff "$SWAP_FILE"
    fi
    sudo rm -f "$SWAP_FILE"

    free_gb=$(( $(df --output=avail -k "$(dirname "$SWAP_FILE")" | tail -1) / 1024 / 1024 ))
    if (( free_gb < SWAP_GB + 2 )); then
      echo "Not enough free disk space for ${SWAP_GB} GB swap (${free_gb} GB free). Use --no-swap or SWAP_GB=<smaller>."
      exit 1
    fi

    echo "==> Creating temporary ${SWAP_GB} GB swap file $SWAP_FILE"
    trap remove_swap EXIT
    trap "exit 130" INT TERM
    if ! sudo fallocate -l "${SWAP_GB}G" "$SWAP_FILE" 2>/dev/null; then
      sudo dd if=/dev/zero of="$SWAP_FILE" bs=1M count=$(( SWAP_GB * 1024 )) status=progress
    fi
    sudo chmod 600 "$SWAP_FILE"
    sudo mkswap "$SWAP_FILE" >/dev/null
    sudo swapon "$SWAP_FILE"
    SWAP_ACTIVE=1
    free -h
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
  install_modgui "$PRODUCTS/Surge XT.lv2"
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
fi

if [[ $DO_DEPLOY -eq 1 ]]; then
  deploy_pistomp
fi

echo "==> Done. Commit: $(git rev-parse --short HEAD)"
