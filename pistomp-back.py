#!/usr/bin/env python3
"""Make a press of the Tweak 2 encoder go BACK from the parameter edit screen
to the pedal block overview (only active in that screen).

  python3 pistomp-back.py on|off|status [--restart]

Run it from ~/git/surge on the dev Pi: it executes itself on the pi-Stomp over ssh
(target: $PISTOMP, default pistomp@pistomp.local). It edits plugins/parameter_window.py
of the pi-stomp software; re-run it after a pi-stomp update. Options:
  --host USER@HOST   ssh target        --local   work on this machine
  --pistomp DIR      pi-stomp folder   --restart restart the pi-Stomp service
"""
import argparse, os, re, shlex, socket, subprocess, sys
from pathlib import Path

BEGIN = "    # >>> pistomp-back (tweak 2 press = back)\n"
END = "    # <<< pistomp-back\n"
CODE = BEGIN + '''    def on_event(self, event) -> bool:
        from pistomp.controller import ControlType
        from pistomp.input.event import SwitchEvent, SwitchEventKind

        if (
            isinstance(event, SwitchEvent)
            and event.kind is SwitchEventKind.PRESS
            and event.controller.type == ControlType.KNOB
            and event.controller.id == 2
        ):
            self._on_dismiss()
            return True
        return super().on_event(event)

''' + END
ANCHOR = "    def declare_bindings(self) -> tuple[BindingDecl, ...]:\n"


def find_pistomp(given):
    if given:
        return Path(given).expanduser()
    out = subprocess.run("find / -path '*/plugins/parameter_window.py' -not -path '*/tests/*' 2>/dev/null | head -1",
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

    f = find_pistomp(a.pistomp) / "plugins" / "parameter_window.py"
    s = f.read_text()
    has = BEGIN in s
    if a.mode == "status":
        print("tweak 2 press = back: " + ("ON" if has else "OFF"))
        return
    if (a.mode == "on") == has:
        print(f"already {a.mode}")
        return
    if a.mode == "on":
        cls = s.index("class ParameterWindow(")
        i = s.index(ANCHOR, cls)
        if "\n    def on_event(" in s[cls:]:
            sys.exit("ParameterWindow already defines on_event; not patching")
        s = s[:i] + CODE + s[i:]
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
