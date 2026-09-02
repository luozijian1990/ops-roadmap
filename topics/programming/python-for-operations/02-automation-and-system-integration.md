# Python 运维自动化与工程实践 · 第二册：自动化与系统集成

## 第五章 · 稳妥地处理路径、文件和临时资源

### 不再手工拼接路径后，`pathlib` 能帮我们避开什么坑？

运维脚本经常同时运行在开发机、CI 容器和服务器上。
手工用字符串拼接路径会混淆目录分隔符、相对基准、文件名和用户输入，也容易漏掉父目录创建与类型检查。
`pathlib.Path` 把路径作为对象处理，让“拼路径”和“读文件”成为不同动作。

```python
from pathlib import Path


config_dir = Path("config")
config_path = config_dir / "targets.json"
report_path = Path("output") / "reports" / "latest.json"

print(config_path)
print(config_path.name)
print(config_path.suffix)
print(config_path.parent)
```

`/` 在这里是路径连接运算，不会立即访问文件系统。
只有调用 `exists()`、`read_text()`、`open()` 等方法时才发生 I/O。

#### 先明确相对路径相对于谁

相对路径默认基于进程当前工作目录，而不是脚本文件所在目录。

```python
from pathlib import Path


print("cwd:", Path.cwd())
print("script:", Path(__file__).resolve())
```

CLI 接受用户路径时，通常应尊重当前工作目录：

```python
def resolve_user_path(value: str) -> Path:
    return Path(value).expanduser().resolve()
```

读取随包发布的内置资源时，不应假设 cwd，可以使用 `importlib.resources`。
不要为了“稳定”就把所有相对路径都绑定到 `__file__`；这会违背多数命令行工具的用户预期。

#### 检查存在性还不够

```python
def require_regular_file(path: Path) -> Path:
    candidate = path.expanduser().resolve()
    if not candidate.exists():
        raise FileNotFoundError(candidate)
    if not candidate.is_file():
        raise ValueError(f"expected a regular file: {candidate}")
    return candidate
```

真正打开时仍可能因竞态、权限或挂载变化失败，因此 `exists()` 不能替代异常处理。
更常见的风格是直接尝试操作，再把 `FileNotFoundError`、`PermissionError` 转成明确错误。

#### 创建目录要表达幂等意图

```python
output_dir = Path("output") / "reports"
output_dir.mkdir(parents=True, exist_ok=True)
```

`parents=True` 创建缺失父目录，`exist_ok=True` 允许目录已存在。
但若同名路径是普通文件，调用仍会失败，这正是应该保留的保护。

#### 限制用户路径不能逃出工作目录

Web 服务或共享自动化平台不能把用户输入直接拼到输出根目录。

```python
def path_below(root: Path, relative_name: str) -> Path:
    root = root.resolve()
    candidate = (root / relative_name).resolve()

    if not candidate.is_relative_to(root):
        raise ValueError("path escapes output root")
    return candidate
```

这能拒绝 `../../etc/passwd` 一类路径穿越。
符号链接和创建时竞态仍需根据威胁模型处理；高权限服务应尽量使用专用低权限目录和操作系统隔离。

#### 遍历目录时控制范围

```python
def iter_json_files(root: Path):
    for path in root.glob("*.json"):
        if path.is_file():
            yield path
```

`rglob("*.json")` 会递归所有子目录，面对挂载点或巨大树时可能非常昂贵。
默认选择最窄范围，并提供最大文件数、深度或总大小限制。

#### 本节练习

实现 `discover_configs(root)`：

- 根目录必须存在且是目录。
- 只读取当前目录的 `.json`。
- 按文件名排序，保证输出稳定。
- 忽略符号链接或明确记录策略。
- 超过 1,000 个文件时拒绝继续。

```python
def discover_configs(root: Path, limit: int = 1000) -> list[Path]:
    root = root.expanduser().resolve()
    if not root.is_dir():
        raise ValueError(f"not a directory: {root}")

    found = sorted(
        path
        for path in root.glob("*.json")
        if path.is_file() and not path.is_symlink()
    )
    if len(found) > limit:
        raise ValueError(f"too many config files: {len(found)} > {limit}")
    return found
```

路径对象提升可读性，但安全仍来自明确根目录、资源上限、权限和失败策略。

#### `shutil` 负责复制和移动，但不会替你决定破坏边界

`pathlib` 擅长表达路径，`shutil` 则提供复制文件、复制目录树、移动和磁盘空间查询等高层操作。
这些函数会真正修改文件系统，调用前要先解析源与目标、拒绝越界路径，并明确覆盖和符号链接策略。

```python
from pathlib import Path
import shutil


def copy_report(source: Path, archive_root: Path) -> Path:
    source = source.expanduser().resolve(strict=True)
    archive_root = archive_root.expanduser().resolve()
    archive_root.mkdir(parents=True, exist_ok=True)

    if not source.is_file() or source.is_symlink():
        raise ValueError(f"expected regular source file: {source}")

    usage = shutil.disk_usage(archive_root)
    required = source.stat().st_size
    if usage.free < required * 2:
        raise OSError("insufficient free space for copy and replacement")

    destination = archive_root / source.name
    if destination.exists():
        raise FileExistsError(destination)

    return Path(shutil.copy2(source, destination))
```

`copy2()` 尽量保留修改时间等元数据，但不能保证跨平台保留所有者、ACL、扩展属性和资源分叉。
`move()` 跨文件系统时可能退化为复制再删除，因此不等同于原子重命名。
`copytree()` 的目录范围必须有上限；`rmtree()` 会递归删除整棵树，只能接收已经解析并验证过的专用工作目录，不能直接接收用户输入或宽泛根目录。

验证这类代码时使用临时目录，至少覆盖目标已存在、空间不足、源为符号链接和复制中断四条路径。

### 怎样安全更新配置文件，避免写到一半留下残缺内容？

直接以 `w` 模式打开正式文件会先截断内容。
进程崩溃、磁盘写满或机器断电都可能留下空文件或半截 JSON。
更稳妥的模式是在同一文件系统中写临时文件，刷新并校验后用 `os.replace()` 原子替换目标。

```text
序列化新内容
  -> 在目标目录创建临时文件
  -> 写入、flush、fsync
  -> 可选：重新读取并校验
  -> os.replace(temp, target)
  -> 可选：fsync 父目录
```

```python
import json
import os
import tempfile
from pathlib import Path
from typing import Any


def write_json_atomic(path: Path, value: Any) -> None:
    path = path.resolve()
    path.parent.mkdir(parents=True, exist_ok=True)

    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temp_name = handle.name
            json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())

        os.replace(temp_name, path)
        temp_name = None
    finally:
        if temp_name is not None:
            Path(temp_name).unlink(missing_ok=True)
```

临时文件放在目标目录，是为了提高同一文件系统内替换的原子性。
跨文件系统移动可能退化为复制，失去相同保证。

#### 原子替换不等于并发控制

两个进程同时读取旧配置、各自修改再替换，最终仍会发生最后写入者覆盖。
需要防止丢失更新时，可以：

- 使用操作系统文件锁。
- 写入前比较版本号或内容摘要。
- 把状态移入支持事务和条件更新的数据库。
- 设计为单写者，由队列串行提交。

```python
from hashlib import sha256


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()
```

更新前保存摘要，替换前再次比较；不一致就拒绝覆盖并要求重试。
这属于乐观并发控制，仍需把比较与替换之间的竞态纳入具体实现。

#### 权限、所有者和备份也属于写入契约

新临时文件的权限可能与旧文件不同。
更新系统配置前要决定：

- 是否继承旧文件模式。
- 进程 umask 是否符合要求。
- 所有者和组是否需要保持。
- 是否保留可恢复备份以及保留多久。
- 备份是否包含 Secret，访问权限是否更严格。

原子更新解决“完整旧版或完整新版”，不自动解决权限和语义正确性。

#### 先渲染再提交，支持 dry-run

```python
def render_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def update_config(path: Path, value: object, *, dry_run: bool) -> bool:
    rendered = render_json(value)
    previous = path.read_text(encoding="utf-8") if path.exists() else None

    if previous == rendered:
        return False

    if dry_run:
        print(f"would update {path}")
        return True

    write_json_atomic(path, value)
    return True
```

返回值表示是否存在变化，调用者据此生成审计记录。
dry-run 不能只是不写文件，还应避免重启服务、发送通知等所有后续副作用。

#### 本节练习

为原子写函数注入三个故障：序列化失败、写入中断、替换失败。
每次都验证：

- 原正式文件仍是完整旧内容。
- 临时文件被清理或能被明确识别。
- 错误包含目标路径但不包含 Secret 正文。
- 成功路径末尾换行和键顺序稳定。
- 连续写入相同内容不会触发后续 reload。

原子性是可验证的状态转换，不是函数名中的一个形容词。

### `with` 语句为什么能在异常发生后仍然释放资源？

文件、锁、临时目录、数据库连接和网络客户端都拥有生命周期。
如果获取成功却未释放，长进程会耗尽文件描述符，批处理会留下锁，测试会污染临时目录。
上下文管理器把进入和退出协议放在同一个语法边界。

```python
with Path("config.json").open("r", encoding="utf-8") as handle:
    text = handle.read()
```

它近似于：

