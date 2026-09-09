# Traefik 39 章统一实验包

固定基线：Traefik 3.6.25、Python 3.12.12、grpcio 1.76.0、websockets 15.0.1、dnslib 0.9.26、Nginx 1.28.0、Prometheus 3.5.0、Collector 0.123.0、Consul 1.21.5。依赖 Docker Compose v2、curl、Python3、支持 `-addext` 的 OpenSSL；可选 dig、kubectl/Helm、独立 Swarm。镜像首次构建和拉取需要网络。

[返回笔记](../guide.md) · [整改验收记录](../../../../docs/traefik/reviews/39-chapters-remediation-2026-09-07.md)

## 启动与清理

在仓库根目录执行。只操作名为 `traefik-review-39` 的专用项目，宿主发布端口绑定127.0.0.1。后端不发布宿主端口。教学密码 `learner / lab-password` 已公开，仅用于隔离实验，不得作为实际账户凭据。

```bash
cd topics/web/traefik/lab
./init-certs.sh
docker compose config --quiet
docker compose build backend-a
docker compose up -d
docker compose exec traefik traefik version
docker compose ps
docker compose logs --tail=30 traefik
curl -u learner:lab-password -H 'Host: app.localhost' http://127.0.0.1:28080/
```

等待服务就绪后再跑脚本；启动时 Consul 可能尚未监听，Provider有连接拒绝并重试，只要随后恢复且业务通过就与持续失败区别记录。若 `front` 在Traefik DNS名出现前启动失败，确认Traefik运行后执行 `docker compose up -d front`。

固定实验网段172.30.39.0/24用于真实IP可解释性。遇现有Docker/VPN网络冲突，改 compose.yaml 的subnet及静态IP，同时改traefik.yml trustedIPs、dynamic/routes.yml sourceRange、checks.py Catalog注册地址和信任断言、verify-lifecycle.py中的注册地址。不能只换IP却继续使用旧白名单。

| 宿主端口 | 用途 |
| --- | --- |
| 28080 / 28443 | HTTP / HTTPS |
| 28081 | 前置Nginx HTTP |
| 29100 / 29090 | Traefik metrics / Prometheus查询 |
| 27000 / 27443 | TCP echo / Traefik终止TLS的echo |
| 25353/udp | DNS UDP |

```bash
# 按此顺序运行；metrics 的无流量窗口内不能运行其他业务实验。
docker compose run --rm client /checks.py core
docker compose run --rm client /checks.py protocols
docker compose run --rm client /checks.py catalog
python3 verify-lifecycle.py
docker compose run --rm client /checks.py metrics
# 实验结束，仅清理本项目的容器与网络。
docker compose down
```

checks.py每组失败返回非零，标准输出为已完成样本的JSON；verify-lifecycle.py额外控制摘除/恢复、读取双后端镜像日志、测试后端TLS三种失败、轮换证书、保存Collector实收片段及Catalog健康变化。它会恢复临时动态配置和健康标记；成功的证书轮换保留新证书。私钥位于被忽略的certs/，不会进入报告。要重建整套CA，应先停止实验并自行备份/移走原certs目录；不要在服务运行中无意换掉CA。

## 路径、身份和负载均衡

完整配置为 [traefik.yml](traefik.yml) 和 [dynamic/routes.yml](dynamic/routes.yml)，后端源代码 [app/server.py](app/server.py)。修改启动配置要重新创建Traefik，动态配置通过File Provider热加载。

```bash
for request_path in /bar /foo/bar /foo/../bar /foo/%2E%2E/bar /foo//bar /foo%2Fbar; do
  printf '\n%s\n' "$request_path"
  curl --path-as-is -i -H 'Host: path.localhost' "http://127.0.0.1:28080$request_path"
done
docker compose logs traefik | rg 'path-(bar|foo-bar|default)@file'
docker compose logs backend-a backend-b | rg mirror-39
```

后端JSON同时显示backend、uri、remote、xff、prefix。`.30 → .11 → .10 → .21` 分别是客户端、前置代理、Traefik与A。Nginx覆盖外来XFF，Traefik仅信任`.11/32`，IPAllowList从进入中间件时的XFF最右取1个IP。直连伪造拒绝403，经front允许200；从宿主请求的NAT地址可能不同，允许样本要使用固定client容器。rate.localhost按来源共享令牌桶，X-User变化不会分桶。

WRR目标3:1，mirror仅GET且镜像100%给B，Failover基于A的`/health`。`/error`仅让业务500；`touch /tmp/unhealthy`才让健康503。在A/B日志中查到同一mirror-39才证明镜像成功。教学后端只提供读请求与日志，勿换成有副作用的业务GET后照搬镜像配置。

