# Python 运维自动化与工程实践 · 第一册：语言基础

## 第一章 · 先弄清楚为什么运维工程师仍然要学 Python

### Python 最适合替运维工程师解决哪些问题？

运维工作里最常见的编程需求，通常不是从零实现数据库或网络协议，而是把已有系统连接起来。
数据可能来自日志、命令输出、HTTP API、配置文件和监控接口；处理结果则可能写回终端、文件、工单或另一个 API。
Python 的价值首先体现在这类“胶水工作”上：语法直接、标准库覆盖面广、第三方 SDK 丰富，而且可以很快把一次人工操作变成可重复执行的程序。

不过，“适合自动化”不等于“任何系统都应该用 Python”。
语言选择要从工作负载、交付方式和维护条件出发，而不是从语言热度出发。

#### 从一条人工操作链开始判断

假设值班人员每天需要完成下面的工作：

1. 登录三台测试主机。
2. 读取服务状态。
3. 从日志中统计最近一小时的错误。
4. 把结果整理成 JSON。
5. 失败时保留主机、命令和原因。

如果人工流程的输入、判断和输出已经比较稳定，Python 很适合把它变成一个巡检工具。
最小程序甚至不需要框架：一个入口函数、几个纯函数和标准库就能完成。

```mermaid
flowchart LR
    A[人工输入] --> B[解析]
    B --> C[校验]
    C --> D[执行动作]
    D --> E[结构化结果]
    E --> F[退出码与审计]
```

这条流水线也是后文反复使用的信任边界：外部文本先解析再校验，副作用只接收可信模型，最后同时交付给人和自动化系统可判断的结果。

```python
from __future__ import annotations

import json
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class CheckResult:
    target: str
    ok: bool
    message: str


def summarize(results: list[CheckResult]) -> str:
    payload = {
        "checked": len(results),
        "failed": sum(not item.ok for item in results),
        "results": [asdict(item) for item in results],
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


def main() -> int:
    results = [
        CheckResult("app-01", True, "service is active"),
        CheckResult("app-02", False, "health endpoint timed out"),
    ]
    print(summarize(results))
    return 0 if all(item.ok for item in results) else 2


if __name__ == "__main__":
    raise SystemExit(main())
```

第一次读到这段代码，不必先系统学习面向对象。
把 `class CheckResult` 暂时理解为“给一组字段命名的结果模型”；`@dataclass(...)` 是装饰器，它接收紧随其后的类，并替我们生成初始化、比较和显示等常用方法。
后文出现的 `@pytest.fixture` 与 `@app.command` 也遵循相同阅读顺序：先看被装饰的函数或类负责什么，再看装饰器额外注册或生成了什么行为。
装饰器可能改变调用方式，因此陌生装饰器要查其官方接口，不能只凭名字猜测。

这个例子虽小，却已经包含运维工具需要关心的几个边界：

- 输入被转换为明确的数据模型。
- 汇总逻辑与终端输出分开。
- 失败不是只打印一句话，而是产生非零退出码。
- `main()` 返回结果，入口只负责把结果交给操作系统。

运行后除了看 JSON，还要检查退出码：

```bash
python3 check_demo.py
status=$?
printf 'exit_status=%s\n' "$status"
```

预期输出中 `failed` 为 `1`，退出码为 `2`。
如果 JSON 看起来正常但退出码仍为 `0`，自动化平台就可能把部分失败误判为成功。

#### Python 特别合适的工作类型

| 工作类型 | Python 的优势 | 仍需确认的边界 |
| --- | --- | --- |
| 文件与日志处理 | 标准库可直接处理路径、文本、JSON、CSV 和压缩文件 | 文件大小、编码、原子写入和保留期限 |
| API 与 SDK 集成 | 云厂商、监控和基础设施系统通常提供 Python SDK | 超时、分页、限流、认证和幂等 |
| CLI 与批处理 | 很容易把函数封装为参数化命令 | 退出码、稳定输出、dry-run 和审计 |
| 数据整理与报表 | 字典、生成器及数据生态适合清洗和聚合 | 数据量是否仍适合单机内存处理 |
| 小型内部服务 | 可较快交付 API、任务和管理页面 | 是否需要长期运行、恢复和独立扩缩容 |
| 测试与验证工具 | 能快速构造假数据、调用接口和检查结果 | 测试不能直接操作真实生产环境 |

Python 的快速交付来自较少的样板代码和成熟生态，不来自省略工程约束。
只要程序会改配置、执行命令或调用生产 API，就必须处理权限、输入、失败、日志和恢复。

Jupyter Notebook 很适合逐步查看 API 返回值、试验清洗表达式或画一次性图表，但单元格执行顺序会隐藏状态，且不天然提供稳定入口、退出码和部署契约。
探索得到结论后，应把可复用逻辑移入 `.py` 模块，用测试固定行为，再由 CLI 或任务入口调用。

#### 哪些信号提示不要继续使用简单 Python 脚本

下面这些信号不一定意味着立刻换语言，但说明需要重新评估：

- 程序要作为资源敏感的常驻 Agent 分发到大量主机。
- 交付环境不允许预装解释器或动态安装依赖。
- 工作负载以持续的 CPU 密集计算为主，而且横向拆分收益有限。
- 服务有明确的低延迟、高并发和资源上限要求。
- 一个脚本已经同时承担 API、调度、任务恢复、权限和状态存储。
- 团队对另一种语言已有成熟的构建、部署和排障体系。

此时的正确动作不是争论“Python 快不快”，而是收集证据：

```text
业务目标
  -> 任务耗时与并发
  -> CPU 内存与启动成本
  -> 分发和升级方式
  -> 故障恢复与隔离要求
  -> 团队维护能力
  -> 语言与组件选择
```

对于一次性数据整理、控制面调用和内部自动化，Python 往往刚好够用。
对于大量主机上的常驻二进制、严格资源预算或高并发服务，Go 可能更自然。
真正重要的是把升级条件写出来，不要因为“以后也许会需要”提前引入复杂度。

#### 从结果而不是代码行数判断是否完成

一个运维脚本的完成标准至少应回答：

- 输入来自哪里，格式不对时怎样失败？
- 是否会接触生产资源，权限范围是什么？
- 外部调用有没有超时？
- 部分目标失败时整体退出码是什么？
- 是否支持 dry-run 或只读验证？
- 日志能否定位到目标和动作，又是否隐藏 Secret？
- 重复执行会不会产生第二次副作用？
- 谁能运行，结果保留多久？

练习时可以把上面的 `CheckResult` 示例改成读取一个本地 JSON 文件。
故意加入缺失字段、错误布尔值和重复目标，观察程序是在输入边界拒绝数据，还是带着错误继续运行。
这个练习比再背一组语法更接近真实运维开发。

本主题只讲 Python 如何调用和自动化系统；文件、进程、权限与信号的系统机制继续参考 [Linux 专题](../../systems/linux/README.md)，网络连接与协议边界参考 [网络基础专题](../../systems/network-fundamentals/README.md)。

### 拿到一段脚本，怎样确认它会由哪个 Python 运行？

“机器上有 Python”不是一个足够精确的结论。
同一台主机可能同时存在系统 Python、包管理器安装的 Python、项目虚拟环境和容器内 Python。
如果解释器选错，最常见的现象是依赖找不到、语法不兼容、导入了错误版本的包，或者把依赖装进了另一个环境。

#### 先收集四个事实

运行未知脚本前，先确认：

```bash
command -v python3
python3 --version
python3 -c 'import sys; print(sys.executable)'
python3 -c 'import sys; print("\n".join(sys.path))'
```

这四条信息分别回答：

1. Shell 会解析到哪个命令。
2. 解释器报告的版本是什么。
3. Python 进程实际使用哪个可执行文件。
4. 模块会从哪些目录查找。

`command -v` 的结果和 `sys.executable` 通常一致，但在别名、包装脚本、虚拟环境和版本管理工具参与时，不能只看其中一个。
排查 `ModuleNotFoundError` 时，`sys.path` 比“我明明安装过”更有证据价值。

可以把诊断信息做成脚本自身的 `--diagnose` 输出：

```python
from __future__ import annotations

import json
import platform
import sys


def runtime_facts() -> dict[str, object]:
    return {
        "python_version": platform.python_version(),
        "implementation": platform.python_implementation(),
        "executable": sys.executable,
        "prefix": sys.prefix,
        "base_prefix": sys.base_prefix,
        "module_search_path": sys.path,
    }


if __name__ == "__main__":
    print(json.dumps(runtime_facts(), ensure_ascii=False, indent=2))
```

`sys.prefix != sys.base_prefix` 通常表示当前解释器运行在虚拟环境中。
它适合诊断，不应被当成安全控制；程序仍要通过明确的启动方式和依赖声明保证环境一致。

#### Shebang 只决定直接执行时的入口

脚本第一行常见：

```python
#!/usr/bin/env python3
```

当文件具有执行权限并以 `./tool.py` 启动时，操作系统会根据 shebang 找解释器。
`/usr/bin/env python3` 会继续使用当前 `PATH` 查找 `python3`，便于虚拟环境接管，但也意味着 `PATH` 被错误修改时可能运行到意外解释器。

下面两种执行方式不完全相同：

```bash
chmod +x tool.py
./tool.py --help

/opt/ops-tool/.venv/bin/python tool.py --help
```