```python
handle = Path("config.json").open("r", encoding="utf-8")
try:
    text = handle.read()
finally:
    handle.close()
```

即使 `read()` 或后续解析抛出异常，`close()` 仍会执行。

#### 自定义上下文管理器表达锁的生命周期

```python
from contextlib import contextmanager
from collections.abc import Iterator
from pathlib import Path


@contextmanager
def operation_marker(path: Path) -> Iterator[None]:
    if path.exists():
        raise RuntimeError(f"operation already running: {path}")

    path.write_text(str(os.getpid()), encoding="ascii")
    try:
        yield
    finally:
        path.unlink(missing_ok=True)
```

```python
with operation_marker(Path(".ops-check.running")):
    run_batch()
```

这个示例只能演示生命周期，不能作为可靠跨进程锁：存在检查与创建之间有竞态，进程被强制杀死后也可能留下标记。
生产中应使用平台支持的原子锁机制或成熟库。

#### `ExitStack` 处理动态数量的资源

```python
from contextlib import ExitStack
from pathlib import Path


def read_all(paths: list[Path]) -> list[str]:
    with ExitStack() as stack:
        handles = [
            stack.enter_context(path.open("r", encoding="utf-8"))
            for path in paths
        ]
        return [handle.read() for handle in handles]
```

任何一个文件打开失败时，之前已打开的文件也会被关闭。
但同时打开大量文件仍可能耗尽描述符；能顺序读取时就不要一次打开全部。

#### 异常是否被抑制必须显式决定

上下文管理器的退出方法可以返回真值来抑制异常，但这会改变控制流。
资源清理器通常不应吞掉业务异常。
如果清理本身失败，记录清理错误时也要保留原始异常，避免根因被覆盖。

#### 本章检查点

```text
[ ] 用户路径基于明确目录解析
[ ] 遍历范围和文件数量有上限
[ ] 正式文件通过同目录临时文件原子替换
[ ] dry-run 覆盖所有副作用
[ ] 每项资源都有唯一所有者和释放路径
[ ] 异常路径验证无残留文件、锁和句柄
```

路径对象、原子写入和上下文管理器共同解决的是状态边界。
只有文件从哪里来、何时提交、失败后剩下什么都说得清，自动化才有资格修改系统状态。

## 第六章 · 从 Python 调用系统命令，而不是失去控制

### 调用系统命令后，怎样拿到真正的退出码和错误信息？

```mermaid
flowchart LR
    A[参数列表] --> B[启动子进程]
    B --> C[等待与超时]
    C --> D[收集输出]
    D --> E[分类退出状态]
    E --> F[结果或清理]
```

调用命令不是“拼一个字符串然后等待”，而是一段有启动、观察、截止时间、分类和清理责任的生命周期。

外部命令不是“打印几行文本的函数”。
它有参数、工作目录、环境变量、标准输入、标准输出、标准错误、退出码、超时和信号状态。
Python 调用命令时必须把这些结果纳入契约。

```python
import subprocess


completed = subprocess.run(
    ["git", "status", "--short"],
    stdin=subprocess.DEVNULL,
    capture_output=True,
    text=True,
    encoding="utf-8",
    errors="replace",
    timeout=5,
    check=False,
)

print("returncode:", completed.returncode)
print("stdout:", completed.stdout)
print("stderr:", completed.stderr)
```

参数列表让程序名与每个参数保持边界。
`capture_output=True` 同时捕获 stdout 和 stderr；`text=True` 按指定编码解码。
`check=False` 表示调用者自己解释退出码。

#### 非零退出码不总是同一种失败

许多命令约定 `0` 成功、非零失败，但具体含义由命令定义。
例如比较工具可能用 `1` 表示“发现差异”，这对巡检是业务发现，而不是程序崩溃。

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class CommandResult:
    arguments: tuple[str, ...]
    returncode: int
    stdout: str
    stderr: str

    @property
    def succeeded(self) -> bool:
        return self.returncode == 0
```

封装层保留原始退出码，业务层再按具体命令映射。
不要只根据 stderr 是否为空判断成功；有些命令会把进度写到 stderr，有些失败只体现在退出码。

#### `check=True` 适合“任何非零都无法继续”

```python
try:
    completed = subprocess.run(
        ["python3", "-m", "json.tool", "config.json"],
        capture_output=True,
        text=True,
        timeout=5,
        check=True,
    )
except subprocess.CalledProcessError as exc:
    print(f"validation failed with {exc.returncode}")
    print(exc.stderr)
```

`CalledProcessError` 会携带退出码和已捕获输出。
如果某些非零值属于正常业务结果，就使用 `check=False` 并明确分支。

#### 环境变量应从最小增量构造

```python
import os


child_env = os.environ.copy()
child_env.update({
    "LC_ALL": "C.UTF-8",
    "NO_COLOR": "1",
})

completed = subprocess.run(
    ["tool", "inspect", "--format", "json"],
    env=child_env,
    capture_output=True,
    text=True,
    timeout=10,
)
```

完全替换环境可能导致 `PATH`、证书路径或区域设置丢失；盲目继承又可能把代理、调试开关和 Secret 传给子进程。
高风险场景应按允许列表构造环境，并绝不记录整个环境字典。

#### 工作目录和可执行文件要可解释

相对文件参数会基于子进程 `cwd` 解释。
调用日志至少记录可执行文件、脱敏参数、cwd、耗时和退出码。
若工具版本影响行为，还应单独执行版本探测并缓存结果。

#### 输出可能很大

`capture_output=True` 会把全部输出保存在内存。
大量输出应重定向到有容量管理的文件，或使用 `Popen` 流式读取。
读取 stdout 与 stderr 时要避免只读一边导致另一管道填满；优先使用 `communicate()` 或经过验证的异步模式。

#### 本节练习

为 localhost 写一个命令包装器，验证：

- 成功命令返回 0 和标准输出。
- 失败命令保留退出码与标准错误。
- 超时命令不会永久挂住。
- 不存在的可执行文件产生 `FileNotFoundError`。
- 输出日志不包含传入的测试 Token。

### 用户输入为什么不能直接拼进 Shell 命令？

Shell 会解释空格、引号、通配符、重定向、管道、变量展开和命令替换。
把用户输入插入命令字符串，相当于允许输入改变命令结构。

```python
# 危险示例：不要这样做
host = user_input
subprocess.run(f"ping -c 1 {host}", shell=True)
```

输入若包含 `;`、`$()` 或重定向符，Shell 可能执行额外操作。
即便输入来自“内部系统”，资产名称、工单字段和文件名也可能被污染。

#### 默认使用参数列表和 `shell=False`

```python
def ping_once(host: str) -> subprocess.CompletedProcess[str]:
    validated = validate_hostname(host)
    return subprocess.run(
        ["ping", "-c", "1", "--", validated],
        capture_output=True,
        text=True,
        timeout=3,
        check=False,
        shell=False,
    )
```

`--` 在支持它的命令中表示选项结束，可避免以连字符开头的值被解析成选项。
是否支持要查目标命令文档，不能假设所有程序一致。

#### 参数边界不替代业务校验

参数列表可以阻止 Shell 注入，但用户仍可能要求访问不允许的主机或文件。

```python
import re


HOST_PATTERN = re.compile(
    r"(?=^.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*"
    r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$"
)


def validate_hostname(value: str) -> str:
    host = value.strip().lower()
    if not HOST_PATTERN.fullmatch(host):
        raise ValueError("invalid host name")
    if not host.endswith((".internal", ".test")):
        raise ValueError("host is outside the allowed domain")
    return host
```

生产规则还可能需要解析 IP、阻止环回/链路本地/云元数据地址，并以资产授权为准。
这是 SSRF 与权限边界问题，不是一个正则表达式能完全解决的。

#### 必须用 Shell 时固定脚本结构

管道、重定向和 Shell 内建命令有时确实需要 Shell。
此时不要让用户输入参与脚本结构，而是通过环境变量、标准输入或位置参数传值，并进行严格验证。

```python
script = "set -eu; printf '%s\\n' \"$TARGET_NAME\""
env = {"PATH": "/usr/bin:/bin", "TARGET_NAME": validated_name}

subprocess.run(
    ["/bin/sh", "-c", script],
    env=env,
    stdin=subprocess.DEVNULL,
    timeout=2,
    check=True,
)
```

`shlex.quote()` 只针对 POSIX Shell 单个词的转义，不是跨平台安全保证，也不能修复复杂拼接设计。

#### 参数日志必须脱敏

```python
SENSITIVE_FLAGS = {"--token", "--password", "--secret"}


def redact_arguments(arguments: list[str]) -> list[str]:
    redacted: list[str] = []
    hide_next = False

    for argument in arguments:
        if hide_next:
            redacted.append("***")
            hide_next = False
        else:
            redacted.append(argument)
            hide_next = argument in SENSITIVE_FLAGS

    return redacted