## 观测

Prometheus和Collector与Traefik同一网络。Prometheus采集traefik:9100并加载 [alerts.yml](alerts.yml)。运行规则校验：

```bash
docker compose exec prometheus promtool check config /etc/prometheus/prometheus.yml
docker compose exec prometheus promtool check rules /etc/prometheus/alerts.yml
docker compose run --rm client /checks.py metrics
```

metrics约需两分钟，验证正常200、500、慢请求、无业务流量四种状态，以及5xx比例、P95/P99、证书到期天数和告警firing/解除。生产告警窗口与最低流量要按实际负载调整。完整查询见 [checks.py](checks.py) 和第18章。少于两次采样的rate可能无结果；无流量0/0产生NaN，不得当作健康百分比0%。Collector debug exporter提供真实Span，但没有长期存储与可视化查询后端。

## TLS 与轮换

init-certs.sh生成入口/后端/客户端证书和错误CA客户端；证书用途及SAN已明确。入口mtls.localhost要求客户端证书，Traefik再用独立client证书访问要求mTLS的backend-a:8443。app.localhost的HTTP与HTTPS都挂载同一BasicAuth。默认TLSStore使用相同受信入口证书，错误SAN测试因此能得到确切的hostname mismatch，不被默认自签证书错误掩盖。

```bash
curl --resolve mtls.localhost:28443:127.0.0.1 --cacert certs/ca.crt \
  --cert certs/client.crt --key certs/client.key https://mtls.localhost:28443/
python3 verify-lifecycle.py
```

verify-lifecycle.py逐项测试后端错误SAN、错误CA、缺客户端证书，期待入口5xx并恢复200，同时核对明确的TLS错误日志。rotate-cert.sh重新签发入口证书、原子替换并触发动态文件重载；验收使用新TLS连接读取serial，不用磁盘证书或已有keep-alive证明轮换。

## DNS-01 与续期

本节是外部环境实验，不包含在默认 `compose up` 中。需要自己控制的真实域名与Cloudflare DNS Token（限定目标zone，Zone DNS Edit与Zone Read），本次未自动申请公网证书。不要向助手或公开日志粘贴Token。

1. 修改dns-acme.yml中的email。创建state/acme目录与权限600的acme.json；在state/cloudflare-token写入Token（用编辑器或交互输入，避免shell历史）。Compose secret通过CF_DNS_API_TOKEN_FILE注入。
2. 创建state/dns-routes.yml，将下例的`YOUR_DOMAIN`替换为自己的根域，websecure Router引用cloudflare-staging。
3. 运行独立Compose，观察日志和权威TXT。DNS-01不要求公网访问本机443，但容器需要访问DNS/Cloudflare/ACME API。

```bash
mkdir -p state/acme
chmod 700 state state/acme
# 仅在文件不存在时创建，不能清空已有账户/证书状态。
(umask 077; test -e state/acme/acme.json || touch state/acme/acme.json)
chmod 600 state/acme/acme.json
# 用编辑器创建 state/cloudflare-token，保存后：
chmod 600 state/cloudflare-token
docker compose -f dns-acme-compose.yaml config --quiet
docker compose -f dns-acme-compose.yaml up -d
docker compose -f dns-acme-compose.yaml logs --tail=100 traefik
dig NS YOUR_DOMAIN +short
dig @AUTHORITATIVE_NS TXT _acme-challenge.YOUR_DOMAIN
dig @1.1.1.1 TXT _acme-challenge.YOUR_DOMAIN
```

state/dns-routes.yml完整模板（`noop@internal`仅触发路由证书需求，不依赖业务后端）：

```yaml
http:
  routers:
    certificate-probe:
      entryPoints: [websecure]
      rule: Host(`YOUR_DOMAIN`)
      service: noop@internal
      tls:
        certResolver: cloudflare-staging
        domains:
          - main: YOUR_DOMAIN
            sans: ['*.YOUR_DOMAIN']
```

遇失败先查Token权限/zone、_acme-challenge的CNAME委派、权威NS是否存在TXT，再查公共递归缓存与negative TTL。`propagation.delayBeforeChecks: 10s`不是任意DNS都在10秒内收敛的保证，勿禁用检查掩盖传播问题。通配符需DNS-01；HTTP-01要求公网80可达，TLS-ALPN-01要求公网443与正确ALPN可达，均不能用这个loopback DNS示例声称已验收。

保存首次成功后的serial/NotAfter及实际续期时的相同字段。默认2160小时续期计算不决定CA真实签出期限，以实际NotAfter为准。短实验不能通过改时钟或删acme.json冒充自动续期。续期失败先修API/网络/权限，再保留可用证书与账户状态恢复；进入生产CA需独立storage，避免staging证书混用。staging链不受系统默认信任，签发成功并不等于浏览器可信。