第一种依赖 shebang 和当前 `PATH`。
第二种明确指定解释器，更适合 systemd、定时任务和可复现的部署脚本。

不要写死个人电脑上的解释器路径再提交给所有人，也不要修改系统 Python 来迁就单个工具。
正式项目应使用项目虚拟环境、容器或明确的运行时镜像。

#### `python -m` 为什么经常比直接运行文件稳定

假设项目结构如下：

```text
ops_check/
├── pyproject.toml
└── src/
    └── ops_check/
        ├── __init__.py
        ├── cli.py
        └── parser.py
```

在包内使用相对或绝对导入时，直接执行深层文件可能改变模块搜索上下文：

```bash
python3 src/ops_check/cli.py
```

更稳妥的方式是安装项目后按模块执行，或使用定义好的命令入口：

```bash
python3 -m ops_check.cli
ops-check --help
```

`-m` 让 Python 按模块名称定位代码，并建立正确的包上下文。
它不能替代正确的项目结构，但能减少“在某个目录运行才成功”的偶然行为。

#### 不要把依赖安装命令和解释器分开猜

如果环境仍使用 `pip`，优先写：

```bash
python3 -m pip --version
python3 -m pip install -r requirements.txt
```

这样 `pip` 模块由同一个 `python3` 解释器加载。
单独执行 `pip3` 时，它可能属于另一个 Python 安装。

现代项目可以使用 `uv run`、`uv sync` 和锁文件管理环境；第三册会完整讲解。
无论使用什么工具，目标都是同一个：运行解释器、安装位置和依赖解析必须能够被复现。

#### 退出状态是程序与调用方的契约

终端上打印“失败”但退出 `0`，对人可能醒目，对调度系统却仍是成功。
相反，打印正常结果却因未处理异常退出，调用方只会看到非零状态而缺少结构化原因。

推荐把退出码集中在入口决定：

```python
from enum import IntEnum


class ExitCode(IntEnum):
    OK = 0
    CHECK_FAILED = 2
    INVALID_INPUT = 3
    INTERNAL_ERROR = 70


def main() -> int:
    try:
        # parse input -> run checks -> render output
        return ExitCode.OK
    except ValueError as exc:
        print(f"invalid input: {exc}")
        return ExitCode.INVALID_INPUT


if __name__ == "__main__":
    raise SystemExit(main())
```

退出码不需要设计几十种。
应区分调用方真正会采取不同动作的类别，并在 `--help` 或使用文档中稳定说明。

验证时至少覆盖：

```bash
python3 tool.py --help
printf 'help=%s\n' "$?"

python3 tool.py --unknown-option
printf 'invalid=%s\n' "$?"
```

还要分别从交互式 Shell、CI、cron 或 systemd 的实际启动入口验证。
环境变量、当前目录和 `PATH` 在这些环境中经常不同。

#### 当前文档基线

