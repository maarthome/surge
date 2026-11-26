#!/usr/bin/env python3
"""Switch the pi-Stomp arc rings ("circular sliders") on or off for an LV2 plugin.

  plugin-rings.py "Surge XT.lv2" off      all parameters become horizontal sliders
  plugin-rings.py "Surge XT.lv2" on       back to pi-Stomp's default (first 4 as rings)
  plugin-rings.py "Surge XT.lv2" status

The argument is the bundle folder name (searched in ~/.lv2 and the system LV2
folders) or a path to the bundle. The plugin URI(s) are read from its
manifest.ttl. Options:  --pistomp DIR   pi-stomp source folder (auto-detected)
                        --restart       restart the pi-Stomp service afterwards
"""
import argparse, os, re, subprocess, sys
from pathlib import Path

BEGIN = "# >>> plugin-rings:{uri}"
END = "# <<< plugin-rings:{uri}"
BLOCK = '''{begin}
register(
    "{uri}",
    customization=PluginCustomization(pinned_params=()),
)
{end}
'''
LV2_DIRS = [Path.home() / ".lv2", Path("/usr/local/lib/lv2"), Path("/usr/lib/lv2"),
            Path("/usr/lib/aarch64-linux-gnu/lv2")]


def find_bundle(arg):
    p = Path(arg).expanduser()
    if p.is_dir():
        return p
    for d in LV2_DIRS:
        if (d / arg).is_dir():
            return d / arg
    sys.exit(f"bundle '{arg}' not found in: " + ", ".join(map(str, LV2_DIRS)))


def plugin_uris(bundle):
    text = (bundle / "manifest.ttl").read_text(errors="replace")
    uris = re.findall(r"<([^>]+)>\s+(?:a|rdf:type)\s+lv2:[A-Za-z]*Plugin\b", text)
    if not uris:
        sys.exit(f"no lv2:Plugin found in {bundle}/manifest.ttl")
    return list(dict.fromkeys(uris))


def find_pistomp(given):
    if given:
        return Path(given).expanduser()
    cands = [Path.home() / "pi-stomp", Path.home() / "pi-stomp-v3"]
    for c in cands:
        if (c / "plugins" / "pinned_params.py").exists():
            return c
    r = subprocess.run("find / -path '*/plugins/pinned_params.py' -not -path '*/tests/*' 2>/dev/null | head -1",
                       shell=True, capture_output=True, text=True)
    out = r.stdout.strip()
    if not out:
        sys.exit("pi-stomp source not found; use --pistomp DIR")
    return Path(out).parent.parent


def ensure_wide_window(pistomp):
    f = pistomp / "plugins" / "parameter_window.py"
    s = f.read_text()
    if "n == 0 and len(self._list_params()) > 8" in s:
        return
    old = "        if n >= _MAX_PINNED:\n            w = self.WIN_W\n"
    new = "        if n >= _MAX_PINNED or (n == 0 and len(self._list_params()) > 8):\n            w = self.WIN_W\n"
    if old not in s:
        print("warning: could not patch the window width in parameter_window.py", file=sys.stderr)
        return
    f.write_text(s.replace(old, new, 1))
    print("patched window width in parameter_window.py")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("bundle")
    ap.add_argument("mode", choices=["on", "off", "status"])
    ap.add_argument("--pistomp")
    ap.add_argument("--restart", action="store_true")
    a = ap.parse_args()

    bundle = find_bundle(a.bundle)
    uris = plugin_uris(bundle)
    pistomp = find_pistomp(a.pistomp)
    f = pistomp / "plugins" / "pinned_params.py"
    s = f.read_text()
    changed = False

    for uri in uris:
        b, e = BEGIN.format(uri=uri), END.format(uri=uri)
        has = b in s
        if a.mode == "status":
            print(f"{uri}: rings {'OFF (all horizontal)' if has else 'ON (pi-Stomp default)'}")
        elif a.mode == "off":
            if has:
                print(f"{uri}: already off")
            else:
                if re.search(r'["\']' + re.escape(uri) + r'["\']', s):
                    print(f"warning: {uri} is already registered elsewhere in pinned_params.py", file=sys.stderr)
                s = s.rstrip("\n") + "\n\n\n" + BLOCK.format(begin=b, end=e, uri=uri)
                changed = True
                print(f"{uri}: rings switched OFF")
        else:
            if not has:
                print(f"{uri}: already on")
            else:
                s = re.sub(r"\n*" + re.escape(b) + r".*?" + re.escape(e) + r"\n", "\n", s, flags=re.S)
                changed = True
                print(f"{uri}: rings switched ON")

    if changed:
        f.write_text(s)
        if a.mode == "off":
            ensure_wide_window(pistomp)
        if a.restart:
            unit = subprocess.run("systemctl list-units --type=service --no-legend | awk '{print $1}' | grep -i 'stomp' | head -1",
                                  shell=True, capture_output=True, text=True).stdout.strip()
            if unit:
                subprocess.run(["sudo", "systemctl", "restart", unit])
                print(f"restarted {unit}")
            else:
                print("could not find the pi-Stomp service; restart it manually")
        else:
            print("restart the pi-Stomp service to apply")


main()
