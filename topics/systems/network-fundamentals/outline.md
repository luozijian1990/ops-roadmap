# 计算机网络基础学习笔记大纲

<!-- volume: 01-models-addressing-and-subnets.md -->

## 第一册 · 网络模型、地址与子网

### 从数据交换理解计算机网络
<!-- src: temp/network/1.txt (Ch. 2 Networking Overview) -->

### 客户端、服务端、协议与网络操作系统
<!-- src: temp/network/1.txt (Ch. 2.3-2.7 Client Server, OS, Protocols, Wired versus Wireless) -->

### 分层为什么是理解网络的第一把钥匙
<!-- src: temp/network/1.txt (Ch. 4.1-4.2 Layering and Protocol Encapsulation) -->

### TCP/IP 模型与 OSI 模型如何对应
<!-- src: temp/network/1.txt (Ch. 4.3-4.4 Internet Model and OSI Model) -->

### 二进制、十六进制与字节如何表达网络数据
<!-- src: temp/network/1.txt (Ch. 10.1 Integer Representations; Ch. 40.1-40.2 Number Bases) -->

### 位运算如何服务于掩码和协议字段
<!-- src: temp/network/1.txt (Ch. 40.3-40.7 AND, OR, NOT, Shift, Bit Masks) -->

### 大端序、小端序与网络字节序
<!-- src: temp/network/1.txt (Ch. 10.2-10.3 Endianness and Python) -->

### TCP 字节流为什么需要应用层消息边界
<!-- src: temp/network/1.txt (Ch. 11 Parsing Packets) -->

### IP 协议负责什么又不负责什么
<!-- src: temp/network/1.txt (Ch. 6.1-6.4 IP Terminology, Versions, Related Protocols) -->

### IPv4 地址、私有网络与动态分配
<!-- src: temp/network/1.txt (Ch. 6.5-6.6 Private Networks, Static and Dynamic Addresses; Ch. 7.1 IPv4 Addresses) -->

### IPv4 的历史分类、特殊地址与特殊网段
<!-- src: temp/network/1.txt (Ch. 7.2-7.6 Subnets, Historic Subnets, Special Addresses and Subnets) -->

### IPv6 地址表示、作用域、DNS 与 URL
<!-- src: temp/network/1.txt (Ch. 8 IPv6 Representation, Link Local, Special Addresses, DNS and URLs) -->

### CIDR、子网掩码与网络边界
<!-- src: temp/network/1.txt (Ch. 17.1-17.6 Address Representation and Subnet Masks) -->

### 从 IP 地址计算网段、主机范围与广播地址
<!-- src: temp/network/1.txt (Ch. 17.7 Finding the Subnet; Ch. 18.6 Broadcast Address; Ch. 19 Computing and Finding Subnets) -->

### 链路层、帧与数据包有什么区别
<!-- src: temp/network/1.txt (Ch. 20.1-20.2 Octets, Frames versus Packets) -->

### Ethernet 帧由哪些字段组成
<!-- src: temp/network/1.txt (Ch. 20.6 Ethernet Frame, EtherType, CRC and Sublayers) -->

### MAC 地址、介质访问与交换机学习
<!-- src: temp/network/1.txt (Ch. 20.3-20.6 MAC Addresses, Shared Medium, Multiple Access, Ethernet) -->

### ARP 如何把 IPv4 地址解析成 MAC 地址
<!-- src: temp/network/1.txt (Ch. 21.1-21.3 Broadcast, ARP Resolution and Cache) -->

### ARP 报文、通告与地址冲突检测
<!-- src: temp/network/1.txt (Ch. 21.4-21.6 ARP Structure, Request Response, Announcements and Probes) -->

### IPv6 邻居发现如何替代 ARP
<!-- src: temp/network/1.txt (Ch. 21.7 IPv6 and ARP) -->

### 网卡、交换机与路由器分别工作在哪一层
<!-- src: temp/network/1.txt (Ch. 24 Network Hardware) -->

### 用 Packet Tracer 直连两台主机
<!-- src: temp/network/1.txt (Ch. 25 Connect Two Computers; Ch. 41 Installing Packet Tracer) -->

### 用交换机和单台路由器连接局域网
<!-- src: temp/network/1.txt (Ch. 26 Using a Switch; Ch. 27 Using a Router) -->

### 用多台路由器、默认网关和静态路由连接网段
<!-- src: temp/network/1.txt (Ch. 28 Multiple Routers) -->

<!-- volume: 02-transport-routing-and-services.md -->

## 第二册 · 传输、路由与网络服务