本文可执行示例以 Python 3.12 及以上版本为教学基线，因为后文使用了 `StrEnum`、`asyncio.TaskGroup` 和 `asyncio.timeout()` 等接口。
这不是要求所有生产环境立刻升级：正式项目应在 `pyproject.toml` 中声明真实支持范围，并让 CI 覆盖实际部署版本；维护旧版本时需要为这些接口选择兼容写法。
涉及标准库细节时，以 [Python 官方文档](https://docs.python.org/3/) 为准；本文核对日期为 2026-09-02。

### AI 已经能写代码了，为什么还要自己读懂和验证？

AI 可以快速生成函数、测试和项目骨架，但它不知道你所在环境的真实权限、网络、数据和恢复要求。
一段代码“看起来合理”只说明语法和常见模式像代码，不说明它在你的系统里安全、正确或可运维。
运维工程师不必拒绝生成代码，必须把验收责任留在自己手里。

#### 先把生成结果当成未经审查的变更

审查顺序可以固定为：

```text
需求和边界
  -> 输入与输出
  -> 外部副作用
  -> 权限与凭证
  -> 失败和恢复
  -> 依赖与版本
  -> 测试和运行证据
  -> 才允许进入真实环境
```

不要一上来只挑语法错误。
下面这段代码语法正确，却不适合直接用于批量运维：

```python
import os


def restart(service: str) -> None:
    os.system(f"systemctl restart {service}")
```

至少存在这些问题：

- `service` 可能包含 Shell 元字符，形成命令注入。
- 没有允许服务白名单。
- 没有超时。
- 没有捕获退出码和 stderr。
- 没有 dry-run。
- 没有记录操作者、目标和结果。
- 调用方不知道重启失败。

改进后的最小版本可以是：

```python
from __future__ import annotations

import subprocess
from collections.abc import Collection


class RestartError(RuntimeError):
    pass


def restart_service(
    service: str,
    *,
    allowed: Collection[str],
    dry_run: bool = True,
    timeout: float = 20.0,
) -> list[str]:
    if service not in allowed:
        raise ValueError(f"service is not allowed: {service}")

    command = ["systemctl", "restart", service]
    if dry_run:
        return command

    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
        shell=False,
    )
    if completed.returncode != 0:
        message = completed.stderr.strip() or "no stderr"
        raise RestartError(
            f"restart failed: service={service} "
            f"status={completed.returncode} error={message}"
        )
    return command
```

这仍不是完整生产实现，但它把危险输入、默认副作用、超时和失败信息变成了显式接口。
后续还需结合权限提升方式、并发限制、服务状态复查和审计系统设计。

#### 用四遍阅读法降低遗漏

第一遍只看数据流：

- 输入从参数、环境变量、文件还是网络进入？
- 经过哪些转换？
- 输出写到哪里？
- 哪些地方改变外部状态？

第二遍只看失败路径：

- 什么异常会出现？
- 哪些异常被吞掉？
- 超时后底层任务是否仍在运行？
- 部分成功怎样表达？
- 重试是否可能重复执行写操作？

第三遍只看安全与权限：

- Secret 是否出现在源码、参数或日志中？
- 用户输入是否进入路径、SQL、Shell 或模板？
- TLS 校验是否被关闭？
- 是否使用过大的云权限或 Kubernetes 权限？

第四遍只看可验证性：

- 核心逻辑能否在无网络环境测试？
- 外部依赖能否替换成本地假实现？
- 是否有明确退出码？
- 日志能否定位到一次任务？
- 失败能否稳定复现？

#### 要求 AI 同时交付证据

比“帮我写一个巡检脚本”更有效的要求是：

```text
实现只读巡检 CLI。
输入是一份本地 JSON 主机清单。
默认 dry-run，不执行远程写操作。
外部调用必须设置超时和并发上限。
输出同时支持人读表格和稳定 JSON。
部分失败时退出码为 2。
提供 pytest，覆盖成功、非法输入、超时和部分失败。
列出未验证假设和生产使用前检查项。
```

这样的描述仍不能保证结果正确，但会让边界和验收条件进入生成过程。
如果生成工具修改了依赖、CI、部署文件或权限配置，要把它们当成独立高风险变更审查。

#### 最小验证不等于真实验证

验证证据有层次：

| 证据 | 能证明什么 | 不能证明什么 |
| --- | --- | --- |
| AST 或编译通过 | Python 语法可解析 | 逻辑、依赖和外部系统正确 |
| 单元测试通过 | 已覆盖输入下的函数行为 | 真实网络、权限和部署行为 |
| 本地集成测试通过 | 本地假服务与文件流程可运行 | 生产规模和生产故障模式 |
| 测试环境演练通过 | 指定环境中的完整路径可用 | 所有生产流量与边界均安全 |
| 小范围生产观察 | 真实依赖下的部分行为 | 长周期、峰值和所有故障情形 |

因此报告应写“执行了什么”，不要只写“已验证”。
例如：

```text
PASS  Python 代码块已通过 py_compile
PASS  12 个单元测试通过
PASS  localhost 假服务验证超时与 500 响应
NOT VERIFIED  生产凭证权限和真实主机并发容量
```

#### 给生成代码做一次故障注入

最有价值的练习不是让正常输入再跑一遍，而是主动破坏假设：

- 删除必需环境变量。
- 提供空文件、坏 JSON 和错误编码。
- 让假 API 延迟超过超时。
- 返回 429、500 和格式错误的 200 响应。
- 让一半目标成功、一半失败。
- 在写文件中途抛出异常。
- 连续运行两次相同任务。
- 在任务进行时发送终止信号。

记录每次实验的输入、预期、实际结果和残留状态。
代码只有在失败后仍可解释、可恢复，才开始具备运维价值。

本章的结论不是“AI 不可靠”，而是生成速度不能替代工程责任。
能读懂基础语法、追踪数据流、识别副作用并运行测试，正是 vibe coding 时代更重要的基本功。

## 第二章 · 写脚本之前，先理解数据在程序里怎样变化

### 同一批有序数据，什么时候用列表，什么时候用元组？

运维脚本经常要处理“一批有顺序的数据”：主机清单、待检查端口、命令参数、时间序列采样点。
列表和元组都能保存这些数据，也都支持遍历、索引和切片，但它们表达的承诺不同。

- `list` 表示这批元素在运行中可能增加、删除、排序或替换。
- `tuple` 表示这是一个结构固定的值，调用者不应修改它的组成。
- 两者都不保证内部元素不可变；元组只能保证自己的槽位不能被重新赋值。

先看一个容易读懂的选择：巡检目标会在过滤阶段变化，所以用列表；单个地址由主机和端口组成，结构固定，所以用元组。

```python
targets: list[tuple[str, int]] = [
    ("db-a.internal", 3306),
    ("cache-a.internal", 6379),
    ("api-a.internal", 443),
]

targets.append(("api-b.internal", 443))

for host, port in targets:
    print(f"checking {host}:{port}")
```

这里的类型从外向内读：`targets` 是列表，列表中的每一项是一个二元组。
解包语句 `for host, port in targets` 还会验证每项恰好包含两个元素；结构不符时会立即失败，而不是悄悄把字段弄错。

#### 用“是否允许变化”做第一判断

不要根据“元组可能更省一点内存”决定业务模型。
对运维工具更重要的是调用约定：谁可以改变这批数据，改变后是否会影响其他代码。

```python
def enabled_checks(all_checks: list[str], disabled: set[str]) -> list[str]:
    return [name for name in all_checks if name not in disabled]


CHECK_COLUMNS: tuple[str, ...] = (
    "target",
    "status",
    "latency_ms",
    "message",
)
```

`enabled_checks()` 返回新列表，调用者可以继续排序或追加。
`CHECK_COLUMNS` 是输出协议的一部分，元组让“固定顺序”更明显。
常量名使用大写只是约定，不会让对象自动只读；真正限制槽位变化的是元组类型。

以下场景通常适合列表：

- 逐步收集发现结果。
- 根据条件过滤、插入或删除目标。
- 排序后依次执行。
- 需要就地更新某个位置。

以下场景通常适合元组：

- 一个固定字段组合，例如 `(host, port)`。
- 函数需要返回多个关联值，但还没有必要定义具名类型。
- 作为字典键或集合元素，并且其中所有成员也都可哈希。
- 明确表达“不应通过这个引用改动容器结构”。

#### 索引、切片和负数位置

列表与元组都从索引 `0` 开始。
负数索引从末尾反向计数，`-1` 是最后一项。
切片遵循左闭右开区间：包含起点，不包含终点。

```python
samples = [82, 87, 91, 105, 99, 88]

print(samples[0])       # 82
print(samples[-1])      # 88
print(samples[1:4])     # [87, 91, 105]
print(samples[:3])      # [82, 87, 91]
print(samples[::2])     # [82, 91, 99]
```

切片会创建一个新的外层容器。
如果元素本身是字典或列表，新容器仍然引用相同的内部对象；这与后面的浅拷贝问题相同。

访问不存在的单个索引会抛出 `IndexError`，切片越界则会安全截断：

```python
items = ["a", "b"]

print(items[:100])

try:
    print(items[100])
except IndexError as exc:
    print(f"invalid position: {exc}")
```

这种差异适合用来表达不同意图。
“最多取前 100 条”可以切片；“结果必须存在第 101 条”则应让索引错误暴露数据不符合预期。

#### 不要把可变对象藏在元组里后误以为安全

元组不能替换槽位，但槽位指向的列表仍然可以变化：

```python
record = ("db-a", [3306, 33060])
record[1].append(9104)

print(record)
# ('db-a', [3306, 33060, 9104])
```

如果希望得到真正清晰的只读值，可以把内部成员也改为不可变结构，或定义冻结的数据类：

```python
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Endpoint:
    host: str
    ports: tuple[int, ...]


endpoint = Endpoint("db-a", (3306, 33060))
```

`frozen=True` 会阻止常规字段重新赋值，`slots=True` 则固定实例字段集合。
它们改善的是模型边界，不是安全隔离；字段若仍指向可变对象，内部对象仍可能被改动。

#### 用小实验验证容器行为

```python
def normalize_hosts(raw_hosts: list[str]) -> list[str]:
    normalized = []
    for raw in raw_hosts:
        host = raw.strip().lower()
        if host:
            normalized.append(host)
    return normalized


source = [" DB-A ", "", "Api-A"]
result = normalize_hosts(source)

assert source == [" DB-A ", "", "Api-A"]
assert result == ["db-a", "api-a"]
assert result is not source
```

这组断言验证了三件事：输入没有被修改、输出内容正确、返回值是新对象。
当函数会修改输入时，名称应明确体现，例如 `normalize_hosts_in_place()`，文档和测试也应说明副作用。

#### 本节练习：给巡检目标选模型

给定以下需求，先写出类型，再解释选择：

1. 用户按照命令行顺序传入的一批主机。
2. 单个 TCP 地址的主机名与端口。
3. 固定的 CSV 表头。
4. 扫描过程中不断增加的告警列表。

一种合理答案是：

```python
input_hosts: list[str]
address: tuple[str, int]
csv_header: tuple[str, ...]
alerts: list[str]
```

答案并非只能如此。
如果地址需要校验、序列化和更多字段，`dataclass` 会比位置元组更清楚。
选择数据结构的核心不是炫技，而是让“哪些东西会变化、哪些字段属于一个整体”在代码中一眼可见。

### 查找、去重和成员判断，为什么经常离不开字典与集合？

列表擅长保存顺序，但从很长的列表中反复查找某个值，需要从头向后比较。
字典和集合基于哈希组织键，通常能更直接地完成按键查找、去重和成员判断。

- `dict` 保存“键到值”的映射。
- `set` 只关心某个唯一值是否存在。
- 两者的键或元素都必须可哈希，例如字符串、整数以及成员均可哈希的元组。
- 列表、字典和集合本身可变，因此不能直接作为字典键。

#### 把线性搜索改成明确的索引

假设 API 返回了主机对象，而本地任务需要按主机名多次匹配。
每次扫描原列表既慢又容易把匹配逻辑散落在循环里。

```python
hosts = [
    {"name": "api-a", "owner": "platform", "enabled": True},
    {"name": "db-a", "owner": "dba", "enabled": True},
    {"name": "old-a", "owner": "legacy", "enabled": False},
]

host_by_name = {item["name"]: item for item in hosts}

target = host_by_name.get("db-a")
if target is None:
    print("target not found")
else:
    print(target["owner"])
```

字典推导式把列表转换为以名称为键的索引。
`dict.get()` 在键不存在时返回 `None`；如果缺失属于程序错误，则应使用 `host_by_name["db-a"]`，让 `KeyError` 暴露出来。

必须先决定重复键的含义。
上述推导式遇到两个同名主机时，后者会覆盖前者。
如果重复代表脏数据，就应该显式拒绝：

```python
def index_unique_hosts(items: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    indexed: dict[str, dict[str, object]] = {}

    for item in items:
        name = str(item["name"])
        if name in indexed:
            raise ValueError(f"duplicate host name: {name}")
        indexed[name] = item

    return indexed
```

这段代码把数据约束放在入口，后续业务代码就能依赖“名称唯一”这一事实。

#### 用集合表达去重与集合关系

```python
expected = {"api-a", "api-b", "db-a"}
reported = {"api-a", "db-a", "unknown-a"}

missing = expected - reported
unexpected = reported - expected
healthy_scope = expected & reported
all_seen = expected | reported

print("missing:", sorted(missing))
print("unexpected:", sorted(unexpected))
```

差集、交集和并集让意图比嵌套循环清楚。
集合本身不承诺业务需要的展示顺序，因此输出前应使用 `sorted()`，让日志和测试结果稳定。

```text
missing: ['api-b']
unexpected: ['unknown-a']
```

如果既要去重又要保留首次出现顺序，可以利用字典键唯一且保持插入顺序的语言保证：

```python
raw_hosts = ["api-a", "db-a", "api-a", "cache-a"]
unique_hosts = list(dict.fromkeys(raw_hosts))

assert unique_hosts == ["api-a", "db-a", "cache-a"]
```

这比先转集合再转列表更适合 CLI 输入，因为用户提供的顺序可能影响执行与阅读。

#### 字典遍历时明确自己需要什么

```python
ports = {"ssh": 22, "https": 443, "mysql": 3306}

for name in ports:
    print(name)

for port in ports.values():
    print(port)

for name, port in ports.items():
    print(f"{name}={port}")
```

直接遍历字典得到键。
需要键和值时使用 `.items()`，可以避免循环体里再次索引。
不要在遍历字典期间增删键，否则可能触发 `RuntimeError: dictionary changed size during iteration`。

需要删除时，先计算待删除键或构造新字典：

```python
checks = {
    "ssh": {"enabled": True},
    "dns": {"enabled": False},
    "http": {"enabled": True},
}

enabled_checks = {
    name: config
    for name, config in checks.items()
    if config["enabled"]
}
```

#### 缺失、空值和假值不是一回事

下面的写法会把 `0`、空字符串和不存在都当成同一种情况：

```python
timeout = config.get("timeout")
if not timeout:
    timeout = 5
```

如果 `0` 在业务上表示“立即超时”或“禁用等待”，这段代码就改变了用户配置。
应根据协议区分缺失与合法假值：

```python
MISSING = object()

raw_timeout = config.get("timeout", MISSING)
if raw_timeout is MISSING:
    timeout = 5.0
else:
    timeout = float(raw_timeout)
```

字典的键存在性也可以直接判断：

```python
if "timeout" not in config:
    print("using default timeout")
```

#### 可哈希并不等于业务上适合作为键

字符串容易作为键，但仍要先规范化。
`API-A`、`api-a` 和 `api-a ` 在 Python 看来是三个不同字符串。

```python
def normalize_host_key(value: str) -> str:
    key = value.strip().lower()
    if not key:
        raise ValueError("host name cannot be empty")
    return key
```

如果在不同入口使用不同规范化规则，字典查找会产生难以解释的缺失。
把规则集中到一个函数，并在读取配置、接收参数和解析 API 响应时统一调用。

#### 本节练习：对账两份主机清单

实现一个函数，接收期望主机列表和实际上报列表，返回缺失、未知、重复三类结果。

```python
from collections import Counter
from dataclasses import dataclass


@dataclass(frozen=True)
class InventoryDiff:
    missing: tuple[str, ...]
    unexpected: tuple[str, ...]
    duplicates: tuple[str, ...]


def compare_inventory(expected: list[str], reported: list[str]) -> InventoryDiff:
    expected_set = set(expected)
    reported_set = set(reported)
    counts = Counter(reported)

    return InventoryDiff(
        missing=tuple(sorted(expected_set - reported_set)),
        unexpected=tuple(sorted(reported_set - expected_set)),
        duplicates=tuple(sorted(name for name, count in counts.items() if count > 1)),
    )


diff = compare_inventory(
    expected=["api-a", "api-b", "db-a"],
    reported=["api-a", "api-a", "db-a", "old-a"],
)

assert diff.missing == ("api-b",)
assert diff.unexpected == ("old-a",)
assert diff.duplicates == ("api-a",)
```

这个练习同时使用列表保留原始事件、集合计算关系、计数器识别重复、元组稳定输出。
真正的数据模型往往不是四选一，而是让不同结构各自承担最适合的职责。

### 为什么改了一个变量，另一个变量也跟着变了？

Python 变量不是装对象的盒子，更像贴在对象上的名字。
赋值语句通常只是让另一个名字指向同一个对象，不会自动复制对象。

```python
primary = {"host": "api-a", "tags": ["prod"]}
candidate = primary

candidate["tags"].append("canary")

print(primary)
# {'host': 'api-a', 'tags': ['prod', 'canary']}
```

`primary` 与 `candidate` 指向同一个字典，字典中的标签列表也只有一份。
因此通过任一名字修改，都能从另一名字观察到变化。

#### `==` 比较值，`is` 比较身份

```python
left = {"status": "ok"}
right = {"status": "ok"}
alias = left

assert left == right
assert left is not right
assert alias is left
```

业务数据通常用 `==` 比较内容。
`is` 主要用于身份判断，最常见的写法是 `value is None` 和 `value is not None`。
不要用 `is` 比较字符串和整数；解释器内部复用对象属于实现细节，不能作为业务逻辑。

#### 浅拷贝只复制第一层

```python
from copy import copy


original = {
    "host": "api-a",
    "labels": {"env": "prod"},
}
cloned = copy(original)

cloned["host"] = "api-b"
cloned["labels"]["env"] = "staging"

assert original["host"] == "api-a"
assert original["labels"]["env"] == "staging"
```

外层字典是两份，所以替换 `host` 不影响原对象。
内层 `labels` 字典仍被共享，所以修改环境标签会穿透过去。
列表切片、`list(source)` 和 `dict(source)` 也都是浅拷贝。

#### 深拷贝不是默认答案

`copy.deepcopy()` 会递归复制对象图，能隔离多数嵌套可变对象：

```python
from copy import deepcopy


original = {"host": "api-a", "labels": {"env": "prod"}}
cloned = deepcopy(original)
cloned["labels"]["env"] = "staging"

assert original["labels"]["env"] == "prod"
```

但深拷贝也有成本和语义问题：

- 大对象会增加内存和 CPU 消耗。
- 文件句柄、锁、Socket 与外部客户端并不适合复制。
- 对象之间刻意共享的关系可能被破坏。
- 深拷贝掩盖了“谁拥有这份数据”的设计问题。

更好的默认策略通常是缩小可变范围，并显式构造需要变化的新值：

```python
def with_environment(record: dict[str, object], env: str) -> dict[str, object]:
    old_labels = record.get("labels", {})
    if not isinstance(old_labels, dict):
        raise TypeError("labels must be a mapping")

    return {
        **record,
        "labels": {
            **old_labels,
            "env": env,
        },
    }
```

这段代码明确复制了要修改的两层，而不是盲目复制整个对象图。

#### 函数参数也是一次名字绑定

调用函数时，形参会绑定到实参对象。
函数若修改可变对象，调用者能够看到；函数若让形参重新绑定，调用者的变量不会随之改名。

```python
def append_default(items: list[str]) -> None:
    items.append("default")


def replace_locally(items: list[str]) -> None:
    items = ["replacement"]
    print("inside:", items)


names = ["custom"]
append_default(names)
assert names == ["custom", "default"]

replace_locally(names)
assert names == ["custom", "default"]
```

这不是简单的“值传递”或“引用传递”口号能完整描述的。
实际规则是对象被传入，形参获得对该对象的新绑定；对象是否可变决定了原地操作能否被外部观察。

#### 避开可变默认参数

默认参数在函数定义时求值，不是每次调用时重新创建。
把列表或字典直接放在默认值里，会让多次调用共享状态：

```python
def collect_bad(host: str, results: list[str] = []) -> list[str]:
    results.append(host)
    return results


print(collect_bad("api-a"))
print(collect_bad("db-a"))
# 第二次结果会包含 api-a 和 db-a
```

安全写法用 `None` 作为哨兵：

```python
def collect(host: str, results: list[str] | None = None) -> list[str]:
    if results is None:
        results = []
    results.append(host)
    return results
```

如果函数本来就需要跨调用缓存，应该使用清楚命名的缓存对象或缓存装饰器，并说明生命周期，而不是借用默认参数制造隐式状态。

#### 并发会放大共享可变状态的风险

单线程脚本中，别名问题可能只是偶发的数据污染。
多个线程或协程同时修改共享字典时，更新次序也会变得不稳定。

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class CheckResult:
    target: str
    ok: bool
    message: str


def check_one(target: str) -> CheckResult:
    # 函数只根据输入产生返回值，不修改全局 results。
    return CheckResult(target=target, ok=True, message="reachable")
```

让工作函数返回结果，再由单一汇总点收集，通常比让所有任务同时修改全局容器更易测试。
后面的并发章节会在超时、取消和有界并发下继续使用这个模式。

#### 用对象身份定位意外共享

调试时可以用 `id()` 观察两个名字是否指向同一对象：

```python
config_a = {"labels": {"env": "prod"}}
config_b = config_a.copy()

print(id(config_a), id(config_b))
print(id(config_a["labels"]), id(config_b["labels"]))
```

预期现象是外层 ID 不同，内层 ID 相同。
`id()` 只适合诊断当前进程中的身份关系，不应写入持久化协议，也不能拿来跨进程判断对象是否相同。

#### 本节练习：消除一次配置串改

下面的代码希望为两台主机生成独立配置，却复用了嵌套标签：

```python
base = {"timeout": 3, "labels": {"env": "prod"}}

api_config = base.copy()
api_config["labels"]["role"] = "api"

db_config = base.copy()
db_config["labels"]["role"] = "db"
```

运行后，两个配置的 `role` 都会变成最后写入的 `db`。
可以显式复制内层字典：

```python
def build_config(base: dict[str, object], role: str) -> dict[str, object]:
    labels = base.get("labels")
    if not isinstance(labels, dict):
        raise TypeError("base.labels must be a mapping")

    return {
        **base,
        "labels": {
            **labels,
            "role": role,
        },
    }


api_config = build_config(base, "api")
db_config = build_config(base, "db")

assert api_config["labels"] == {"env": "prod", "role": "api"}
assert db_config["labels"] == {"env": "prod", "role": "db"}
assert base["labels"] == {"env": "prod"}
```

验证时不要只看新对象是否正确，还要确认基础模板没有被修改。
这条检查对批量生成主机配置、Kubernetes 清单和告警规则都很重要。

本章形成了三个可继续复用的判断：容器是否允许变化、查找是否需要键索引、数据是否被多个名字共享。
先把这些边界想清楚，后续解析文件、调用 API 和并发执行时才不容易出现隐蔽副作用。

## 第三章 · 把外部文本变成程序可以信任的数据

### 日志出现乱码或格式错乱时，应该先检查什么？

Python 的 `str` 表示 Unicode 文本，`bytes` 表示原始字节。
文件、网络和子进程边界上传递的最终都是字节；编码负责在两者之间转换。
所谓“乱码”通常不是文字突然损坏，而是写入方与读取方使用了不同编码，或者字节在更早环节已经被截断。

```text
字节 --decode(编码)--> str --业务处理--> str --encode(编码)--> 字节
```

排查时先回答四个问题：

1. 原始字节来自哪里，是否还能保存一份不变的样本？
2. 生产方声明或约定的编码是什么？
3. 当前 Python 进程实际按什么编码读取？
4. 终端、日志采集器和下游存储又按什么编码显示？

#### 文件读写显式声明编码

```python
from pathlib import Path


log_path = Path("fixtures") / "agent.log"

with log_path.open("r", encoding="utf-8") as handle:
    for line_number, line in enumerate(handle, start=1):
        print(line_number, line.rstrip("\n"))
```

显式写 `encoding="utf-8"` 能避免脚本依赖操作系统区域设置。
`rstrip("\n")` 只去掉行尾换行，不会像无参数 `strip()` 那样连前导空格也删除；对需要保留缩进的日志尤其重要。

写文件也应声明编码和换行策略：

```python
report_path = Path("output") / "summary.txt"
report_path.parent.mkdir(parents=True, exist_ok=True)

with report_path.open("w", encoding="utf-8", newline="\n") as handle:
    handle.write("主机\t状态\n")
    handle.write("api-a\t正常\n")
```

#### 解码失败时不要先用 `errors="ignore"`

严格解码会在非法字节处抛出 `UnicodeDecodeError`，其中包含编码、字节范围和失败原因。
这是定位上游问题的重要证据。

```python
sample = b"status=ok\xffhost=api-a"

try:
    text = sample.decode("utf-8")
except UnicodeDecodeError as exc:
    print(f"encoding={exc.encoding}")
    print(f"byte range={exc.start}:{exc.end}")
    print(f"reason={exc.reason}")
```

直接忽略错误会让两个字段粘在一起，后续解析可能产生看似合法但含义错误的数据。
如果业务允许保留可见文本并继续处理，可以选择替换模式，同时记录指标与样本：

```python
decoded = sample.decode("utf-8", errors="replace")
replacement_count = decoded.count("\N{REPLACEMENT CHARACTER}")

if replacement_count:
    print(f"warning: replaced {replacement_count} invalid byte sequence(s)")
```

替换字符说明数据质量下降，不能静默当作正常成功。
原始字节可能包含敏感信息，保存样本前还要脱敏并限制访问。

#### `bytes` 和 `str` 不能随意混用

```python
payload = "主机=api-a".encode("utf-8")
assert isinstance(payload, bytes)

text = payload.decode("utf-8")
assert isinstance(text, str)
assert text == "主机=api-a"
```

正则表达式、字符串替换和 JSON 解析通常面向 `str`。
校验文件摘要、处理压缩流或底层协议帧时则可能需要 `bytes`。
转换应集中在 I/O 边界，业务层尽量只处理一种表示。

#### 换行、制表符和不可见字符也会破坏格式

日志“看起来一样”不代表字符串相同。
常见差异包括 `\n`、Windows 的 `\r\n`、制表符 `\t`、不换行空格和零宽字符。
调试时使用 `repr()` 比直接 `print()` 更容易发现它们：

```python
raw = "api-a\tOK\r\n"

print(raw)
print(repr(raw))
# 'api-a\tOK\r\n'
```

解析结构化文本时应针对协议清理，而不是一律删除所有空白：

```python
def parse_status_line(line: str) -> tuple[str, str]:
    normalized = line.rstrip("\r\n")
    parts = normalized.split("\t")
    if len(parts) != 2:
        raise ValueError(f"expected 2 tab-separated fields, got {len(parts)}")

    host, status = parts
    if not host:
        raise ValueError("host cannot be empty")
    return host, status
```

#### 子进程输出也有编码边界

`subprocess.run(..., text=True)` 会把标准输出解码为字符串。
若外部命令输出编码不确定，可以先收集字节并显式处理：

```python
import subprocess


completed = subprocess.run(
    ["printf", "%s", "status=ok"],
    capture_output=True,
    check=False,
    timeout=2,
)

stdout = completed.stdout.decode("utf-8", errors="strict")
stderr = completed.stderr.decode("utf-8", errors="replace")
```

真实脚本还应检查退出码并限制输出大小。
本例只是说明编码位置，完整的子进程安全模型会在第二册展开。

#### 建立可复现的乱码诊断记录

一份有用的诊断记录至少包含：

- 文件或响应的来源与采集时间。
- 原始数据摘要，例如 SHA-256，而不是把敏感正文贴进工单。
- 生产方声明的编码。
- 实际尝试的编码与异常位置。
- 是否使用替换策略，以及替换数量。
- Python 版本、操作系统和终端区域设置。

可以安全记录字节片段的十六进制形式：

```python
from hashlib import sha256


def describe_bytes(data: bytes, sample_size: int = 24) -> dict[str, object]:
    return {
        "size": len(data),
        "sha256": sha256(data).hexdigest(),
        "prefix_hex": data[:sample_size].hex(),
    }
```

十六进制前缀仍可能泄露内容，生产环境要根据数据分类决定是否保留。

#### 本节练习：区分编码错误与字段错误

准备三份测试数据：合法 UTF-8、含非法字节、字段数错误。
解析器应产生三种不同结果，而不是统一返回空值。

```python
def decode_status(data: bytes) -> tuple[str, str]:
    text = data.decode("utf-8")
    return parse_status_line(text)


assert decode_status("api-a\tOK\n".encode()) == ("api-a", "OK")

for bad in (b"api-a\xffOK\n", b"api-a OK\n"):
    try:
        decode_status(bad)
    except (UnicodeDecodeError, ValueError) as exc:
        print(type(exc).__name__, str(exc))
```

把异常分开，调用者才知道应该修正编码、修正字段协议，还是把问题交给上游系统。

### 读到 JSON 或 YAML 后，为什么不能马上相信里面的数据？

JSON 或 YAML 解析成功，只说明文本符合序列化格式，不说明它符合业务约束。
例如 `timeout` 可以存在，却是字符串 `"forever"`；目标列表可以是数组，却包含空主机名；动作可以是任意用户输入。

可靠的入口通常分四步：

1. 限制输入来源与大小。
2. 用安全解析器转换语法。
3. 验证类型、必需字段、取值范围和跨字段关系。
4. 转成内部模型，后续代码不再反复猜测结构。

#### JSON 解析错误需要携带位置

```python
import json
from pathlib import Path
from typing import Any


def load_json_file(path: Path, max_bytes: int = 1_000_000) -> Any:
    size = path.stat().st_size
    if size > max_bytes:
        raise ValueError(f"JSON file too large: {size} bytes")

    text = path.read_text(encoding="utf-8")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}"
        ) from exc