```

更好的做法是不把 Secret 放进命令行，因为其他本机用户可能通过进程列表看到参数。
优先使用受权限保护的文件描述符、标准输入或子进程专用环境变量，并了解目标工具是否会再打印它们。

#### 本节练习

测试输入包含空格、以 `-` 开头、分号、命令替换文本、Unicode 和超长字符串。
验证它们要么被当成单个参数，要么在业务校验层被拒绝；测试绝不能真的执行输入中的内容。

### 命令卡住、收到退出信号或执行失败时，脚本该怎样收尾？

给单次命令设置超时，只解决“等待多久”。
完整生命周期还要处理子进程树、临时文件、部分输出、用户中断和下一项任务是否继续。

```python
def run_bounded(arguments: list[str], timeout_seconds: float) -> CommandResult:
    try:
        completed = subprocess.run(
            arguments,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
            check=False,
            shell=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise CommandTimeout(
            f"command exceeded {timeout_seconds:.1f}s: {arguments[0]}"
        ) from exc

    return CommandResult(
        arguments=tuple(arguments),
        returncode=completed.returncode,
        stdout=completed.stdout,
        stderr=completed.stderr,
    )
```

#### 超时后确认子进程是否真的终止

`subprocess.run()` 会处理它直接启动的进程，但命令若再启动孙进程，平台行为会更复杂。
需要管理进程组时，应分别设计 POSIX 和 Windows 行为并做真实测试，不能只凭一个开发平台推断。

#### 信号处理器只设置停止意图

```python
import signal
import threading


stop_requested = threading.Event()


def request_stop(signum: int, frame: object) -> None:
    stop_requested.set()


signal.signal(signal.SIGINT, request_stop)
signal.signal(signal.SIGTERM, request_stop)
```

主循环在安全检查点停止接收新任务：

```python
for target in targets:
    if stop_requested.is_set():
        break
    results.append(check_one(target))
```

信号处理器里不要执行复杂 I/O、获取普通锁或进行长时间清理。
清理由正常控制流和 `finally`/上下文管理器完成。

#### 明确部分成功如何报告

中断发生时，已经完成的结果仍有价值，但报告必须标注不完整：

```python
@dataclass(frozen=True)
class BatchSummary:
    planned: int
    completed: int
    passed: int
    failed: int
    interrupted: bool
```

不能把“已检查 30/100 且全通过”输出成“100 台全部正常”。

#### 清理顺序遵循所有权反向释放

```text
停止接收新任务
  -> 通知正在运行的任务取消
  -> 等待有限宽限期
  -> 终止仍未退出的子进程
  -> 刷新已完成结果和审计记录
  -> 删除临时资源
  -> 返回中断退出码
```

每一步都需要超时，清理本身也不能无限等待。

#### 本章验证清单

```text
[ ] 所有命令使用参数列表，默认 shell=False
[ ] 每次执行都有单次超时和可解释退出码
[ ] stdout/stderr 有大小与脱敏策略
[ ] 用户输入既有参数边界也有业务授权校验
[ ] SIGINT/SIGTERM 停止新任务并有限等待
[ ] 中断报告明确 planned 与 completed
[ ] 异常退出后没有孤儿进程和临时文件
```

系统命令是一个不可信外部依赖。
只有参数、时间、输出、权限和收尾都受控，Python 包装器才比手工 Shell 真正更可靠。

## 第七章 · 把个人脚本变成别人也敢用的 CLI

### 一个脚本什么时候应该拥有正式的命令行接口？

当脚本需要被同事、CI、cron 或其他程序调用时，函数顶部的几个常量已不足以形成稳定接口。
正式 CLI 至少要定义命令名、参数、帮助、退出码、stdout/stderr 分工和兼容策略。

一次性实验可以保持简单；出现以下信号时值得建立 CLI：

- 输入经常变化，用户开始修改源码。
- 同一工具有检查、计划、执行等不同动作。
- 调用者需要稳定的机器可读输出。
- 错误需要映射为可判断的退出码。
- 工具要打包安装，而不是到处复制 `.py` 文件。

#### 从标准库 `argparse` 开始

```python
import argparse
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Options:
    config: Path
    output: str
    dry_run: bool
    concurrency: int


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ops-check",
        description="Run bounded checks against configured targets.",
    )
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--output", choices=("table", "json"), default="table")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--concurrency", type=int, default=8)
    return parser


def parse_options(arguments: list[str] | None = None) -> Options:
    namespace = build_parser().parse_args(arguments)
    if not 1 <= namespace.concurrency <= 64:
        build_parser().error("--concurrency must be between 1 and 64")

    return Options(
        config=namespace.config,
        output=namespace.output,
        dry_run=namespace.dry_run,
        concurrency=namespace.concurrency,
    )
```

把参数解析结果转换成内部数据类，后续代码就不依赖可随意添加属性的 `Namespace`。

#### 子命令对应不同意图

```text
ops-check validate --config targets.json
ops-check plan --config targets.json --output json
ops-check run --config targets.json --concurrency 8
```

`validate` 不访问目标，`plan` 只展示将执行什么，`run` 才产生外部操作。
这种边界比一个同时拥有十几个开关的命令更容易授权和审计。

#### Typer 适合类型驱动的用户体验

Typer 能根据函数签名生成参数、帮助和补全，适合已有依赖管理的项目。
但引入框架仍需考虑版本、启动时间和异常行为；小工具使用 `argparse` 已足够。
具体 API 应以 [Typer 官方文档](https://typer.tiangolo.com/) 为准。

#### CLI 是公共接口

参数重命名、退出码变化、JSON 字段删除都会破坏自动化调用者。
帮助文本、示例和变更记录应与行为一起评审。
废弃参数可以先保留一个版本并输出 stderr 警告，再在明确的主版本边界移除。

#### 本节练习

对 `parse_options()` 直接传列表测试，而不是修改 `sys.argv`：

```python
options = parse_options([
    "--config", "fixtures/targets.json",
    "--output", "json",
    "--dry-run",
    "--concurrency", "4",
])

assert options.output == "json"
assert options.dry_run is True
assert options.concurrency == 4
```

另测缺失配置、非法输出格式、并发为 0 与超过上限的错误路径。

### 命令行参数、配置文件和环境变量冲突时，该听谁的？

配置来源越多，越需要固定优先级和可观察来源。
常见顺序是：内置默认值 < 配置文件 < 环境变量 < 命令行参数。
这不是唯一答案，但必须写进契约并保持一致。

```python
@dataclass(frozen=True)
class RuntimeSettings:
    timeout_seconds: float
    concurrency: int
    api_url: str


DEFAULTS = RuntimeSettings(
    timeout_seconds=3.0,
    concurrency=8,
    api_url="https://api.internal",
)
```

#### 用 `None` 表示用户没有提供覆盖值

如果 argparse 直接把默认并发设成 8，就无法区分“用户显式输入 8”和“没有输入”。

```python
parser.add_argument("--concurrency", type=int, default=None)
```

合并函数再逐层选择：

```python
def first_defined(*values):
    return next((value for value in values if value is not None), None)


concurrency = first_defined(
    cli.concurrency,
    parse_optional_int(env.get("OPS_CONCURRENCY")),
    file_config.get("concurrency"),
    DEFAULTS.concurrency,
)
```

空字符串是否等于未设置要单独定义，不能依赖真假判断。

#### Secret 与普通配置分工

配置文件可以保存 URL、并发和功能开关，但不应把真实 Token 提交到仓库。
Secret 可来自平台 Secret 管理、受权限保护的文件或环境变量。
环境变量并非天然安全：它可能被错误日志、诊断命令或子进程继承泄露。

#### 输出有效配置时标注来源并脱敏

```text
api_url=https://api.internal        source=config
timeout_seconds=5.0                 source=cli
concurrency=8                       source=default
api_token=***                       source=environment
```

这比只打印最终值更利于解释“为什么工具用了这个配置”。

#### 本节练习

构造四层配置矩阵，验证每个字段独立覆盖；再验证非法高优先级值不会静默退回低优先级默认值。
用户显式输入 `OPS_CONCURRENCY=abc` 应报错，而不是悄悄使用 8。

#### 综合实验测试套件：把边界条件固定成回归证据

以下测试继续使用专用假数据，不依赖真实主机和凭证。

```python
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest


def save_document(path: Path, document: object) -> None:
    path.write_text(
        json.dumps(document, ensure_ascii=False),
        encoding="utf-8",
    )


def valid_target(
    *,
    name: object = "fast",
    url: object = "http://127.0.0.1:18080/health/fast",
    timeout: object = 0.5,
) -> dict[str, object]:
    return {
        "name": name,
        "url": url,
        "timeout_seconds": timeout,
    }


def valid_document(*targets: object) -> dict[str, object]:
    return {
        "schema_version": 1,
        "targets": list(targets) or [valid_target()],
    }
```

配置文件边界：

```python
def test_missing_file_reports_config_error(tmp_path: Path) -> None:
    path = tmp_path / "missing.json"

    with pytest.raises(ConfigError, match="cannot stat config"):
        load_targets(path)


def test_directory_is_not_accepted_as_config(tmp_path: Path) -> None:
    with pytest.raises(ConfigError, match="cannot read config"):
        load_targets(tmp_path)


def test_oversized_file_is_rejected_before_parsing(tmp_path: Path) -> None:
    path = tmp_path / "huge.json"
    path.write_bytes(b"x" * 101)

    with pytest.raises(ConfigError, match="exceeds 100 bytes"):
        load_targets(path, max_bytes=100)


