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
#   ./build-lv2-pi.sh --deb        also make a .deb package in ./dist
#   ./build-lv2-pi.sh --deb-only   only make the .deb from the existing build
#   --with-fx                      also build/install "Surge XT Effects" (off by default)
#                                  (also settable as WITH_FX=1)
#   --x11                          with --deploy: also install the "GUI" switch helper (VNC + web page)
#                                  on the pi-Stomp: apt xvfb x11vnc novnc websockify jalv + a service
#                                  (also settable as WITH_X11=1)
#   --no-progress                  show the raw compiler output instead of the progress bar
#   --panel-scale N                size of the MOD UI panel, 1.0 = 940x500 px (default 1.25)
#                                  (also settable as PANEL_SCALE=N)
#   --lv2-dir DIR                  where the .lv2 plugin folders go (default ~/.lv2)
#                                  only the plugins; patches/wavetables keep their own folder
#                                  (also settable as LV2_DIR=DIR)
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
LV2_DIR_EXPLICIT="${LV2_DIR:-}"   # empty = not chosen by the user
LV2_DIR="${LV2_DIR:-$HOME/.lv2}"
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
DO_DEB=0
WITH_FX="${WITH_FX:-0}"
WITH_X11="${WITH_X11:-0}"
PANEL_SCALE="${PANEL_SCALE:-1.25}"
PROGRESS=1
while [[ $# -gt 0 ]]; do
  arg="$1"; shift
  case "$arg" in
    --no-update) DO_UPDATE=0 ;;
    --clean)     DO_CLEAN=1 ;;
    --deps)      DO_DEPS=1 ;;
    --no-swap)   DO_SWAP=0 ;;
    --deploy)    DO_DEPLOY=1 ;;
    --deb)       DO_DEB=1 ;;
    --deb-only)  DO_DEB=1; DO_BUILD=0; DO_UPDATE=0; DO_SWAP=0 ;;
    --deploy-only) DO_DEPLOY=1; DO_BUILD=0; DO_UPDATE=0; DO_SWAP=0 ;;
    --lv2-dir)
      [[ $# -gt 0 ]] || { echo "--lv2-dir needs a folder"; exit 1; }
      LV2_DIR_EXPLICIT="$1"; shift ;;
    --with-fx)   WITH_FX=1 ;;
    --x11)       WITH_X11=1 ;;
    --no-progress) PROGRESS=0 ;;
    --panel-scale)
      [[ $# -gt 0 ]] || { echo "--panel-scale needs a number"; exit 1; }
      PANEL_SCALE="$1"; shift ;;
    --panel-scale=*) PANEL_SCALE="${arg#--panel-scale=}" ;;
    --lv2-dir=*) LV2_DIR_EXPLICIT="${arg#--lv2-dir=}" ;;
    -h|--help)   sed -n '2,/^$/p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

if [[ -n "$LV2_DIR_EXPLICIT" ]]; then
  LV2_DIR="${LV2_DIR_EXPLICIT/#\~/$HOME}"
fi

if ! awk -v s="$PANEL_SCALE" 'BEGIN{exit !(s ~ /^[0-9]+(\.[0-9]+)?$/ && s >= 0.5 && s <= 3)}'; then
  echo "--panel-scale must be a number between 0.5 and 3 (got: $PANEL_SCALE)"; exit 1
fi

# Which plugins to build/install: Surge XT always, Surge XT Effects only on request
BUNDLES=("Surge XT.lv2")
BUILD_TARGETS=(surge-xt_LV2)
if [[ "$WITH_FX" == "1" ]]; then
  BUNDLES+=("Surge XT Effects.lv2")
  BUILD_TARGETS+=(surge-fx_LV2)
fi

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

