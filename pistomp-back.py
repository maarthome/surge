#!/usr/bin/env python3
"""Make a press of the Tweak 2 encoder go BACK from any plugin edit screen
(parameter window or plugin panel) to the pedal block overview.

  python3 pistomp-back.py on|off|status [--restart]

Run it from ~/git/surge on the dev Pi: it executes itself on the pi-Stomp over ssh
(target: $PISTOMP, default pistomp@pistomp.local). It edits plugins/base.py
of the pi-stomp software; re-run it after a pi-stomp update. Options:
  --host USER@HOST   ssh target        --local   work on this machine
  --pistomp DIR      pi-stomp folder   --restart restart the pi-Stomp service
"""
import argparse, os, re, shlex, socket, subprocess, sys
from pathlib import Path

BEGIN = "        # >>> pistomp-back (tweak 2 press = back)\n"
END = "        # <<< pistomp-back\n"
CODE = BEGIN + '''        if (
            isinstance(event, SwitchEvent)
            and event.kind is SwitchEventKind.PRESS
            and event.controller.type == ControlType.KNOB
            and event.controller.id == 2
        ):
            self._on_dismiss()
            return True
''' + END
ANCHOR = "        if not isinstance(event, EncoderEvent):\n            return False\n        rows = self.declare_bindings()\n"
# first version of this script patched ParameterWindow only; remove that one when found
OLD_BEGIN = "    # >>> pistomp-back (tweak 2 press = back)\n"
OLD_END = "    # <<< pistomp-back\n"


def find_pistomp(given):
    if given:
        return Path(given).expanduser()
    out = subprocess.run("find / -path '*/plugins/base.py' -not -path '*/tests/*' 2>/dev/null | head -1",
                         shell=True, capture_output=True, text=True).stdout.strip()
    if not out:
        sys.exit("pi-stomp source not found; use --pistomp DIR")
    return Path(out).parent.parent


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mode", choices=["on", "off", "status"])
    ap.add_argument("--pistomp"); ap.add_argument("--host")
    ap.add_argument("--local", action="store_true"); ap.add_argument("--restart", action="store_true")
    a = ap.parse_args()

    if not a.local and socket.gethostname().lower() != "pistomp":
        host = a.host or os.environ.get("PISTOMP", "pistomp@pistomp.local")
        args = [a.mode, "--local"] + (["--pistomp", a.pistomp] if a.pistomp else []) + (["--restart"] if a.restart else [])
        print(f"==> running on {host}")
        sys.exit(subprocess.run(["ssh", host, "python3 - " + " ".join(shlex.quote(x) for x in args)],
                                input=Path(__file__).read_text(), text=True).returncode)

    root = find_pistomp(a.pistomp)
    old = root / "plugins" / "parameter_window.py"
    if old.exists() and OLD_BEGIN in old.read_text():
        old.write_text(re.sub(re.escape(OLD_BEGIN) + r".*?" + re.escape(OLD_END), "",
                              old.read_text(), flags=re.S))
        print("removed the earlier parameter_window.py version")
    f = root / "plugins" / "base.py"
    s = f.read_text()
    has = BEGIN in s
    if a.mode == "status":
        print("tweak 2 press = back: " + ("ON" if has else "OFF"))
        return
    if (a.mode == "on") == has:
        print(f"already {a.mode}")
        return
    if a.mode == "on":
        if s.count(ANCHOR) != 1:
            sys.exit("PluginPanel.on_event not recognised in plugins/base.py (pi-stomp changed?); not patching")
        s = s.replace(ANCHOR, CODE + ANCHOR, 1)
    else:
        s = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END), "", s, flags=re.S)
    compile(s, str(f), "exec")
    f.write_text(s)
    print(f"tweak 2 press = back switched {a.mode.upper()}")
    if a.restart:
        unit = subprocess.run("systemctl list-units --type=service --no-legend | awk '{print $1}' | grep -i 'stomp' | head -1",
                              shell=True, capture_output=True, text=True).stdout.strip()
        if unit:
            subprocess.run(["sudo", "systemctl", "restart", unit]); print(f"restarted {unit}")
        else:
            print("could not find the pi-Stomp service; restart it manually")
    else:
        print("restart the pi-Stomp service to apply")


main()
