#!/usr/bin/env python3
"""Helper for the Surge XT MOD panel "GUI" switch (runs on the pi-Stomp).

Starts the Surge XT plugin GUI (jalv, X11) on a virtual screen and serves that screen as VNC and as
a web page (noVNC), so it can be opened in the browser on the PC. The window is only an editor: it
is silent, and everything changed there is copied to the Surge XT in the MOD pedalboard (and the
other way round).

  GET /status  -> {"running": bool, "url": "http://<host>:6080/vnc.html?..."}
  GET /start   -> starts virtual screen + GUI + VNC + noVNC web server
  GET /stop    -> stops everything again

Only requests from private LAN addresses are accepted. VNC (port 5900) has no password; set
SURGE_VNC_PASSWD_FILE to an x11vnc password file to protect it.
"""
import ipaddress, json, os, shutil, signal, subprocess, time

SYNC_DIR = os.environ.get("SURGE_SYNC_DIR", "/tmp/surge-sync")
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("SURGE_X11_PORT", "8765"))
WEB_PORT = int(os.environ.get("SURGE_NOVNC_PORT", "6080"))
VNC_PORT = int(os.environ.get("SURGE_VNC_PORT", "5900"))
DISP = os.environ.get("SURGE_X11_DISPLAY", ":77")
SIZE = os.environ.get("SURGE_X11_SIZE", "1280x800x24")
PASSWD = os.environ.get("SURGE_VNC_PASSWD_FILE", "")
HERE = os.path.dirname(os.path.abspath(__file__))
GUI = os.path.join(HERE, "surge-x11-gui")
procs = []


def alive(p):
    return p.poll() is None


def running():
    return len(procs) > 0 and all(alive(p) for p in procs)


def sync_off():
    try:
        os.remove(os.path.join(SYNC_DIR, "enabled"))
    except OSError:
        pass


def sync_on():
    # fresh folder; while "enabled" exists the plugin in MOD and the plugin in the window copy
    # their complete patch state to each other (see SurgeSynthProcessor::syncLoop)
    shutil.rmtree(SYNC_DIR, ignore_errors=True)
    os.makedirs(SYNC_DIR, exist_ok=True)
    os.chmod(SYNC_DIR, 0o1777)
    open(os.path.join(SYNC_DIR, "enabled"), "w").close()


def stop_all():
    global procs
    sync_off()
    for p in reversed(procs):
        try:
            os.killpg(os.getpgid(p.pid), signal.SIGTERM)
        except OSError:
            pass
    procs = []


LOG = "/tmp/surge-x11.log"


def spawn(cmd, env=None):
    log = open(LOG, "a")
    log.write("\n$ %s\n" % " ".join(cmd))
    log.flush()
    p = subprocess.Popen(cmd, env=env, start_new_session=True, stdout=log, stderr=log)
    procs.append(p)
    return p


def novnc_dir():
    for d in ("/usr/share/novnc", "/usr/share/novnc/utils/../", "/opt/novnc"):
        if os.path.exists(os.path.join(d, "vnc.html")):
            return d
    return None


def start_all():
    missing = [c for c in ("Xvfb", "x11vnc", "websockify") if not shutil.which(c)]
    if missing or not novnc_dir():
        return "missing: " + " ".join(missing + ([] if novnc_dir() else ["novnc"])) + \
               " (sudo apt install xvfb x11vnc novnc websockify jalv matchbox-window-manager)"
    try:
        os.remove(LOG)
    except OSError:
        pass
    env = dict(os.environ, DISPLAY=DISP, SURGE_SYNC_ROLE="editor", SURGE_SYNC_DIR=SYNC_DIR)
    sync_on()
    if not shutil.which("jackd"):
        stop_all()
        return "missing: jackd (should come with jack2-pistomp; do NOT install jackd2, it replaces the pi-Stomp JACK)"
    # the window is silent, so it gets its own private dummy JACK server; it needs no access to
    # the sound card or to the JACK server that MOD uses
    env["JACK_DEFAULT_SERVER"] = "surgeedit"
    env["JACK_NO_AUDIO_RESERVATION"] = "1"
    spawn(["jackd", "-r", "-n", "surgeedit", "-d", "dummy", "-r", "48000", "-p", "4096"], env=env)
    time.sleep(1.5)
    spawn(["Xvfb", DISP, "-screen", "0", SIZE, "-nolisten", "tcp"])
    time.sleep(1)
    # a minimal window manager without title bar: it makes the Surge window fill the whole screen
    if shutil.which("matchbox-window-manager"):
        spawn(["matchbox-window-manager", "-display", DISP, "-use_titlebar", "no", "-use_cursor", "no"])
        time.sleep(0.5)
    spawn([GUI], env=env)
    cmd = ["x11vnc", "-display", DISP, "-forever", "-shared", "-rfbport", str(VNC_PORT), "-quiet"]
    cmd += ["-rfbauth", PASSWD] if PASSWD else ["-nopw"]
    spawn(cmd)
    spawn(["websockify", "--web", novnc_dir(), str(WEB_PORT), "localhost:%d" % VNC_PORT])
    time.sleep(2)
    if not running():
        dead = [p.args[0] for p in procs if not alive(p)]
        try:
            tail = " | ".join([l.strip() for l in open(LOG).read().splitlines() if l.strip()][-6:])
        except OSError:
            tail = ""
        stop_all()
        return "could not start: %s stopped. Log (%s): %s" % (", ".join(os.path.basename(str(d)) for d in dead), LOG, tail)
    return None


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def reply(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        ip = self.client_address[0]
        if ip.startswith("::ffff:"):
            ip = ip[7:]
        try:
            a = ipaddress.ip_address(ip.split("%")[0])
            if not (a.is_private or a.is_loopback or a.is_link_local):
                return self.reply(403, {"error": "LAN only"})
        except ValueError:
            return self.reply(403, {"error": "bad address"})
        path = self.path.split("?")[0]
        if path == "/start":
            if procs and not running():
                stop_all()
            if not procs:
                err = start_all()
                if err:
                    return self.reply(500, {"running": False, "error": err})
        elif path == "/stop":
            stop_all()
        elif path != "/status":
            return self.reply(404, {"error": "unknown"})
        host = (self.headers.get("Host") or "").split(":")[0] or "pistomp.local"
        self.reply(200, {"running": running(),
                         "url": "http://%s:%d/vnc.html?autoconnect=1&resize=scale" % (host, WEB_PORT)})


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