build_with_progress() {
  # Runs the build and shows a progress bar (needs the [ 42%] or [42/100] lines that make and
  # ninja print). The complete output goes to build.log; on failure the end of it is shown.
  local log="$BUILD_DIR/build.log" rc=0
  local cmd=(cmake --build "$BUILD_DIR" --config Release --target "${BUILD_TARGETS[@]}" -j "$JOBS")

  if [[ $PROGRESS -eq 0 ]]; then
    "${cmd[@]}"
    return
  fi

  local start=$SECONDS is_tty=0 cols
  [[ -t 1 ]] && is_tty=1
  cols="$(tput cols 2>/dev/null || echo 80)"
  : > "$log"

  set +e
  "${cmd[@]}" 2>&1 | {
    local line p n m e msg bar i filled maxp=0 lastp=-1 width=30 room
    while IFS= read -r line; do
      printf '%s\n' "$line" >> "$log"
      p=-1
      if [[ $line =~ ^\[\ *([0-9]+)%\] ]]; then
        p=${BASH_REMATCH[1]}
      elif [[ $line =~ ^\[([0-9]+)/([0-9]+)\] ]]; then
        n=${BASH_REMATCH[1]}; m=${BASH_REMATCH[2]}
        (( m > 0 )) && p=$(( n * 100 / m ))
      fi

      if (( p >= 0 )); then
        (( p > maxp )) && maxp=$p
        e=$(( SECONDS - start ))
        msg="${line#*] }"
        if [[ $msg =~ ^Building\ [A-Za-z+]+\ object\ (.*) ]]; then
          msg="compiling ${BASH_REMATCH[1]##*/}"
        elif [[ $msg =~ ^Linking\ [A-Za-z+]+\ (shared\ library|shared\ module|static\ library|executable)\ (.*) ]]; then
          msg="linking ${BASH_REMATCH[2]##*/}"
        fi
        if (( is_tty )); then
          filled=$(( maxp * width / 100 )); bar=""
          for (( i = 0; i < width; i++ )); do
            (( i < filled )) && bar+="#" || bar+="."
          done
          room=$(( cols - width - 18 )); (( room < 10 )) && room=10
          printf '\r\033[K[%s] %3d%%  %d:%02d  %s' "$bar" "$maxp" $(( e / 60 )) $(( e % 60 )) "${msg:0:room}"
        elif (( maxp / 10 > lastp / 10 || lastp < 0 )); then
          printf 'build %3d%%  elapsed %d:%02d\n' "$maxp" $(( e / 60 )) $(( e % 60 ))
        fi
        lastp=$maxp
      elif [[ $line =~ (error|Error\ [0-9]|\*\*\*|FAILED|undefined\ reference) ]]; then
        (( is_tty )) && printf '\r\033[K'
        printf '%s\n' "$line"
      fi
    done
    (( is_tty )) && printf '\n'
  }
  rc=${PIPESTATUS[0]}
  set -e

  if [[ $rc -ne 0 ]]; then
    echo "Build failed (exit code $rc). Last lines of $log:"
    tail -n 30 "$log"
    exit "$rc"
  fi
  echo "    full build output: $log"
}

install_modgui() {
  # Adds the MOD UI panel (resources/modgui/surge-xt) to the built "Surge XT.lv2" bundle
  local bundle="$1"
  local src="$REPO_DIR/resources/modgui/surge-xt"
  local dst="$bundle/modgui"
  echo "==> Adding MOD UI panel to $(basename "$bundle")"
  mkdir -p "$dst"
  cp "$src/icon-surge-xt.html" "$src/screenshot-surge-xt.png" "$src/thumbnail-surge-xt.png" "$dst/"
  python3 "$src/scale-css.py" "$src/stylesheet-surge-xt.css" "$dst/stylesheet-surge-xt.css" "$PANEL_SCALE"
  echo "    panel scale: $PANEL_SCALE"
  python3 "$src/gen-patchlist.py" "$REPO_DIR/resources/data" \
     "$src/javascript-surge-xt.js" "$dst/javascript-surge-xt.js"
  cp "$src/modgui.ttl" "$bundle/modgui.ttl"
  if ! grep -q "modgui.ttl" "$bundle/manifest.ttl"; then
    printf '\n<https://surge-synthesizer.github.io/lv2/surge-xt>\n    rdfs:seeAlso <modgui.ttl> .\n' >> "$bundle/manifest.ttl"
  fi
}

