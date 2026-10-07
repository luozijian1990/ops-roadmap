#!/usr/bin/env python3
"""Local learning fixture, not an Internet-facing application server. Python 3.9+."""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def initialize(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as db:
        db.execute('CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')
        db.execute('INSERT OR IGNORE INTO items VALUES (1, ?)', ('first-deployment',))


def make_server(host, port, state, version):
    state.mkdir(parents=True, exist_ok=True)
    initialize(state / 'app.db')
    counters = {}
    lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            started = time.monotonic()
            path = self.path.split('?', 1)[0]
            status, content_type = 200, 'application/json; charset=utf-8'
            fault = (state / 'fault').read_text().strip() if (state / 'fault').exists() else 'none'
            body = None
            try:
                if path == '/healthz':
                    body = {'alive': True}
                elif path == '/version':
                    body = {'version': version}
                elif path == '/metrics':
                    content_type = 'text/plain; version=0.0.4'
                    with lock:
                        body = '# TYPE lab_requests_total counter\n' + ''.join(
                            f'lab_requests_total{{route="{route}",status="{code}"}} {count}\n'
                            for (route, code), count in sorted(counters.items()))
                elif path in ('/', '/api/items', '/readyz'):
                    if fault == 'unready':
                        raise sqlite3.OperationalError('simulated dependency unavailable')
                    if fault == 'slow' and path != '/readyz':
                        time.sleep(1)
                    # Read-only open prevents a missing database from silently becoming a new empty one.
                    with sqlite3.connect((state / 'app.db').resolve().as_uri() + '?mode=ro', uri=True) as db:
                        items = [{'id': row[0], 'name': row[1]} for row in db.execute('SELECT id, name FROM items ORDER BY id')]
                    body = {'ready': True} if path == '/readyz' else {'version': version, 'items': items}
                else:
                    status, body = 404, {'error': 'not_found'}
            except sqlite3.Error:
                status, body = 503, {'error': 'dependency_unavailable'}
            payload = (body if isinstance(body, str) else json.dumps(body, ensure_ascii=False)).encode()
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            try:
                self.wfile.write(payload)
            except (BrokenPipeError, ConnectionResetError):
                pass
            route = path if path in ('/', '/healthz', '/readyz', '/version', '/metrics', '/api/items') else 'other'
            with lock:
                counters[route, str(status)] = counters.get((route, str(status)), 0) + 1
            print(json.dumps({'method': 'GET', 'route': route, 'status': status,
                              'elapsed_ms': round((time.monotonic() - started) * 1000, 2),
                              'version': version}), flush=True)

    return ThreadingHTTPServer((host, port), Handler)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8088)
    parser.add_argument('--state', type=Path, default=Path(__file__).parent / '.state')
    parser.add_argument('--version', default=os.environ.get('LAB_VERSION', 'v1'))
    args = parser.parse_args()
    server = make_server(args.host, args.port, args.state.resolve(), args.version)
    print(f'Learning fixture: http://{args.host}:{server.server_port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
