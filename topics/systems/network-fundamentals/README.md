# 计算机网络基础学习指南

本主题从分层模型、地址和子网讲到传输、路由、DNS、Socket、安全与排障实战，为云原生、数据库和 Web 运维建立网络基础。

## 可以学到什么

- 计算 CIDR、子网边界、地址范围并理解 Ethernet/ARP。
- 分析 TCP/UDP、握手、重传、流控和拥塞控制。
- 解释路由表、最长前缀、IGP/BGP 和 DNS 解析链路。
- 编写最小 Socket/HTTP 程序并处理半包、超时和编码。
- 用抓包和分层证据定位连接、协议和安全问题。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 模型、地址与子网 | 分层、IPv4/IPv6、CIDR | [Markdown](./01-models-addressing-and-subnets.md) · [Roadmap](./01-models-addressing-and-subnets-roadmap.html) |
| 2 | 传输、路由与服务 | TCP/UDP、路由、DNS | [Markdown](./02-transport-routing-and-services.md) · [Roadmap](./02-transport-routing-and-services-roadmap.html) |
| 3 | Socket、安全与排障 | API、HTTP、抓包、边界 | [Markdown](./03-sockets-security-and-troubleshooting.md) · [Roadmap](./03-sockets-security-and-troubleshooting-roadmap.html) |

## 阅读建议

- 按顺序学习；每章配合 `ip`、`dig`、抓包和 Python 实验。
- 生产排障先保存现场和时间线，再修改路由、防火墙或 MTU。
