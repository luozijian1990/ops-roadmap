"""Run: docker compose run --rm client /checks.py [core|metrics|protocols|catalog]."""
import asyncio, base64, collections, http.client, json, socket, ssl, sys, time
from urllib.parse import urlencode
from urllib.request import urlopen, Request
import grpc, echo_pb2, echo_pb2_grpc
from dnslib import DNSRecord
from websockets.asyncio.client import connect
results=[]
def record(case, **evidence):
    results.append({'case':case,'result':'PASS',**evidence})
def request(host, path='/', headers=None, target='traefik', port=80):
    c=http.client.HTTPConnection(target,port,timeout=8)
    c.request('GET',path,headers={'Host':host,**(headers or {})})
    r=c.getresponse();status=r.status;body=r.read().decode();c.close()
    return status, body
AUTH={'Authorization':'Basic '+base64.b64encode(b'learner:lab-password').decode()}
def tls_request(host, client=None, cafile='/certs/ca.crt',port=443):
    ctx=ssl.create_default_context(cafile=cafile)
    if client:ctx.load_cert_chain(f'/certs/{client}.crt',f'/certs/{client}.key')
    with socket.create_connection(('traefik',port),timeout=5) as raw:
        with ctx.wrap_socket(raw,server_hostname=host) as s:
            s.sendall(('GET / HTTP/1.1\r\nHost: '+host+'\r\nConnection: close\r\n\r\n').encode())
            chunks=[]
            while chunk:=s.recv(4096):chunks.append(chunk)
            return b''.join(chunks).decode()
def core():
    for path in ['/bar','/foo/bar','/foo/../bar','/foo/%2E%2E/bar','/foo//bar','/foo%2Fbar']:
        code,body=request('path.localhost',path)
        # Recent security patches may reject encoded slashes; preserve actual outcome.
        assert code in (200,400),(path,code,body)
        if code==200:
            data=json.loads(body)
            expected='a' if path=='/foo%2Fbar' else 'b'
            assert data['backend']==expected,(path,data)
            record('path',sent=path,status=code,backend=data['backend'],uri=data['uri'])
        else:record('path',sent=path,status=code,backend=None)
    assert request('app.localhost')[0]==401
    assert request('app.localhost',headers=AUTH)[0]==200
    assert '401 Unauthorized' in tls_request('app.localhost')
    ctx=ssl.create_default_context(cafile='/certs/ca.crt')
    with socket.create_connection(('traefik',443),timeout=5) as raw:
        with ctx.wrap_socket(raw,server_hostname='app.localhost') as s:
            s.sendall(f'GET / HTTP/1.1\r\nHost: app.localhost\r\nAuthorization: {AUTH["Authorization"]}\r\nConnection: close\r\n\r\n'.encode())
            assert b'200 OK' in s.recv(4096)
    record('dual-entry-auth',http=[401,200],https=[401,200])
    assert '200 OK' in tls_request('mtls.localhost','client')
    record('two-leg-mtls',status=200)
    for name,host,client,ca in [('no-client','mtls.localhost',None,'ca'),('unknown-client','mtls.localhost','unknown-client','ca'),('wrong-san','wrong.localhost',None,'ca'),('unknown-server-ca','app.localhost',None,'unknown-ca')]:
        try:tls_request(host,client,f'/certs/{ca}.crt')
        except (ssl.SSLError,ConnectionError) as e:
            if name=='wrong-san': assert 'Hostname mismatch' in str(e),str(e)
            record(name,error=str(e))
        else:raise AssertionError(name+' unexpectedly accepted')
    count=collections.Counter(json.loads(request('weighted.localhost')[1])['backend'] for _ in range(80))
    assert count=={'a':60,'b':20},count
    record('wrr',distribution=dict(count))
    assert request('mirror.localhost','/read-only?id=mirror-39',{'X-Request-ID':'mirror-39'})[0]==200
    record('mirror-request',request_id='mirror-39',note='verify BOTH backend logs separately')
    code,body=request('failover.localhost','/error');assert code==500 and json.loads(body)['backend']=='a'
    record('application-500-does-not-failover',status=code,backend='a')
    h={'X-Forwarded-For':'172.30.39.30','X-Forwarded-Prefix':'/forged'}
    code,body=request('headers.localhost',headers=h);data=json.loads(body)
    assert data['prefix'] is None and data['xff']=='172.30.39.30',data
    assert request('ip.localhost',headers=h)[0]==403
    assert request('ip.localhost',headers=h,target='front')[0]==200
    code,body=request('headers.localhost',headers=h,target='front');data=json.loads(body)
    assert data['xff']=='172.30.39.30, 172.30.39.11' and data['prefix']=='/trusted-edge',data
    record('forwarded-trust',direct_spoof=403,via_front=200,backend=data)
    statuses=[request('rate.localhost',target='front',headers={'X-User':str(i)})[0] for i in range(5)]
    assert 429 in statuses,statuses
    record('shared-egress-rate',statuses=statuses)
def query(expr):
    data=json.load(urlopen('http://prometheus:9090/api/v1/query?'+urlencode({'query':expr})))
    assert data['status']=='success',data
    return data['data']['result']