```

限制大小可以避免误读巨大日志或受到不受控输入拖垮内存。
异常链 `from exc` 保留了原始原因，同时给 CLI 提供更贴近用户的错误信息。

#### 用数据类建立内部边界

```python
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class Target:
    host: str
    port: int
    timeout_seconds: float


def parse_target(raw: Any) -> Target:
    if not isinstance(raw, dict):
        raise ValueError("target must be an object")

    host = raw.get("host")
    port = raw.get("port")
    timeout = raw.get("timeout_seconds", 3.0)

    if not isinstance(host, str) or not host.strip():
        raise ValueError("target.host must be a non-empty string")
    if isinstance(port, bool) or not isinstance(port, int):
        raise ValueError("target.port must be an integer")
    if not 1 <= port <= 65535:
        raise ValueError("target.port must be between 1 and 65535")
    if isinstance(timeout, bool) or not isinstance(timeout, (int, float)):
        raise ValueError("target.timeout_seconds must be a number")
    if not 0.1 <= float(timeout) <= 60:
        raise ValueError("target.timeout_seconds must be between 0.1 and 60")

    return Target(
        host=host.strip().lower(),
        port=port,
        timeout_seconds=float(timeout),
    )
```

注意 `bool` 是 `int` 的子类，所以只写 `isinstance(True, int)` 会意外接受布尔值作为端口。
这种边角行为正是入口校验需要覆盖的地方。

解析后的业务代码拿到的是 `Target`，不必到处写 `raw["host"]`，也不必猜测超时是字符串还是数字。

#### 汇总多个字段错误，而不是修一个报一个

交互式 CLI 可以一次报告全部配置错误：

```python
def validate_document(raw: object) -> list[str]:
    errors: list[str] = []

    if not isinstance(raw, dict):
        return ["document root must be an object"]

    targets = raw.get("targets")
    if not isinstance(targets, list):
        return ["targets must be an array"]

    if not targets:
        errors.append("targets cannot be empty")

    for index, item in enumerate(targets):
        try:
            parse_target(item)
        except ValueError as exc:
            errors.append(f"targets[{index}]: {exc}")

    return errors