def test_invalid_utf8_reports_byte_position(tmp_path: Path) -> None:
    path = tmp_path / "encoding.json"
    path.write_bytes(b'{"targets":[]}' + b"\xff")

    with pytest.raises(ConfigError, match="not valid UTF-8 at byte"):
        load_targets(path)


def test_invalid_json_reports_line_and_column(tmp_path: Path) -> None:
    path = tmp_path / "broken.json"
    path.write_text('{\n  "schema_version": 1,\n', encoding="utf-8")

    with pytest.raises(ConfigError, match=r"invalid JSON at \d+:\d+"):
        load_targets(path)


def test_root_must_be_object(tmp_path: Path) -> None:
    path = tmp_path / "array.json"
    save_document(path, [])

    with pytest.raises(ConfigError, match="root must be an object"):
        load_targets(path)


@pytest.mark.parametrize("version", [None, 0, 2, "1", True])
def test_schema_version_must_be_integer_one(tmp_path: Path, version: object) -> None:
    path = tmp_path / "version.json"
    save_document(path, {"schema_version": version, "targets": [valid_target()]})

    with pytest.raises(ConfigError, match="schema_version must be 1"):
        load_targets(path)


@pytest.mark.parametrize("targets", [None, {}, "fast", [], True])
def test_targets_must_be_non_empty_array(tmp_path: Path, targets: object) -> None:
    path = tmp_path / "targets.json"
    save_document(path, {"schema_version": 1, "targets": targets})

    with pytest.raises(ConfigError, match="non-empty array"):
        load_targets(path)
```

单项目标边界：

```python
@pytest.mark.parametrize("item", [None, [], "host", 3, True])
def test_target_must_be_object(tmp_path: Path, item: object) -> None:
    path = tmp_path / "target.json"
    save_document(path, valid_document(item))

    with pytest.raises(ConfigError, match=r"targets\[0\] must be an object"):
        load_targets(path)


@pytest.mark.parametrize("name", [None, "", "   ", 42, True, []])
def test_name_must_be_non_empty_string(tmp_path: Path, name: object) -> None:
    path = tmp_path / "name.json"
    save_document(path, valid_document(valid_target(name=name)))

    with pytest.raises(ConfigError, match="name must be a non-empty string"):
        load_targets(path)


@pytest.mark.parametrize(
    "url",
    [
        "https://127.0.0.1:18080/health",
        "http://localhost:18080/health",
        "http://127.0.0.2:18080/health",
        "http://example.com/health",
        "file:///etc/passwd",
        "ssh://127.0.0.1/",
        "http://user:pass@127.0.0.1/health",
        "http://127.0.0.1/health#secret",
    ],
)
def test_url_is_restricted_to_exercise_boundary(tmp_path: Path, url: str) -> None:
    path = tmp_path / "url.json"
    save_document(path, valid_document(valid_target(url=url)))

    with pytest.raises(ConfigError):
        load_targets(path)


@pytest.mark.parametrize("timeout", [None, "1", True, False, [], {}])
def test_timeout_must_be_numeric(tmp_path: Path, timeout: object) -> None:
    path = tmp_path / "timeout-type.json"
    save_document(path, valid_document(valid_target(timeout=timeout)))

    with pytest.raises(ConfigError, match="timeout_seconds must be a number"):
        load_targets(path)


@pytest.mark.parametrize("timeout", [-1, 0, 0.01, 10.1, 1000])
def test_timeout_is_bounded(tmp_path: Path, timeout: float) -> None:
    path = tmp_path / "timeout-range.json"
    save_document(path, valid_document(valid_target(timeout=timeout)))

    with pytest.raises(ConfigError, match="between 0.05 and 10"):
        load_targets(path)


def test_unknown_field_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "unknown.json"
    target = valid_target()
    target["timout_seconds"] = 5
    save_document(path, valid_document(target))

    with pytest.raises(ConfigError, match="unknown field"):
        load_targets(path)


def test_duplicate_names_are_rejected(tmp_path: Path) -> None:
    path = tmp_path / "duplicate.json"
    save_document(
        path,
        valid_document(
            valid_target(name="same"),
            valid_target(name="same"),
        ),
    )

    with pytest.raises(ConfigError, match="names must be unique"):
        load_targets(path)
```

执行器边界使用假探针，不启动网络：

```python
def target(name: str) -> Target:
    return Target(
        name=name,
        url=f"http://127.0.0.1:18080/health/{name}",
        timeout_seconds=0.5,
    )


def ok_probe(value: Target) -> Result:
    return Result(
        target=value.name,
        kind=ResultKind.OK,
        latency_ms=1.0,
        message="healthy",
    )


def test_execute_returns_stable_target_order() -> None:
    results = execute(
        [target("z"), target("a"), target("m")],
        ok_probe,
        concurrency=3,
    )

    assert [result.target for result in results] == ["a", "m", "z"]


@pytest.mark.parametrize("concurrency", [-1, 0, 33, 1000])
def test_execute_rejects_unsafe_concurrency(concurrency: int) -> None:
    with pytest.raises(ValueError, match="between 1 and 32"):
        execute([target("a")], ok_probe, concurrency)


def test_expected_result_is_preserved() -> None:
    expected = Result(
        target="a",
        kind=ResultKind.TIMEOUT,
        latency_ms=None,
        message="request timed out",
    )

    results = execute([target("a")], lambda _: expected, concurrency=1)

    assert results == [expected]


def test_unexpected_exception_keeps_target_identity() -> None:
    def broken_probe(value: Target) -> Result:
        raise RuntimeError(f"injected for {value.name}")

    results = execute([target("a")], broken_probe, concurrency=1)

    assert results[0].target == "a"
    assert results[0].kind is ResultKind.INTERNAL_ERROR
    assert results[0].message == "RuntimeError"
    assert "injected" not in results[0].message
```

汇总与报告边界：

```python
def result(name: str, kind: ResultKind) -> Result:
    return Result(
        target=name,
        kind=kind,
        latency_ms=1.0 if kind is ResultKind.OK else None,
        message=kind.value,
    )


def test_summary_counts_known_results() -> None:
    targets = [target("a"), target("b"), target("c")]
    results = [
        result("a", ResultKind.OK),
        result("b", ResultKind.TIMEOUT),
        result("c", ResultKind.HTTP_ERROR),
    ]

    summary = summarize(targets, results)

    assert summary.planned == 3
    assert summary.completed == 3
    assert summary.passed == 1
    assert summary.failed == 2
    assert summary.complete is True


def test_report_has_explicit_schema_version() -> None:
    summary = Summary(1, 1, 1, 0, True)
    document = report_document([result("a", ResultKind.OK)], summary)

    assert document["schema_version"] == 1
    assert document["complete"] is True


def test_dry_run_does_not_write_file(tmp_path: Path, capsys) -> None:
    path = tmp_path / "report.json"
    document = {"schema_version": 1, "complete": True}

    write_report(path, document, dry_run=True)

    captured = capsys.readouterr()
    assert json.loads(captured.out) == document
    assert path.exists() is False


def test_atomic_report_ends_with_newline(tmp_path: Path) -> None:
    path = tmp_path / "report.json"
    document = {"schema_version": 1, "complete": True}

    write_report(path, document, dry_run=False)

    rendered = path.read_text(encoding="utf-8")
    assert rendered.endswith("\n")
    assert json.loads(rendered) == document
```

CLI 协议：

```python
def test_config_error_uses_stderr_and_exit_two(tmp_path: Path, capsys) -> None:
    code = app([
        "--config", str(tmp_path / "missing.json"),
        "--report", str(tmp_path / "report.json"),
    ])

    captured = capsys.readouterr()
    assert code == 2
    assert "configuration error" in captured.err
    assert captured.out == ""


def test_findings_return_exit_one(tmp_path: Path, monkeypatch) -> None:
    config = tmp_path / "targets.json"
    report = tmp_path / "report.json"
    save_document(config, valid_document(valid_target()))

    monkeypatch.setattr(
        __name__,
        "probe",
        lambda value: Result(
            value.name,
            ResultKind.TIMEOUT,
            None,
            "request timed out",
        ),
    )

    code = app([
        "--config", str(config),
        "--report", str(report),
    ])

    assert code == 1
    assert json.loads(report.read_text(encoding="utf-8"))["summary"]["failed"] == 1
```

测试中的 `monkeypatch.setattr()` 目标应指向 CLI 模块实际查找 `probe` 的位置。
若 patch 了定义位置而不是使用位置，测试可能仍访问真实网络。


### 同一个 CLI 怎样同时服务人工操作和自动化系统？

人需要清晰表格、进度和修复建议；自动化需要稳定 JSON、安静 stdout 和可靠退出码。
不要让调用者从彩色自然语言中猜测状态。

#### stdout 给结果，stderr 给诊断

```python
def emit_json(results: list[CheckResult]) -> None:
    payload = {
        "schema_version": 1,
        "results": [asdict(result) for result in results],
    }
    json.dump(payload, sys.stdout, ensure_ascii=False, sort_keys=True)
    sys.stdout.write("\n")
