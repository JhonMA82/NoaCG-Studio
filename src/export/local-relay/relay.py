#!/usr/bin/env python3
# NoaCG local relay v1 (macOS / Linux) -- double-click "start-controller.command" (macOS) or
# run ./start-controller.sh instead of running this directly. Serves this package's files
# over http://localhost:<port>/ and relays control commands between the control panel and the
# graphics through a tiny ordered log, so a panel in your browser can drive a graphic loaded
# in OBS/vMix (separate browser engines that a BroadcastChannel can never cross).
# Python 3 standard library only.
#
# Protocol v1 (shared with relay.ps1 -- keep them in agreement):
#   GET  /relay/ping           -> {"ok":true,"v":1,"head":N}
#   GET  /relay/head           -> {"head":N}
#   GET  /relay/log?after=N    -> {"rows":[{"id","graphic","stream","msg"}...],"head":N} (max 500)
#   POST /relay/send           -> body {"graphic","msg","stream"?} or {"items":[...]} -> {"head":N}
#   anything else              -> a file from this folder (the package is the web root)
# Rows persist to relay-log.jsonl beside this script, so a relay restart keeps the history.

import json
import os
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(ROOT, 'relay-log.jsonl')

ROWS = []
HEAD = 0
LOCK = threading.Lock()

if os.path.exists(LOG_FILE):
    with open(LOG_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
                ROWS.append(row)
                HEAD = max(HEAD, int(row.get('id', 0)))
            except ValueError:
                pass

TYPES = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif',
    '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
    '.webm': 'video/webm', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
}

# The operator page: the production CONTROLLER when the package has one, else the
# aggregated show panel, else the single graphic's panel.
if os.path.exists(os.path.join(ROOT, 'controller.html')):
    PANEL = 'controller.html'
elif os.path.exists(os.path.join(ROOT, 'show_controlpanel.html')):
    PANEL = 'show_controlpanel.html'
else:
    PANEL = 'controlpanel.html'


def append_row(item):
    global HEAD
    with LOCK:
        HEAD += 1
        row = {
            'id': HEAD,
            'graphic': str(item.get('graphic', '')),
            'stream': str(item.get('stream') or 'program'),
            'msg': item.get('msg'),
        }
        ROWS.append(row)
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(json.dumps(row, separators=(',', ':')) + '\n')
        return row


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # keep the terminal readable for operators
        pass

    def send_json(self, obj, status=200):
        body = json.dumps(obj, separators=(',', ':')).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == '/relay/ping':
            return self.send_json({'ok': True, 'v': 1, 'head': HEAD})
        if url.path == '/relay/head':
            return self.send_json({'head': HEAD})
        if url.path == '/relay/log':
            after = 0
            q = parse_qs(url.query).get('after')
            if q:
                try:
                    after = int(q[0])
                except ValueError:
                    after = 0
            with LOCK:
                out = [r for r in ROWS if r['id'] > after][:500]
            return self.send_json({'rows': out, 'head': HEAD})
        # Static: this folder is the web root. Resolve inside it only (no .. escapes).
        rel = url.path.lstrip('/') or PANEL
        full = os.path.realpath(os.path.join(ROOT, rel))
        if not full.startswith(os.path.realpath(ROOT)) or not os.path.isfile(full):
            return self.send_json({'error': 'not found'}, 404)
        ext = os.path.splitext(full)[1].lower()
        with open(full, 'rb') as f:
            body = f.read()
        self.send_response(200)
        self.send_header('Content-Type', TYPES.get(ext, 'application/octet-stream'))
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        url = urlparse(self.path)
        if url.path != '/relay/send':
            return self.send_json({'error': 'not found'}, 404)
        length = int(self.headers.get('Content-Length') or 0)
        try:
            parsed = json.loads(self.rfile.read(length).decode('utf-8'))
        except ValueError:
            return self.send_json({'error': 'bad json'}, 400)
        items = parsed.get('items') if isinstance(parsed, dict) and 'items' in parsed else [parsed]
        for item in items:
            if isinstance(item, dict):
                append_row(item)
        return self.send_json({'head': HEAD})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    server = None
    for p in range(port, port + 40):
        try:
            server = ThreadingHTTPServer(('localhost', p), Handler)
            port = p
            break
        except OSError:
            continue
    if server is None:
        print('No free port between 8787 and 8826.')
        sys.exit(1)
    print('NoaCG local relay v1 -- http://localhost:%d/' % port)
    print('Point OBS/vMix browser sources at the graphics on this address; keep this window open.')
    print('Ctrl+C stops it.')
    if os.path.exists(os.path.join(ROOT, PANEL)):
        webbrowser.open('http://localhost:%d/%s' % (port, PANEL))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
