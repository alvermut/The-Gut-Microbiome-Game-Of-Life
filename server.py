"""Loopback-only app server and explicit, same-origin CUPS print bridge."""
import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import subprocess
import threading
from urllib.parse import urlsplit

from receipt import escpos, render_receipt, validate

ROOT = Path(__file__).resolve().parent
STATIC = {'/': 'index.html', **{f'/{name}': name for name in (
    'index.html', 'app.js', 'engine.js', 'abundance.js', 'style.css', 'assets/participant-qr.png',
    'assets/fonts/Montserrat.ttf', 'assets/fonts/OFL.txt')}}


class PrintError(Exception):
    pass


class Printer:
    def __init__(self, queue):
        if not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]*', queue):
            raise ValueError('Invalid printer queue name.')
        self.queue = queue
        self.jobs = {}
        self.lock = threading.Lock()

    def submit(self, data):
        validate(data)
        digest = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
        with self.lock:
            if data['id'] in self.jobs:
                previous = self.jobs[data['id']]
                if previous['digest'] != digest:
                    raise PrintError('This run ID already belongs to different results.')
                if 'error' in previous:
                    raise PrintError(previous['error'])
                return previous['result']
            # Fail closed rather than forget IDs and risk a duplicate print.
            if len(self.jobs) >= 10000:
                raise PrintError('Print session is full. Restart the server before a new run.')
            try:
                result = subprocess.run(
                    ['lp', '-d', self.queue, '-o', 'raw', '-o', 'job-sheets=none',
                     '-n', '1', '-t', 'Microbiome ' + data['id'][:8]],
                    input=escpos(render_receipt(data), include_qr=True), capture_output=True, timeout=15,
                    env={**os.environ, 'LC_ALL': 'C'})
            except subprocess.TimeoutExpired:
                message = 'Printer submission timed out. It may already be queued; check the Linux print queue. This run will not be resent.'
                self.jobs[data['id']] = {'digest': digest, 'error': message}
                raise PrintError(message)
            except FileNotFoundError:
                raise PrintError('CUPS lp is missing. Install the Linux printing tools and restart the server.')
            if result.returncode:
                raise PrintError('Could not queue receipt: ' + result.stderr.decode(errors='replace').strip()[:300])
            message = result.stdout.decode(errors='replace').strip()
            response = {'queued': True, 'message': message or 'Receipt accepted by the print queue.', 'printer': self.queue}
            self.jobs[data['id']] = {'digest': digest, 'result': response}
            return response


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(20)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'")
        super().end_headers()

    def reply(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def local_host(self):
        return self.headers.get('Host') in {f'localhost:{self.server.server_port}', f'127.0.0.1:{self.server.server_port}'}

    def do_GET(self):
        if not self.local_host():
            return self.reply(403, {'error': 'Local host required.'})
        path = urlsplit(self.path).path
        if path == '/api/session':
            return self.reply(200, {'token': self.server.token, 'printer': self.server.printer.queue})
        if path not in STATIC:
            return self.reply(404, {'error': 'Not found.'})
        file = ROOT / STATIC[path]
        try:
            body = file.read_bytes()
        except OSError:
            return self.reply(404, {'error': 'Asset unavailable.'})
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(file)[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        origin = 'http://' + self.headers.get('Host', '')
        if (not self.local_host() or self.headers.get('Origin') != origin
                or not secrets.compare_digest(self.headers.get('X-Print-Token', ''), self.server.token)):
            return self.reply(403, {'error': 'Open the app locally and try again.'})
        if self.path not in ('/api/receipt', '/api/print'):
            return self.reply(404, {'error': 'Not found.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 4096 or self.headers.get('Content-Type') != 'application/json':
                raise ValueError('Expected a small JSON run summary.')
            data = json.loads(self.rfile.read(length))
            validate(data)
            if self.path == '/api/receipt':
                return self.reply(200, {'text': render_receipt(data)})
            self.reply(200, self.server.printer.submit(data))
        except (ValueError, UnicodeError) as error:
            self.reply(400, {'error': str(error)})
        except PrintError as error:
            self.reply(503, {'error': str(error)})


def make_server(port=8000, printer='Iggual_TP_Easy_58'):
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.token = secrets.token_hex(32)
    server.printer = Printer(printer)
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--printer', default='Iggual_TP_Easy_58')
    args = parser.parse_args()
    with make_server(args.port, args.printer) as server:
        print(f'Microbiome: http://localhost:{server.server_port} | Receipt queue: {args.printer}', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
