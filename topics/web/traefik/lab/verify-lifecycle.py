"""Host-side lifecycle checks. Runs only against this directory's Compose project."""
from pathlib import Path
import json, subprocess, time, urllib.request, ssl
ROOT=Path(__file__).resolve().parent
results=[]
def dc(*args):return subprocess.check_output(['docker','compose',*args],cwd=ROOT,text=True,stderr=subprocess.PIPE)
def req(host,path='/'):
    r=urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:28080'+path,headers={'Host':host}),timeout=5)
    return json.load(r)
def poll(fn):
    for _ in range(30):
        try:
            value=fn()
            if value:return value
        except (OSError,ValueError):pass
        time.sleep(0.5)
    raise AssertionError('condition did not converge')
def entry():
    ctx=ssl.create_default_context(cafile=str(ROOT/'certs/ca.crt'))
    ctx.load_cert_chain(str(ROOT/'certs/client.crt'),str(ROOT/'certs/client.key'))
    import socket
    with socket.create_connection(('127.0.0.1',28443),timeout=5) as raw:
        with ctx.wrap_socket(raw,server_hostname='mtls.localhost') as sock:
            sock.sendall(b'GET / HTTP/1.1\r\nHost: mtls.localhost\r\nConnection: close\r\n\r\n')
            return sock.recv(4096).decode().splitlines()[0]
def serial():
    import socket
    ctx=ssl.create_default_context(cafile=str(ROOT/'certs/ca.crt'))
    with socket.create_connection(('127.0.0.1',28443),timeout=5) as raw:
        with ctx.wrap_socket(raw,server_hostname='app.localhost') as s:return s.getpeercert()['serialNumber']
def main():
    # Final auth/path regression after certificate store configuration has settled.
    poll(lambda:req('observe.localhost')['backend']=='a')
    core=json.loads(dc('run','--rm','client','/checks.py','core'));results.extend(core)
    log=dc('logs','--no-log-prefix','backend-a','backend-b')
    mirrors=[json.loads(line) for line in log.splitlines() if '"request_id": "mirror-39"' in line]
    assert {row['backend'] for row in mirrors}=={'a','b'},mirrors
    results.append({'case':'mirror-both-backends','result':'PASS','records':mirrors})
    try:
        dc('exec','backend-a','touch','/tmp/unhealthy')
        poll(lambda:req('failover.localhost')['backend']=='b')
    finally:dc('exec','backend-a','rm','-f','/tmp/unhealthy')
    poll(lambda:req('failover.localhost')['backend']=='a')
    results.append({'case':'failover-health-and-recovery','result':'PASS','backends':['a','b','a']})
    route=ROOT/'dynamic/routes.yml';original=route.read_text()
    # Bounded textual edits avoid a host PyYAML dependency for this helper.
    replacements=[('backend-wrong-san','serverName: backend-a','serverName: wrong.localhost'),('backend-unknown-ca','- /certs/ca.crt','- /certs/unknown-ca.crt'),('backend-missing-client','certificates:\n      - certFile: /certs/client.crt\n        keyFile: /certs/client.key','certificates: []')]
    for name,old,new in replacements:
        assert old in original,old
        try:
            updated=original.replace(old,new,1)
            pending=ROOT/'dynamic/routes.next';pending.write_text(updated);pending.replace(route)
            status=poll(lambda:(int(line.split()[1]) if (line:=entry()).split()[1] in ('500','502') else None))
            logs=dc('logs','--since=15s','--no-log-prefix','traefik')
            errors=[json.loads(line) for line in logs.splitlines() if line.startswith('{') and 'tls:' in line]
            assert errors,logs
            results.append({'case':name,'result':'PASS','status':status,'tls_errors':errors[-2:]})
        finally:
            pending=ROOT/'dynamic/routes.next';pending.write_text(original);pending.replace(route)
            poll(lambda:'200' in entry())
    before=serial()
    subprocess.check_output(['bash','rotate-cert.sh'],cwd=ROOT,text=True)
    after=poll(lambda:(value if (value:=serial())!=before else None))
    results.append({'case':'certificate-live-rotation','result':'PASS','before':before,'after':after})
    out=dc('exec','backend-b','python','-c','import socket; s=socket.create_connection(("traefik",7000)); s.settimeout(3); s.sendall(b"PING\\n");\ntry: print(repr(s.recv(100)))\nexcept ConnectionResetError: print("reset")')
    assert out.strip() in ["b''",'reset'],out
    results.append({'case':'tcp-disallowed-source','result':'PASS','response':out.strip()})
    trace='11111111111111111111111111111111'
    urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:28080/',headers={'Host':'observe.localhost','traceparent':f'00-{trace}-2222222222222222-01'})).read()
    traces=poll(lambda:(logs if trace in (logs:=dc('logs','--no-log-prefix','otel')) else None))
    lines=traces.splitlines();excerpt=[]
    for i,line in enumerate(lines):
        if trace in line:excerpt.extend(lines[max(0,i-2):i+16])
    results.append({'case':'collector-received-trace','result':'PASS','excerpt':excerpt})
    # Catalog remains registered while health changes; deregister in finally.
    service={'ID':'review-health','Name':'catalog-health','Address':'172.30.39.21','Port':8080,'Tags':['traefik.enable=true','traefik.http.routers.catalog-health.rule=Host(`catalog-health.localhost`)'],'Check':{'HTTP':'http://backend-a:8080/health','Interval':'1s'}}
    def consul(path,body=None):
        code='from urllib.request import Request,urlopen; '+f'r=urlopen(Request("http://consul:8500/v1/{path}", data={json.dumps(body).encode()!r},method="PUT")); print(r.status)'
        dc('exec','backend-b','python','-c',code)
    try:
        consul('agent/service/register',service)
        poll(lambda:req('catalog-health.localhost')['backend']=='a')
        dc('exec','backend-a','touch','/tmp/unhealthy')
        def critical():
            code='from urllib.request import urlopen; import json; print(json.dumps(json.load(urlopen("http://consul:8500/v1/health/service/catalog-health?passing=true"))))'
            return json.loads(dc('exec','backend-b','python','-c',code))==[]
        poll(critical)
        def unavailable():
            try:req('catalog-health.localhost')
            except urllib.error.HTTPError as e:return e.code if e.code in (404,503) else None
        status=poll(unavailable)
        dc('exec','backend-a','rm','-f','/tmp/unhealthy')
        poll(lambda:req('catalog-health.localhost')['backend']=='a')
        results.append({'case':'catalog-health-recovery','result':'PASS','unhealthy_status':status,'recovered_backend':'a'})
    finally:
        dc('exec','backend-a','rm','-f','/tmp/unhealthy')
        consul('agent/service/deregister/review-health')
if __name__=='__main__':
    try:main()
    finally:print(json.dumps(results,ensure_ascii=False,indent=2))