```

外层结构完全错误时立即返回，避免产生几十条连锁噪声；独立目标错误则批量收集，减少用户反复修改配置的次数。

#### YAML 必须使用安全加载方式

YAML 能表达比 JSON 更复杂的类型，某些加载方式还可能构造任意 Python 对象。
处理不受信任输入时，应使用所选库官方提供的安全加载 API，并锁定、审计依赖版本。

以 PyYAML 为例：

```python
from pathlib import Path
from typing import Any

import yaml


def load_yaml_file(path: Path) -> Any:
    text = path.read_text(encoding="utf-8")
    return yaml.safe_load(text)
```

安全加载只解决对象构造风险，不替代业务校验。
YAML 还存在容易误判的隐式类型、重复键处理和锚点扩展问题。
如果配置不需要注释和复杂表达能力，JSON 可能是更窄、更容易审计的边界。

#### 不要把 Secret 混入错误信息

下面的调试写法会泄露整个配置：

```python
# 错误示例
raise ValueError(f"invalid config: {raw}")
```

更稳妥的错误只指出字段路径和规则：

```text
targets[2].timeout_seconds must be between 0.1 and 60
auth.token is required
```

日志中也不要输出请求头、完整连接串或环境变量快照。
第三册会建立统一的脱敏与审计字段。

#### 明确未知字段的策略

拼写错误最危险的表现是被静默忽略：

```json
{
  "host": "api-a",
  "port": 443,
  "timout_seconds": 30
}
```

如果程序忽略 `timout_seconds`，便会悄悄使用默认超时。
关键配置应拒绝未知字段：

```python
ALLOWED_TARGET_KEYS = {"host", "port", "timeout_seconds"}