```

日志、重试提示和进度写 stderr，stdout 就能安全管道给 `jq` 或保存文件。

```text
ops-check run --output json > result.json
```

#### JSON 需要版本和稳定类型

不要让字段有时是数字、有时是字符串。
新增可选字段通常比重命名或改变含义安全；破坏性变化应提升 `schema_version`。

```json
{
  "schema_version": 1,
  "complete": true,
  "summary": {"total": 2, "passed": 1, "failed": 1},
  "results": []
}
```

#### 非交互环境不能等待确认

危险动作默认要求 `--dry-run` 或显式 `--apply`，但 CI 中不能弹出无限等待的提示。
可用 `sys.stdin.isatty()` 判断是否交互；非 TTY 且缺少显式确认时直接失败。

#### 退出码形成小而稳定的协议

```text
0  任务完成且未发现问题
1  任务完成但发现巡检问题
2  参数或配置错误
3  任务无法完成
130 用户中断
```

不要为每个细节创建几十个退出码；详细原因放在 JSON 的分类字段里。

#### 本章检查点

```text
[ ] --help 不访问网络和配置文件
[ ] 参数解析可直接传列表测试
[ ] 配置优先级固定且能解释来源
[ ] 非法覆盖值不会静默回退
[ ] JSON stdout 不混入日志
[ ] schema_version 与退出码有兼容承诺
[ ] 危险动作默认 dry-run，非交互不阻塞
```

一个好 CLI 的价值不是参数多，而是人和系统都能预测它下一步会做什么。

## 第八章 · 调用 HTTP API 时，先把失败当成常态

### 发出 HTTP 请求之前，为什么一定要先设置超时？

```mermaid
flowchart LR
    A[构造请求] --> B[连接超时]
    B --> C[读取超时]
    C --> D[校验状态码]
    D --> E[校验响应结构]
    E --> F[成功或可分类失败]
```

任何一步都可能失败；只有响应状态和数据结构都满足契约，调用方才可以把它当作成功。

网络调用可能在 DNS、连接、TLS、发送请求、等待响应或读取响应体任一阶段卡住。
不设超时，就等于允许外部依赖无限占用工作线程和任务槽位。

HTTPX 把超时拆成连接、读取、写入和连接池等待等阶段。
具体行为应以 [HTTPX 官方超时文档](https://www.python-httpx.org/advanced/timeouts/) 为准。

```python
import httpx


timeout = httpx.Timeout(
    connect=2.0,
    read=5.0,
    write=5.0,
    pool=1.0,
)

with httpx.Client(
    timeout=timeout,
    follow_redirects=False,
    headers={"User-Agent": "ops-check/1"},
) as client:
    response = client.get("http://127.0.0.1:8080/health")
    response.raise_for_status()
```

#### 单次超时之外还需要总预算

请求重试三次，每次读取超时 5 秒，不代表总耗时只有 5 秒。
还要加连接、退避和业务处理时间。

```python
from time import monotonic


deadline = monotonic() + 12.0


def remaining_seconds() -> float:
    remaining = deadline - monotonic()
    if remaining <= 0:
        raise TimeoutError("overall request budget exhausted")
    return remaining
```

使用单调时钟计算持续时间，避免系统时钟校准导致负耗时或超长等待。

#### 状态码、响应格式和业务状态分别验证

```python
def fetch_health(client: httpx.Client, url: str) -> dict[str, object]:
    response = client.get(url)
    response.raise_for_status()

    content_type = response.headers.get("content-type", "")
    if "application/json" not in content_type.lower():
        raise ValueError(f"unexpected content type: {content_type}")

    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("health response must be an object")
    if payload.get("status") not in {"ok", "degraded", "failed"}:
        raise ValueError("unknown health status")
    return payload
```

HTTP 200 不保证响应是预期 JSON，更不保证业务状态健康。

#### TLS 验证不能为省事关闭

`verify=False` 会取消服务器证书验证，使客户端容易受到中间人攻击。
内部 CA 应通过受控 CA 文件或系统信任链配置，而不是关闭验证。
日志不得打印认证头、完整查询参数和响应中的敏感字段。

#### 客户端应复用连接并正确关闭

在循环中为每个请求创建新客户端会重复建立连接和 TLS 握手。
用上下文管理器在一个批次内复用客户端，结束时释放连接池。

#### 本节练习

只使用 localhost 假服务，分别模拟：快速 200、延迟响应、500、非 JSON 200、连接拒绝。
断言每类失败映射到不同分类，并测量总耗时确实受预算限制。

#### 使用标准库启动故障可控的 localhost 服务

```python
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from time import sleep


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/health/slow":
            sleep(0.5)

        if self.path == "/health/broken":
            self.send_response(500)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"test failure"}')
            return

        if self.path not in {"/health/fast", "/health/slow"}:
            self.send_response(404)
            self.end_headers()
            return

        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def log_message(self, format: str, *args: object) -> None:
        return


def serve() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 18080), Handler)
    server.serve_forever()


if __name__ == "__main__":
    serve()
```

服务只绑定环回地址。
端口被占用时应换成系统分配的临时端口，并把地址通过 fixture 传给测试，避免并行测试冲突。


### 面对分页、限流和偶发失败，批量调用怎样避免漏数据或重复操作？

列表接口通常只返回一页。
只请求第一页会静默漏数据；无限跟随服务端游标又可能进入循环。

```python
from collections.abc import Iterator


def iter_assets(client: httpx.Client, base_url: str) -> Iterator[dict[str, object]]:
    cursor: str | None = None
    seen_cursors: set[str] = set()

    while True:
        params = {"limit": "100"}
        if cursor is not None:
            params["cursor"] = cursor

        response = client.get(f"{base_url}/assets", params=params)
        response.raise_for_status()
        payload = response.json()

        items = payload.get("items")
        if not isinstance(items, list):
            raise ValueError("items must be an array")

        for item in items:
            if not isinstance(item, dict):
                raise ValueError("asset must be an object")
            yield item

        next_cursor = payload.get("next_cursor")
        if next_cursor is None:
            return
        if not isinstance(next_cursor, str) or not next_cursor:
            raise ValueError("invalid next_cursor")
        if next_cursor in seen_cursors:
            raise RuntimeError("pagination cursor loop detected")

        seen_cursors.add(next_cursor)
        cursor = next_cursor
```

还应设置最大页数或最大项目数，避免错误服务端无限生成新游标。

#### 429 与 `Retry-After`

服务端返回 429 表示速率限制。
客户端应尊重合法的 `Retry-After`，同时设置最大等待时间；不能让恶意或错误响应要求等待数天。
多个客户端同时重试时加抖动，减少惊群。

#### 只重试可能恢复且允许重复的操作

GET 通常可安全重试，但仍要考虑服务端负载。
POST 创建资源可能产生重复副作用，除非 API 支持幂等键。

```python
from uuid import uuid4


operation_id = str(uuid4())
response = client.post(
    f"{base_url}/jobs",
    headers={"Idempotency-Key": operation_id},
    json={"target": "api-a"},
)
```

客户端生成幂等键不代表服务端真的实现去重，必须按 API 契约验证。

#### 分页过程中失败如何恢复

记录最后一个已完整提交页的游标或稳定项目 ID。
输出端使用唯一键去重，使恢复后重复读取一页不会产生第二次副作用。
不要只记录“已读取 300 条”，因为数据集变化后偏移量可能指向不同项目。

#### 本节练习

假服务依次返回两页数据、一次 429、一次 503，再成功。
验证最大尝试次数、退避预算、游标循环保护和项目去重。
报告应区分“全部完成”“部分完成”和“无法确认完成度”。

### 已有 SDK、普通 HTTP 和原生 Socket，应该按什么顺序选择？

选择集成层级时，先选能表达业务协议且维护成本最低的最高层接口：官方 SDK，其次成熟 HTTP 客户端，最后才是原生 Socket。

| 选择 | 优点 | 风险 |
| --- | --- | --- |
| 官方 SDK | 模型、认证和分页常已封装 | 版本兼容、隐藏重试、依赖较重 |
| HTTP 客户端 | 协议透明、工具成熟、易测试 | 需要自己建模分页与错误 |
| Socket | 控制帧与连接细节 | 协议、重连、心跳、背压都要自己承担 |

#### 评估 SDK 不只看“能不能调用”

检查维护活跃度、版本支持、超时配置、重试默认、线程/协程安全、日志脱敏和错误类型。
如果 SDK 隐藏无限重试或无法设置总预算，薄薄一层 HTTP 调用可能更可控。

#### Socket 是协议实现，不是更快的 HTTP

原生 Socket 需要处理消息边界、半包、粘包、编码、心跳、重连、TLS、认证和背压。

```python
import socket


with socket.create_connection(("127.0.0.1", 9000), timeout=2.0) as sock:
    sock.settimeout(2.0)
    sock.sendall(b"PING\n")
    reply = sock.recv(1024)
```

一次 `recv()` 不保证得到一条完整消息。
真实协议必须定义长度前缀、分隔符或固定帧，并循环读取到完整边界。

#### 建立窄适配器隔离依赖

```python
from typing import Protocol


class InventoryClient(Protocol):
    def list_targets(self) -> list[Target]: ...


def build_plan(client: InventoryClient) -> list[Target]:
    return [target for target in client.list_targets() if target.host]