make_deb() {
  # Packages the finished build (plugins, MOD panel, factory data) as a .deb:
  #   <lv2 dir>/Surge XT.lv2, <lv2 dir>/Surge XT Effects.lv2 (default /usr/lib/lv2; --lv2-dir
  #   changes it), and /usr/share/surge-xt for the factory data
  local products="$BUILD_DIR/surge_xt_products"
  command -v dpkg-deb >/dev/null || { echo "dpkg-deb not found"; exit 1; }
  [[ -d "$products/Surge XT.lv2" ]] || { echo "No build found in $products (build first)"; exit 1; }
  install_modgui "$products/Surge XT.lv2"

  local arch ver pkg stage out deb_lv2
  deb_lv2="/usr/lib/lv2"
  if [[ -n "$LV2_DIR_EXPLICIT" ]]; then
    [[ "$LV2_DIR" == /* ]] || { echo "For --deb, --lv2-dir must be an absolute path (got: $LV2_DIR)"; exit 1; }
    deb_lv2="$LV2_DIR"
  fi
  arch="$(dpkg --print-architecture)"
  ver="1.0+$(date +%Y%m%d).$(git -C "$REPO_DIR" rev-parse --short HEAD)"
  pkg="surge-xt-lv2-mod"
  stage="$(mktemp -d)"
  out="$REPO_DIR/dist/${pkg}_${ver}_${arch}.deb"

  echo "==> Building $out"
  mkdir -p "$stage/DEBIAN" "$stage$deb_lv2" "$stage/usr/share/surge-xt" "$REPO_DIR/dist"
  for bundle in "${BUNDLES[@]}"; do
    [[ -d "$products/$bundle" ]] && cp -r "$products/$bundle" "$stage$deb_lv2/"
  done
  cp -r "$REPO_DIR/resources/data/." "$stage/usr/share/surge-xt/"

  cat > "$stage/DEBIAN/control" <<CONTROL
Package: $pkg
Version: $ver
Architecture: $arch
Maintainer: maarthome <maarthome@users.noreply.github.com>
Section: sound
Priority: optional
Depends: libasound2t64 | libasound2, libfreetype6, libx11-6, libxrandr2, libxinerama1, libxcursor1
Conflicts: surge-xt-lv2
Description: Surge XT LV2 plugins with a MOD UI panel (My_adaptions fork)
 Surge XT synthesizer and Surge XT Effects as LV2 plugins, with a custom
 MOD UI panel for playing from a keyboard on a pi-Stomp.
CONTROL

  cat > "$stage/DEBIAN/postinst" <<'POSTINST'
#!/bin/sh
set -e
# Let MOD pick up the new plugins (only if MOD is installed here)
for unit in mod-host mod-ui; do
  if systemctl list-unit-files "$unit.service" >/dev/null 2>&1; then
    systemctl try-restart "$unit" || true
  fi
done
exit 0
POSTINST
  chmod 755 "$stage/DEBIAN/postinst"

  find "$stage" -type d -exec chmod 755 {} +
  dpkg-deb --root-owner-group --build "$stage" "$out" >/dev/null
  rm -rf "$stage"
  echo "==> Done: $out"
  echo "    Install with: sudo apt install \"$out\""
}

deploy_pistomp() {
  local products="$BUILD_DIR/surge_xt_products"
  echo "==> Deploying to pi-Stomp ($PISTOMP)"
  local remote_lv2=".lv2"            # relative to the pi-Stomp user's home
  [[ -n "$LV2_DIR_EXPLICIT" ]] && remote_lv2="$LV2_DIR_EXPLICIT"
  echo "    LV2 folder on pi-Stomp: $remote_lv2"
  ssh "$PISTOMP" "mkdir -p '$remote_lv2' ~/.local/share/surge-xt"
  for bundle in "${BUNDLES[@]}"; do
    if [[ -d "$products/$bundle" ]]; then
      rsync -as --delete "$products/$bundle/" "$PISTOMP:$remote_lv2/$bundle/"
      echo "    copied $bundle"
    else
      echo "    WARNING: $products/$bundle not found (build first)"
    fi
  done
  echo "==> Copying factory data (patches, wavetables)"
  rsync -as "$REPO_DIR/resources/data/" "$PISTOMP:.local/share/surge-xt/"
  if [[ $WITH_X11 -eq 1 ]]; then
    echo "==> Installing the GUI helper (VNC + web page) on the pi-Stomp"
    ssh "$PISTOMP" "mkdir -p ~/.local/share/surge-xt-x11 ~/.config/systemd/user"
    rsync -as "$REPO_DIR/resources/modgui/surge-xt/x11/" "$PISTOMP:.local/share/surge-xt-x11/"
    ssh "$PISTOMP" 'mv ~/.local/share/surge-xt-x11/surge-x11-helper.service ~/.config/systemd/user/ && chmod +x ~/.local/share/surge-xt-x11/surge-x11-*'
    ssh -t "$PISTOMP" 'sudo apt-get install -y xvfb x11vnc novnc websockify jalv && sudo loginctl enable-linger "$USER" && systemctl --user daemon-reload && systemctl --user enable --now surge-x11-helper.service && systemctl --user restart surge-x11-helper.service' \
      || echo "    WARNING: GUI helper install failed - see the messages above"
  fi
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

  echo "==> Building ${BUNDLES[*]} with $JOBS jobs (this takes a while on a Pi)"
  build_with_progress

  PRODUCTS="$BUILD_DIR/surge_xt_products"
  install_modgui "$PRODUCTS/Surge XT.lv2"
  echo "==> Installing LV2 bundles to $LV2_DIR"
  SUDO=""
  if [[ -d "$LV2_DIR" ]]; then
    [[ -w "$LV2_DIR" ]] || SUDO="sudo"
  else
    [[ -w "$(dirname "$LV2_DIR")" ]] || SUDO="sudo"
  fi
  [[ -z "$SUDO" ]] || echo "    (needs sudo to write to $LV2_DIR)"
  $SUDO mkdir -p "$LV2_DIR"
  for bundle in "${BUNDLES[@]}"; do
    if [[ -d "$PRODUCTS/$bundle" ]]; then
      $SUDO rm -rf "$LV2_DIR/$bundle"
      $SUDO cp -r "$PRODUCTS/$bundle" "$LV2_DIR/"
      echo "    installed $bundle"
    else
      echo "    WARNING: $PRODUCTS/$bundle not found"
    fi
  done

  echo "==> Installing factory data (patches, wavetables) to $DATA_DIR"
  mkdir -p "$DATA_DIR"
  cp -r "$REPO_DIR/resources/data/." "$DATA_DIR/"
fi

if [[ $DO_DEB -eq 1 ]]; then
  make_deb
fi

if [[ $DO_DEPLOY -eq 1 ]]; then
  deploy_pistomp
fi

echo "==> Done. Commit: $(git rev-parse --short HEAD)"