### TCP 如何用端口和连接提供可靠字节流
<!-- src: temp/network/1.txt (Ch. 14.1-14.4 TCP Goals, Stack Location, Ports and Overview) -->

### 序列号、确认与重传如何恢复顺序和完整性
<!-- src: temp/network/1.txt (Ch. 14.4-14.5 Transmission, Packet Ordering and Error Detection) -->

### 流量控制和拥塞控制解决了什么不同问题
<!-- src: temp/network/1.txt (Ch. 14.6-14.7 Flow Control, Slow Start and Congestion Avoidance) -->

### 三次握手、数据传输与四次关闭
<!-- src: temp/network/1.txt (Ch. 14.4.1-14.4.3 Connection, Transmission and Closing) -->

### UDP 为什么选择简单而不保证可靠
<!-- src: temp/network/1.txt (Ch. 15.1-15.5 UDP Goals, Ports, Overview and Integrity) -->

### TCP 与 UDP、MTU 和分片应该如何权衡
<!-- src: temp/network/1.txt (Ch. 15.6-15.8 Maximum Payload, Uses and Datagram Sockets; Ch. 14 TCP) -->

### Internet 校验和如何发现传输错误
<!-- src: temp/network/1.txt (Ch. 16.3 Checksum in General) -->

### 用伪首部逐步验证 TCP 校验和
<!-- src: temp/network/1.txt (Ch. 16.1-16.11 Validating a TCP Packet) -->

### 路由器如何根据路由表逐跳转发数据包
<!-- src: temp/network/1.txt (Ch. 18.2-18.4 Routing Tables, Algorithm and Example) -->

### 默认路由、最长前缀匹配与下一跳
<!-- src: temp/network/1.txt (Ch. 18 Routing Tables; Ch. 28.5-28.7 Default Gateways and Routing Tables) -->

### IGP 与 BGP 如何在网络之间传播路径
<!-- src: temp/network/1.txt (Ch. 18.1 Interior and Exterior Gateway Protocols) -->

### TTL、广播地址与路由环路如何影响转发
<!-- src: temp/network/1.txt (Ch. 18.5-18.6 Routing Loops, Time To Live and Broadcast Address) -->

### 用 Dijkstra 算法理解最短路径路由
<!-- src: temp/network/1.txt (Ch. 22.2-22.3 Graphs and Dijkstra Overview) -->

### 用 Python 实现最短路径计算实验
<!-- src: temp/network/1.txt (Ch. 22.4-22.7 Dijkstra Implementation, Graph Representation and Examples) -->

### DNS 如何把域名递归解析为地址
<!-- src: temp/network/1.txt (Ch. 31.1-31.5 DNS Usage, Domains, Name Servers and Resolution Example) -->

### DNS 层级、Zone、Resolver、缓存与 TTL 如何协作
<!-- src: temp/network/1.txt (Ch. 31.3-31.8 Name Servers, Root Servers, Zones, Resolver and Caching) -->

### DNS 记录、动态更新与反向解析分别解决什么问题
<!-- src: temp/network/1.txt (Ch. 31.9-31.11 Record Types, Dynamic DNS and Reverse DNS) -->

### 用 dig 从递归查询追踪到权威服务器
<!-- src: temp/network/1.txt (Ch. 34 Digging DNS Info) -->

### DHCP DORA 如何自动分配网络配置
<!-- src: temp/network/1.txt (Ch. 6.6 Static versus Dynamic Addresses; Ch. 33.1 DHCP Operation) -->

### DHCP 租约、续租与跨网段 Relay 如何工作
<!-- src: temp/network/1.txt (Ch. 33 DHCP Operation and Reflection) -->

### NAT 状态表如何转换地址与端口
<!-- src: temp/network/1.txt (Ch. 32.1-32.5 NAT Motivation, Private Networks, Operation and IPv6) -->

### 端口转发和回程路径为什么必须成对检查
<!-- src: temp/network/1.txt (Ch. 32.6 Port Forwarding) -->

### 从浏览器输入域名到收到响应发生了什么
<!-- src: temp/network/1.txt (Ch. 3 Client Connection Process; Ch. 14 TCP; Ch. 31 DNS; Ch. 32 NAT) -->

<!-- volume: 03-sockets-security-and-troubleshooting.md -->

## 第三册 · Socket、安全与排障实战

### Socket API 如何连接应用程序与协议栈
<!-- src: temp/network/1.txt (Ch. 2.4 OS, Network Programming and Sockets; Ch. 3 Introducing The Sockets API) -->