def reject_unknown_keys(raw: dict[str, object]) -> None:
    unknown = set(raw) - ALLOWED_TARGET_KEYS
    if unknown:
        names = ", ".join(sorted(unknown))
        raise ValueError(f"unknown target field(s): {names}")
```

向后兼容要求较高时，也可以先告警再逐步收紧，但必须能观察到未知字段出现了多少次。

#### 本节练习：从文档到可信模型

测试至少覆盖以下输入：

- 根节点不是对象。
- 缺少 `targets`。
- 目标列表为空。
- 端口为 `true`、字符串、0 和 65536。
- 超时为负数、极大数字和合法小数。
- 出现拼错的未知字段。
- 错误信息不包含 Token。

期望的处理链可以表示为：

```text
文件字节
  -> UTF-8 严格解码
  -> JSON/YAML 安全语法解析
  -> 文档级结构验证
  -> 单项目标验证与规范化
  -> Target 内部模型
  -> 执行层
```

只要原始字典还在执行层到处流动，可信边界就没有真正建立起来。

### 日志文件太大放不进内存时，怎样边读边处理？

`read()` 和 `read_text()` 会一次性把整个文件载入内存。
小配置这样最简单；数 GB 日志则应该逐行迭代，或按固定大小读取字节块。
流式处理的目标不是“绝不占内存”，而是让内存与批次大小相关，而不是与全部输入大小相关。

#### 文件对象本身就是可迭代对象

```python
from collections import Counter
from pathlib import Path


def count_levels(path: Path) -> Counter[str]:
    counts: Counter[str] = Counter()

    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            fields = line.rstrip("\r\n").split("\t")
            if len(fields) < 2:
                print(f"skip malformed line {line_number}")
                continue

            level = fields[1]
            counts[level] += 1

    return counts
```

循环每次只保留当前行和计数器。
输入再大，内存主要取决于不同级别的数量，而不是日志行数。

如果任务已经变成二维表关联、时间窗口聚合或数值数组运算，Pandas 与 NumPy 可能显著减少实现成本；如果只是逐行筛选和计数，引入它们会增加安装体积与内存基线。
先用代表性数据测量内存和耗时，再决定是否增加依赖；Notebook 中跑通的分析也要整理成模块、参数和回归测试后才能进入自动化。

#### 用生成器把读取、解析和过滤拆开

生成器函数包含 `yield`，调用时返回迭代器；每次请求下一个值时，它从上次暂停处继续。

```python
from collections.abc import Iterable, Iterator
from dataclasses import dataclass


@dataclass(frozen=True)
class LogEvent:
    timestamp: str
    level: str
    message: str


def parse_events(lines: Iterable[str]) -> Iterator[LogEvent]:
    for line_number, line in enumerate(lines, start=1):
        fields = line.rstrip("\r\n").split("\t", maxsplit=2)
        if len(fields) != 3:
            print(f"skip line={line_number} reason=field_count")
            continue

        timestamp, level, message = fields
        yield LogEvent(timestamp, level, message)


def only_errors(events: Iterable[LogEvent]) -> Iterator[LogEvent]:
    for event in events:
        if event.level in {"ERROR", "CRITICAL"}:
            yield event
```

组合时数据按需流动：

```python
path = Path("fixtures/agent.log")

with path.open("r", encoding="utf-8") as handle:
    for event in only_errors(parse_events(handle)):
        print(event.timestamp, event.message)
```

读取层不关心错误级别，过滤层不关心文件如何打开，主流程负责资源生命周期。
这种职责拆分也让每层可以用小型内存输入单独测试。

#### 迭代器通常只能消费一次

```python
numbers = (value for value in range(3))

print(list(numbers))  # [0, 1, 2]
print(list(numbers))  # []
```

如果既要统计又要输出，不能无意中先把同一生成器耗尽。
可以在一次循环中同时完成两个动作，或明确把可接受大小的结果物化为列表。
`itertools.tee()` 也能复制迭代视图，但缓存差距过大时仍可能占用大量内存。

#### 批处理是在吞吐和资源之间设旋钮

数据库或 API 往往适合按批写入。
Python 标准库的新版本提供了若干分批工具，但为了兼容清晰，这里实现一个简单生成器：

```python
from collections.abc import Iterable, Iterator
from itertools import islice
from typing import TypeVar


T = TypeVar("T")


def batched(items: Iterable[T], size: int) -> Iterator[list[T]]:
    if size < 1:
        raise ValueError("batch size must be positive")

    iterator = iter(items)
    while batch := list(islice(iterator, size)):
        yield batch
```

```python
with Path("fixtures/agent.log").open("r", encoding="utf-8") as handle:
    events = parse_events(handle)
    for batch in batched(events, size=500):
        print(f"would write {len(batch)} events")
```

批次太小会增加请求次数，太大则增加内存、锁持有时间和失败重放范围。
应通过压测和下游限制选取默认值，并允许在安全范围内配置。

#### 坏行策略要明确

流式任务运行数小时后才遇到坏行，应该停止还是跳过？
答案取决于业务：

| 策略 | 适用情况 | 必须补充的保护 |
| --- | --- | --- |
| 立即失败 | 配置迁移、账务、强一致导入 | 原子写入或事务、清楚的行号 |
| 跳过继续 | 大规模日志分析、允许部分结果 | 错误计数、样本、失败阈值 |
| 隔离坏行 | 后续要人工复核或重放 | 脱敏、独立权限、容量限制 |

不能只有 `except Exception: continue`。
至少要知道跳过多少条，并在比例超过阈值时让整个任务失败。

```python
@dataclass
class ParseStats:
    total: int = 0
    accepted: int = 0
    rejected: int = 0


def rejection_rate(stats: ParseStats) -> float:
    if stats.total == 0:
        return 0.0
    return stats.rejected / stats.total
```

#### 需要回看时保存检查点，而不是保存所有对象

长任务可以记录已完成的文件、字节偏移或稳定事件 ID。
检查点必须与输出提交顺序一致，否则恢复时可能漏数据。

一个简化原则是：

```text
读取批次 -> 校验批次 -> 提交输出 -> 持久化检查点
```

如果先推进检查点再提交输出，进程在两者之间崩溃会造成永久遗漏。
如果先提交输出再写检查点，恢复时可能重复，因此输出端还需要幂等键。
第四册会完整讨论这一权衡。

#### 本节练习：实现有失败预算的日志统计

目标行为：

- 逐行读取，不调用 `read()`。
- 记录总行数、有效行和坏行。
- 最多保存前 10 个坏行号，不保存原始敏感内容。
- 坏行比例超过 1% 时返回非零退出码。
- 空文件不出现除零错误。

```python
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ScanReport:
    total: int = 0
    accepted: int = 0
    rejected: int = 0
    rejected_lines: list[int] = field(default_factory=list)


def scan_log(path: Path) -> ScanReport:
    report = ScanReport()

    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            report.total += 1
            try:
                parse_status_line(line)
            except ValueError:
                report.rejected += 1
                if len(report.rejected_lines) < 10:
                    report.rejected_lines.append(line_number)
            else:
                report.accepted += 1

    return report


def report_exit_code(report: ScanReport) -> int:
    if report.total and report.rejected / report.total > 0.01:
        return 2
    return 0
```

验证时生成小型测试文件即可，不需要真的创建数 GB 数据。
可用大量重复行模拟规模，再观察进程常驻内存是否随总行数持续增长。

本章建立了外部输入的可信路径：字节先正确解码，结构化文本再做业务校验，大文件最后通过迭代器和批次保持资源有界。
任何一步失败都应留下足够定位的信息，但不能泄露输入中的敏感内容。

## 第四章 · 让脚本既能跑通，也能在出错时说清原因

### 条件、循环和推导式，怎样写才不会把流程绕晕？

控制流的作用是把业务规则变成可以逐步验证的路径。
代码行数少不等于容易理解；把过滤、转换、副作用和错误处理塞进一条表达式，通常只会让排障更慢。

先用一句自然语言描述规则：

> 只检查启用且属于生产环境的目标；维护中的目标记为跳过，其他目标执行检查。

然后让代码保持相同顺序：

```python
for target in targets:
    if not target.enabled:
        continue

    if target.environment != "prod":
        continue

    if target.in_maintenance:
        record_skipped(target, reason="maintenance")
        continue

    run_check(target)
```

早退出减少嵌套层级。
阅读者从上往下就能看到每个排除条件，不必在多个 `else` 中记忆状态。

#### 先区分真假判断和精确状态判断

空字符串、空容器、数字零和 `None` 都是假值，但业务含义可能不同。

```python
if timeout is None:
    timeout = DEFAULT_TIMEOUT

if timeout <= 0:
    raise ValueError("timeout must be positive")
```

若写成 `if not timeout`，缺省和非法零值会混在一起。
对状态枚举也应显式比较，避免未来新增状态时被错误归入 `else`。

```python
from enum import StrEnum


class Health(StrEnum):
    OK = "ok"
    DEGRADED = "degraded"
    FAILED = "failed"


def status_exit_code(health: Health) -> int:
    match health:
        case Health.OK:
            return 0
        case Health.DEGRADED:
            return 1
        case Health.FAILED:
            return 2
