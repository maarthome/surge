# My adaptions to Surge XT (branch `My_adaptions`)

Fork: `maarthome/surge` of `surge-synthesizer/surge`. Goal: Surge XT as an LV2 plugin in MOD-UI on a
pi-Stomp (Pi 5, Debian trixie, aarch64), controlled from the pi-Stomp display and hardware knobs.
Companion repo: `maarthome/pi-stomp`, branch `My_Changes` (see its `MY_CHANGES.md`).

## 1. What is changed

| Area | Where | What it does |
|---|---|---|
| Build + deploy script | `build-lv2-pi.sh` | Updates, builds the LV2 bundle, installs to `~/.lv2`, deploys to the pi-Stomp (rsync + restart of mod-host/mod-ui). Asks whether to install patches/wavetables (installs after 20 s without an answer). |
| MOD panel (web UI in mod-ui) | `resources/modgui/surge-xt/` (`javascript-surge-xt.js`, `stylesheet-surge-xt.css`, `icon-surge-xt.html`) | 1100x640 panel that looks like Surge's own GUI: scene, two filters with their frequency-response curves (F1 orange, F2 blue), mixer, filter and amp envelopes (A=0 goes straight up), macros across the bottom, GUI/bypass buttons top right. Parameters are set directly through `patch_set`, no MIDI. |
| Real LV2 control ports | `resources/patches/juce-lv2-control-ports.patch`, `resources/lv2-knobs/gen-knobs.py` | Surge XT's own `.ttl` declares 48 control input ports (Cutoff, Resonance, ADSRs, osc levels, macros, ...). The pi-Stomp display lists exactly these, so hardware knobs edit Surge parameters directly, without MIDI/CC. |
| Parameter order on the display | `KNOBS` table in `resources/lv2-knobs/gen-knobs.py` | The order of the table is the port order: Amp ADSR + Gain, Filter ADSR, Cutoff/Resonance/Env Amt, Osc 1-3, Scene Level/Master, the rest, Macro 1-8. |
| GUI switch / VNC editor | `resources/modgui/surge-xt/x11/`, `src/surge-xt/SurgeSynthProcessor.cpp/.h` | The "GUI" button starts the real Surge editor in a VNC/web page on the pi-Stomp. Both instances stay in sync through files in `/tmp/surge-sync` (state stays as it is, preset is not reset to init). Mouse pointer is visible in VNC. |
| Old "Surge XT Knobs" plugin | `resources/lv2-knobs/surge_xt_knobs.c` | Earlier approach (LV2 knobs -> MIDI CC). Obsolete, off by default. `--knobs` / `WITH_KNOBS=1` builds it. |

How the control ports work: `gen-knobs.py --header` writes `surge_lv2_controls.h` (symbol, name, Surge parameter id,
default). The JUCE LV2 wrapper patch includes it, appends the ports to the TTL and, in `run()`, applies a changed
port value to the matching parameter. Port changes in the first 3 s after start are ignored, so loading a
pedalboard does not overwrite the patch. The display does not follow changes made in the Surge GUI.

## 2. Procedures

### Build and deploy

```
cd ~/git/surge
JOBS=4 ./build-lv2-pi.sh --deploy            # update, build, install here, copy to the pi-Stomp
JOBS=4 ./build-lv2-pi.sh --deploy --x11      # also (re)install the VNC "GUI" helper on the pi-Stomp
./build-lv2-pi.sh --deploy-only              # only copy the last build
```

The script applies the JUCE patch (idempotent) and generates the header before CMake runs. After a deploy mod-host
and mod-ui restart. Check on the pi-Stomp:

```
grep -c "lv2:index" ~/.lv2/"Surge XT.lv2"/dsp.ttl     # 61 = 13 + 48 control ports
```

### A pedalboard must be saved again after the ports change

pi-Stomp only lists ports that are stored in the pedalboard file. After the port list or order changes: delete
Surge XT in the pedalboard, add it again, reconnect the cables, Save. Boards saved with an older build show no
(or the old) knobs.

### Change the order or the names of the 48 knobs

1. Edit the `KNOBS` list in `resources/lv2-knobs/gen-knobs.py` (entries are `(symbol, name, cc, default)`; the list order is the display order).
2. Rebuild and deploy (section above), reload the pedalboard (re-add Surge XT if the order does not change).

### Add, remove or remap a knob

1. Add or remove the entry in `KNOBS` and give it a Surge storage name in the `PARAM` dict of the same file (the id is the `a_...` / `macro_N` name Surge uses in its patch parameters).
2. Rebuild, deploy, re-add Surge XT to the pedalboard and save. Port count is generated from the table.

### Change the MOD panel

- Layout and controls: `resources/modgui/surge-xt/javascript-surge-xt.js` (`KNOBS` table: key -> parameter, label, type, options; layout in `build()`; graphs in `drawFilters()` and `drawEnv()`).
- Look: `stylesheet-surge-xt.css`. Size: `--panel-scale N` (1.0 = 1100x640).
- Deploy with `./build-lv2-pi.sh --deploy-only`; reload the mod-ui page.

### Keep the JUCE patch working after a JUCE update

`libs/JUCE` is a submodule, the patch is applied at build time. If the build prints "JUCE control-port patch does not apply", regenerate it: apply the edits to
`libs/JUCE/modules/juce_audio_plugin_client/juce_audio_plugin_client_LV2.cpp` (file has CRLF line endings, keep them),
then `git -C libs/JUCE diff > resources/patches/juce-lv2-control-ports.patch` and restore the submodule file.

### Optional: old MIDI knobs plugin

```
JOBS=4 ./build-lv2-pi.sh --deploy --knobs
```

## 3. Troubleshooting

- Display shows no Surge knobs: check the `dsp.ttl` count above, restart mod-ui on the pi-Stomp, re-add the plugin in the pedalboard and save.
- `curl -s "http://localhost/effect/get?uri=https://surge-synthesizer.github.io/lv2/surge-xt"` on the pi-Stomp should list 50 control inputs (48 + 2 standard).
- Sync/CC logs: `/tmp/surge-sync/log`, `/tmp/surge-cc.log` (on the pi-Stomp).
- Package installs on the dev Pi: never install `jackd2` on the pi-Stomp, use `apt --no-remove`.