def metrics():
    # Wait until there are enough real samples, then generate 500 and slow traffic.
    for _ in range(8):request('observe.localhost');time.sleep(1)
    normal=query('sum(rate(traefik_service_requests_total{service="a@file",code="200"}[1m]))')
    assert normal and float(normal[0]['value'][1])>0,normal
    for _ in range(35):
        request('observe.localhost','/error');request('observe.localhost','/?delay=0.3');time.sleep(1)
    expr='sum(rate(traefik_service_requests_total{service="a@file",code=~"5.."}[1m])) / sum(rate(traefik_service_requests_total{service="a@file"}[1m]))'
    ratio=query(expr);assert ratio and float(ratio[0]['value'][1])>0.05,ratio
    quantiles={}
    for q in (0.95,0.99):
        rows=query(f'histogram_quantile({q}, sum by(le) (rate(traefik_service_request_duration_seconds_bucket{{service="a@file"}}[1m])))')
        assert rows and float(rows[0]['value'][1])>0.1,rows
        quantiles[str(q)]=rows
    cert=query('min(traefik_tls_certs_not_after - time()) / 86400')
    assert cert and float(cert[0]['value'][1])>0,cert
    alert=query('ALERTS{alertname="TraefikHigh5xx",alertstate="firing"}')
    assert alert,alert
    record('metrics-active',normal=normal,ratio=ratio,quantiles=quantiles,certificate_days=cert,alert=alert)
    # No business traffic for longer than the query window; scrape/health remain.
    time.sleep(70)
    quiet=query(expr)
    assert quiet and quiet[0]['value'][1]=='NaN',quiet
    assert not query('ALERTS{alertname="TraefikHigh5xx",alertstate="firing"}')
    record('metrics-no-traffic',ratio=quiet,alert_firing=False)
def protocols():
    with socket.create_connection(('traefik',7000),timeout=5) as s:
        s.sendall(b'PING\n');assert s.recv(100)==b'PONG\n'
        s.sendall(b'hello');assert s.recv(100)==b'hello'
        time.sleep(5);assert s.recv(100)==b''
    with socket.create_connection(('traefik',7000),timeout=5) as s:
        s.sendall(b'PING\n');assert s.recv(100)==b'PONG\n'
        s.shutdown(socket.SHUT_WR);assert s.recv(100)==b''
    record('tcp-echo-idle-halfclose-reconnect',idle_seconds=5)
    held=[socket.create_connection(('traefik',7000),timeout=5) for _ in range(2)]
    try:
        for s in held:s.sendall(b'PING\n');assert s.recv(100)==b'PONG\n'
        with socket.create_connection(('traefik',7000),timeout=5) as third:
            try:third.sendall(b'PING\n');assert third.recv(100)==b''
            except ConnectionResetError:pass
    finally:
        for s in held:s.close()
    record('tcp-inflight-budget',accepted=2,rejected=1)
    for host in ['tcp.localhost','wrong.localhost']:
        ctx=ssl.create_default_context(cafile='/certs/ca.crt')
        try:
            with socket.create_connection(('traefik',7443),timeout=5) as raw:
                with ctx.wrap_socket(raw,server_hostname=host) as s:
                    s.sendall(b'PING\n');assert s.recv(100)==b'PONG\n'
            assert host=='tcp.localhost'
            record('tcp-tls-sni',host=host,accepted=True)
        except ssl.SSLError as e:
            assert host=='wrong.localhost';record('tcp-tls-sni',host=host,accepted=False,error=str(e))
    with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as s:
        s.settimeout(5)
        for delay in (0,4):
            time.sleep(delay);s.sendto(DNSRecord.question('lab.test.').pack(),('traefik',5353))
            answer=DNSRecord.parse(s.recv(4096));assert str(answer.rr[0].rdata)=='192.0.2.42'
        record('udp-dns-idle-session',answer='192.0.2.42',idle_seconds=4)
    with grpc.insecure_channel('traefik:80',options=[('grpc.default_authority','grpc.localhost')]) as channel:
        stub=echo_pb2_grpc.EchoStub(channel)
        assert stub.Say(echo_pb2.Message(text='hello'),timeout=5).text=='a:hello'
    record('grpc-unary',method='lab.Echo/Say',response='a:hello')
    async def ws_test():
        for i in range(2):
            async with connect('ws://ws.localhost/',host='traefik',port=80,proxy=None) as ws:
                await ws.send('hello');assert await ws.recv()=='hello'
                await asyncio.sleep(5)
                await ws.send('after-idle');assert await ws.recv()=='after-idle'
    asyncio.run(ws_test());record('websocket-echo-idle-close-reconnect',connections=2,idle_seconds=5)
def catalog():
    service={'ID':'review-a','Name':'catalog-app','Address':'172.30.39.21','Port':8080,'Tags':['traefik.enable=true','traefik.http.routers.catalog.rule=Host(`catalog.localhost`)'],'Check':{'HTTP':'http://backend-a:8080/health','Interval':'1s'}}
    def put(path,value=None):
        with urlopen(Request('http://consul:8500/v1/'+path,data=json.dumps(value).encode() if value else b'',method='PUT')) as r:return r.read()
    put('agent/service/register',service)
    for _ in range(15):
        code,body=request('catalog.localhost')
        if code==200:break
        time.sleep(1)
    assert code==200 and json.loads(body)['backend']=='a',(code,body)
    record('catalog-register',address=service['Address'],port=service['Port'],status=code)
    put('agent/service/deregister/review-a')
    for _ in range(15):
        code,_=request('catalog.localhost')
        if code==404:break
        time.sleep(1)
    assert code==404,code
    record('catalog-deregister',status=code)
if __name__=='__main__':
    try:
        {'core':core,'metrics':metrics,'protocols':protocols,'catalog':catalog}[sys.argv[1] if len(sys.argv)>1 else 'core']()
    finally:print(json.dumps(results,ensure_ascii=False,indent=2))