```

`match` 适合对结构或明确状态分支。
简单的两个条件仍用 `if` 更直观，不需要为了使用新语法而使用。

#### 循环中明确跳过、停止和失败

- `continue` 表示当前项目不再处理，继续下一项。
- `break` 表示整个循环结束。
- `return` 表示当前函数结束。
- `raise` 表示当前路径无法正常完成，由上层决定处理。

```python
def find_first_failed(results: list[CheckResult]) -> CheckResult | None:
    for result in results:
        if not result.ok:
            return result
    return None
```

如果任务要求收集所有失败，就不能在第一个失败处 `return`：

```python
def collect_failed(results: list[CheckResult]) -> list[CheckResult]:
    failed: list[CheckResult] = []
    for result in results:
        if not result.ok:
            failed.append(result)
    return failed
```

两个函数都正确，区别在于业务契约。
写循环前先确认是 fail-fast、best-effort，还是达到失败阈值后停止。

#### 推导式只承担一次清晰转换

下面的推导式易读：

```python
failed_names = [result.target for result in results if not result.ok]
```

下面的表达式混合了解析、过滤、网络调用和默认值，不适合作为“简洁”示范：

```python
# 不推荐：副作用和异常位置都难以观察
states = {
    item["name"]: fetch_state(item["url"]) if item.get("enabled") else "disabled"
    for item in raw_items
    if item.get("name") and item.get("url")
}
```

把输入校验和外部调用展开后更容易加入日志、超时和失败结果：

```python
states: dict[str, str] = {}

for item in raw_items:
    name = item.get("name")
    url = item.get("url")

    if not isinstance(name, str) or not name:
        continue
    if not isinstance(url, str) or not url:
        continue

    if not item.get("enabled", False):
        states[name] = "disabled"
        continue

    states[name] = fetch_state(url)
```

#### `for ... else` 只在团队能读懂时使用

循环的 `else` 会在没有触发 `break` 时执行：

```python
for result in results:
    if not result.ok:
        print(f"first failure: {result.target}")
        break
else:
    print("all checks passed")
```

它不是异常处理的 `else`，也不是与 `if` 配对。
如果团队不熟悉，抽成函数并用提前返回往往更清楚。

#### 避免用循环变量泄露业务状态

循环结束后变量仍可能存在，但空输入时根本不会赋值：

```python
# 脆弱写法
for target in targets:
    last_target = target

print(last_target)
```

需要最后一项时，应先验证输入或显式维护可空状态：

```python
last_target: Target | None = None

for target in targets:
    last_target = target

if last_target is None:
    print("no targets")
else:
    print(last_target.host)
```

#### 本节练习：把嵌套流程改成决策表

为巡检目标定义以下规则：

| enabled | environment | maintenance | 动作 |
| --- | --- | --- | --- |
| false | 任意 | 任意 | 忽略，不计入总数 |
| true | 非 prod | 任意 | 忽略，不计入总数 |
| true | prod | true | 记录 skipped |
| true | prod | false | 执行检查 |

先写表，再写四组测试输入，最后实现控制流。
决策表能暴露条件遗漏，也能避免把复杂布尔表达式当成唯一事实来源。

```python
def decide_target(target: TargetPolicy) -> str:
    if not target.enabled:
        return "ignore"
    if target.environment != "prod":
        return "ignore"
    if target.in_maintenance:
        return "skip"
    return "check"
```

### 一段代码什么时候该拆成函数，参数和返回值又该怎样设计？

函数不是为了减少几行重复而存在。
更重要的价值是给一段逻辑命名、建立输入输出边界、隔离副作用，并让失败可以独立测试。

匿名函数 `lambda` 适合放在 `sorted(..., key=lambda item: item.name)` 这类短小、无副作用的键函数或回调位置。
一旦表达式需要异常处理、多步判断、日志或复用，就改成有名字的 `def`；名字能承载业务含义，也让 traceback 和测试更容易理解。

适合拆函数的信号包括：

- 需要用一句注释解释“接下来做什么”。
- 同一规则在两个入口重复出现。
- 一段代码同时解析、校验、执行和格式化。
- 测试某条分支必须启动整个程序。
- 参数或局部状态多到很难判断依赖。
- 错误信息无法说明失败属于哪个阶段。

#### 从混合流程中找出阶段边界

一个批量巡检 CLI 可以拆成：

```text
load_config
  -> parse_targets
  -> plan_checks
  -> execute_checks
  -> summarize_results
  -> render_report
  -> choose_exit_code
```

每个箭头都是可验证的契约。
加载函数处理文件问题，解析函数处理数据问题，执行函数处理外部依赖，渲染函数不再发网络请求。

#### 参数只传函数真正需要的内容

把整个全局配置传给每个函数很方便，却隐藏依赖：

```python
# 依赖不透明
def check_target(target: Target, config: dict[str, object]) -> CheckResult:
    ...
```

更清楚的签名会暴露超时和重试策略：

```python
def check_target(
    target: Target,
    *,
    timeout_seconds: float,
    attempts: int,
) -> CheckResult:
    ...
```

星号后的参数只能按名称传入：

```python
result = check_target(
    target,
    timeout_seconds=3.0,
    attempts=2,
)
```

调用位置不会出现含义不明的 `check_target(target, 3, 2)`。

#### 返回结构化结果，不要同时打印和决定退出

底层函数直接 `print()` 会让测试依赖终端文本，也让 JSON 输出和日志输出难以复用。

```python
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class CheckResult:
    target: str
    ok: bool
    latency_ms: float | None
    message: str


def summarize(results: list[CheckResult]) -> dict[str, int]:
    passed = sum(1 for result in results if result.ok)
    failed = len(results) - passed
    return {"total": len(results), "passed": passed, "failed": failed}
```

表现层再决定输出格式：

```python
import json
from typing import TextIO


def write_json_summary(summary: dict[str, int], stream: TextIO) -> None:
    json.dump(summary, stream, ensure_ascii=False, sort_keys=True)
    stream.write("\n")
```

测试可以传入 `io.StringIO`，CLI 可以传 `sys.stdout`，文件导出可以传已打开的文件句柄。

#### 不要用特殊返回值隐藏失败

返回 `None`、空列表还是异常，取决于结果语义：

- “没有匹配项目”是正常结果，可以返回空列表。
- “可选缓存没有命中”可以返回 `None`。
- “配置缺少必需字段”不是正常结果，应抛出明确异常。
- “单台目标不可达”在批量巡检中可以建模为 `CheckResult(ok=False)`。
- “整个认证配置无效”会影响全部目标，应终止批次。

```python
def lookup_optional_owner(host: str, owners: dict[str, str]) -> str | None:
    return owners.get(host)


def require_token(env: dict[str, str]) -> str:
    token = env.get("OPS_API_TOKEN")
    if not token:
        raise ConfigError("OPS_API_TOKEN is required")
    return token
```

#### 函数应保持一个抽象层级

下面的主流程混入了协议细节：

```python
def run() -> int:
    # 如果这里同时出现 open、json.loads、socket、重试循环、ANSI 颜色，
    # 调用流程就很难一眼读懂。
    ...
```

更理想的主流程像一份可执行目录：

```python
def run(options: Options) -> int:
    config = load_and_validate_config(options.config_path)
    plan = build_check_plan(config, options)
    results = execute_plan(plan)
    write_report(results, options.output_format)
    return exit_code_for(results)
```

细节并没有消失，只是进入名字与职责匹配的函数。
如果某个函数仍有几十个条件和多种外部副作用，就继续沿阶段边界拆分，而不是机械限制行数。

#### 谨慎使用位置可变参数和任意关键字

`*args`、`**kwargs` 适合框架适配或薄包装，不适合掩盖不稳定接口。

```python
# 调用者不知道支持哪些键
def run_check(target: str, **options: object) -> CheckResult:
    ...
```

对于业务入口，显式参数、数据类或 `TypedDict` 更容易被编辑器、类型检查器和评审者理解。

#### 纯函数与副作用外壳

纯函数只由输入决定输出，不读时钟、不访问网络、不修改外部状态。
运维工具不可能完全没有副作用，但可以把副作用压到边缘：

```python
def build_curl_arguments(url: str, timeout_seconds: float) -> list[str]:
    if not url.startswith(("http://", "https://")):
        raise ValueError("unsupported URL scheme")
    return [
        "curl",
        "--fail",
        "--silent",
        "--show-error",
        "--max-time",
        str(timeout_seconds),
        url,
    ]
```

参数构造可以纯测试；真正执行命令的薄层统一处理退出码和超时。
但能用 HTTP 客户端库时，不必绕到 `curl`，示例只用于说明分层。

#### 本节练习：给函数写契约测试

为 `parse_target()` 写出契约：

- 输入必须是映射。
- 主机名会去除两端空白并转小写。
- 端口只接受 1 到 65535 的整数，不接受布尔值。
- 超时有默认值且被转成浮点数。
- 输入字典不会被修改。

```python
raw = {"host": " API-A ", "port": 443}
before = raw.copy()

target = parse_target(raw)

assert target.host == "api-a"
assert target.port == 443
assert target.timeout_seconds == 3.0
assert raw == before
```

函数签名、返回类型和失败类型共同构成契约。
文档说明意图，类型提示降低误用，测试验证真正行为，三者不能相互替代。

### 异常应该在哪里捕获，什么时候又应该让它继续抛出？

异常表示当前代码无法按原定路径完成。
捕获异常的前提是这一层知道如何恢复、转换、补充上下文，或把它变成明确的用户结果。
如果只会把异常吞掉，就不应该捕获。

#### 只包住可能失败的最小范围

```python
try:
    raw = path.read_text(encoding="utf-8")