```

业务层依赖自己的窄接口，而不是让 SDK 对象渗透整个项目。
升级 SDK 或替换 HTTP 实现时，变化集中在适配器。

#### 本章检查点

```text
[ ] 连接、读取、写入、连接池和总预算都有界
[ ] HTTP 成功、格式成功、业务成功分别验证
[ ] TLS 验证没有被关闭
[ ] 分页有结束条件、循环检测和数量上限
[ ] 重试只覆盖短暂失败与幂等操作
[ ] SDK 默认行为已核查，Socket 协议边界有测试
```

## 第九章 · 批量巡检要加速，但不能无限并发

### 数据越来越多时，怎样让内存占用保持可控？

第二册前面已经用生成器逐行读取日志。
批量巡检还要避免一次创建几十万个任务、一次收集全部响应体或无限积压待写结果。

#### 从源头到输出都要流式

```python
def run_sequential(targets: Iterable[Target]) -> Iterator[CheckResult]:
    for target in targets:
        yield check_one(target)
```

如果调用者立刻 `list(run_sequential(...))`，流式优势又被取消。
可以边消费边写 JSON Lines：

```python
def write_json_lines(results: Iterable[CheckResult], stream: TextIO) -> int:
    count = 0
    for result in results:
        stream.write(json.dumps(asdict(result), ensure_ascii=False) + "\n")
        count += 1
    return count
```

JSON Lines 允许逐条提交，但消费者需要接受该格式；普通 JSON 数组要额外处理逗号和中断后的完整性。

#### 队列容量就是背压

生产速度持续高于消费速度时，无界队列只是把故障推迟到内存耗尽。
有界队列满后让生产者等待，使压力沿链路返回。

```python
import queue


result_queue: queue.Queue[CheckResult] = queue.Queue(maxsize=100)
```

容量要结合单项大小、可接受内存和下游处理速度评估。

#### 监测内存要看趋势

一次任务峰值高不一定泄漏；每批结束后基线持续上升才更可疑。
记录输入数、在途任务数、队列深度、批次耗时和 RSS，使用相同负载重复多轮比较。

#### 本节练习

用生成器产生十万条小型目标，消费者只计数不保存结果。
验证进程没有创建十万个 Future，队列深度不超过上限，最终计数正确。

### 同时巡检很多目标时，线程、进程和协程该怎么选？

选择并发模型先看等待在哪里，而不是先看哪种语法“高级”。

| 工作类型 | 优先候选 | 原因 |
| --- | --- | --- |
| 阻塞 HTTP、文件、命令 | 线程池 | 复用同步库，等待时可切换 |
| 大量异步网络 I/O | `asyncio` | 单线程管理大量等待任务 |
| CPU 密集计算 | 进程池 | 跨进程利用多个 CPU 核心 |
| 少量任务或风险高动作 | 顺序执行 | 最容易控制与审计 |

#### 有界线程池

```python
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections.abc import Iterable, Iterator


def run_threaded(
    targets: Iterable[Target],
    workers: int,
) -> Iterator[CheckResult]:
    if not 1 <= workers <= 64:
        raise ValueError("workers must be between 1 and 64")

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(check_one, target): target
            for target in targets
        }
        for future in as_completed(futures):
            target = futures[future]
            try:
                yield future.result()
            except ExpectedCheckError as exc:
                yield CheckResult(target.host, False, None, str(exc))
```

这段代码仍会一次提交全部输入。
海量目标应使用滑动窗口，只保持固定数量 Future 在途。

#### 协程不是自动并行

`asyncio` 适合支持异步 API 的 I/O。
在协程里调用阻塞库会卡住事件循环；要改用异步客户端或显式送到线程。

```python
import asyncio


async def check_with_limit(target: Target, semaphore: asyncio.Semaphore):
    async with semaphore:
        return await async_check_one(target)
```

信号量限制同时访问外部系统的数量，但创建无限任务仍消耗内存，因此还需限制任务创建。

#### 进程池需要可序列化边界

传给进程池的函数和数据必须适合跨进程序列化。
不要把打开的客户端、锁和文件句柄塞进任务参数。
CPU 任务还应考虑启动开销、数据复制和容器 CPU 配额。

#### GIL 不是“线程完全不能并发”

在常见 CPython 中，线程执行 Python CPU 字节码受解释器锁影响，但阻塞 I/O 通常会释放等待机会。
因此线程池仍适合很多运维 I/O；CPU 密集任务则通过基准测试决定进程池、原生扩展或其他语言。

Python 3.13 起还提供可选的 free-threaded 构建，能够关闭 GIL，但它不是常规 CPython 安装的默认模式，部分扩展模块也可能重新启用 GIL 或尚未完全兼容。
采用前应在目标发行方式上检查 `sys._is_gil_enabled()`、依赖兼容性与真实负载基准；不要因为存在这一构建选项，就把原本的线程安全假设直接删掉。

#### 本节练习

对同一批 localhost 延迟接口分别用顺序、4 线程和 4 并发协程执行。
记录总耗时、峰值在途数和失败分类，不只比较“哪个最快”。

### 有些目标超时、有些失败时，怎样收回任务并汇总结果？

并发批次通常产生三类结局：成功、已知失败、未知异常。
汇总器必须保留目标身份，不能让一个 Future 的异常终止结果对应关系。

#### `TaskGroup` 建立结构化生命周期

现代 Python 的 `asyncio.TaskGroup` 让子任务生命周期归属于一个上下文。
某个任务抛出未处理异常时，组会取消其余任务，并以异常组报告。
具体语义应核对 [Python `asyncio` 任务官方文档](https://docs.python.org/3/library/asyncio-task.html)。

```python
async def run_batch(targets: list[Target], limit: int) -> list[CheckResult]:
    semaphore = asyncio.Semaphore(limit)
    tasks: list[asyncio.Task[CheckResult]] = []

    async with asyncio.TaskGroup() as group:
        for target in targets:
            tasks.append(group.create_task(check_safe(target, semaphore)))

    return [task.result() for task in tasks]
```

`check_safe()` 应把预期的单目标网络失败转换成结果；真正的编程错误继续触发任务组失败。

#### 取消必须继续传播

```python
async def check_safe(target: Target, semaphore: asyncio.Semaphore) -> CheckResult:
    try:
        async with semaphore:
            return await async_check_one(target)
    except asyncio.CancelledError:
        raise
    except ExpectedCheckError as exc:
        return CheckResult(target.host, False, None, str(exc))
```

吞掉 `CancelledError` 会破坏关闭流程。
若需要清理，在 `finally` 中执行有限清理，然后重新抛出取消。

#### 单项超时和批次截止时间分别设置

```python
async def timed_check(target: Target) -> CheckResult:
    async with asyncio.timeout(3.0):
        return await async_check_one(target)


async def bounded_batch(targets: list[Target]) -> list[CheckResult]:
    async with asyncio.timeout(30.0):
        return await run_batch(targets, limit=16)
```

单项超时保护一个目标，批次截止时间保护整个命令的服务等级目标。

#### 汇总必须标注完整性

```python
@dataclass(frozen=True)
class BatchReport:
    planned: int
    completed: int
    passed: int
    failed: int
    cancelled: int
    complete: bool
```

`complete=False` 时不能把未执行目标算成健康，也不能只按已完成样本计算成功率而不加说明。

#### 第二册收束

批量巡检 CLI 到这里已经具备：

- 明确路径和原子输出。
- 受控子进程与信号收尾。
- 稳定 CLI、配置优先级和 JSON 协议。
- HTTP 超时、分页、限流与幂等意识。
- 流式输入、有界并发、取消和部分结果。

仍需验证的不是“代码能运行”，而是每条失败路径是否在规定时间内停止、释放资源并产生可解释结果。
第三册会把这些行为放进可安装项目，用类型、格式检查、测试、日志和性能诊断守住它们。

#### 第二册综合实验：把所有外部边界放进一次可回放运行

下面的实验不访问生产环境。
它只读取本地 JSON，调用 `127.0.0.1` 假服务，把结果原子写入临时目录。
目标是验证边界行为，不是展示最短代码。

配置输入：

```json
{
  "schema_version": 1,
  "targets": [
    {
      "name": "fast",
      "url": "http://127.0.0.1:18080/health/fast",
      "timeout_seconds": 1.0
    },
    {
      "name": "slow",
      "url": "http://127.0.0.1:18080/health/slow",
      "timeout_seconds": 0.1
    },
    {
      "name": "broken",
      "url": "http://127.0.0.1:18080/health/broken",
      "timeout_seconds": 1.0
    }
  ]
}
```

先定义不会依赖第三方框架的边界模型：

```python
from __future__ import annotations

from dataclasses import asdict, dataclass
from enum import StrEnum
from pathlib import Path
from typing import Any


class ConfigError(Exception):
    pass


class ResultKind(StrEnum):
    OK = "ok"
    TIMEOUT = "timeout"
    HTTP_ERROR = "http_error"
    INVALID_RESPONSE = "invalid_response"
    INTERNAL_ERROR = "internal_error"


@dataclass(frozen=True, slots=True)
class Target:
    name: str
    url: str
    timeout_seconds: float


@dataclass(frozen=True, slots=True)
class Result:
    target: str
    kind: ResultKind
    latency_ms: float | None
    message: str

    @property
    def ok(self) -> bool:
        return self.kind is ResultKind.OK


@dataclass(frozen=True, slots=True)
class Summary:
    planned: int
    completed: int
    passed: int
    failed: int
    complete: bool