### TCP 客户端如何解析地址、建立连接并收发数据
<!-- src: temp/network/1.txt (Ch. 3.1 Client Connection Process; Ch. 5.4 HTTP Client) -->

### TCP 服务端如何绑定、监听并接受连接
<!-- src: temp/network/1.txt (Ch. 3.2 Server Listening Process; Ch. 5.5 HTTP Server) -->

### UDP Socket 如何收发独立数据报
<!-- src: temp/network/1.txt (Ch. 15.8 UDP Datagram Sockets) -->

### select 如何管理可读、可写、监听与超时事件
<!-- src: temp/network/1.txt (Ch. 29 Select) -->

### 用 select 构建多客户端事件循环
<!-- src: temp/network/1.txt (Ch. 30 Project Using Select) -->

### 线程的启动、共享状态与执行顺序有什么风险
<!-- src: temp/network/1.txt (Ch. 42.1-42.2 Thread Concepts and Python Multithreading) -->

### daemon、join 与线程练习如何管理生命周期
<!-- src: temp/network/1.txt (Ch. 42.3-42.5 Daemon Threads, CTRL C and Threading Project) -->

### Python 字符串、字符编码与网络字节如何转换
<!-- src: temp/network/1.txt (Ch. 5.2 Python Character Encoding) -->

### 用原生 Socket 编写最小 HTTP 客户端和服务端
<!-- src: temp/network/1.txt (Ch. 5.1-5.5 HTTP Client and Server Project) -->

### 如何解释 HTTP 重定向、客户端错误和服务端错误
<!-- src: temp/network/1.txt (Ch. 5.6 HTTP 301, 302, 400, 404 and 500 Responses) -->

### 静态文件服务端如何解析请求、MIME 和 Content Length
<!-- src: temp/network/1.txt (Ch. 9.1-9.7 Better Web Server Project) -->

### 如何限制文件路径、返回 404 并安全扩展服务端
<!-- src: temp/network/1.txt (Ch. 9.5 Path Stripping; Ch. 9.7-9.8 Not Found and Extensions) -->

### 如何正确处理偏移量、半包与多个消息
<!-- src: temp/network/1.txt (Ch. 5.6.2 Receiving Partial Data; Ch. 11 Parsing Packets) -->

### 用 Atomic Time 实验解码固定长度二进制协议
<!-- src: temp/network/1.txt (Ch. 12 Project Atomic Time) -->

### 用 Word Server 实验实现长度前缀和流式拆包
<!-- src: temp/network/1.txt (Ch. 13 Project The Word Server) -->

### JSON 与 Python 对象如何编码、解码和验证
<!-- src: temp/network/1.txt (Ch. 43 JSON; Ch. 39.5 JSON Payloads) -->

### 多用户聊天室的客户端和服务端如何协作
<!-- src: temp/network/1.txt (Ch. 39.1-39.3 Chat Architecture, Client IO and TUI) -->

### Hello、Chat、Join 与 Leave 消息如何设计
<!-- src: temp/network/1.txt (Ch. 39.4-39.5 Packet Structure and JSON Payload Types) -->

### 每连接缓冲区、并发接收与断线清理如何实现
<!-- src: temp/network/1.txt (Ch. 39.6-39.7 Chat Extensions and Recommendations; Ch. 42 Multithreading) -->

### Wireshark 如何逐字段验证 ARP 请求与响应
<!-- src: temp/network/1.txt (Ch. 23 Sniff ARP Packets with Wireshark) -->

### TCP 与 UDP 端口扫描能发现什么
<!-- src: temp/network/1.txt (Ch. 35 Port Scanning; Ch. 38 Project Port Scanning) -->

### 防火墙如何与连接状态和 NAT 协同过滤流量
<!-- src: temp/network/1.txt (Ch. 36 Firewalls) -->

### 缓冲区越界和资源耗尽为什么来自不可信输入
<!-- src: temp/network/1.txt (Ch. 37.1 Buffer Overflow and Overrun) -->

### 命令注入、SQL 注入与 XSS 应该如何防御
<!-- src: temp/network/1.txt (Ch. 37.2 Command Injection, SQL Injection and Cross Site Scripting) -->

### 用分层思路定位连接失败与请求异常
<!-- src: temp/network/1.txt (Ch. 3 Sockets API; Ch. 5.6 HTTP Hints; Ch. 18 IP Routing; Ch. 31 DNS; Ch. 36 Firewalls) -->

### 建立一套从地址到应用的网络排障清单
<!-- src: temp/network/1.txt (Ch. 23 Wireshark; Ch. 25-28 Packet Tracer; Ch. 34 dig; Ch. 35 Port Scanning) -->
