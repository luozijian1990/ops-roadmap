"""Isolated teaching endpoints: no business writes; /health follows a local marker."""
import asyncio, json, os, socketserver, ssl, threading, time
from concurrent import futures
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
import grpc
import echo_pb2, echo_pb2_grpc
from dnslib import DNSRecord, RR, A, QTYPE
from websockets.asyncio.server import serve
NAME = os.getenv("BACKEND", "a")
def event(**fields): print(json.dumps({"backend": NAME, **fields}), flush=True)
class HTTP(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_GET(self):
        path = urlsplit(self.path)
        delay = min(float(parse_qs(path.query).get("delay", [0])[0]), 5)
        time.sleep(max(0, delay))
        status = 500 if path.path == '/error' else 200
        if path.path == '/health' and Path('/tmp/unhealthy').exists(): status = 503
        payload = {"backend": NAME, "uri": self.path, "remote": self.client_address[0],
                   "xff": self.headers.get('X-Forwarded-For'),
                   "prefix": self.headers.get('X-Forwarded-Prefix'),
                   "request_id": self.headers.get('X-Request-ID')}
        event(protocol="http", status=status, **{k:v for k,v in payload.items() if k!='backend'})
        body = json.dumps(payload).encode()
        self.send_response(status); self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(body))); self.end_headers()
        self.wfile.write(body)
class TCP(socketserver.BaseRequestHandler):
    def handle(self):
        self.request.settimeout(4)
        event(protocol='tcp', action='open', remote=self.client_address[0])
        try:
            while data := self.request.recv(4096):
                self.request.sendall(b'PONG\n' if data.strip()==b'PING' else data)
        except (TimeoutError, ConnectionError): pass
        finally: event(protocol='tcp', action='close')
class UDP(socketserver.BaseRequestHandler):
    def handle(self):
        data, sock = self.request
        query = DNSRecord.parse(data); reply = query.reply()
        if str(query.q.qname) == 'lab.test.' and query.q.qtype == QTYPE.A:
            reply.add_answer(RR('lab.test.',QTYPE.A,rdata=A('192.0.2.42'),ttl=30))
        event(protocol='dns', query=str(query.q.qname), source_port=self.client_address[1])
        sock.sendto(reply.pack(),self.client_address)
class Echo(echo_pb2_grpc.EchoServicer):
    def Say(self, request, context):
        event(protocol='grpc', text=request.text)
        return echo_pb2.Message(text=f'{NAME}:{request.text}')
async def ws(connection):
    event(protocol='websocket', action='open')
    try:
        async for message in connection: await connection.send(message)
    finally: event(protocol='websocket', action='close')
async def websockets():
    async with serve(ws,'0.0.0.0',8081,ping_interval=2,ping_timeout=4): await asyncio.Future()
def run(server): threading.Thread(target=server.serve_forever,daemon=True).start()
if __name__ == '__main__':
    run(ThreadingHTTPServer(('0.0.0.0',8080),HTTP))
    if Path('/certs/backend.crt').exists():
        server=ThreadingHTTPServer(('0.0.0.0',8443),HTTP)
        ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain('/certs/backend.crt','/certs/backend.key')
        ctx.load_verify_locations('/certs/ca.crt'); ctx.verify_mode=ssl.CERT_REQUIRED
        server.socket=ctx.wrap_socket(server.socket,server_side=True); run(server)
    socketserver.ThreadingTCPServer.allow_reuse_address=True
    run(socketserver.ThreadingTCPServer(('0.0.0.0',7000),TCP))
    run(socketserver.ThreadingUDPServer(('0.0.0.0',5353),UDP))
    rpc=grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    echo_pb2_grpc.add_EchoServicer_to_server(Echo(),rpc)
    rpc.add_insecure_port('[::]:50051'); rpc.start()
    asyncio.run(websockets())