```bash
openssl s_client -connect 127.0.0.1:38443 -servername YOUR_DOMAIN </dev/null 2>/dev/null \
  | openssl x509 -noout -serial -dates -issuer
docker compose -f dns-acme-compose.yaml down
```

## Kubernetes 复用端点

仅在独立测试context操作；没有集群时可以执行CRD schema校验，但不能宣称网络/RBAC运行通过。需要Traefik 3.6.25对应CRD与RBAC，Gateway实验另需Gateway API v1.4.0。不要直接套用采集材料的TCP `spec.rootCAs`；目标版本应为 `spec.tls.rootCAs`。

先把 `traefik-review-backend:2026-09-07` 导入测试集群节点（例如 `kind load docker-image traefik-review-backend:2026-09-07 --name YOUR_TEST_CLUSTER`）；如果是远程集群，由操作者将镜像发布到自己的registry并修改清单，本次不会自动推送镜像。

```bash
kubectl config current-context
kubectl create namespace traefik-notes --dry-run=client -o yaml | kubectl apply -f -
kubectl -n traefik-notes create secret generic backend-certs \
  --from-file=ca.crt=certs/ca.crt --from-file=backend.crt=certs/backend.crt \
  --from-file=backend.key=certs/backend.key --dry-run=client -o yaml | kubectl apply -f -
kubectl -n traefik-notes create configmap backend-ca --from-file=ca.crt=certs/ca.crt \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n traefik-notes create secret generic backend-ca --from-file=ca.crt=certs/ca.crt \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n traefik-notes create secret tls gateway-client --cert=certs/client.crt --key=certs/client.key \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply --dry-run=server -f kubernetes/backends.yml -f kubernetes/routes.yml
kubectl apply -f kubernetes/backends.yml -f kubernetes/routes.yml
kubectl -n traefik-notes rollout status deploy/backend-a
kubectl -n traefik-notes rollout status deploy/backend-b
kubectl -n traefik-notes get svc,endpointslices
```

上述Secret管道不落盘、不打印私钥，不要加tee或shell tracing。Traefik需额外EntryPoint `echo=:7000`、`backendtls=:7080`、`dns=:5353/udp`及对应Service端口；HTTP/gRPC/WS复用web。根据安装Chart把端口暴露到测试可达地址，`kubectl port-forward`不能转UDP。

```bash
curl -H 'Host: k8s-mtls.localhost' http://TRAEFIK_IP:80/
# TCP transport接收明文HTTP并以mTLS拨后端8443，返回HTTP JSON。
curl http://TRAEFIK_IP:7080/
printf 'PING\n' | nc TRAEFIK_IP 7000
dig @TRAEFIK_IP -p 5353 lab.test A +notcp +noall +answer
curl -H 'Host: k8s-weighted.localhost' http://TRAEFIK_IP:80/
curl -H 'Host: k8s-mirror.localhost' -H 'X-Request-ID: k8s-mirror-39' http://TRAEFIK_IP:80/
kubectl -n traefik-notes logs deploy/backend-a | rg k8s-mirror-39
kubectl -n traefik-notes logs deploy/backend-b | rg k8s-mirror-39
```

gRPC/WS使用相同checks.py客户端方法，把目标地址替换为测试入口、authority/URL分别改为k8s-grpc.localhost/k8s-ws.localhost。TLS负向测试每次只改transport的CA、serverName、客户端Secret之一，观察后端握手和代理响应后恢复。Ingress Prefix样本见第12/31章。清理只删除本实验清单及其Secret/ConfigMap，避免删除其他人共用的namespace或Controller。

## Catalog、Swarm 与 ECS

`checks.py catalog` 是完整注册→passing→发现→请求→注销流程；verify-lifecycle.py在保持注册的情况下增加critical→摘除→恢复实验。API能连接不代表注册地址能被Traefik访问，读取Consul健康API与代理ServiceURL/RouterName对照。Consul dev模式仅用于教学，重建后状态丢失。

Swarm完整 [swarm-stack.yml](swarm-stack.yml) 与创建overlay、部署、清理步骤在第03章，仅在已有独立测试Swarm操作，不自动执行swarm init。端口38080使用host发布并监听节点网络接口，应由测试节点防火墙限制；Docker Socket即使只读挂载也有API控制能力。ECS的 [读取动作策略](ecs-read-policy.json) 与awsvpc/bridge地址判断见第15章，本次不创建AWS资源，不宣称云环境验收。