except FileNotFoundError as exc:
    raise ConfigError(f"config file not found: {path}") from exc
except PermissionError as exc:
    raise ConfigError(f"cannot read config file: {path}") from exc

config = parse_config(raw)
plan = build_plan(config)
```

若把后面所有逻辑都放进同一个 `try`，一个编程错误也可能被误报为“读取配置失败”。
异常范围越精确，错误上下文越可信。

#### 捕获具体异常，而不是裸 `except`

```python
# 不推荐
try:
    run_check(target)
except:
    return CheckResult(target, False, None, "failed")
```

裸捕获还会接住 `KeyboardInterrupt`、`SystemExit` 等控制流程异常。
即使写 `except Exception`，也可能掩盖 `NameError`、`AttributeError` 这类代码缺陷。

批量任务可以在单项目标边界捕获预期的外部失败：

```python
class CheckTimeout(Exception):
    pass


class TargetUnavailable(Exception):
    pass


def execute_one(target: Target) -> CheckResult:
    try:
        latency = probe(target)
    except CheckTimeout:
        return CheckResult(target.host, False, None, "timeout")
    except TargetUnavailable as exc:
        return CheckResult(target.host, False, None, str(exc))

    return CheckResult(target.host, True, latency, "reachable")
```

未知异常继续抛出，让测试或顶层错误处理发现程序缺陷。

#### 用异常链保留根因

```python
class ConfigError(Exception):
    """Configuration cannot be loaded or validated."""


def load_config(path: Path) -> dict[str, object]:
    try:
        text = path.read_text(encoding="utf-8")
        raw = json.loads(text)
    except OSError as exc:
        raise ConfigError(f"cannot read {path}") from exc
    except json.JSONDecodeError as exc:
        raise ConfigError(
            f"invalid JSON in {path}:{exc.lineno}:{exc.colno}"
        ) from exc

    if not isinstance(raw, dict):
        raise ConfigError("config root must be an object")
    return raw
```

`raise ... from exc` 让 traceback 同时显示业务上下文和底层原因。
顶层 CLI 可以给普通用户显示简洁错误，在调试模式输出完整异常链。

#### `else` 和 `finally` 各自解决什么问题

`try` 的 `else` 只在没有异常时运行，适合把可能抛错的范围缩小。
`finally` 无论成功失败都会执行，适合释放本层拥有的资源。

```python
lock = acquire_lock()

try:
    result = perform_change()
except ExpectedOperationError as exc:
    record_failure(exc)
    raise
else:
    record_success(result)
finally:
    lock.release()
```

文件和锁若支持上下文管理器，优先用 `with`，它会把清理协议封装得更稳妥。
不要在 `finally` 中 `return`，否则可能覆盖原异常。

#### 重试不是普通异常处理

只有短暂性失败才可能适合重试，例如连接瞬断、服务端 503 或明确的限流响应。
认证失败、参数错误和数据校验失败通常不会因为再试一次而恢复。

一个安全重试策略至少定义：

- 哪些异常或状态允许重试。
- 最大尝试次数。
- 每次尝试的超时。
- 退避和抖动。
- 整体时间预算。
- 操作是否幂等。
- 最终失败如何记录。

```python
import random
import time
from collections.abc import Callable
from typing import TypeVar


R = TypeVar("R")


def retry_transient(
    operation: Callable[[], R],
    *,
    attempts: int = 3,
    base_delay: float = 0.2,
) -> R:
    if attempts < 1:
        raise ValueError("attempts must be positive")

    for attempt in range(1, attempts + 1):
        try:
            return operation()
        except TargetUnavailable:
            if attempt == attempts:
                raise

            delay = base_delay * (2 ** (attempt - 1))
            delay += random.uniform(0, delay * 0.2)
            time.sleep(delay)

    raise AssertionError("unreachable")
```

这仍是教学版本。
生产代码还要支持取消、总截止时间、可注入睡眠函数和结构化日志。
不要对创建用户、扩容、重启等非幂等动作盲目套重试。

#### 顶层把异常映射为稳定退出码

```python
import sys


EXIT_OK = 0
EXIT_FINDINGS = 1
EXIT_USAGE = 2
EXIT_RUNTIME = 3


def main() -> int:
    try:
        options = parse_options()
        return run(options)
    except ConfigError as exc:
        print(f"configuration error: {exc}", file=sys.stderr)
        return EXIT_USAGE
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        return 130
    except Exception:
        logger.exception("unexpected failure")
        return EXIT_RUNTIME


if __name__ == "__main__":
    raise SystemExit(main())
```

顶层可以设置最后一道保护，但意外异常必须记录 traceback，不能只输出“失败”。
库函数不应直接 `sys.exit()`，否则调用者和测试无法决定恢复策略。

#### 失败结果与异常要分层

批量巡检中，单台主机不可达是预期业务结果；配置读不到则使任务无法开始；代码访问不存在属性则是缺陷。

| 情况 | 表达方式 | 谁处理 |
| --- | --- | --- |
| 单目标超时 | `CheckResult(ok=False)` | 汇总层 |
| 配置无效 | `ConfigError` | CLI 顶层 |
| 用户中断 | `KeyboardInterrupt` / 信号 | 生命周期边界 |
| 编程错误 | 原异常和 traceback | 测试、监控、维护者 |

如果把所有情况都变成 `False`，调用者无法决定退出码、重试和告警级别。

#### 本节练习：验证四条失败路径

为批量巡检入口准备四个实验：

1. 配置文件不存在，预期退出码为用法错误且 stderr 不含 traceback。
2. 单台目标超时，其他目标仍执行，最终报告包含失败目标。
3. 用户中断，预期退出码为 130，并停止接收新任务。
4. 工作函数发生 `AttributeError`，预期记录完整 traceback 并返回运行时错误。

输出示例：

```text
$ ops-check --config missing.json
configuration error: config file not found: missing.json
$ echo $?
2
```

测试不仅断言文本，还应断言退出码、已执行目标数和是否留下临时文件。

#### 第一册收束：能够解释，才算掌握

完成第一册后，读者应能对一段 Python 运维脚本回答：

- 解释器与依赖环境从哪里确定。
- 每个变量指向什么类型的数据，哪里可能原地修改。
- 外部字节如何解码，结构化输入在哪里完成校验。
- 大文件是否流式处理，内存上限由什么控制。
- 条件分支对应哪条业务规则。
- 函数的输入、输出、副作用和异常分别是什么。
- 单目标失败、任务级失败和程序缺陷如何区分。
- 自动化系统能依据哪个退出码判断结果。

可以用下面的最小检查表审查练习代码：

```text
[ ] 输入边界有编码、大小和结构校验
[ ] 可变数据的所有权清楚
[ ] 主流程能按阶段读出来
[ ] 底层函数不随意 print 或 sys.exit
[ ] 捕获的是预期的具体异常
[ ] 未知异常保留 traceback
[ ] 输出与退出码都能被测试
[ ] 示例不依赖真实生产凭证和主机
```

这些基础不是为了手写所有代码，而是为了让你能审查生成代码、定位失败并为生产动作承担责任。
第二册将在这个语言边界之上，真正连接路径、文件、系统命令、CLI、HTTP API 与并发任务。

#### 第一册自测：不用运行代码，先预测结果

读下面每段代码，先写下输出或异常，再用独立临时文件验证。

```python
items = ["api-a"]
alias = items
copied = items.copy()
alias.append("db-a")

print(items)
print(copied)
print(alias is items)
print(copied is items)
```

应能解释赋值、浅拷贝、值相等和身份相同的区别。

```python
template = {"labels": {"env": "prod"}}
first = template.copy()
second = template.copy()
first["labels"]["role"] = "api"

print(second)
```

应能指出共享发生在内层字典，并给出显式复制边界。

```python
def remember(value: str, values: list[str] = []) -> list[str]:
    values.append(value)
    return values


print(remember("a"))
print(remember("b"))
```

应能解释默认对象何时创建，并改用 `None` 哨兵。

```python
raw = {"timeout": 0}
timeout = raw.get("timeout") or 3
print(timeout)
```

应能判断输出为何不是 0，并区分缺失与合法假值。

```python
records = (
    {"host": "api-a", "ports": [80]},
)
records[0]["ports"].append(443)
print(records)
```

应能解释元组固定的是槽位，而不是递归冻结成员。

```python
stream = (number * 2 for number in range(3))
print(sum(stream))
print(list(stream))
```

应能说明迭代器为何第二次为空，并提出只遍历一次的汇总设计。

```python
try:
    raise ValueError("bad input")
except Exception as exc:
    wrapped = ConfigError("cannot load")
    wrapped.__cause__ = exc
    raise wrapped
```

应能用更自然的 `raise ConfigError(...) from exc` 保留异常链。

```python
def classify(value: object) -> str:
    if not value:
        return "missing"
    if isinstance(value, int):
        return "number"
    return "other"


print(classify(False))
print(classify(0))
print(classify(None))
```

应能发现三个不同输入被合并，并根据业务改成精确判断。

每段练习都记录四项：预测、实际、机制解释、运维风险。
只得到正确输出但解释不出原因，说明知识仍停留在记忆层面。
