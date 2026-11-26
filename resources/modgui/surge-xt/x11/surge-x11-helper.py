#!/usr/bin/env python3
"""Helper for the Surge XT MOD panel "GUI" switch (runs on the pi-Stomp).

Starts the Surge XT plugin GUI (jalv, X11) on a virtual screen and serves that screen as VNC and as
a web page (noVNC), so it can be opened in the browser on the PC.

  GET /status  -> {"running": bool, "url": "http://<host>:6080/vnc.html?..."}
  GET /start   -> starts virtual screen + GUI + VNC + noVNC web server
  GET /stop    -> stops everything again

Only requests from private LAN addresses are accepted. VNC (port 5900) has no password; set
SURGE_VNC_PASSWD_FILE to an x11vnc password file to protect it.
"""
import ipaddress, json, os, shutil, signal, subprocess, time
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


def stop_all():
    global procs
    for p in reversed(procs):
        try:
            os.killpg(os.getpgid(p.pid), signal.SIGTERM)
        except OSError:
            pass
    procs = []


def spawn(cmd, env=None):
    p = subprocess.Popen(cmd, env=env, start_new_session=True,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
               " (sudo apt install xvfb x11vnc novnc websockify jalv)"
    env = dict(os.environ, DISPLAY=DISP)
    spawn(["Xvfb", DISP, "-screen", "0", SIZE, "-nolisten", "tcp"])
    time.sleep(1)
    spawn([GUI], env=env)
    cmd = ["x11vnc", "-display", DISP, "-forever", "-shared", "-rfbport", str(VNC_PORT), "-quiet"]
    cmd += ["-rfbauth", PASSWD] if PASSWD else ["-nopw"]
    spawn(cmd)
    spawn(["websockify", "--web", novnc_dir(), str(WEB_PORT), "localhost:%d" % VNC_PORT])
    time.sleep(2)
    if not running():
        stop_all()
        return "could not start (is jalv installed? Surge XT plugin present in ~/.lv2?)"
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