```

配置解析集中处理大小、编码、字段、类型、范围和 URL 边界：

```python
import json
from urllib.parse import urlsplit


ALLOWED_KEYS = {"name", "url", "timeout_seconds"}


def require_string(raw: dict[str, Any], key: str) -> str:
    value = raw.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ConfigError(f"{key} must be a non-empty string")
    return value.strip()


def require_timeout(raw: dict[str, Any]) -> float:
    value = raw.get("timeout_seconds", 3.0)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ConfigError("timeout_seconds must be a number")

    timeout = float(value)
    if not 0.05 <= timeout <= 10.0:
        raise ConfigError("timeout_seconds must be between 0.05 and 10")
    return timeout


def require_local_url(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme != "http":
        raise ConfigError("exercise URL must use http")
    if parsed.hostname != "127.0.0.1":
        raise ConfigError("exercise URL must target 127.0.0.1")
    if parsed.username is not None or parsed.password is not None:
        raise ConfigError("URL credentials are not allowed")
    if parsed.fragment:
        raise ConfigError("URL fragment is not allowed")
    return value


def parse_target(raw: object, index: int) -> Target:
    if not isinstance(raw, dict):
        raise ConfigError(f"targets[{index}] must be an object")

    unknown = set(raw) - ALLOWED_KEYS
    if unknown:
        names = ", ".join(sorted(unknown))
        raise ConfigError(f"targets[{index}] unknown field(s): {names}")

    try:
        name = require_string(raw, "name")
        url = require_local_url(require_string(raw, "url"))
        timeout = require_timeout(raw)
    except ConfigError as exc:
        raise ConfigError(f"targets[{index}]: {exc}") from exc

    return Target(name=name, url=url, timeout_seconds=timeout)


def load_targets(path: Path, max_bytes: int = 1_000_000) -> list[Target]:
    try:
        size = path.stat().st_size
    except OSError as exc:
        raise ConfigError(f"cannot stat config: {path}") from exc

    if size > max_bytes:
        raise ConfigError(f"config exceeds {max_bytes} bytes")

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except UnicodeDecodeError as exc:
        raise ConfigError(f"config is not valid UTF-8 at byte {exc.start}") from exc
    except json.JSONDecodeError as exc:
        raise ConfigError(
            f"invalid JSON at {exc.lineno}:{exc.colno}: {exc.msg}"
        ) from exc
    except OSError as exc:
        raise ConfigError(f"cannot read config: {path}") from exc

    if not isinstance(raw, dict):
        raise ConfigError("config root must be an object")
    if raw.get("schema_version") != 1:
        raise ConfigError("schema_version must be 1")

    items = raw.get("targets")
    if not isinstance(items, list) or not items:
        raise ConfigError("targets must be a non-empty array")

    targets = [parse_target(item, index) for index, item in enumerate(items)]
    names = [target.name for target in targets]
    if len(names) != len(set(names)):
        raise ConfigError("target names must be unique")
    return targets
```

HTTP 探针只把预期的外部失败变成结果：

```python
from time import monotonic

import httpx


def probe(target: Target) -> Result:
    started = monotonic()
    timeout = httpx.Timeout(
        connect=target.timeout_seconds,
        read=target.timeout_seconds,
        write=target.timeout_seconds,
        pool=target.timeout_seconds,
    )

    try:
        with httpx.Client(timeout=timeout, follow_redirects=False) as client:
            response = client.get(
                target.url,
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
    except httpx.TimeoutException:
        return Result(
            target=target.name,
            kind=ResultKind.TIMEOUT,
            latency_ms=None,
            message="request timed out",
        )
    except httpx.HTTPStatusError as exc:
        return Result(
            target=target.name,
            kind=ResultKind.HTTP_ERROR,
            latency_ms=None,
            message=f"HTTP {exc.response.status_code}",
        )
    except httpx.RequestError as exc:
        return Result(
            target=target.name,
            kind=ResultKind.HTTP_ERROR,
            latency_ms=None,
            message=type(exc).__name__,
        )

    try:
        payload = response.json()
    except ValueError:
        return Result(
            target=target.name,
            kind=ResultKind.INVALID_RESPONSE,
            latency_ms=None,
            message="response is not JSON",
        )

    if not isinstance(payload, dict) or payload.get("status") != "ok":
        return Result(
            target=target.name,
            kind=ResultKind.INVALID_RESPONSE,
            latency_ms=None,
            message="response status is not ok",
        )

    latency_ms = (monotonic() - started) * 1000
    return Result(
        target=target.name,
        kind=ResultKind.OK,
        latency_ms=round(latency_ms, 3),
        message="healthy",
    )
```

运行器限制并发并稳定排序：

```python
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections.abc import Callable


def execute(
    targets: list[Target],
    check: Callable[[Target], Result],
    concurrency: int,
) -> list[Result]:
    if not 1 <= concurrency <= 32:
        raise ValueError("concurrency must be between 1 and 32")

    collected: list[Result] = []

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        pending = {
            executor.submit(check, target): target
            for target in targets
        }

        for future in as_completed(pending):
            target = pending[future]
            try:
                result = future.result()
            except Exception as exc:
                result = Result(
                    target=target.name,
                    kind=ResultKind.INTERNAL_ERROR,
                    latency_ms=None,
                    message=type(exc).__name__,
                )
            collected.append(result)

    return sorted(collected, key=lambda result: result.target)


def summarize(targets: list[Target], results: list[Result]) -> Summary:
    passed = sum(result.ok for result in results)
    completed = len(results)
    return Summary(
        planned=len(targets),
        completed=completed,
        passed=passed,
        failed=completed - passed,
        complete=completed == len(targets),
    )
```

这里捕获未知异常是为了将单个 Future 关联回目标。
正式工具还必须用 `logger.exception()` 保存 traceback，并根据策略决定内部错误是否让整个批次返回运行时失败。

原子报告写入复用本册文件章节的模式：

```python
import os
import tempfile
from collections.abc import Iterable


def report_document(results: Iterable[Result], summary: Summary) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "complete": summary.complete,
        "summary": asdict(summary),
        "results": [asdict(result) for result in results],
    }


def write_report(path: Path, document: dict[str, Any], dry_run: bool) -> None:
    rendered = json.dumps(
        document,
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    ) + "\n"

    if dry_run:
        print(rendered, end="")
        return

    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: str | None = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary = handle.name
            handle.write(rendered)
            handle.flush()
            os.fsync(handle.fileno())

        json.loads(Path(temporary).read_text(encoding="utf-8"))
        os.replace(temporary, path)
        temporary = None
    finally:
        if temporary is not None:
            Path(temporary).unlink(missing_ok=True)
```

CLI 入口保持参数解析、应用组合和表现分离：

```python
import argparse
import sys


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(prog="ops-check-lab")
    value.add_argument("--config", type=Path, required=True)
    value.add_argument("--report", type=Path, required=True)
    value.add_argument("--concurrency", type=int, default=4)
    value.add_argument("--dry-run", action="store_true")
    return value


def app(arguments: list[str] | None = None) -> int:
    options = parser().parse_args(arguments)

    try:
        targets = load_targets(options.config)
        results = execute(targets, probe, options.concurrency)
        summary = summarize(targets, results)
        document = report_document(results, summary)
        write_report(options.report, document, options.dry_run)
    except ConfigError as exc:
        print(f"configuration error: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        return 130
    except Exception as exc:
        print(f"runtime error: {type(exc).__name__}", file=sys.stderr)
        return 3

    return 0 if summary.failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(app())
```

#### 单元测试覆盖输入和汇总

```python
import json

import pytest


def write_config(path: Path, targets: list[dict[str, object]]) -> None:
    path.write_text(
        json.dumps({"schema_version": 1, "targets": targets}),
        encoding="utf-8",
    )


def test_loads_valid_local_target(tmp_path: Path) -> None:
    path = tmp_path / "targets.json"
    write_config(
        path,
        [{
            "name": "fast",
            "url": "http://127.0.0.1:18080/health/fast",
            "timeout_seconds": 0.5,
        }],
    )

    targets = load_targets(path)

    assert targets == [
        Target(
            name="fast",
            url="http://127.0.0.1:18080/health/fast",
            timeout_seconds=0.5,
        )
    ]


@pytest.mark.parametrize(
    "url",
    [
        "https://127.0.0.1:18080/health",
        "http://localhost:18080/health",
        "http://example.com/health",
        "file:///etc/passwd",
    ],
)
def test_rejects_non_exercise_url(tmp_path: Path, url: str) -> None:
    path = tmp_path / "targets.json"
    write_config(path, [{"name": "bad", "url": url}])

    with pytest.raises(ConfigError):
        load_targets(path)


def test_summary_marks_missing_result_incomplete() -> None:
    targets = [
        Target("a", "http://127.0.0.1:1/a", 0.1),
        Target("b", "http://127.0.0.1:1/b", 0.1),
    ]
    results = [Result("a", ResultKind.OK, 1.0, "healthy")]

    summary = summarize(targets, results)

    assert summary.planned == 2
    assert summary.completed == 1
    assert summary.passed == 1
    assert summary.failed == 0
    assert summary.complete is False
```

#### 故障注入矩阵

| 注入点 | 输入或操作 | 必须观察的结果 |
| --- | --- | --- |
| 路径 | 配置不存在 | stderr 指向路径，退出 2 |
| 路径 | 配置是目录 | 读取错误，不创建报告 |
| 大小 | 超过 1 MB | 解析前拒绝 |
| 编码 | 非 UTF-8 字节 | 报告字节位置，不打印正文 |
| JSON | 少右括号 | 报告行列号 |
| schema | 版本为 2 | 拒绝未知版本 |
| 字段 | `timout_seconds` | 拒绝未知字段 |
| 类型 | 超时为 `true` | 不把布尔值当数字 |
| 范围 | 超时为 0 | 配置失败 |
| URL | 公网域名 | 实验模式拒绝 |
| URL | 包含用户名密码 | 配置失败且不回显密码 |
| 清单 | 重复名称 | 执行前失败 |
| HTTP | 连接拒绝 | 单目标 `http_error` |
| HTTP | 500 | 单目标 `http_error` |
| HTTP | 非 JSON 200 | `invalid_response` |
| HTTP | 慢于超时 | `timeout` 且批次继续 |
| 并发 | 设置为 0 | 执行前拒绝 |
| 并发 | 设置为 1000 | 执行前拒绝 |
| 工作函数 | 抛出未知异常 | 关联目标并标内部错误 |
| 输出 | dry-run | stdout 有文档，磁盘不变 |
| 输出 | 磁盘写失败 | 旧报告完整，临时文件清理 |
| 中断 | SIGINT | 不宣称完整，退出 130 |

#### 实验记录模板

```text
实验时间：
Python 版本：
依赖锁摘要：
操作系统：
输入 fixture：
启动命令：
预期退出码：
实际退出码：
预期结果分类：
实际结果分类：
报告是否完整：
stderr 是否含 traceback：
是否发现 Secret：
临时文件残留：
子进程/线程残留：
最大并发观察值：
总耗时：
结论：PASS / FAIL / NOT VERIFIED
未验证边界：
```

综合实验的价值在于把“会用 API”变成可重复证据。
如果超时、坏响应、中断和写盘失败没有被主动制造过，就不能声称这些路径已经可靠。

#### 手工验收步骤

```text
01. 在临时目录创建虚拟环境。
02. 安装锁定依赖，不复用全局 site-packages。
03. 启动只绑定 127.0.0.1 的假服务。
04. 用端口探测确认监听地址不是 0.0.0.0。
05. 运行合法配置，确认 fast 成功。
06. 运行 slow，确认接近单项超时后返回。
07. 运行 broken，确认 500 被分类。
08. 保存 JSON 报告并重新解析。
09. 检查 stdout 没有混入日志。
10. 检查 stderr 没有 Token 和响应正文。
11. 用 --dry-run，确认正式文件时间戳不变。
12. 在写入前制造权限错误，确认旧报告完整。
13. 把并发设为 0，确认执行前失败。
14. 把并发设为 33，确认执行前失败。
15. 连续运行两次相同输入，比较稳定字段。
16. 在批次中发送 Ctrl-C，确认退出 130。
17. 检查是否残留 `.tmp` 文件。
18. 检查是否残留 Python 进程和监听端口。
19. 保存命令、退出码、报告摘要和环境版本。
20. 把未执行的真实环境检查标成 NOT VERIFIED。
```

#### 第二册完成标准

学习者不需要背下每个 API 参数，但应能独立做出以下判断：

- 路径相对于哪里解析，是否可能逃出允许根目录。
- 写文件失败时，旧版本和临时文件分别处于什么状态。
- 子进程参数是否越过 Shell，退出码和 stderr 如何解释。
- 命令卡住或收到信号时，谁负责停止和回收。
- CLI 的人类输出、机器输出和退出码是否相互独立。
- 配置冲突按什么优先级解决，错误覆盖是否会静默回退。
- HTTP 每个阶段与整个批次的时间预算是多少。
- 分页何时结束，重试是否可能制造重复副作用。
- 并发槽位、队列和内存是否都有限制。
- 部分完成是否被诚实标注，而不是包装成成功。

完成这些测试后，仍然只能证明 localhost 与假数据下的实现行为。
真实证书、网络策略、外部限流、Shell 平台差异和生产容量必须单独验证。

#### 第二册运行记录样例

```text
实验编号：LAB-OPS-HTTP-001
实验目的：验证部分失败不会阻止其他目标完成
输入摘要：sha256:fixture-example
Python：3.12.x
操作系统：本地测试环境
监听地址：127.0.0.1
目标总数：3
并发上限：2
单项超时：fast=1s, slow=0.1s, broken=1s
批次 deadline：未实现，标记 NOT VERIFIED

预期：
- fast 返回 ok
- slow 返回 timeout
- broken 返回 http_error
- planned=3
- completed=3
- complete=true
- CLI 退出码=1

执行：
1. 确认测试端口未被占用。
2. 启动 localhost 假服务。
3. 保存服务 PID 和启动时间。
4. 执行 `ops-check-lab`。
5. 保存 stdout、stderr 和退出码。
6. 重新解析报告 JSON。
7. 检查目标名称排序。
8. 搜索假 Token 与敏感响应正文。
9. 终止假服务。
10. 检查监听端口与临时文件残留。

实际：
- fast.kind=ok
- slow.kind=timeout
- broken.kind=http_error
- planned=3
- completed=3
- passed=1
- failed=2
- complete=true
- CLI 退出码=1
- stdout 未混入诊断日志
- stderr 未发现假 Token
- 无 `.tmp` 残留
- 无测试监听端口残留

结论：PASS

仍未证明：
- 真实内部 CA 配置
- 外部 API 的 Retry-After 语义
- 生产网关重定向策略
- Windows 子进程树终止
- 20,000 目标内存上限
- SIGTERM 在容器编排器中的宽限期
```

再为中断单独留记录，不能用正常运行结果代替：

```text
实验编号：LAB-OPS-SIGNAL-001
实验目的：验证用户中断不会宣称批次完整
目标总数：20
完成后注入：第 5 个结果落盘后发送 SIGINT
预期退出码：130
预期 complete：false
预期 completed：小于 planned
预期临时文件：0
预期活动线程：0
预期监听端口：仅测试服务，清理后为 0
实际退出码：
实际 complete：
实际 completed：
实际清理耗时：
结果：PASS / FAIL / NOT VERIFIED
```

一份可以复核的实验记录，应把输入、命令、预期、实际、残留与未验证边界放在一起。
#### 第二册变更评审矩阵：执行前把高风险边界逐项关掉

评审不需要十份结构相同的卡片，但必须留下可复现证据。
先按下面矩阵选择与本次变更有关的行，再把输入、命令、退出码、残留和未验证边界写入同一份运行记录。

| 边界 | 必须回答 | 最小故障注入 | 通过条件 |
| --- | --- | --- | --- |
| 路径根目录 | 用户路径最终落在哪里 | 用 .. 符号链接和绝对路径尝试逃逸 | 所有越界输入在写入前被拒绝 |
| 原子更新 | 中断时正式文件剩什么 | 在写入 fsync replace 分别失败 | 正式文件始终是完整旧版或新版 |
| dry-run | 预演是否产生副作用 | 给文件和远端适配器加调用计数 | 只有计划和审计发生变化 |
| 子进程参数 | 用户值能否改变命令结构 | 输入空格 分号 命令替换和连字符 | 输入保持单一参数或被拒绝 |
| 子进程超时 | 超时后命令树是否退出 | 测试命令再启动长寿命子进程 | 无孤儿进程且结果分类为超时 |
| CLI 协议 | 人类诊断是否污染机器输出 | 同时制造 warning 和业务失败 | stdout 仍为单一合法 JSON |
| 配置覆盖 | 高优先级错误是否静默回退 | 非法环境值覆盖合法文件值 | 明确失败并报告来源 |
| HTTP 分页 | 重复和游标循环如何停止 | 返回重复项目和循环游标 | 有上限 不漏报 不无限循环 |
| 有界并发 | 目标暴增时在途对象是否受限 | 慢消费者配合大量生成目标 | 内存与窗口而非总量相关 |
| 批次中断 | 部分完成如何诚实呈现 | 不同比例发送 SIGINT 或 SIGTERM | complete 为 false 且有限时间退出 |

高风险动作还要记录审批者、变更窗口、回退触发和审计位置。
矩阵证明的是已执行场景，不是生产环境必然安全；没有运行的行标记为 NOT VERIFIED，不能借用相邻测试的 PASS。

Python 负责调用接口，不替代接口背后的系统知识：进程、信号与权限回到 [Linux 专题](../../systems/linux/README.md)，连接失败与超时机制回到 [网络基础专题](../../systems/network-fundamentals/README.md)。
若脚本开始读写数据库或消费消息，应继续参考 [MySQL 专题](../../data-systems/mysql/README.md) 与 [Kafka 专题](../../data-systems/kafka/README.md)，先明确事务、确认和重复投递语义，再选择客户端写法。

完成第二册后，选一个只读 localhost API 重做综合实验：先顺序执行，再切换有界并发，最后注入超时、坏 JSON 和中断。
三轮必须使用相同输入摘要与输出 schema；性能提升若伴随结果遗漏，应判定为失败而不是优化成功。
保存每轮命令、退出码、峰值在途数和残留检查，作为第三册工程化测试的输入。
