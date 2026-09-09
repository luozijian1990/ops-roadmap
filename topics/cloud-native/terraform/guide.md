# Terraform 学习笔记：CLI 工作流与运维实践

## 第 1 章 · 理解 Terraform 的工作目录与初始化过程

### Terraform CLI 如何连接配置与基础设施管理
<!-- src: md/commands.md -->

Terraform CLI 把配置文件中的目标状态转化为基础设施变更。理解它时，要先区分三个独立对象：CLI 负责读取配置、构造依赖和执行工作流，Provider 负责与具体平台 API 交互，Backend 负责保存状态并按实现提供锁。HCP Terraform 则可以承载远端状态、运行和协作；它不是本地 CLI 的另一个名称。

运维人员的入口是包含根模块 `.tf` 文件的工作目录。同一个命令在不同目录执行，可能指向完全不同的资源集合。自动化中最好显式指定目录，并在执行前检查版本和命令帮助：

```bash
terraform version
terraform -chdir=environments/dev init
terraform plan -help
```

`-chdir` 是全局参数，必须在子命令前。它改变通常的配置读取和文件写入位置，但 CLI 全局配置会更早读取；表达式 `path.cwd` 仍表示原始调用目录，`path.root` 才表示根模块目录。脚本移动到其他目录后出现文件找不到时，先检查这两个上下文，不要马上改绝对路径。

命令列表应以目标二进制的帮助为准。本文区分基础工作流与 query、Stacks 等较新能力，具体版本前提在相应小节说明；采集页面的 latest 标签不作为当前稳定发布版本的证明。

CLI 还支持 `terraform -install-autocomplete` 和对应的 `-uninstall-autocomplete`，会修改 shell 配置，重新加载后生效。版本提示可能使用 Checkpoint；需要控制其网络行为时可配置 `disable_checkpoint`，也可仅禁止匿名去重签名而保留公告检查。这些属于客户端行为，不影响 Provider 的平台认证。

#### 用一个最小对象贯穿工作流

后续基础示例使用 `service-demo`：把环境名和发布代次作为输入，交给 `terraform_data.service` 保存，再通过根输出展示服务名。`terraform_data` 由 `terraform.io/builtin/terraform` 提供，不需要安装外部 Provider；它能展示创建、更新、替换和状态绑定，却不代表创建了一台机器或一个服务。

读这个示例时，可以把一次命令拆为三个问题：CLI 读到了哪些配置和变量，内置 Provider 如何解释对象变化，Backend 把对象记录保存在哪里。云资源章节另用 AWS S3 案例，因为内置对象不会读取云端标签，也不能用来模拟真实云端漂移。

本文新增代码用于阅读与语法检查，命令链和结果节选均为教学示例；运行条件与历史验证证据统一见校验记录。资源生命周期示例即使不访问云端，实际 apply 仍会写状态。

### 工作目录如何保存配置与初始化数据
<!-- src: md/init.md -->

工作目录既包含应版本管理的源文件，也包含运行产生的数据。把两类内容混在一起，会使克隆后的环境难以复现，甚至让状态与凭据进入公开仓库。先辨认文件角色，再决定备份和忽略规则。

| 内容 | 用途 | 管理方式 |
|---|---|---|
| `.tf` 与经过审查的变量文件 | 描述配置和输入 | 可纳入版本管理，排除秘密 |
| `.terraform.lock.hcl` | 记录 Provider 选择和校验和 | 通常提交并审查变化 |
| `.terraform/` | 模块、插件、当前 Workspace 与 Backend 初始化元数据 | 自动生成，不提交 |
| `terraform.tfstate` | local Backend 默认 Workspace 状态 | 受控保存，不能当普通源码 |
| `terraform.tfstate.d/` | local Backend 其他 Workspace 状态 | 同样按敏感状态保护 |

`.terraform/` 可以重建，不等于其中完全没有敏感信息；Backend 参数可能进入初始化元数据。状态也不只是资源 ID 清单，可能包含敏感属性。远端 Backend 下没有本地 `terraform.tfstate`，不能据此判断项目没有状态。

在一个新的配置副本中执行 `terraform init` 后，观察 Provider 和模块安装信息，以及是否出现要求迁移 Backend 的提示。成功提示只说明目录准备完成，不说明配置一定有效或云端资源已经存在。接下来仍需 `validate` 和 `plan`。

排查“另一个目录正常，这个目录报错”时，应比较源码提交、CLI 版本、锁文件、当前 Workspace 与 Backend 选择。直接复制别人的整个 `.terraform/` 会把机器相关路径和运行选择一起复制过来，不利于定位问题。

#### 从文件看到一个完整根模块

下面四个 `.tf` 文件共同组成根模块，不按文件名先后执行。拆文件是为了让人阅读；变量引用会连接它们。将代码块分别理解为目录中的对应文件，而不是四个独立项目。

```text
service-demo/
├── versions.tf
├── variables.tf
├── main.tf
├── outputs.tf
├── dev.tfvars
└── prod.tfvars
```

`service-demo/versions.tf` 限定基础示例使用支持 `terraform_data` 的 CLI；后文测试等新能力还有各自的版本要求：

```hcl
terraform {
  required_version = ">= 1.4.0, < 2.0.0"
}
```

`service-demo/variables.tf` 定义输入的名称、类型与默认值。`generation` 是演示替换的发布代次，不是 Terraform 状态的 serial：

```hcl
variable "environment" {
  type    = string
  default = "dev"
}

variable "generation" {
  type    = number
  default = 1
}
```

`service-demo/main.tf` 保存一个具名对象。`input` 改变通常更新该对象；`triggers_replace` 改变要求替换，适合用来比较两种计划动作：

```hcl
resource "terraform_data" "service" {
  input = {
    name        = "api-${var.environment}"
    environment = var.environment
  }
  triggers_replace = var.generation
}
```

`service-demo/outputs.tf` 同时提供一个可直接计算的名字和一个来自资源结果的结构化值：

```hcl
output "service_name" {
  value = "api-${var.environment}"
}

output "service_info" {
  value = terraform_data.service.output
}
```

这样设计有意保留了求值差异：名字可从输入直接推导，资源输出在首次计划中可能尚未知。两个变量文件会在下一章给出；不提供时使用默认值。

初始化后的 `.terraform/` 内容取决于 Backend 和依赖，apply 后 local Backend 才会有相应对象状态。纯内置 Provider 示例没有需要锁定的外部插件，不应期望出现 AWS 插件目录或 AWS 锁条目。

### 初始化如何准备 Backend 与 Provider
<!-- src: md/commands/init.md -->

初始化为后续工作准备三类依赖：定位状态存储、获取子模块源码、安装 Provider 插件。Backend 决定接下来操作哪份状态，因此初始化提示的目标与资源变更计划一样值得审查。

```mermaid
graph TD
  A[读取根模块] --> B[初始化 Backend]
  B --> C[获取子模块]
  C --> D[解析 Provider 约束]
  D --> E[安装并校验插件]
  E --> F[记录依赖锁文件]
  F --> G[进入校验与计划]
```

```bash
terraform init
terraform init -input=false -lock-timeout=60s -no-color
```

第二条适用于输入已经准备好的自动化环境。`-input=false` 的含义是遇到缺失输入时失败，并不是替用户作出迁移选择。锁等待超时应检查持锁者或调度并发，不宜改成 `-lock=false` 绕过保护。

首次安装会结合各模块的 Provider 约束选择版本并写入锁文件；后续初始化通常复用选择。`-lockfile=readonly` 禁止修改锁文件但仍验证校验和，适合依赖变更已在前置流程完成的流水线；它与 `-upgrade` 冲突。离线环境需配置镜像或使用 `-plugin-dir`，不是简单禁止下载就能满足插件依赖。

`-from-module=SOURCE` 可在空目录复制初始配置，但常规项目更适合先用版本控制工具检出，再初始化。`-backend=false` 和 `-get=false` 只跳过对应步骤，不保证后续命令可用；静态校验可在隔离目录中用前者准备依赖，真实运行仍要正确初始化 Backend。旧 `-get-plugins=false` 已移除，不应从历史教程复制。

#### 把初始化信息对应到配置

若希望把基础示例的 local Backend 路径显式写出，可在原 `terraform` 块中增加以下 backend 子块；这是替换 versions.tf 的写法，不与另一个重复 backend 并存：

```hcl
terraform {
  required_version = ">= 1.4.0, < 2.0.0"
  backend "local" {
    path = "state/service.tfstate"
  }
}
```

相对路径按该配置工作目录解释。Backend 元数据和资源状态不是同一个文件：`.terraform/` 保存“如何访问状态”的运行信息，`state/service.tfstate` 保存对象记录。

外部 Provider 则另有依赖声明。下面是独立 `provider-example/versions.tf`，并非基础示例必需：

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 6.0.0"
    }
  }
}
```

下面是不可直接作为 Terraform 输入的示意输出；它用于说明字段形状，不代表真实执行日志。

```text
Initializing the backend...
Initializing modules...
Initializing provider plugins...
- Finding hashicorp/aws versions matching "6.0.0"...
- Installing hashicorp/aws v6.0.0...
```

在 Backend 阶段失败先检查状态目标；在模块阶段失败检查 source；已经找到 Provider 版本却下载失败，再检查分发渠道。不要把所有初始化问题都归结为云账号认证，安装插件并不要求已经创建云资源。

### 何时重新初始化或单独更新模块
<!-- src: md/commands/init.md; md/commands/get.md -->

修改 Provider 要求、模块来源或 Backend 设置后，应重新初始化。重复 `init` 不会删除现有配置或状态，但新增依赖可能下载失败，Backend 变化也可能要求明确选择迁移方式，因此“可以重复执行”不等于“可以忽略结果”。

| 目的 | 命令 | 需要检查的结果 |
|---|---|---|
| 安装新增依赖 | `terraform init` | 新模块和 Provider 是否正确获取 |
| 在约束内升级依赖 | `terraform init -upgrade` | 锁文件及后续计划变化 |
| 将已有状态迁往新 Backend | `terraform init -migrate-state` | 来源、目的地及各 Workspace 状态 |
| 丢弃旧 Backend 初始化设置 | `terraform init -reconfigure` | 新目标是否确有预期状态 |
| 仅下载模块 | `terraform get` | 不代表 Backend 或 Provider 已初始化 |
| 更新已下载模块 | `terraform get -update` | 模块源码变化和行为差异 |

`-reconfigure` 不迁移旧状态。误把它当迁移命令，可能让下一次计划把原有资源判定为尚未管理。`-force-copy` 会自动同意迁移问题并隐含迁移选项，只有已审查完整迁移目标的专门自动化才适合采用，不应作为默认解决报错的参数。

模块更新与 Provider 锁定是两种机制。不能因锁文件没变，就断言远端模块代码未变；应为模块配置合适的版本或固定引用，并审查依赖更新后的计划。

较新版本允许模块 source 和 version 引用声明 `const = true` 的输入，并为 get 提供变量参数。需要兼容旧 CLI 时使用静态来源和版本声明；需要新能力时，先核对目标版本帮助与变量文档。const 值须在加载配置阶段已知，不能依赖计划才求出的资源属性。

#### 按配置变化选择准备步骤

新增本地模块的例子最容易看清 get 的边界。在独立目录中，根 `main.tf` 调用模块，模块文件 `modules/naming/main.tf` 返回一个固定值：

```hcl
# 根 main.tf
module "naming" {
  source = "./modules/naming"
}
```

```hcl
# modules/naming/main.tf
output "name" {
  value = "api-dev"
}
```

这时 init 可以重新发现模块；get 只处理模块准备，不建立新 Backend。若把外部 Provider 约束从 `= 6.0.0` 改到另一个批准版本，应该审查约束及锁文件变化后重新初始化，必要时使用 upgrade。升级失败时保留原锁文件便于比较，不能用“删除所有缓存和锁”代替诊断。

若把显式 local 路径从 `state/service.tfstate` 改为另一个存储目标，真正想带走旧绑定时选择迁移；若新目标已经有另一份正确状态，只想重建本地连接信息，才选择 reconfigure。两种意图不同，命令不能靠是否消除提示来选择。

## 第 2 章 · 从变更预览到基础设施创建与销毁

### 一次基础设施变更如何经过计划与执行
<!-- src: md/run.md -->

Terraform 的基本工作流是先求出差异，再执行差异。配置声明期望，状态记录资源地址与远端对象的对应关系，Provider 读取远端对象；计划把这些信息合并后提出动作。所有步骤都受当前工作目录和 Workspace 限定，切错目标会改变整个操作范围。

```mermaid
graph TD
  A[配置与变量] --> D[生成计划]
  B[当前 Workspace 状态] --> D
  C[Provider 读取远端对象] --> D
  D --> E[审查资源动作]
  E --> F[执行批准的计划]
  F --> G[记录结果到状态]
  G --> H[复查完整计划]
```

以下命令链用于已经初始化、已配置认证的受控实验环境。本文仅展示流程，没有执行资源变更：

```bash
terraform workspace show
terraform plan -out=tfplan
terraform show tfplan
# 完成审查后才执行下一条
terraform apply tfplan
terraform plan
```

不带 `-out` 的计划通常用于推测变更影响；之后直接运行 `apply` 会重新生成计划，不会自动使用先前屏幕上看过的结果。需要把审批与执行绑定时，应保存计划并限制制品的访问与替换权限。

计划不会执行其中提出的资源增删改，但可能读取远端 API、获取数据源并调用 Provider。因此不能把所有 `plan` 都理解成完全离线的语法检查。对于未知配置，先审查代码和依赖，再决定运行环境。

#### 从同一份配置观察三次变更

沿用第 1 章的 service-demo，第一次以默认输入规划，Terraform 尚无 `terraform_data.service` 的绑定，因此提出创建；环境从 dev 改为 prod 时只改变 input，通常提出更新；generation 从 1 改为 2 时改变 triggers_replace，提出替换。这里的“发布代次”由示例配置定义，不是 CLI 自动维护的部署版本。

```text
阶段             配置输入                    预期动作示意
首次使用         environment=dev generation=1   create
修改环境字段     environment=prod generation=1  update
改变替换触发值   environment=prod generation=2  replace
```

每一行描述前一行已经成功应用后的下一次计划。若只是连续改变量但没有执行过任何计划，状态仍为空，后续计划仍会创建；不能拿这张表当作三条未执行命令的必然输出。根输出 `service_name` 表达配置计算值，`service_info` 表达资源结果，也可能在不同阶段有不同的已知程度。

### 如何阅读执行计划并选择计划模式
<!-- src: md/commands/plan.md -->

阅读计划时，先看每个地址的动作及原因，再看属性差异，最后核对汇总。只看“新增几个、删除几个”会漏掉关键数据库替换，也会把一次替换误读成两个独立资源。

| 标记 | 行为 | 审查重点 |
|---|---|---|
| `+` | 创建 | 是否误连空状态，命名是否冲突 |
| `~` | 原地更新 | API 是否造成服务中断或重启 |
| `-` | 删除 | 是否是预期移除，数据是否已处理 |
| `-/+` | 先删后建的替换 | 哪个属性强制替换，停机与数据后果 |

输出中的未知值表示求值时尚不可确定，不等于空字符串或零。标为 sensitive 的值只是在常规界面隐藏；保存计划仍可能包含明文敏感数据。计划文件不要使用 `.tf` 后缀，也不要作为普通日志公开。

普通模式试图让资源符合配置；`-destroy` 试图删除当前状态管理的对象；`-refresh-only` 只计划让状态和根输出反映外部变化。三种模式互斥。刷新模式自 0.15.4 起提供。刷新不是接纳配置变更，更不会自动把外部修改写回 `.tf`。

```bash
terraform plan -refresh-only
terraform plan -destroy
terraform plan -detailed-exitcode -no-color
```

最后一条退出码为 0 表示无差异，2 表示有差异但成功，1 表示错误。流水线要显式处理 2，不能让统一的“非零即失败”吞掉正常变更。`plan -json` 输出事件流，`show -json tfplan` 则输出计划结构，解析器应分别设计。

#### 配置差异与计划动作对照

下面是对 service-demo 输入的两次独立改动。它们发生在变量文件中，不需要重写 resource 块：

```diff
# 更新 input 的例子
-environment = "dev"
+environment = "prod"
 generation  = 1
```

```diff
# 触发替换的例子
 environment = "dev"
-generation  = 1
+generation  = 2
```

第二种改动的计划节选可以按如下方式阅读。为了突出字段关系，省略了无关属性，这不是完整运行输出：

```text
# terraform_data.service must be replaced
-/+ resource "terraform_data" "service" {
  ~ id               = "old-object-id" -> (known after apply)
  ~ triggers_replace = 1 -> 2 # forces replacement
}
Plan: 1 to add, 0 to change, 1 to destroy.
```

替换同时计入新增和销毁，所以汇总两个数字不代表两个独立的配置地址。`known after apply` 表示新 ID 尚未产生；不能把它作为字符串写到其他配置中。某些生命周期配置会让替换显示为先建后删的 `+/-`，实际顺序以计划为准，不应把所有替换都理解成先删除。

#### 自动化如何保留详细退出码

下面是计划脚本示例，只演示分支处理。把命令放在 if 条件中，可以保留退出码 2，而不会被 `set -e` 提前终止；不要使用 `if ! terraform ...` 后再读取 `$?`，那会拿到取反后的状态。

```bash
set -euo pipefail
if terraform plan -input=false -detailed-exitcode -out=tfplan; then
  plan_status=0
else
  plan_status=$?
fi
case "$plan_status" in
  0) printf '%s\n' '计划成功 当前无差异' ;;
  2) printf '%s\n' '计划成功 有差异 等待审查 tfplan' ;;
  *) printf '%s\n' '计划失败 不进入执行阶段' >&2
     exit "$plan_status" ;;
esac
```

生产流水线还应为本次制品使用独立目录，防止失败后误用上一次留下的同名文件。退出码只回答本次计划是否成功、有无差异，不替代对删除和替换动作的审查。

### 如何传入变量并控制计划范围
<!-- src: md/commands/plan.md -->

输入变量应已经在根模块声明。简单值可以用 `-var`，复杂集合优先放在 `.tfvars` 文件中，减少 shell 与 HCL 两层引号解析带来的误差。下例使用第 1 章已声明的 environment 与 generation，采用 Unix shell：

```bash
terraform plan -var='environment=dev' -var='generation=2'
terraform plan -var-file=dev.tfvars -out=tfplan
```

参数中的赋值等号旁不加空格。变量文件在 Terraform 内部解析，而命令行上的秘密可能进入历史或进程参数；实际凭据应遵循 Provider 推荐的认证渠道。自动化要补齐输入后再设置 `-input=false`，否则它会报错而不是自动补默认值。

`-target` 接受实例、资源或模块地址，还会包含所选对象依赖的对象。因此“指定一个地址”不保证计划只有一个对象。它适合故障恢复或绕过已知限制，长期依靠它拆分大项目，会让未被选中的差异持续隐藏。目标操作结束后必须再看不带 target 的完整计划。

```bash
terraform plan -target='aws_instance.web[0]'
terraform plan -replace='aws_instance.web[0]' -out=replacement.tfplan
```

第一条缩小计算范围；第二条要求替换指定实例，并不替代依赖分析。`-replace` 不能与销毁模式合用。`-refresh=false` 会跳过远端刷新、可能漏掉漂移，且不能用于 refresh-only。`-parallelism` 默认 10，可在 API 限流时调低，但不能修正错误依赖。

新材料的 `-invoke=action.TYPE.LABEL` 是单独调用 Provider action 的能力，会排除其他配置的常规规划。它需要支持该功能的 CLI、Provider 与 action 声明；不能把它当作旧版本 `-target` 的别名。本文不构造无来源支撑的 action 资源实战。

#### 变量声明、文件与命令的对应

第 1 章已经声明 environment 和 generation。`service-demo/dev.tfvars` 与 `prod.tfvars` 分别如下，两份文件是替代输入：

```hcl
# dev.tfvars
environment = "dev"
generation  = 1
```

```hcl
# prod.tfvars
environment = "prod"
generation  = 1
```

```bash
terraform plan -var-file=dev.tfvars
terraform plan -var-file=prod.tfvars -var='generation=2'
```

在本地 CLI 的常规变量赋值中，默认值的优先级最低，其上依次是 `TF_VAR_...`、`terraform.tfvars`、`terraform.tfvars.json`、按字母序的自动变量文件，最后是命令行上的 var/var-file；同层重复赋值再按相应顺序决定。下表是各输入同时存在时的累积结果：

| 输入来源 | environment 的值 | 累积生效值 |
|---|---|---|
| variable 默认值 | dev | dev |
| TF_VAR_environment | staging | staging |
| terraform.tfvars | qa | qa |
| 20-team.auto.tfvars | sandbox | sandbox |
| 命令中先给 -var-file=prod.tfvars | prod | prod |
| 命令末尾再给 -var=environment=canary | canary | canary |

这种规则不等同于任意深度合并 map：变量值通常整体赋值，不能从 Helm Values 的递归合并类推 Terraform 输入行为。HCP 的变量集优先级另有平台规则，不在这张本地表中推导。

对 target，可以设想 `terraform_data.consumer.input` 引用了 `terraform_data.service.output`：只定位 consumer 仍需考虑 service。目标地址不是跨依赖关系的隔离墙；第 5 章会给出对应的实际引用配置。

### 如何执行已保存的计划并处理部分失败
<!-- src: md/commands/apply.md -->

`apply` 有两种输入：不传文件时现场规划并请求批准；传入计划文件时执行该文件，并把传文件的动作视作批准，不再弹出确认。后者不能再叠加 `-var`、`-target` 或计划模式来修改已经确定的动作。

```bash
terraform show tfplan
# 以下会实际修改基础设施
terraform apply -lock-timeout=60s tfplan
```

计划应和配置提交、变量、Workspace、CLI 与依赖版本一起形成审查记录。保存计划不是长期有效的事务承诺；状态变化可能使其过期，远端 API 也可能拒绝原先可行的动作。遇到过期或运行条件改变，应重新计划并重新审查，不能通过强制修改状态让旧计划继续执行。

`-input=false` 只关闭交互，在未提供计划且未批准时会保守地失败。`-auto-approve` 则会跳过现场批准，适合已经有等效控制的自动化，不是解决缺少变量的选项。`apply -json` 同样要求预先提供计划或自动批准，因为机器输出模式不能交互批准。

执行失败时，Terraform 会报告错误并尽可能把已完成的变化记录到状态，正常错误退出流程会释放锁。它不会自动回滚已经成功的资源操作。应先确认成功与失败地址、Provider 错误以及状态是否写入，再解决原因并生成新计划。若状态持久化失败，要按状态恢复流程处理保存的恢复文件，不能把失败简单等同于“什么都没发生”。

例如三个对象中前两个成功、第三个配额不足，修复配额后重新计划应主要补齐剩余差异。若突然提出重新创建前两个，应先检查 Backend 和状态，暂缓执行。

#### 将批准对象固定为一份制品

可以用以下发布记录串联一次执行。记录表是团队可自定义的审查资料，不是 Terraform 固定 JSON 格式：

| 记录项 | 示例 |
|---|---|
| 配置提交 | commit-A |
| 工作目录 / Workspace | service-demo / development |
| 输入 | dev.tfvars，generation=2 |
| 待执行制品 | run-042/tfplan |
| 执行工具链 | 已批准的 CLI 和 Provider 选择 |

假设执行中 A 对象成功、B 因权限失败：先看诊断能否确认 B 没有完成，再确认 A 已被记入状态。修正权限后重新计划，才能得到剩余差异。若报错发生在最终状态上传而不是 B 的 API 调用，实际资源与远端快照可能已经分离，应转到第 9 章调查恢复文件；不能再用这张简单的 A/B 时间线推断状态完整。

### 如何审查销毁范围并完成资源清理
<!-- src: md/commands/destroy.md -->

销毁依据当前 Workspace 的状态确定管理对象。它不会扫描整个云账号清空所有资源，也不会删除 `.tf` 配置；因此适合已确认不再需要的临时环境，但前提是当前状态的管理边界正确。

```bash
terraform workspace show
terraform state list
terraform plan -destroy -out=destroy.tfplan
terraform show destroy.tfplan
# 仅在逐项审查范围和数据处理后执行
terraform apply destroy.tfplan
```

需要分离预览和执行时使用上述链路。`terraform destroy` 是销毁模式的便利入口，不接受计划文件；不能写成 `terraform destroy destroy.tfplan`。直接销毁仍会生成计划并要求确认。

审查删除顺序、共享资源、持久化数据和删除保护，尤其要确认其他系统是否还引用这些对象。Terraform 的管理边界不代表业务依赖边界。`-target` 销毁仍涉及依赖分析，不适合凭地址猜测最终范围，必须以实际销毁计划为准。

执行结束后，复查状态清单、销毁计划与平台资源。失败的删除可能留下残余费用；反过来，状态清空也不能证明没有脱管资源。普通 `plan` 在配置仍声明资源时会提出重新创建，这是预期结果，不应误认为销毁失败。结束临时环境时还应停用可能再次运行该配置的流水线。

#### 销毁完成后再计划为何仍有新增

仍以只包含一个内置对象的 service-demo 为例，按阶段可以推导：

| 阶段 | 配置中的声明 | 状态中的绑定 | 计划结果示意 |
|---|---|---|---|
| 销毁前 | service 存在 | service 存在 | destroy 模式提出删除 1 个对象 |
| 已销毁 | service 仍存在 | 已无该绑定 | destroy 模式没有剩余删除 |
| 再做普通 plan | service 仍存在 | 已无该绑定 | 普通模式提出创建 1 个对象 |

因此，“销毁后普通计划有新增”是配置仍然声明目标的自然结果。要停止这个环境，除了清理资源，还需让调度系统不再自动应用原配置。迁移到真实 S3 案例时，非空桶的删除行为又受 Provider 配置影响，不能把内置对象的简单清理过程当作所有云资源的删除保证。

## 第 3 章 · 建立并管理 Terraform 平台认证

### CLI 如何获取平台访问凭据并保存登录状态
<!-- src: md/auth.md; md/commands/login.md -->

平台认证让 CLI 能访问 HCP Terraform 或 Terraform Enterprise 的运行、状态和私有注册表服务。它和 AWS、Azure 等 Provider 的云端凭据属于不同认证链：成功登录 Terraform 平台，并不说明某次远端运行已经拥有云账号权限。

交互式登录会打开浏览器，引导取得 API token，并在写入前说明保存位置。默认目标是 `app.terraform.io`；企业部署应显式写出自己的服务主机：

```bash
terraform login
terraform login terraform.example.com
```

第二条中的域名是占位示例。平台必须支持 Terraform login 协议，不是任意有登录页面的站点都能接受这个命令。无人值守流水线不适合浏览器登录，应通过 CLI 凭据配置、环境变量或凭据 helper 提供预先分配的令牌。

默认令牌以明文存入 `credentials.tfrc.json`，通常位于用户 Terraform 配置目录，具体路径以登录提示为准。若组织已有秘密管理系统，可通过 helper 保存和取回凭据。检查认证时，应验证目标服务上的必要只读访问，而不要把完整凭据文件打印到 CI 日志。

欧洲组织的官方登录入口为 `terraform login app.terraform.io/eu`。使用前应核对组织所属区域及目标 CLI 支持，不能自行把 `/eu` 拼到所有企业主机上。

#### 从凭据文件认识主机绑定

默认 JSON 凭据文件结构可按下例理解，token 是不可用的教学占位值：

```json
{
  "credentials": {
    "app.terraform.io": {
      "token": "REPLACE_WITH_USER_OR_TEAM_TOKEN"
    }
  }
}
```

主机键用于选择 Terraform 服务请求的身份。连接企业主机时，需要其自身的条目；给 app.terraform.io 的 token 不会自动覆盖 terraform.example.com。

| 请求链路 | 身份由哪里提供 | 主要访问对象 |
|---|---|---|
| 本地 CLI → HCP Terraform | 平台 token、CLI 凭据配置或 helper | Workspace、状态、私有模块等服务 |
| 本地 Provider → AWS | Provider 支持的 AWS 认证链 | 云端资源 API |
| HCP 运行环境 → AWS | 远端运行配置的凭据或工作负载身份 | 云端资源 API |

第三行尤其容易遗漏：本地机器能访问 AWS，不意味着远端运行环境取得了相同身份。连接失败时先确定是哪条请求链路失败，再查该链路的凭据来源。

### 退出登录后还需要如何处理令牌
<!-- src: md/commands/logout.md -->

`logout` 删除本地保存的凭据，不会在远端撤销 API token。因此“退出成功”只证明这一个本地来源已经移除，不能证明令牌失效，更不能作为凭据泄漏后的完整处置。

```bash
terraform logout
terraform logout terraform.example.com
```

默认处理 `app.terraform.io`，显式主机则处理对应凭据。使用 helper 时，Terraform 调用 helper 的 `forget` 操作，实际删除方式由 helper 决定。退出前后应保持同一主机名称，否则可能清理错条目。

如果离职交接、设备丢失或日志泄漏涉及令牌，还需在平台撤销旧 token，更新依赖该 token 的自动化，并确认旧凭据请求已被拒绝。不要通过重新复制旧凭据文件来测试“退出是否可恢复”。

退出后 CLI 仍能访问平台时，优先检查 `TF_TOKEN_...` 环境变量、其他 CLI 配置和 helper 是否还提供凭据。认证来源可能不止一处；仅查看文件消失不足以判断认证终止。学习练习可画出“创建令牌—本地保存—请求携带—本地移除—平台撤销”的过程，区分设备上的登录状态和服务器上的令牌有效性。

#### 一个退出后仍可访问的例子

假设机器同时保存了上述 JSON 条目，又由启动脚本设置了 `TF_TOKEN_app_terraform_io`。logout 删除文件条目之后，新的 CLI 进程仍会选择环境变量里的 token，因而可以继续访问平台。

排查顺序是确认实际主机、检查环境变量是否被设置、检查显式 CLI 配置与 helper，然后核对平台端是否撤销令牌。检查“是否设置”即可，不必输出变量内容；例如以下 shell 片段仅报告存在性：

```bash
if [ -n "${TF_TOKEN_app_terraform_io:-}" ]; then
  printf '%s\n' '当前进程仍有平台 token 环境变量'
fi
```

只删除文件不会影响父进程的环境；只清空当前 shell 也不会更新其他运行中的作业。平台撤销才改变服务器是否接受旧 token，客户端配置清理则决定后续进程从哪里取身份。

## 第 4 章 · 调试表达式并检查配置质量

### 如何在 Console 中理解表达式与求值上下文
<!-- src: md/code.md; md/commands/console.md -->

表达式调试、格式统一和配置校验解决不同层次的问题。Console 适合确认一个表达式究竟产生什么类型和值；fmt 管理排版；validate 检查配置内部一致性。把三个工具组合起来，能在接触真实基础设施之前排除大量输入和配置错误。

在没有资源的独立目录中，也可以测试内置函数：

```bash
printf '%s\n' 'split(",", "web,api")' | terraform console
```

预期得到两个字符串组成的列表。管道输入多行表达式时通常只打印最后一个结果，不适合把它当作逐行打印日志的解释器。交互模式可用 `exit`、Control-D 或 Control-C 退出。

普通 Console 以根模块为求值作用域，结合配置与当前状态。尚未创建的资源属性可能显示 `known after apply`，这表示未知，不能强行当作实际值。远端 Backend 下会读取远端状态，并持有状态锁；长时间开着会影响其他状态操作。

较新版本的 `-scope='module.child["key"]'` 可切到子模块实例，`-plan` 可先规划再根据计划状态求值。使用前核对目标 CLI 是否支持。计划求值还可能运行 external 数据源的外部命令，因此查看未知配置前需要了解其行为。表达式返回正确只证明当前上下文的计算结果，不证明云资源操作会成功。

#### 先定义输入，再检查集合表达式

在 service-demo 新增 `locals.tf`，不涉及云端对象：

```hcl
locals {
  apps = {
    web = { region = "ap-southeast-1", enabled = true }
    api = { region = "eu-west-1", enabled = false }
  }
}
```

以下是 Console 对话示意，`>` 是提示符，不属于表达式：

```text
> local.apps.web.region
"ap-southeast-1"
> keys(local.apps)
["api", "web"]
> { for name, app in local.apps : name => app.region if app.enabled }
{"web" = "ap-southeast-1"}
> type(local.apps.web.enabled)
bool
```

过滤式先遍历键值对，再检查 enabled，仅保留符合条件的项；结果的值被投影为 region，而不是保留原对象。keys 的输出顺序按键排序，不要把 map 的书写顺序当作部署顺序。

对第 1 章的 `"api-${var.environment}"`，配置输入齐全就可推导值；`terraform_data.service.id` 在尚无对象状态时则不能得出真实 ID。前者是计算，后者依赖生命周期结果。调试时先用 `type()` 确认布尔、字符串与对象，再检查字段；不要把文本 `"false"` 当作布尔 false 使用。

### 如何统一配置格式并把格式检查接入自动化
<!-- src: md/commands/fmt.md -->

格式差异会淹没真正的配置变化。`terraform fmt` 按 Terraform 约定重写文件，让代码审查聚焦资源、变量和依赖。它的格式规则不是可任意定制的团队主题，且不同 CLI 版本可能有细微变化，因此团队与 CI 应统一版本。

```bash
# 本地整理当前目录及子目录
terraform fmt -recursive
# CI 只检查 不改文件
terraform fmt -check -diff -recursive
```

默认只扫描当前或指定目录，`-recursive` 才包含子目录。`-check` 隐含禁止写入；退出码 0 表示格式符合要求，非零则需查看输出文件名、差异或解析错误。`-diff` 本身不禁止改写文件，单独用它做审查时容易误以为只有预览，应结合 `-check` 或 `-write=false`。

命令也可接收文件路径，或用 `-` 从标准输入读取。生成器可以先将结果送入格式化过程，再落盘，避免手写与生成配置的样式不同。

格式通过并不表示属性名、变量引用或 Provider 配置正确。练习时可给一个变量块制造缩进不一致，观察检查失败，再格式化并重新检查；随后把变量引用写错，验证 fmt 与 validate 的分工。历史 `0.12upgrade`、`0.13upgrade` 仅存在于相应版本，迁移旧配置时应使用对应升级指南，不能假定当前 CLI 仍有这些命令。

#### 只改变排版的差异

假设 `variables.tf` 中的这个块语法合法，但风格不统一：

```hcl
variable "environment" {
 type=string
 default="dev"
}
```

格式化后的变化示意为：

```diff
 variable "environment" {
- type=string
- default="dev"
+  type    = string
+  default = "dev"
 }
```

这里没有改变变量类型或默认值，所以它适合作为格式检查反例。若把 `var.environment` 拼成 `var.environmnt`，HCL 仍能解析，却变成引用问题，应由语义检查发现。语法解析、规范排版、引用正确是三个不同判断；fmt 不承担后两者的全部职责。

### 配置校验能发现哪些问题及如何读取诊断结果
<!-- src: md/commands/validate.md -->

`validate` 检查语法、属性和类型等内部一致性，不验证远端状态服务是否可用，也不验证云账号配额、权限或资源存在性。它适合编辑器、提交检查和模块 CI；某个 Workspace 下的真实变量与状态上下文应交给 plan 验证。

```bash
terraform init -backend=false -input=false
terraform validate -json > validation.json
```

初始化仍可能安装 Provider 和模块；`-backend=false` 只跳过 Backend，不能据此宣称全过程不联网。示例应在隔离配置副本运行，真实执行目录还需正常初始化状态目标。

正常 JSON 包含 `format_version`、`valid`、`error_count`、`warning_count` 与 `diagnostics`。诊断的 `severity` 决定是否为错误，`summary` 和 `detail` 用于说明原因，`range` 和 `snippet` 可辅助编辑器定位，但位置字段可能缺失。`valid=true` 可以同时有 warning，需要按内容判断，不能一律忽略。

消费工具应接受兼容的小版本新增字段，拒绝不支持的格式主版本，并处理启动阶段输出不是 JSON 的情况。先检查进程退出码，再解析结构和有效性；不能仅因为生成了 `.json` 文件就判定通过。

较新 validate 接口可能支持变量参数，但不能假定旧 CLI 提供相同能力。通用检查采用不带变量参数的 validate，具体输入与状态上下文采用 plan 验证；下面用错误引用说明诊断阅读。

#### 把诊断定位回代码

在已经声明 environment 的根模块中，假设 `outputs.tf` 只有以下三行。它是有意设计的语义错误示例，语法仍合法：

```hcl
output "service_name" {
  value = var.environmnt
}
```

对应的诊断结构可按下例理解。内容是精简示意，range 用于定位第 2 行，不保证与每个 CLI 版本逐字相同：

```json
{
  "format_version": "1.0",
  "valid": false,
  "error_count": 1,
  "warning_count": 0,
  "diagnostics": [
    {
      "severity": "error",
      "summary": "Reference to undeclared input variable",
      "range": {
        "filename": "outputs.tf",
        "start": {"line": 2, "column": 11, "byte": 34},
        "end": {"line": 2, "column": 25, "byte": 48}
      }
    }
  ]
}
```

修正引用的完整输出块如下；不要再次声明第二个同名 output，应替换错误块：

```hcl
output "service_name" {
  value = "api-${var.environment}"
}
```

排查顺序是看 valid 和 error_count，找到 error 的 summary，再按 filename/line 回到文件检查拼写。range 可能为空，工具仍应显示 summary；只有 warning 时不能直接标为配置无效。这些错误属于语义层；本节仅说明诊断形状，不把示意结果当作执行记录。

## 第 5 章 · 查看依赖关系、输出值与资源状态

### 如何从依赖图理解资源之间的关系
<!-- src: md/inspect.md; md/commands/graph.md -->

检查基础设施时，应按问题选择视图：graph 解释依赖，output 提供对外接口，show 展开计划或状态，state list/show 定位具体实例。它们读取的不是同一层数据，不能互相替代。

资源引用会建立依赖，影响 Terraform 的操作顺序。下面的教学图表达应用依赖子网、子网依赖网络；箭头在本图中表示先准备前者再准备后者，不是原始 DOT 边方向的复刻：

```mermaid
graph TD
  A[网络] --> B[子网]
  B --> C[应用实例]
  C --> D[根模块输出]
```

```bash
terraform graph -type=plan > graph.dot
# 已安装 Graphviz 时渲染
dot -Tsvg graph.dot -o graph.svg
terraform graph -type=plan -draw-cycles > cycles.dot
```

`terraform graph` 输出的是 DOT，不是 Mermaid。`-draw-cycles` 应与具体操作类型配合，便于排查循环依赖。较新版本默认显示简化的资源依赖图；显式 `-type=plan` 可获取包含运行细节的操作图。`-plan=tfplan` 则生成指定计划的 apply 图。

图能显示顺序约束，不能直接证明业务请求路径、网络连通性或资源健康。若图中出现循环，应回查引用或显式依赖为何互相要求，而非通过提高并发解决。graph 的可用参数随版本变化，跨版本脚本需先核对帮助。

#### 引用如何变成依赖边

在第 1 章 service-demo 的 `main.tf` 后增加以下资源，原 service 块保持不变：

```hcl
resource "terraform_data" "consumer" {
  input = terraform_data.service.output
}
```

consumer 的 input 需要 service 的 output，因此 Terraform 必须考虑 service 的结果。下面是解释这一关系的 DOT 示意，不是实际 graph 输出的完整节点集合：

```dot
digraph dependencies {
  "terraform_data.consumer" -> "terraform_data.service";
}
```

此处 DOT 箭头表示“左边依赖右边”，与上面教学 Mermaid 中的准备顺序箭头含义不同。真实操作图还会包含 Provider、展开节点等细节。若把 service 的 input 又改为引用 consumer.output，就会形成循环；加大 parallelism 不能解决互相等待的逻辑。

### 如何提取输出值并选择适合脚本的表示形式
<!-- src: md/commands/output.md -->

根模块 output 是配置作者提供给调用者的接口。`terraform output` 从状态中读取这些值，不会实时查询负载均衡器是否健康，也不会自动展示所有子模块内部输出。要公开子模块输出，应由根模块显式转发。

```hcl
output "service_endpoint" {
  value = module.service.endpoint
}
```

该片段要求已有 `module.service` 且导出 `endpoint`，不能单独作为完整配置运行。对已应用且包含对应输出的配置，可以选择以下表示：

```bash
terraform output
terraform output -raw service_endpoint
terraform output -json
terraform output -json instance_ips | jq -r '.[0]'
```

普通输出供人阅读，格式可能变化。`-raw` 适用于字符串、数字、布尔，复杂对象和集合使用 JSON。无名称的 JSON 是按输出名组织的对象，指定名称后则直接返回该输出值，脚本要与调用方式保持一致。

`sensitive` 不表示加密。按名称请求敏感输出，或使用 `-json`、`-raw`，都可能显示明文；不要把这些结果无筛选地附在工单或流水线日志中。新版本的 ephemeral 值不写入计划和状态，因此不能指望 output 把它们重新取回；根输出也不能随意套用子模块 ephemeral 输出能力。

输出缺失时，先检查 Workspace、根 output 声明与最近一次状态更新，而不是把空值当作平台服务已经删除。学习时可用本地常量输出比较四种命令的表示差异，无需真实云账号。

#### 同一个输出的三种表示

假设 service-demo 已按 environment=dev 成功写入状态，`terraform output service_name` 的人类表示为 `"api-dev"`，`terraform output -raw service_name` 为不带引号的 `api-dev`，`terraform output -json service_name` 为 JSON 字符串 `"api-dev"`。外观相近不代表脚本用途相同。

不指定名称的 `terraform output -json` 会多一层元数据封装。以下只展示 service_name 这一项，实际基础配置还包含 service_info：

```json
{
  "service_name": {
    "sensitive": false,
    "type": "string",
    "value": "api-dev"
  }
}
```

因此，处理整组输出应访问 `.service_name.value`，处理具名 JSON 则直接使用值。假设资源输出已经确定，`terraform output -json service_info` 的值结构示意为：

```json
{"environment": "dev", "name": "api-dev"}
```

这个对象不能使用 raw。根输出只有在适当的状态更新后才能被 output 命令读取，单纯把一个 output 块写入源码并不等于已保存输出。

#### 根模块怎样转发子模块接口

前面的 endpoint 片段可以用以下完整调用关系补齐。在独立例子的根 `main.tf` 定义模块，在 `modules/service/outputs.tf` 定义输出，根输出再引用它：

```hcl
# 根 main.tf
module "service" {
  source = "./modules/service"
}
```

```hcl
# modules/service/outputs.tf
output "endpoint" {
  value = "https://api.example.invalid"
}
```

该 URL 是教学占位值，模块没有创建网络服务。由根 `service_endpoint` 转发后，调用者不必知道模块内部如何生成地址；改变模块内部实现时，只要该输出接口保持稳定，根调用关系就可以不变。

### 如何检查计划文件与状态快照
<!-- src: md/commands/show.md -->

`terraform show` 不带文件时查看最新状态快照，带计划文件时展示待执行动作，带状态文件时查看指定快照。明确对象与采集时间，才能避免拿昨天的状态回答今天的故障问题。

```bash
terraform show tfplan
terraform show -json tfplan > plan.json
terraform show -json > state-view.json
```

计划 JSON 还包含配置和相关状态信息；它不是 `plan -json` 的执行事件流。状态的 show JSON 是为消费工具提供的视图，也不等于可直接推送回 Backend 的原始状态格式。恢复应使用 state pull 得到的快照或可靠备份，不应使用这里的 `state-view.json`。

读取快照需要兼容的 Provider Schema。升级 Provider 后若提示状态 Schema 不匹配，应先确认版本及升级路径，在受控流程中审查 refresh-only 计划。旧 refresh 会自动批准状态刷新，不适合作为只读检查的隐式前置动作。

JSON 中敏感值可能明文出现；文件权限、保留期与共享范围应和状态一致。脚本还应识别格式版本、缺失字段、未知值和子模块层级，不能假设所有资源都在根模块。show 成功说明能解码该快照，不说明远端基础设施仍与快照一致。

#### 从计划结构中提取动作

`show -json tfplan` 可包含以下 resource_changes 节选。示例仅保留地址和动作，不能作为完整计划文件执行：

```json
{
  "format_version": "1.2",
  "resource_changes": [
    {
      "address": "terraform_data.service",
      "change": {"actions": ["delete", "create"]}
    }
  ]
}
```

```bash
jq '.resource_changes[]? | {address, actions: .change.actions}' plan.json
```

actions 是数组，替换由 delete/create 的组合表示；不能只读取第一项后把替换统计成单纯删除。状态视图则从 `values.root_module.resources` 及递归的 child_modules 读取资源，不应对它使用 resource_changes 路径。

一个无子模块的状态视图节选如下，values 内的 id 是占位值：

```json
{
  "format_version": "1.0",
  "values": {
    "root_module": {
      "resources": [
        {"address": "terraform_data.service", "values": {"id": "example-object-id"}}
      ]
    }
  }
}
```

两种 JSON 都是展示接口，完整原始状态还含有恢复所需的其他元数据。读取工具用这些接口即可，恢复工具应另用原始状态快照。

### 如何从资源清单定位到单个资源实例
<!-- src: md/commands/state/list.md; md/commands/state/show.md -->

排查某个资源时，先从状态清单找到精确地址，再查看属性。state list 按模块深度再按字母排序，结果是 Terraform 管理地址，不是云平台的全量资源列表。

```bash
terraform state list
terraform state list module.service
terraform state list -id=i-0123456789abcdef0
terraform state show 'module.service.aws_instance.web["blue"]'
```

资源 ID 是占位示例，需替换为实际值。按模块地址过滤会包含其子模块；资源未带索引时可能匹配多个实例。state show 则要求单个实例，带 count 或 for_each 的地址需要写数字索引或字符串键，并在 Unix shell 中用单引号保护方括号与双引号。

查看属性有助于核对 ID、区域相关属性和计算值，但这些来自状态，并非刚刚读取的云端事实。发现与控制台不一致时，应先检查采集时点、账号和区域，再用受控计划调查漂移。

`terraform state show -json ADDRESS` 要求 Terraform 1.16 或更高版本。旧版本自动化使用 `terraform show -json` 并递归遍历资源树，按 address 过滤。输出中的只读属性不能整段复制成 resource 配置，否则可能违反 Provider Schema。

#### 先过滤范围再查看一个实例

假设在第 7 章的 for_each 变体中，blue 和 green 两个实例均已存在，state list 结果示意为：

```text
terraform_data.service["blue"]
terraform_data.service["green"]
```

```bash
terraform state list terraform_data.service
terraform state show 'terraform_data.service["blue"]'
```

第一条仍可能显示两个实例；第二条只展示 blue。属性节选示意为：

```text
# terraform_data.service["blue"]:
resource "terraform_data" "service" {
  id     = "blue-object-id"
  input  = "api-blue"
  output = "api-blue"
}
```

id 和 output 来自资源记录，不能整段复制成新 resource 的输入。资源迁入 module.service 后，地址前再增加 `module.service.`；相同类型和本地名称不意味着根模块与子模块中的两个地址是同一个对象。

## 第 6 章 · 将已有基础设施纳入 Terraform 管理

### 导入如何建立已有资源与配置的管理关系
<!-- src: md/import.md -->

导入解决的是“对象已经存在，但 Terraform 尚未管理它”的问题。核心结果是把一个真实对象绑定到一个配置地址并记录到状态，不是把对象复制一份，也不是自动把整个云环境变成完整代码。

```mermaid
graph TD
  A[确认对象与管理归属] --> B[准备资源配置]
  B --> C[确定 Provider 与导入标识]
  C --> D[建立状态绑定]
  D --> E[审查导入后计划]
  E --> F[修正配置与预期差异]
```

传统 `terraform import ADDRESS ID` 直接写状态，不生成 resource 配置。配置式 `import` 块可纳入 plan/apply 审查，适合可追踪的批量接管；若需要配置生成，应使用该流程或后文 query，而不是期待传统命令输出完整 `.tf`。

每种资源是否支持导入、ID 如何构成，都取决于对应 Provider 的资源文档。一次 CLI 调用通常针对一个目标，不能据此导入整个 VPC 及全部子资源；个别 Provider 的复杂导入可能产生次级绑定，需要逐项查看导入输出并补齐配置。

同一对象应只绑定一个资源地址，也不能由另一个状态重复管理。导入前应确认原有自动化归属，否则两个状态会对同一对象作出互相冲突的变更。导入完成的判断包括正确地址、正确对象 ID、正确管理账号，以及后续计划没有意外替换或删除，不能止于一条成功提示。

#### 先写清要接管的对象

假设已有一个桶 `example-existing-bucket-123456789012`，位于 ap-southeast-1，并确认没有其他 Terraform 状态管理它。名称仅作占位，实际接管必须换成经核对的桶。AWS Provider 6.0.0 的 S3 文档以桶名作为导入 ID。

| 对应项 | 教学案例值 | 负责说明什么 |
|---|---|---|
| 配置地址 | aws_s3_bucket.logs | Terraform 代码中的身份 |
| 导入 ID | example-existing-bucket-123456789012 | Provider 定位真实对象的标识 |
| Provider | registry.terraform.io/hashicorp/aws | 解释资源类型与导入规则 |
| 实际区域 | ap-southeast-1 | API 请求目标的环境条件 |

传统 CLI 导入直接建立绑定，然后再看 plan；import 块先把接管意图写进代码，经 plan 审查后才 apply。两种方式选其一，不应针对同一个对象在不同状态重复执行。

### 如何准备配置并导入不同地址的资源实例
<!-- src: md/import/usage.md; md/commands/import.md -->

先准备目标 resource、Provider 认证、所需变量与正确 Backend，再执行导入。资源块可以先不完整，但后续必须补齐期望参数；不应在未理解导入后差异时直接 apply。

以下是互为替代的独立地址片段；每条 ID 都是占位符，同一对象只能选择一种地址并在对应配置中使用。

```bash
terraform import aws_instance.web i-0123456789abcdef0
terraform import 'module.service.aws_instance.web[0]' i-0123456789abcdef0
terraform import 'aws_instance.web["blue"]' i-0123456789abcdef0
```

模块、count 和 for_each 实例必须能在配置中对应起来。字符串键及方括号用单引号保护，避免 shell 展开。导入后运行 `terraform state show ADDRESS` 确认对象，再执行完整 plan；若出现强制替换，要辨认是配置未还原还是确实要改变资源。

HCP Terraform 场景下，传统 import 在本地运行，即使平时 apply 在远端。它不能自动取得所有远端 Workspace 变量，需在本地准备等效输入和 Provider 凭据。Provider 导入配置不能依赖尚未求出的非变量输入，例如依赖数据源取得认证参数。旧 `-provider` 覆盖参数已弃用，应在目标资源配置中明确 Provider。

配置式接管示意如下，前提是目标资源已声明或采用受支持的配置生成流程：

```hcl
import {
  to = aws_instance.web
  id = "i-0123456789abcdef0"
}
```

若只准备了 import 块而尚无 resource，可在支持的版本执行 `terraform plan -generate-config-out=generated.tf` 生成候选配置，目标文件必须尚不存在；即使计划有其他错误，也应检查是否已经产生文件。生成后继续审查参数和计划，不能直接把输出当作最终模块设计。

实际接管始终查具体 Provider 版本的 import 文档，不能从资源显示名称猜 ID。复杂导入产生的次级资源如果缺少配置，后续计划可能删除它们，应补齐或重新审查接管边界。

#### 一份最小 S3 接管配置

独立 `cloud-example/versions.tf` 固定本例依据的 Provider 版本，避免与 query 需要的较新 Provider 能力混淆：

```hcl
terraform {
  required_version = ">= 1.5.0, < 2.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 6.0.0"
    }
  }
}
```

`cloud-example/provider.tf` 设置区域，认证通过该 Provider 支持的外部凭据来源准备，不在文件中放密钥：

```hcl
provider "aws" {
  region = "ap-southeast-1"
}
```

`cloud-example/main.tf` 描述期望管理的桶和标签；`imports.tf` 描述接管关系：

```hcl
# main.tf
resource "aws_s3_bucket" "logs" {
  bucket = "example-existing-bucket-123456789012"
  tags = {
    Environment = "dev"
  }
}
```

```hcl
# imports.tf
import {
  to = aws_s3_bucket.logs
  id = "example-existing-bucket-123456789012"
}
```

若采用传统 CLI 路径，则保留资源与 Provider 文件，不使用 imports.tf，入口为：

```bash
terraform import aws_s3_bucket.logs example-existing-bucket-123456789012
terraform plan
```

这里不包含 ACL、版本控制或生命周期规则等桶的全部功能，不能把导入一个桶理解成接管其所有相关配置。对照结果时，有两种常见情况：

| 导入后的事实 | 期望配置 | 后续普通计划示意 |
|---|---|---|
| 已有标签 Environment=dev，其他受管属性一致 | Environment=dev | 无需改变该资源 |
| 已有标签 Environment=ops | Environment=dev | 更新标签为 dev |

第二行不是导入失败，而是“读取的已有事实”与“写下的期望”不同。若希望保留 ops，应修改期望配置；若希望采用 dev，才审查该更新。桶名变化可能触发替换，不能为了统一示例名称把真实桶名随意改掉。

### 如何查询存量资源并生成待审查的导入配置
<!-- src: md/commands/query.md -->

`terraform query` 根据当前目录的 `*.tfquery.hcl` 文件中的 list 块查询远端资源，适合从存量对象生成接管候选。它需要支持查询的 CLI 和 Provider，查询成功也只说明发现对象，尚未写入管理状态。

下列结构用于支持 `aws_instance` list 的 Provider，需另外配置相应 Provider 版本、账号与查询范围：

```hcl
list "aws_instance" "candidates" {
  provider = aws
}
```

```bash
terraform query
terraform query -var-file=inventory.tfvars
terraform query -generate-config-out=generated-import.tf
terraform query -generate-config-out=generated-import.tf -json
```

最后两条是两种输出方式的替代示例，普通文件模式的目标必须尚不存在；JSON 模式把配置放入 JSON 输出，不按普通文件模式写入。生成参数采用 `-generate-config-out`，版本和参数核验依据见校验记录。query 需要提供该命令的 CLI 以及支持 list 的 Provider。

生成的 import 和 resource 块仍要审查，尤其是账号、区域、过滤条件、重复管理、只读属性与默认值。原材料示例虽然传了 `env=prod`，list 块却没有引用 env；声明或传入变量不会自动按环境过滤查询。必须使用目标 Provider 支持的 list 配置真正表达过滤逻辑，再抽查查询结果。

将生成文件纳入受控配置后，先执行 plan，核对导入对象与附带的更新动作，再决定 apply。批量发现、代码生成和资源接管是三个步骤，不能把“生成文件成功”报告成“资源已经纳管”。

#### 查询文件不是生成的资源配置

query 使用独立目录和支持 list 的 Provider 版本。前述固定 6.0.0 的导入案例不承诺支持查询；应先查目标 Provider 的 list 文档，再把本节已有 list 块保存为 `inventory.tfquery.hcl`。这是不带过滤的最小结构，不能声称只返回生产实例。

```text
query-example/
├── versions.tf            支持 list 的 Provider 要求
├── provider.tf            已确认的查询账号与区域
├── inventory.tfquery.hcl  查询定义
└── generated-import.tf    查询后生成的候选 resource 与 import
```

若输入文件声明了变量，var/var-file 只是给变量赋值；只有 Provider 支持的查询配置真正引用它，才可能改变匹配范围。为避免提供无依据的 AWS 过滤字段，本例不构造环境过滤语法。

生成文件中的 resource 描述候选目标，import 关联已发现对象。先检查生成的 ID 是否来自正确账号、地址是否与现有配置重复，再检查参数是否表达你打算长期维护的目标。生成代码通常还需要命名和模块组织上的整理，不能把“能够导入”当成“已经设计好可复用模块”。

## 第 7 章 · 理解资源地址并处理状态刷新与资源重建

### 状态维护为什么必须先定位正确的资源地址
<!-- src: md/state.md; md/state/resource-addressing.md -->

状态维护本质上是在调整“配置地址—真实对象”的管理记录。地址错误可能导致对象脱管、重复创建或错误替换，因此每次修改都应先确认 Backend、Workspace 和精确实例，再考虑命令参数。

地址由模块路径与资源规格组成。以下地址表示 service 模块 blue 实例中的第一台 web：

```text
module.service["blue"].aws_instance.web[0]
```

| 部分 | 含义 | 常见误读 |
|---|---|---|
| `module.service["blue"]` | for_each 模块实例 | 误以为是云端资源组名 |
| `aws_instance.web` | 配置资源类型与本地名称 | 误以为 web 是云资源 ID |
| `[0]` | count 的零起始索引 | 与字符串键 `["0"]` 混淆 |

不带模块前缀表示根模块资源；模块实例索引自 0.13 起支持。省略实例索引时，有些命令匹配全部实例，有些命令要求唯一目标并报错，应按子命令语义判断。`module.service` 也可能扩大到整个模块及后代，不能把不完整地址直接复制到写操作。

```bash
terraform workspace show
terraform state list module.service
terraform state show 'module.service["blue"].aws_instance.web[0]'
```

先用只读命令确认实际匹配，再记录地址和真实 ID。Unix shell 的单引号可保护地址中的方括号和双引号；Windows 的转义规则不同，本文示例不直接用于所有 shell。日常 plan/apply 已处理大部分状态更新，手工状态修改应只用于明确的维护目标。

#### 配置实例如何得到地址

下面是两个独立目录的 `main.tf`，用来比较数字索引和字符串键。它们替代基础示例，不追加到同一根模块，避免重复声明 service：

```hcl
# count-example/main.tf
resource "terraform_data" "service" {
  count = 2
  input = "api-${count.index}"
}
```

```hcl
# foreach-example/main.tf
resource "terraform_data" "service" {
  for_each = toset(["blue", "green"])
  input    = "api-${each.key}"
}
```

| 声明 | 实例地址示意 | 该实例 input |
|---|---|---|
| count 第一个 | terraform_data.service[0] | api-0 |
| count 第二个 | terraform_data.service[1] | api-1 |
| for_each 的 blue | terraform_data.service["blue"] | api-blue |
| for_each 的 green | terraform_data.service["green"] | api-green |

资源使用 for_each 时，身份来自键而不是列表位置。若外围 module 调用也使用 for_each，则先选择模块实例，再选择资源实例，例如 `module.service["east"].terraform_data.service["blue"]`。这只是组合规则，前面的根模块示例没有自动生成 east 模块。

### 状态命令如何读取数据并保护修改前的快照
<!-- src: md/commands/state.md; md/state/inspect.md -->

`terraform state` 提供受支持的状态操作接口，优于直接编辑 JSON。状态格式包含版本、Provider 元数据与对象绑定，能被 JSON 解析并不代表可安全修改。

```bash
terraform state list
terraform state show 'aws_instance.web[0]'
# 保存快照前限制新文件权限
umask 077
terraform state pull > before-maintenance.tfstate
```

前两条不修改状态，也不会为你产生备份。修改状态的子命令通常写出备份，远端状态场景同样要关注本地备份文件；具体备份参数按各子命令帮助使用，不能把某个命令的 `-backup` 当作全部命令通用开关。

远端 Backend 下的 state 操作会进行网络读写，因此要区分权限失败、网络失败和确实没有匹配资源。读出的快照与 state show 不会自动刷新远端对象；看到旧属性时，不要马上认为云端变更没有发生。

维护前独立保存当前快照，并验证 pull 退出成功、文件非空且可解析。shell 重定向会在命令成功前创建文件，零字节文件不是有效备份。备份和状态一样敏感，应进入受控存储与保留策略，而不是提交 Git。

状态锁能避免支持锁的 Backend 上的并发写入，但不替代团队协调：代码重构和状态调整之间也可能被其他流水线插入 plan。维护窗口内应暂停相关执行者，完成后用完整计划检查整体一致性。

#### 避免把空文件当成备份

下面的 shell 示例在已经确认正确 Backend 和 Workspace 后使用。它为每次导出创建独立目录，只有 pull 成功、文件非空且为可解析 JSON 时才生成最终文件名：

```bash
set -euo pipefail
umask 077
snapshot_dir=$(mktemp -d ./state-snapshot.XXXXXX)
snapshot_tmp="$snapshot_dir/state.partial"
if terraform state pull > "$snapshot_tmp"; then
  test -s "$snapshot_tmp"
  python3 -m json.tool "$snapshot_tmp" > /dev/null
  mv "$snapshot_tmp" "$snapshot_dir/state.tfstate"
  printf '快照保存至 %s\n' "$snapshot_dir/state.tfstate"
else
  pull_status=$?
  printf '导出失败 保留诊断目录 %s\n' "$snapshot_dir" >&2
  exit "$pull_status"
fi
```

目录相对当前工作目录创建，需有写权限。JSON 检查失败时 set -e 会停止流程，因此不会打印成功信息；它只验证格式，不证明该快照来自正确环境。最终仍需核对资源地址、对象 ID 和备份归属。这里采用独立目录，避免覆盖一份已存在的有效备份。

### 如何审查远端变化并刷新状态
<!-- src: md/commands/refresh.md -->

外部应急操作可能改变对象属性，而 `.tf` 仍保持原样。此时应先决定业务目标：保留外部变化就修正配置并同步记录；恢复配置目标则审查普通计划。仅刷新状态不会替你作出这个选择。

```bash
terraform plan -refresh-only -out=refresh.tfplan
terraform show refresh.tfplan
# 确认差异真实且目标正确后才写入状态
terraform apply refresh.tfplan
terraform plan
```

refresh-only 只更新状态与根输出，不把资源改回配置。最后的普通 plan 可能仍提出修改，因为配置目标与外部事实仍有差异；这是两个阶段的职责不同，不是刷新失败。

旧 `terraform refresh` 已弃用，等价于自动批准的 refresh-only apply。认证、区域或权限配置错误时，Provider 的读取结果可能让 Terraform 误以为对象消失，直接刷新会在没有审查的情况下丢弃绑定。因此不应为了让 show 工作或消除漂移提示就盲目执行 refresh。

审查中若大量对象突然消失，应停下确认账号、区域、服务故障与 Provider 行为，而不是接受一份空状态。refresh-only 模式从 0.15.4 起可用；更老版本的维护应结合升级计划和备份，不在生产中模仿自动刷新示例。

#### 同一次标签漂移对应两种计划

沿用第 6 章 S3 桶，假设上次状态和 `.tf` 都是 `Environment=dev`，应急人员在 AWS 中把标签改成 `ops`。三个值应分别记录，而不是笼统地说“状态变了”：

| 信息来源 | 标签值 | 表达的事实 |
|---|---|---|
| main.tf | dev | 当前代码期望 |
| 上次保存状态 | dev | 旧的管理记录 |
| Provider 新读取的 AWS 对象 | ops | 当前远端事实 |

普通 plan 会基于新读到的 ops，提出把标签改回配置的 dev；refresh-only 只提出把记录从 dev 更新为 ops，不执行改标签操作。其差异可概括为：

```text
普通计划的资源动作节选示意
~ tags.Environment = "ops" -> "dev"

refresh-only 的记录变化示意
旧记录 "dev" -> 当前远端事实 "ops"
不提出把 AWS 标签改回 dev
```

如果 ops 是应保留的新目标，需要同时调整 `.tf`；只接受刷新，下次普通 plan 仍会要求 dev。若 ops 是误操作，则可以保留配置并审查普通计划。这也是为什么刷新状态无法替代业务意图判断。

### 如何替换异常资源并理解 taint 标记
<!-- src: md/state/taint.md; md/commands/taint.md; md/commands/untaint.md -->

Terraform 主要管理 Provider 暴露的对象属性，虚拟机仍存在并不意味着机内服务健康。因此业务故障可能无法从普通 plan 看出，需要先通过应用和系统诊断确定是否确实要整体替换。

```bash
terraform plan -replace='aws_instance.web[0]' -out=replace.tfplan
terraform show replace.tfplan
# 审查依赖影响与数据后执行
terraform apply replace.tfplan
```

`-replace` 自 0.15.2 起提供，把替换意图放进本次计划，便于在修改共享状态前审查。替换可能涉及停机、地址变化和数据丢失，应查看实际创建销毁顺序及下游差异，不能仅凭“配置没改”判断无影响。

tainted 是状态中的“不确定是否完整可用”标记。创建过程或 provisioner 失败后 Terraform 可能自动标记；旧 `terraform taint ADDRESS` 也能手工标记，但已经弃用。它先修改共享状态，其他执行者可能在你审查前生成替换计划，这正是推荐 replace 的原因。

如果已通过平台与业务验证确认对象完好，可使用以下命令移除标记：

```bash
terraform untaint 'aws_instance.web[0]'
terraform plan
```

untaint 不修复真实对象，也不能保证后续计划不因其他属性差异而替换。`-allow-missing` 只让目标缺失时成功，不代表对象已经健康。若仍有疑虑，应保留调查证据，避免把清除标记当作故障修复。

#### 三种处置的前后结果

| 已确认的情况 | 处置 | 计划或状态变化 |
|---|---|---|
| 对象有损坏证据，决定重建 | plan/apply 的 -replace | 本次计划明确包含替换 |
| 自动标记 tainted，检查后确认对象不完整 | 保留标记并审查新计划 | 下一次计划通常提出替换 |
| 自动标记 tainted，但已证实对象健康 | untaint 后重新 plan | 移除标记，其他差异仍可能要求替换 |

例如 tainted 状态的计划会出现“is tainted, so must be replaced”一类原因提示；替换可能来自这个标记，也可能来自不可变属性变化。先看原因，再决定是否清标记。如果服务已经坏了，untaint 只会让记录认为它可用，不会重启进程、修复磁盘或恢复业务数据。

## 第 8 章 · 重构资源配置并维护状态绑定

### 如何在资源改名或迁入模块时保留已有对象
<!-- src: md/state/move.md; md/commands/state/mv.md -->

资源改名或迁入模块会改变配置地址，但真实对象不一定需要重建。Terraform 若只看到旧地址消失、新地址出现，通常会计划删除和创建；重构信息负责告诉它这两者是同一管理对象。

```mermaid
graph TD
  A[旧地址 aws_instance.web] --> C[同一个远端对象]
  B[新地址 module.service.aws_instance.web] --> C
  D[重构记录或 state mv] --> B
```

优先在支持的版本中使用配置式 moved 块，把迁移路径留给所有模块使用者。下面假定旧资源已从根模块迁入 service 子模块：

```hcl
moved {
  from = aws_instance.web
  to   = module.service.aws_instance.web
}
```

若场景需要命令式维护，先停相关流水线并备份，再预览匹配和移动绑定：

```bash
terraform state mv -dry-run aws_instance.web module.service.aws_instance.web
terraform state mv aws_instance.web module.service.aws_instance.web
terraform plan
```

source 与 destination 必须是兼容的对象种类；state mv 的资源移动必须保持资源类型相同。不能用它把 EC2 转成其他云主机。整个模块可移到另一个模块路径，实例可更换索引，但目标必须与新配置一致且未被其他对象占用。

完成后核对新地址仍有原 ID，完整计划没有因改名产生意外重建。属性同时改变仍可能导致更新或替换，因此“移动成功”不保证计划完全无变化。命令与代码变更之间的竞态需靠维护协调控制，单条命令上的状态锁覆盖不了整个重构过程。

#### 从旧资源到子模块的完整文件变化

以下采用内置对象避免把地址重构与云 API 行为混在一起。before 和 after 表示同一配置先后版本的目录快照，不是要同时运行的两套环境。

```text
before/                       after/
└── main.tf                   ├── main.tf
                              ├── moved.tf
                              ├── outputs.tf
                              └── modules/service/main.tf
```

旧 `before/main.tf`：

```hcl
resource "terraform_data" "service" {
  input = "api-dev"
}
```

新 `after/main.tf` 与 `after/modules/service/main.tf`：

```hcl
# after/main.tf
module "service" {
  source = "./modules/service"
}
```

```hcl
# after/modules/service/main.tf
resource "terraform_data" "service" {
  input = "api-dev"
}

output "name" {
  value = terraform_data.service.output
}
```

`after/moved.tf` 描述地址变化，`after/outputs.tf` 则通过模块接口访问结果：

```hcl
# after/moved.tf
moved {
  from = terraform_data.service
  to   = module.service.terraform_data.service
}
```

```hcl
# after/outputs.tf
output "service_name" {
  value = module.service.name
}
```

如果旧地址已经绑定 `object-A`，预期重构关系是旧地址消失、新地址仍绑定 `object-A`，且 input 不变。新增根输出可能造成输出变化，但不需要因移动而替换资源。只改资源本地名称也是同一原理：from/to 使用同模块内的旧新地址。

如果采用命令式替代，应在相同状态目标上完成代码切换与 `state mv terraform_data.service module.service.terraform_data.service`，不把此操作当作新建 after 环境。配置式 moved 更适合留给未来升级的使用者；命令式修改则需要额外维护协调。

### 如何解除资源绑定并评估后续计划
<!-- src: md/commands/state/rm.md -->

`state rm` 解除管理绑定，远端对象继续存在。它适用于移交管理或明确让 Terraform 停止管理某个对象，不适合清理云资源费用。若真实目标是删除对象，应审查正常删除或销毁计划。

```bash
terraform state rm -dry-run 'aws_instance.web["blue"]'
# 确认对象归属和配置调整后才执行
terraform state rm 'aws_instance.web["blue"]'
terraform plan
```

dry-run 用于确认将匹配哪些实例，不写状态。省略实例键可能解除多个绑定，给出模块地址还会覆盖整组资源，不能以单个实例的审查结论批准更大范围。

若 resource 配置仍存在，下一次 plan 通常提出创建新对象，可能与留在云端的原对象重名。要移交管理，应同步调整旧配置、安排新状态导入并验证两边计划，避免长时间脱管，也避免同时存在两个管理者。

支持 removed 块的版本可以把解除管理纳入正常计划审查。要保留远端对象，必须明确相应 lifecycle 的 `destroy = false` 语义，不能只把删除 resource 替换成一个未经确认的 removed 块。本文以兼容的 state rm 命令说明机制，新语法需核对目标版本。

完成后除了确认旧状态中地址消失，还应核对真实对象仍存在，以及新的归属、监控和费用负责人。状态列表里少一个地址，不等于系统少一个资源。

#### 在配置中明确保留远端对象

支持 removed 的版本可把 S3 桶移交意图写入配置。下面是替代原 resource 的独立片段，不能与原声明同时加载。移除原 `aws_s3_bucket.logs` resource 和对应 import 声明后，使用下面的 `removed.tf`；不能与相同目标的原资源声明同时保留：

```hcl
removed {
  from = aws_s3_bucket.logs
  lifecycle {
    destroy = false
  }
}
```

该例要求支持 removed 块的 CLI，基础资源解除管理语法自 1.7 起提供。`destroy=false` 是保留桶的关键，不写清该意图就不能从“removed”这个名字推断不会删除。

| 配置与操作 | 后续结果示意 |
|---|---|
| 只 state rm，原 resource 仍在 | Terraform 可能计划重新创建同名桶 |
| 删除 resource，保留原状态绑定 | 普通计划可能提出销毁 |
| 移除 resource，使用上述 removed 并接受计划 | 停止管理并保留桶 |

移交后谁接管桶、费用和监控仍需有明确记录，解除绑定不会自动把对象导入新状态。

### 如何修改状态中的 Provider 来源地址
<!-- src: md/commands/state/replace-provider.md -->

Provider 来源地址是状态中的依赖身份，例如 `registry.terraform.io/hashicorp/aws`。维护 fork 或迁移 Provider 分发来源时，配置的 required_providers 变化可能需要配套调整状态中的来源，使已有对象交给兼容实现管理。

```bash
terraform providers
# 示例目标注册表及 fork 为占位 必须先确认存在且兼容
terraform state replace-provider \
  registry.terraform.io/hashicorp/aws \
  registry.example.com/platform/aws
```

该命令处理当前状态中使用来源 Provider 的所有资源，不是只改一个别名，也不是把资源搬到另一个云账号。执行前应盘点受影响地址，确认 fork 的资源类型、Schema 和状态升级逻辑兼容，并取得可恢复快照。

命令会展示变化并要求批准，写入前保留备份；默认不使用 `-auto-approve`，便于核对来源和目标。状态中改了名字但没有安装对应 Provider、没有更新配置或认证，后续 plan 仍会失败。

完成后重新初始化依赖，检查 `terraform providers` 的配置与状态要求，再执行完整计划。出现 Schema 无法解码或大范围替换时，停止进一步操作并回查兼容性，不能反复替换来源试错。跨云、跨账号的真实迁移需要另行设计资源与数据迁移流程，不属于此命令的效果。

#### Provider 来源改动要同时体现在代码与状态

假设某组织维护了兼容 AWS Provider 的内部 fork，配置来源的变化可以写为以下 diff。目标域名与版本都是示意，实际需先确认发布存在和兼容性：

```diff
 terraform {
   required_providers {
     aws = {
-      source  = "hashicorp/aws"
+      source  = "registry.example.com/platform/aws"
       version = "= 6.0.0"
     }
   }
 }
```

replace-provider 负责更新状态中原来源的引用；required_providers 负责告诉后续初始化该安装谁。假设状态中只有 logs 和 archive 两个桶使用原 Provider，则这两个地址都在影响范围，不应认为只修改当前打开的 resource 文件。

`provider "aws" { alias = "other" }` 表示同一来源的另一个配置实例，不是更换发布来源；把 region 或凭据切到另一个账号也不等于迁移对象。遇到解码不兼容，应停在代码与状态兼容调查阶段，不能依次试多个来源“直到计划通过”。

## 第 9 章 · 恢复状态备份并处理异常锁

### 如何确认恢复目标并保存当前状态快照
<!-- src: md/state/recover.md; md/commands/state/pull.md -->

状态恢复处理的是管理记录损坏或丢失，不会把真实基础设施还原到备份时刻。恢复旧快照之后，云端可能已经新增、删除或修改对象，所以必须把状态时间线与实际执行记录一起重建。

```mermaid
graph TD
  A[暂停相关执行者] --> B[确认 Backend 与 Workspace]
  B --> C[保存当前快照和故障证据]
  C --> D[比较候选备份]
  D --> E[核对 lineage 与 serial]
  E --> F[恢复管理记录]
  F --> G[审查完整计划与远端事实]
```

```bash
terraform workspace show
umask 077
terraform state pull > current-before-recovery.tfstate
python3 -m json.tool current-before-recovery.tfstate > /dev/null
```

应先确认 pull 的退出码，再做 JSON 检查。pull 从当前 Backend 读取原始状态格式，但会将输出副本转换为本地 CLI 兼容格式；输出中的 Terraform 版本不能直接作为远端原始写入版本的证据。需要原始版本时，应查 Backend 保存的历史快照元数据。

候选备份要核对来源、时间、资源 ID 和最近一次已成功的操作。没有足够证据时，优先保留现状继续调查，不应按文件名最新或体积最大就覆盖。状态文件采用 UTF-8 无 BOM；跨平台复制时还要防止编辑器改坏编码。

只有确实存在已失效锁时才需要解锁。没有锁就直接保存和检查快照，正常运行中的锁则是停止恢复写操作的信号。

#### 恢复时先还原操作时间线

假设 09:00 的备份记录对象 A，09:20 的 apply 新增对象 B，09:30 的错误维护移除了 A 的绑定。直接把 09:00 快照覆盖回去，虽然可能找回 A，却也可能丢失 B 的记录。

| 证据 | 要核对的内容 |
|---|---|
| 09:00 备份 | 当时的 Backend、Workspace、lineage、资源 ID |
| 09:20 作业记录 | B 是否成功创建，状态是否成功保存 |
| 09:30 当前快照 | 哪些绑定丢失，是否还有 B |
| 平台只读调查 | A、B 当前是否存在，是否还有未记录变化 |

先使用第 7 章带错误检查的导出方法保存当前快照，再比较候选；当前状态即使有错，也可能包含比旧备份更多的正确事实。恢复方案必须解释如何保留这些事实，不能只挑一个“出问题之前”的文件。

### 如何检查状态一致性并推送恢复快照
<!-- src: md/commands/state/push.md -->

`state push PATH` 把本地快照写到当前 Backend，既可用于远端也可用于 local。它是直接改变管理记录的操作，不经过资源变更计划，恢复前要明确写入的目标和候选文件。

```bash
jq '{lineage, serial, terraform_version}' current-before-recovery.tfstate
jq '{lineage, serial, terraform_version}' recovered.tfstate
# 完成来源与一致性审查后才执行
terraform state push recovered.tfstate
```

`lineage` 标识一条状态历史，不同 lineage 通常意味着不同状态；`serial` 是这条历史的修订序号。Terraform 会阻止不同 lineage 或远端 serial 更高的覆盖，防止把其他环境或更旧记录写入目标。

被保护检查拒绝时，应回查候选备份、并发执行与远端最新版本。`-force` 会关闭这两类检查，不是自动合并新旧状态；盲目使用可能丢失后来创建对象的绑定。也不应手动改 serial 只为骗过检查。确有灾难恢复需要覆盖时，必须基于完整对象清单和独立保存的现状制定恢复步骤。

推送后重新读取并核对地址与 ID，再审查 refresh-only 和普通计划，辨认备份之后发生的真实变化。恢复成功不代表下一次 apply 安全，更不代表业务已恢复。导出使用 `pull > 文件`，导入使用 `push 文件`，不要混淆方向。

#### lineage 与 serial 的比较实例

当前快照元数据节选：

```json
{"lineage": "history-A", "serial": 42, "terraform_version": "1.14.0"}
```

候选快照元数据节选：

```json
{"lineage": "history-A", "serial": 40, "terraform_version": "1.14.0"}
```

两份 JSON 只用于解释字段，不是可 push 的完整状态。这里历史相同但候选更旧，正常保护会阻止用 serial 40 覆盖 42。改变版本字段或把 40 手工改成 43，并没有把缺少的对象补回来。

| 候选与远端关系 | 保护含义 | 应作出的判断 |
|---|---|---|
| lineage 不同 | 很可能是不同状态历史 | 回查环境归属，停止覆盖 |
| lineage 相同，远端 serial 更高 | 候选可能缺失后续变化 | 重建时间线并比较对象，不默认 force |
| lineage 相同，候选并未落后 | 未触发上述拒绝条件 | 仍需确认文件完整、对象正确、执行者已停止 |

serial 是状态修订信息，不是云端事实的新鲜度证明。即使远端对象刚刚被手工修改，状态 serial 也未必已经变化；最后一行尤其不能解释成“Terraform 同意就一定安全”。

### 如何确认锁已失效并安全解除锁
<!-- src: md/commands/force-unlock.md -->

状态锁用于阻止多个写入者同时修改同一状态。进程异常终止后可能留下失效锁，但排队、慢 API 或网络抖动也可能让有效锁持续较久。解锁前必须确认持有者已经退出，而不是仅以等待时间判断。

```bash
# LOCK_ID 替换为目标 Backend 报错中给出的锁标识
terraform force-unlock LOCK_ID
```

应核对报错中的锁路径、操作、持有者与时间，并联系实际执行流程的负责人或查看作业状态。确认没有活跃写入者后，在同一 Backend 和 Workspace 下使用对应 LOCK_ID。不要从别的工单复制 ID，也不要直接删除不明 Backend 锁记录。

`-force` 在这个命令中仅跳过交互确认，不同于 state push 的覆盖检查开关。强制解锁本身不修改云资源，但可能让第二个写入者进入，因此影响的是并发保护。local 状态的进程锁不能靠另一进程的 force-unlock 正常解除，应先处理实际占用进程。

解锁后先观察单个受控操作能否正常获取和释放锁，再恢复流水线。若马上再次被锁住，应检查重复调度或仍存活的执行者，不能循环强制解锁。恢复调查应保留原错误与处理记录，避免把解锁成功误报成状态内容已修复。

#### 锁信息告诉你什么

下面是锁诊断的字段示意，不对应真实作业：

```text
Lock Info:
  ID:        lock-example-id
  Path:      service/dev/terraform.tfstate
  Operation: OperationTypeApply
  Who:       runner@ci-example
  Created:   2026-09-08 09:20:00 UTC
```

ID 是解锁所需的标识，Path 帮助确认状态目标，Operation/Who/Created 用于关联作业和时间线。先到相关作业记录确认 runner 是否仍在执行，并区分终端断连和实际进程终止。

如果作业仍运行，等待或从原调度系统按其流程终止；如果作业已终止，检查最后一次状态写入情况后再处理失效锁。时间很久不代表一定失效，刚创建的锁也不一定仍有效。force-unlock 的成功只说明锁保护移除，不能替代随后对状态完整性的检查。

## 第 10 章 · 创建 Stack 并准备配置与依赖

### Stacks 的管理对象与公共 CLI 参数如何配合
<!-- src: md/commands/stacks.md; md/commands/stacks/global-flags.md -->

Stacks 面向多组件与部署配置的协作管理。CLI 除了准备本地配置，还能操作平台上的 Stack、配置版本、部署组和部署运行。理解这些对象的作用域，才能判断一个命令是在整理文件，还是在启动可能影响基础设施的平台操作。

```mermaid
graph TD
  A[组织与项目] --> B[Stack]
  C[本地组件和部署配置] --> D[初始化与验证]
  D --> E[配置版本]
  B --> E
  E --> F[部署组与部署运行]
```

Stacks CLI 插件与 Terraform CLI、资源 Provider 分别有版本。`terraform version` 的结果不能代替 Stacks 插件版本；本节示例使用下面说明的组件与部署语法。

```bash
terraform stacks -usage
terraform stacks -chdir=./my-stack -no-color version
```

这里 `-chdir` 位于 stacks 后、子命令前，是 Stacks 公共参数位置。公共参数还包括覆盖 Stack 插件缓存目录的 `-plugin-cache-dir` 与 `-stacks-version` 版本别名；不要把这个插件缓存和 Provider 包缓存混淆。

平台目标通常由组织、项目和 Stack 名称定位；显式选项会覆盖相应 `TF_STACKS_...` 环境变量。Terraform Enterprise 的支持环境需设置 `TF_STACKS_HOSTNAME` 指向实例，并确认服务端支持和认证。不能仅因有 Terraform Enterprise 域名就推断一定启用 Stacks。

#### 从文件到平台对象

本例按官方组件配置使用 `.tfcomponent.hcl`，部署配置使用 `.tfdeploy.hcl`；CLI 插件入口要求 Terraform 1.13.x 或更高版本，插件与平台能力还应分别确认。不要把历史 beta 的独立 CLI 用法与这里的命令混用。

```text
stack-demo/
├── .terraform-version
├── variables.tfcomponent.hcl
├── providers.tfcomponent.hcl
├── components.tfcomponent.hcl
├── deployments.tfdeploy.hcl
└── modules/bucket/main.tf
```

`.terraform-version` 是版本选择文件，示例内容为 `1.14.0`。组织与项目定位平台上的 service-lab Stack；component 引用本地桶模块；deployment 给这个组件蓝图赋一组输入。不同部署可以复用蓝图，但必须为桶名和认证目标提供独立且正确的值。

### 如何创建 Stack 并整理本地配置格式
<!-- src: md/commands/stacks/create.md; md/commands/stacks/fmt.md -->

创建 Stack 是平台写操作，`-with-template` 额外生成本地样板，不是仅创建几个文本文件。执行前需要确认组织、项目、名称和权限，并在适当的本地目录操作，防止把模板写入已有项目。

```bash
# 以下会在已认证的平台中创建 Stack 示例名称需替换
terraform stacks create \
  -organization-name example-org \
  -project-name sre-lab \
  -stack-name service-lab \
  -with-template
```

创建后应记录平台返回的对象标识，并用 list 核对所属项目。Stack 创建成功不代表组件配置已经完整，也不代表基础设施已部署。模板只是起点，必须补充真实组件、输入与部署意图。

Stacks fmt 处理 `.tfstack.hcl`、`.tfcomponent.hcl`、`.tfdeploy.hcl` 的原生 HCL，不支持把 JSON 当作该格式化入口。可以选择文件、目录或标准输入：

```bash
terraform stacks fmt -recursive
terraform stacks fmt -check -diff -recursive
```

第一条写回格式，第二条使用 `-check` 只检查；`-diff` 本身不保证无写入。格式通过之后仍需准备依赖与语义验证，不能把样板格式正确当作部署有效。

#### 一个文件引用闭合的组件与部署示例

下面展示 service-lab 的 S3 组件，是一个独立的 Stacks 片段，不能与同案例其他组件声明直接混成一个文件。角色 ARN、桶名与账号都是占位值；真实使用还需要平台到 AWS 的 OIDC 信任与授权配置，代码本身不会自动创建该信任关系。

`variables.tfcomponent.hcl` 定义组件层输入：

```hcl
variable "bucket_name" {
  type = string
}
variable "environment" {
  type = string
}
variable "region" {
  type = string
}
variable "role_arn" {
  type = string
}
variable "identity_token" {
  type      = string
  sensitive = true
  ephemeral = true
}
```

`providers.tfcomponent.hcl` 在 Stack 层声明并配置 Provider，注意这里 required_providers 不嵌套在普通 terraform 块中，provider 也有两个标签：

```hcl
required_providers {
  aws = {
    source  = "hashicorp/aws"
    version = "= 6.0.0"
  }
}
provider "aws" "this" {
  config {
    region = var.region
    assume_role_with_web_identity {
      role_arn           = var.role_arn
      web_identity_token = var.identity_token
    }
  }
}
```

`components.tfcomponent.hcl` 显式传入模块变量和 Provider 配置：

```hcl
component "bucket" {
  source = "./modules/bucket"
  inputs = {
    bucket_name = var.bucket_name
    environment = var.environment
  }
  providers = {
    aws = provider.aws.this
  }
}
```

`modules/bucket/main.tf` 是普通 Terraform 模块，Provider 要求回到普通 terraform 块，不在子模块中再配置认证：

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 6.0.0"
    }
  }
}
variable "bucket_name" {
  type = string
}
variable "environment" {
  type = string
}
resource "aws_s3_bucket" "this" {
  bucket = var.bucket_name
  tags = {
    Environment = var.environment
  }
}
```

最后在 `deployments.tfdeploy.hcl` 定义一次部署及平台生成的短期身份：

```hcl
identity_token "aws" {
  audience = ["aws.workload.identity"]
}
deployment "dev-east" {
  inputs = {
    bucket_name    = "example-stack-dev-east-123456789012"
    environment    = "dev"
    region         = "ap-southeast-1"
    role_arn       = "arn:aws:iam::123456789012:role/example-stack-role"
    identity_token = identity_token.aws.jwt
  }
}
```

数据链是 deployment.inputs → Stack variable → component.inputs → 模块 variable；身份则从 deployment 到 Stack Provider，再通过 providers 映射交给模块。这两条链的位置不同，是普通模块代码迁入 Stacks 时需要看清的变化。

### 如何安装配置依赖并确认目标 Stack
<!-- src: md/commands/stacks/init.md; md/commands/stacks/list.md -->

Stacks init 下载组件配置需要的远端模块、子 Stack 和 Provider，并创建 `.terraform/` 与依赖锁文件。依赖准备发生在本地配置目录，与列出平台已有 Stack 是两个不同动作。

```bash
terraform stacks init
terraform stacks list -organization-name example-org -project-name sre-lab -json
```

`.terraform/` 不提交版本管理，`.terraform.lock.hcl` 应作为依赖选择记录审查。`init -upgrade` 会在约束内重新选择可用模块和 Provider 版本，不能只为重试下载失败就添加它，否则修复网络的同时改变了依赖。

list 的组织名必需，项目名可选；不指定项目可能得到更广范围结果。显式选项覆盖环境变量，因此排查“为什么看不到 Stack”时，应同时核对当前凭据、组织、项目和命令中的覆盖值。

初始化成功只能证明依赖安装阶段完成；list 能看到对象只能证明平台可见性。两者合起来仍不能证明本地配置对应的就是即将上传的 Stack。发布前还需将本地目录、代码版本、平台 Stack 标识和配置版本记录关联起来。若列表为空，先调查目标和权限，不要直接重新 create 造成重复对象。

#### 本地准备与平台可见性分别确认

沿用 service-lab 名称，本地 init 针对上述模块与 Provider 下载依赖，平台 list 则针对组织和项目列出 Stack。可以用下表组织排查：

| 观察 | 能说明什么 | 仍缺什么 |
|---|---|---|
| 找到 modules/bucket | 本地模块路径存在 | 变量、Provider 映射是否正确 |
| 依赖安装完成 | 配置树所需包已取得 | 目标 Stack 是否创建、凭据是否有权限 |
| 平台列表包含 service-lab | 当前身份可见该对象 | 上传的配置版本是否就是当前目录 |

若模块路径不对，先修正 component.source；若 Provider 约束不能同时满足，先检查 Stack 层和模块层的要求。不要因为本地配置失败就重复创建平台 Stack，也不要因为平台列表可见就跳过本地依赖检查。

### 如何锁定依赖并验证配置与插件版本
<!-- src: md/commands/stacks/providers-lock.md; md/commands/stacks/validate.md; md/commands/stacks/version.md -->

依赖锁文件记录精确 Provider 版本与校验和，让开发机器与 HCP Terraform 执行环境使用可验证的包。Stacks 的 providers-lock 默认考虑当前平台和 HCP Terraform 使用的 `linux_amd64`，也可显式提供多个平台。

```bash
terraform stacks init
terraform stacks providers-lock -platform=darwin_arm64 -platform=linux_amd64
terraform stacks validate -json
terraform stacks version -json
```

按材料要求，validate 前应完成 init 与 providers-lock。它针对本地组件及部署配置做检查，不访问远端状态或 Provider API；但此前依赖下载会联网，平台部署仍需独立验证。

审查锁文件时，核对目标 Provider 来源、选择版本和平台范围。如果某个平台没有可用包，添加 checksum 参数不会生成一个可运行二进制，需要改选兼容 Provider 或执行平台。多平台锁定不是跨架构模拟器。

version 输出是 Stacks 插件版本，适合随验证日志一并记录。排查团队间结果差异时，应比较 CLI、Stacks 插件、锁文件、配置提交与平台能力，不能只比较 `terraform version`。配置验证与真实部署仍需分别验收。

#### 锁定包身份与确认三个版本

本例 Stack 层和模块层都要求 AWS 6.0.0，锁定时应保留同一来源与选择。下面是字段节选示意，hashes 刻意为空，仅用于说明结构，不能作为有效分发锁文件使用：

```hcl
provider "registry.terraform.io/hashicorp/aws" {
  version     = "6.0.0"
  constraints = "6.0.0"
  hashes      = []
}
```

实际 providers-lock 需要为目标包写入真实校验信息。开发机的 darwin_arm64 包与 HCP 的 linux_amd64 包是不同制品，虽然 Provider 发布版本相同。

记录工具链时分别保留 Terraform CLI 版本、Stacks 插件版本、资源 Provider 版本。组件语法被识别、插件能处理平台命令、Provider 能解释资源这三件事各有前提。普通 HCL 语法解析只能检查括号和表达式结构，不能证明上述 Stacks 语义与远端身份已经可用。

## 第 11 章 · 发布 Stack 配置版本并跟踪处理进度

### 如何从 VCS 获取配置并定位配置版本
<!-- src: md/commands/stacks/configuration.md; md/commands/stacks/configuration/fetch.md; md/commands/stacks/configuration/list.md -->

Stack 配置版本把某一份组件与部署配置固定为平台处理对象。管理版本时，先分清配置来源：VCS 连接的 Stack 从关联仓库取得配置；非 VCS 的 Stack 可以上传本地配置。两条路径不能只凭“手上有文件”随意互换。

```mermaid
graph TD
  A[VCS 关联仓库] --> B[configuration fetch]
  C[非 VCS 本地配置] --> D[configuration upload]
  B --> E[Stack 配置版本]
  D --> E
  E --> F[列出并记录版本标识]
  F --> G[按版本跟踪处理]
```

```bash
# 请求平台获取已关联 VCS 的最新配置
terraform stacks configuration fetch -stack-id stack-example -json
terraform stacks configuration list -stack-id stack-example -json
```

示例 ID 需从平台真实结果取得。fetch 的含义是针对 Stack 获取关联 VCS 配置，不是把仓库 checkout 到当前本地目录，也不是只读的列表查询；要核对仓库、分支及实际获取的修订，不能将“最新”视作已经审批的版本。

可以用 Stack ID，或组织、项目、Stack 名称组合定位；同时提供 ID 与名称时 ID 优先。自动化应选一种清晰的定位方式，防止过期环境变量造成误解。list 供版本盘点和事后核对，不能替代观察版本处理结果。

每次发版应记录源码修订与返回配置版本 ID。若 fetch 成功但找不到预期版本，应检查目标 Stack 和权限，再观察服务端处理，不要盲目重试生成多次请求。材料没有完整定义 API 状态枚举和分页契约，本文不编造这些字段；脚本应以目标版本实际 JSON 与官方接口为准。

#### 用发布记录关联源码与配置版本

将 service-lab 连接到 VCS 时，fetch 从其已关联仓库获取配置；本地检出一个分支则仅改变本机文件，两者不是同一动作。发布记录可以按下面的教学表组织：

| 来源 | 源码或目录证据 | 平台对象 | 后续观察入口 |
|---|---|---|---|
| VCS fetch | 仓库、分支、commit-A | 返回的 config-A | configuration watch 的配置 ID |
| 非 VCS upload | stack-demo 的已审查内容与版本记录 | 返回的 config-B | configuration watch 的配置 ID |

这个表不承诺平台 JSON 的字段名。要自动提取 ID，先核对目标插件真实接口；在没有字段契约时，用明确的发布记录比复制猜测的 jq 路径可靠。source commit 与配置 ID 都应保留，因为它们分别回答“从哪里来”和“平台处理哪一份”。

### 如何上传本地配置并观察版本处理进度
<!-- src: md/commands/stacks/configuration/upload.md; md/commands/stacks/configuration/watch.md -->

本地 upload 面向未连接 VCS Provider 的 Stack。上传当前目录中的组件与部署配置之前，应完成格式检查、依赖锁定和配置验证，并确认当前目录是这次准备发布的版本。

```bash
terraform stacks -chdir=./my-stack configuration upload \
  -stack-id stack-example -speculative -json
# config-example 应替换为本次上传返回的配置版本 ID
terraform stacks configuration watch -configuration-id config-example
```

`-speculative` 明确表示不触发部署，适合验证候选配置，但仍会把配置上传平台。去掉它后的普通上传可能触发部署流程，因此正式发布需要基于具体配置内容和 Stack 策略审查，不能当成保存草稿的同义操作。

watch 展示该配置版本及部署组进展。按组织、项目、Stack 名称 watch 时会选择最新版本；多人并行上传时，最新版本可能已不是你提交的那一份，所以发布追踪优先使用返回的 configuration ID。

“上传成功”“配置处理成功”“全部部署完成”是不同判断。应查看部署组、部署运行及失败诊断，直到确认目标范围内的结果；终端断连或退出 watch 仅表示停止本地观察，不意味着平台取消运行。

自动化发布应保存返回 ID 并判断目标配置的处理结果，不能仅凭 upload 的退出码就发布业务成功通知。

#### 第二次上传怎样改变最新版本

假设 10:00 上传候选 A 得到 config-A，10:05 另一位成员上传 B 得到 config-B。10:10 用 Stack 名称 watch 最新配置，观察到的可能已经是 B；继续宣称“我的 A 已部署完成”就缺少证据。

因此可以把发布拆为：先上传 speculative 候选并记录 ID，完成审查后再进行正式上传并记录新的 ID，后续只跟踪正式上传返回的配置版本。两次上传是不同事件，不能假定沿用候选 ID。若目录内容在两次上传之间变化，也必须重新核对审查对象。

```bash
# 在非 VCS Stack 中演示候选上传
terraform stacks -chdir=./stack-demo configuration upload \
  -stack-id stack-example -speculative -json
# config-candidate 是返回值的占位示意
terraform stacks configuration watch -configuration-id config-candidate
```

正式上传使用已确认内容并去掉 speculative，可能进入部署流程；这里不附一条可误接到候选命令后自动执行的发布脚本。审批、上传类型和终态检查应在团队流程中明确，而不是由 watch 命令替代。

## 第 12 章 · 控制 Stack 部署组与部署运行

### 如何定位部署组并理解批量计划审批的范围
<!-- src: md/commands/stacks/deployment-group.md; md/commands/stacks/deployment-group/approve-all-plans.md; md/commands/stacks/deployment-group/list.md -->

部署组是某个配置版本下协调部署的操作范围。按当前官方限制，组关联一个 deployment；deployment run 则表示其具体运行尝试。发布时先定位版本和组，再审查计划，才能避免对“当前最新”的错误范围批准。

```mermaid
graph TD
  A[Stack 配置版本] --> B[部署组]
  B --> C[首次部署运行]
  B --> D[后续重跑尝试]
  C --> E[待审批计划与执行步骤]
  D --> F[待审批计划与执行步骤]
```

```bash
terraform stacks deployment-group list -configuration-id config-example -json
# 以下会批准组内有权限批准的计划
terraform stacks deployment-group approve-all-plans -deployment-group-id dg-example
```

list 使用 configuration ID；approve 使用 deployment-group ID，不能混用。名称定位需要组织、项目、Stack 和组名，并针对该 Stack 最新配置版本的组。ID 优先于名称，适合固定已审查对象。

`approve-all-plans` 只批准调用者有权限批准的计划。命令成功不代表组内所有计划都已获得所需审批，可能仍需其他有权限的人完成审批。也不能从“all”推断它绕过平台权限。

批准前要展开关联部署的具体计划、环境和删除替换范围；批准后继续观察运行结果。组级批准是扩大作用范围的便利操作，不是一次独立的内容审查。若只准备处理一条运行，应使用运行级入口并确认其 ID。

#### 按当前平台限制理解组与部署

当前官方部署配置页面注明，一个 deployment group 只支持一个 deployment。因此本例让 dev-east 和 dev-west 分属两个组；不能将命令接受逗号分隔名单推导为当前平台允许任意多个 deployment 放进同一组。

| 操作目标 | 案例范围 | 不能由此推断 |
|---|---|---|
| config-A | 包含 east/west 两个部署的配置版本 | 两个部署必须属于同一个组 |
| dg-east | east 对应组及其待处理计划 | 可以批准 dg-west 的计划 |
| dr-east-1 | east 的一次部署运行 | 等同配置版本下所有运行 |

组级 approve-all-plans 仍可能涉及用户权限范围内的多个计划。若一个运行包含多个组件步骤，调用者只能批准其中有权限的计划；“一个 deployment”不等于“永远只有一个计划”。这里不编造平台未公开的状态枚举或审批字段。

### 如何重跑部署组并观察执行进度
<!-- src: md/commands/stacks/deployment-group/rerun.md; md/commands/stacks/deployment-group/watch.md -->

重跑用于已定位并处理原因后重新运行所选组关联的部署。它需要明确 `-deployment-names`，这是逗号分隔的部署名列表；不是省略参数就自动重试所有失败项。

```bash
# 名称必须属于已确认的部署组 此命令会启动重跑
terraform stacks deployment-group rerun \
  -deployment-group-id dg-example \
  -deployment-names 'dev-west'
terraform stacks deployment-group watch -deployment-group-id dg-example
```

重跑前检查上一次失败原因：配额、权限、配置错误或状态问题。没有修复原因就重跑，通常只增加重复失败；若远端对象已部分变更，新运行的计划还需重新审查，不能把上一次批准无条件当作这一次的结论。

watch 展示组状态和部署运行进展。查看整体配置时，应分别核对各组；不能因为 east 组完成就宣告 west 组也已完成。

名称定位仍选择最新配置对应的组，因此故障处理中应保留原 group ID，防止期间新上传的配置改变目标。退出 watch 不取消重跑；终端中断后可重新以 ID 观察。材料没有承诺重跑的幂等键或自动回滚机制，本文不把它描述成无副作用的重试。

#### 一个区域失败时选对重跑目标

假设 east 已完成，而 west 因配额问题失败。先修复 west 所需配额，再从 config-A 的部署组列表定位 dg-west，核对该组关联 dev-west。命令形式可以写成：

```bash
terraform stacks deployment-group rerun \
  -deployment-group-id dg-west \
  -deployment-names 'dev-west'
terraform stacks deployment-run list -deployment-group-id dg-west -json
```

这里的 ID 都是占位符，必须来自本次配置版本的真实列表。重跑后取得新 run ID，再按这个 ID 观察；不要继续 watch 旧失败运行并以为新尝试毫无进展。

| 已知情况 | 后续动作 |
|---|---|
| east 成功，west 配额错误 | 处理 west 原因并核对 west 重跑范围 |
| west 只是本地 watch 断开 | 先查询原运行，不马上重跑 |
| config-B 已经发布 | 明确是否仍处理 A，不能按 latest 悄悄切换 |

重复运行是否再次产生动作由新计划与当前状态决定，不应承诺它等同无副作用的网络重试。

### 如何管理单次部署运行的审批与取消
<!-- src: md/commands/stacks/deployment-run.md; md/commands/stacks/deployment-run/approve-all-plans.md; md/commands/stacks/deployment-run/cancel.md -->

部署运行级管理适合对某一条运行做审批、取消和观察，作用范围小于部署组。运行 ID 应来自平台列表或该次请求结果，不能依靠名称、时间猜测，更不能根据示例前缀自行构造。

```bash
# 以下是两个不同处置选择 不应无条件连续执行
terraform stacks deployment-run approve-all-plans -deployment-run-id dr-example
terraform stacks deployment-run cancel -deployment-run-id dr-example
```

批准命令处理该运行的计划，仍应先阅读具体动作与平台审批要求。取消命令请求取消进行中的运行，适用于确认应停止的变更；它不是删除整个 Stack，也不代表恢复已完成动作。

调用 cancel 后应继续 watch 或查看平台状态，确认取消是否已生效以及哪些步骤已经执行。远端 API 调用可能已经完成，平台停止后仍需检查真实资源和状态，必要时制定新的修复计划。不能把“发出取消请求”写成“所有变化已撤销”。

运行 ID 是平台返回的不透明标识，直接使用 list 结果，不根据示例前缀构造或猜测 ID。

#### 请求接受不等于执行完成

假设 dr-west-2 的计划已经审阅，可以选择批准；如果发现目标输入错误，则应评估取消并修改配置重新规划。这是两种处置分支，不是固定的先批准再取消。

取消后至少确认三件事：平台是否已停止推进、已有步骤是否完成、状态是否记录已完成对象。如果 API 已经创建一个桶，取消不会自动删除它；新的修复计划应以这个事实为起点。

对一个组件计划有审批权限，也不一定有全部操作权限。批准或取消报权限错误时，应核对身份和目标，不应改用另一个组或另一条运行来绕过失败。

### 如何查询部署运行并持续跟踪状态
<!-- src: md/commands/stacks/deployment-run/list.md; md/commands/stacks/deployment-run/watch.md -->

运行列表把组级观察细化到单条运行，包含运行标识和时间信息。它适合区分首次运行与重跑，也能为故障报告保留可追踪证据。

```bash
terraform stacks deployment-run list -deployment-group-id dg-example -json
terraform stacks deployment-run watch -deployment-run-id dr-example
```

list 的范围是 deployment group；按名称定位时需要组织、项目、Stack 与组名，并选择最新配置对应组。watch 则直接使用单条运行 ID。固定 group ID 后再选择 run ID，有助于避免跟踪到另一版配置。

观察应同时回答：计划是否生成，是否等待审批，是否进入执行，最终是否失败或完成，以及失败涉及哪些组件。状态名称与 JSON 字段以目标平台和插件版本为准；材料只给命令用途，没有提供可直接实现的完整终态枚举。

自动化应保存返回结果、命令退出状态、运行 ID 和失败诊断，区分本地网络断开与平台执行失败。列表非空不代表运行成功，watch 能持续输出也不代表业务服务健康。部署结束后还需应用层验证；Terraform 管理对象达到目标，只覆盖发布验收的一部分。

#### 将 ID 和尝试时间关联起来

以下是自定义教学记录，描述一个 west 部署的先后尝试，不是平台 API 固定输出：

| 配置版本 | 部署组 | 运行 | 时间与结果概述 |
|---|---|---|---|
| config-A | dg-west | dr-west-1 | 10:00 开始，配额错误 |
| config-A | dg-west | dr-west-2 | 10:30 修复原因后重跑 |
| config-B | dg-west-b | dr-west-b1 | 11:00 新配置版本的运行 |

要调查第一次错误就查看 dr-west-1；要判断重跑是否完成就查看 dr-west-2；要判断新配置的结果则转到 config-B。list 帮助找到标识和时间，watch 帮助追踪具体运行，二者结合才形成可解释的时间线。业务健康检查仍需结合应用自身证据。

## 第 13 章 · 使用 Workspace 管理多份状态

### Workspace 如何复用配置以及为何不等同于权限隔离
<!-- src: md/workspaces.md; md/commands/workspace.md -->

CLI Workspace 在同一工作目录、同一 Backend 下选择不同状态，可以用一份配置管理多套互不重叠的资源。它减少重复工作副本和依赖缓存，但不会自动创建独立账号、网络或权限边界。

```mermaid
graph TD
  A[同一份根模块配置] --> B[选择 CLI Workspace]
  B --> C[default 状态]
  B --> D[feature 状态]
  C --> E[资源集合一]
  D --> F[资源集合二]
```

| 对象 | CLI Workspace | HCP Terraform Workspace |
|---|---|---|
| 配置 | 共享当前工作副本 | 有自己的配置关联 |
| 状态 | 同一 Backend 内的多份状态 | 独立状态与运行记录 |
| 变量与设置 | 由本地调用和配置提供 | 有独立变量、设置和执行模式 |
| 适用范围 | 同配置临时副本等场景 | 平台协作与独立运行单元 |

命名、区域和其他输入仍需区分，否则两份空状态可能试图创建同名资源。Workspace 与 Git 分支也不会自动同步；切分支后要独立确认状态目标。

需要不同凭据或强访问隔离的生产与测试环境，更适合独立根配置和 Backend，通过可复用模块共享代码。不同系统组件也应按架构边界拆分，不能仅用 Workspace 表达组件拆分。

组件之间可通过 DNS、标签发现、配置存储或受控根输出共享信息。`terraform_remote_state` 会增加状态存储权限和生命周期耦合，选择时要考虑读取者实际能访问的状态范围。Workspace 解决状态选择，不能替代这些接口设计。

#### 状态目标与环境输入是两个选择

沿用第 1、2 章的 service-demo，环境差异来自明确传入的变量文件：

| Workspace | 显式输入 | service_name 的配置值 |
|---|---|---|
| development | dev.tfvars | api-dev |
| production | prod.tfvars | api-prod |

切到 production 不会自动读取 prod.tfvars。如果仍传 dev.tfvars，配置仍会算出 api-dev；Workspace 仅改变绑定记录的目标，不能自动理解团队的命名习惯。

使用默认 local Backend 路径时，目录可按以下方式理解。它不适用于自定义远端 Backend 的物理存储布局：

```text
service-demo/
├── terraform.tfstate                 default 的状态
└── terraform.tfstate.d/
    ├── development/terraform.tfstate
    └── production/terraform.tfstate
```

不同状态可以记录不同对象，但凭据与 Backend 访问控制仍可能相同。状态分离与身份隔离应分别设计。

### 如何查看和切换当前 Workspace
<!-- src: md/commands/workspace/list.md; md/commands/workspace/select.md -->

当前 Workspace 是后续 plan、apply 和 state 操作的隐式目标，值得作为每次运行的显式检查。选中状态通常记在本地 `.terraform/` 中，因此两位成员可以选不同 Workspace，但同一工作目录里的多个任务仍可能互相影响。

```bash
terraform workspace list
terraform workspace select development
terraform workspace show
```

list 用星号标记当前项；select 默认要求目标已经存在，成功后 show 应打印 `development`。如果目标不存在，要先判断是否名称错误，不能在生产脚本中无条件创建空状态。

`select -or-create` 可以在缺失时创建，适合明确允许新建临时环境的流程，不适合掩盖拼写错误。较新 workspace list 接口提供 JSON 输出；跨版本脚本先核对支持情况，再选择列表解析方式。

若使用 `TF_WORKSPACE`，环境变量也参与目标选择。排查切换不生效时应检查它及 `TF_DATA_DIR`，不要只看终端上一条 select 输出。并发流水线使用独立工作副本或明确隔离运行元数据，避免共享目录中的选择相互覆盖。

#### 让选择失败终止后续流程

下面是独立 shell 脚本示例，明确拒绝继承了 TF_WORKSPACE 的混合选择方式；团队也可选择全程只用该变量，但不要两种方式互相覆盖：

```bash
set -euo pipefail
if [ -n "${TF_WORKSPACE:-}" ]; then
  printf '%s\n' '请先确认 TF_WORKSPACE 与显式选择方式' >&2
  exit 1
fi
target_workspace=development
terraform workspace select "$target_workspace"
selected_workspace=$(terraform workspace show)
if [ "$selected_workspace" != "$target_workspace" ]; then
  printf '%s\n' 'Workspace 未匹配目标' >&2
  exit 1
fi
terraform plan -var-file=dev.tfvars
```

select 缺失目标时返回失败，set -e 会阻止后续 plan。这里不使用 or-create，因为配置错误导致的不存在不应自动变成一个新的空环境。脚本按调用者选择的工作目录执行，目录与 Backend 仍应在前置步骤确认。

### 如何创建 Workspace 并确定初始状态
<!-- src: md/commands/workspace/new.md -->

`workspace new NAME` 创建并切换到新 Workspace。默认新状态为空，下一次计划会按当前配置提出创建，因此它不是复制原环境的运行结果。

```bash
terraform workspace new feature-demo
terraform workspace show
terraform plan -var-file=dev.tfvars -var='environment=feature-demo'
```

这里复用第 2 章 dev.tfvars，再显式覆盖 environment，需确保资源名称和位置不与现有环境冲突。Workspace 名应可安全用于 URL 路径段，采用简单小写短横线名称便于跨 Backend 使用。

`terraform workspace new -state=old.tfstate feature-demo` 会用指定状态初始化新 Workspace，不是创建空状态。

复制状态不会克隆真实对象，反而可能让两份状态同时指向相同 ID。仅在已设计的状态迁移或恢复流程中使用 `-state`，明确旧状态何时停止管理并验证新归属。想创建独立测试环境应从空状态按差异化输入部署，不能通过复制生产状态得到隔离环境。

#### 复制绑定不会复制对象

假设 development 已经记录 object-A：

```text
普通 new feature-demo
development 状态 -> object-A
feature-demo 状态 -> 尚无绑定

new -state=旧快照 feature-demo
development 状态 -> object-A
feature-demo 状态 -> 同一个 object-A
```

第二种情况没有创建 object-B，只是把旧 ID 放进另一份状态。如果两套流程继续运行，就可能争用同一对象。只有在明确的状态归属迁移中，才应安排旧管理者停止并由新状态接管。

创建临时环境时，空状态配合独立变量和资源名才表达新的一套目标。例如给基础示例传 environment=feature-demo；对真实桶还要提供全局唯一名称，不能仅改 Workspace 名就期望云端自动分配隔离命名。

### 如何清理 Workspace 并确认后续命令的目标
<!-- src: md/commands/workspace/delete.md; md/commands/workspace/show.md -->

删除 Workspace 是删除状态容器，不是先自动清空基础设施。常规清理顺序是切到临时 Workspace、审查并销毁资源、验证没有待管理对象，再切走删除 Workspace。

```bash
terraform workspace select feature-demo
terraform state list
# 若仍管理资源 先按第 2 章流程审查并完成销毁
terraform workspace select default
terraform workspace delete feature-demo
terraform workspace show
```

上例只有在 feature-demo 已不再跟踪资源时才应执行 delete。目标必须存在、不能是当前 Workspace，default 也不是常规可删除的临时环境。Backend 还可能基于锁等条件施加限制。

`delete -force` 即使仍有资源也能删除对应 Workspace，可能造成真实对象脱管且继续计费。它不能解决删除 API 失败，也不能当作销毁失败后的清理捷径。确需移交管理时，应先保存状态并建立新的归属。

最后的 show 让后续命令目标可见。清理脚本应同时检查各步退出码，不能在切换失败后继续销毁或删除。即使 state list 为空，仍应检查之前手工解除绑定或平台删除失败的资源，完成费用与业务清理。

#### 清理前后记录应如何变化

| 步骤完成后 | 当前 Workspace | feature-demo 的预期记录 |
|---|---|---|
| 已审查并完成资源销毁 | feature-demo | 无待管理对象 |
| 已切换到 default | default | 仍存在空 Workspace |
| 已删除 feature-demo | default | 列表中不再出现 |

如果第一步仍有残留对象，先处理资源问题；如果第二步切换失败，不能继续删除当前 Workspace。最终看 show 确认后续命令目标，看 list 确认容器删除，而真实平台的残余资源检查仍承担不同职责。空状态不是整个云账号没有遗留资源的证据。

## 第 14 章 · 管理 Provider 版本、签名与分发

### Provider 如何安装以及签名证明了什么
<!-- src: md/plugins.md; md/plugins/signing.md -->

Provider 是 CLI 与平台 API 之间的插件。配置声明所需来源和版本约束，init 解析整个模块树的依赖并安装包；因此一个根模块看似未声明某 Provider，也可能由子模块引入。

```mermaid
graph TD
  A[模块树中的 Provider 要求] --> B[结合锁文件选版本]
  B --> C[从注册表或镜像取包]
  C --> D[校验包与可信签名信息]
  D --> E[安装到工作目录]
```

注册表分发的 Provider 包具有签名，安装时会验证相关签名信息。HashiCorp 签名、可信合作伙伴签名和自签名表示不同发布者信任链；合作伙伴并不是 HashiCorp 编写全部代码，自签名也不代表有 HashiCorp 验证的身份链。

```bash
terraform init
terraform providers
```

观察 init 的签名与来源输出，确认来源地址符合预期。签名证明发布来源与包完整性的一部分，不能自动证明代码没有漏洞、行为符合组织要求或适合访问生产凭据。

手工安装和镜像需要额外关注包来源。签名认证链主要来自原始注册表；镜像中的包可用预先记录的可信校验和验证，但不能因为文件能解压就视为可信。Provider 是会执行的程序，选用未知 fork 时应审查发布方、兼容性和获取渠道。

#### 要求一个 Provider 与配置它是两件事

第 1 章的 required_providers 声明“需要 hashicorp/aws 6.0.0”；配套 `provider-example/provider.tf` 才描述这个实现使用哪个区域：

```hcl
provider "aws" {
  region = "ap-southeast-1"
}
```

来源、版本、区域分别属于不同维度。换区域不是升级 Provider，换版本也不会自动切账号。安装时签名帮助判断包的发布身份，区域与认证设置则影响运行请求。

内置 `terraform_data` 的 Provider 随 CLI 提供，因此不会下载一个名叫 hashicorp/terraform_data 的注册表包。遇到“找不到 Provider”时，先看资源到底来自内置实现还是外部分发，再确认来源拼写。

### 如何追踪 Provider 依赖并确认实际版本
<!-- src: md/commands/providers.md; md/commands/version.md -->

依赖排查应分清“配置要求什么”和“当前选择了什么”。`terraform providers` 帮助追踪哪个模块引入约束，也能显示状态中的 Provider 依赖；`terraform version` 则提供 CLI、平台和当前目录的 Provider 版本信息。

```bash
terraform providers
terraform version
terraform version -json > toolchain.json
```

版本 JSON 适合保存工具链快照，但不能取代安全公告检查。锁文件中的 Provider 来源和选择版本应与配置约束、平台运行环境一致，版本输出不意味着资源已通过对应 Provider 验证。

若根模块允许 5.x，子模块却限制为互不相容的旧版本，init 可能找不到交集。处理时应找到约束来源并审查模块升级，不宜直接删除锁文件希望“自动解决”。若状态还引用配置中已移除的 Provider，应按资源管理归属处理，不能把残留依赖当作无用文本删除。

可在两个配置副本中分别保存 providers 与 version 输出，比较依赖树和实际选择。诊断报告应包含配置提交、CLI 平台和锁文件；只写“Terraform 最新版”无法复现安装结果。

#### 从两个模块的约束找出冲突

以下是有意构造的依赖冲突例子，HCL 语法都合法。根 `versions.tf` 要求 AWS 6.x，子模块 `modules/legacy/versions.tf` 却仅接受 5.x：

```hcl
# 根 versions.tf
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0.0, < 7.0.0"
    }
  }
}
module "legacy" {
  source = "./modules/legacy"
}
```

```hcl
# modules/legacy/versions.tf
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0.0, < 6.0.0"
    }
  }
}
```

两者对同一来源的约束没有交集，因此不能通过下载另一个包解决。providers 树的教学表示为：

```text
root                 hashicorp/aws >= 6.0.0, < 7.0.0
└── module.legacy    hashicorp/aws >= 5.0.0, < 6.0.0
```

应审查 legacy 模块是否支持升级，或调整整体模块组合。删除锁文件不会让不相交的区间变得相交，降低校验要求也不能提供兼容实现。

### 如何为不同平台准备可复现的依赖锁文件
<!-- src: md/commands/providers/lock.md -->

Provider 锁文件把允许范围收敛为具体选择，并保存校验包的 hashes。跨 macOS 开发机和 Linux CI 时，应事先为目标平台补全信息，避免每台机器第一次 init 都改变锁文件。

```bash
terraform providers lock \
  -platform=darwin_arm64 \
  -platform=linux_amd64
```

该命令默认从原始注册表获取签名覆盖的校验信息，更新锁文件但不等于完成工作目录的 Provider 初始化。审查输出中的签名身份，再审查锁文件 diff；不是 hashes 越多就越可信，而是来源与目标平台符合预期。

只处理某个 Provider 可在末尾指定来源地址。内部 Provider 若只存在文件镜像，可按以下形式锁定，但校验和依据是该镜像，不是原始注册表签名：

```bash
terraform providers lock \
  -fs-mirror=/opt/terraform/providers \
  -platform=linux_amd64 \
  registry.example.com/platform/internal
```

路径和 Provider 是占位示例，需存在真实包。`-net-mirror` 要求符合网络镜像协议。来源与平台缺失时应失败并调查，不应绕过校验。多行 shell 命令中的续行反斜杠必须紧接换行，后面不能追加注释。

支持 `-enable-plugin-cache` 的版本可利用全局缓存加速锁定，但缓存不是权威来源，采用前应核对目标版本帮助和来源策略。锁文件主要管理 Provider，不能据此保证所有远端模块来源都已固定。

#### 约束、选择和 hashes 各自表达什么

锁文件条目节选示意如下，空 hashes 故意表示没有给出实际校验值；不能把此片段当作可用锁文件提交：

```hcl
provider "registry.terraform.io/hashicorp/aws" {
  version     = "6.0.0"
  constraints = ">= 6.0.0, < 7.0.0"
  hashes      = []
}
```

constraints 表达配置允许范围，version 表达本次选择，hashes 为所选版本的包校验提供依据。即使约束允许 6.1.0，只要锁文件仍选择 6.0.0，普通 init 通常继续采用 6.0.0；显式升级才重新考虑符合约束的版本。

真实 hashes 可能包含不同校验形式，不能假定一个 hash 就简单对应一个操作系统。多平台 lock 的目标是使所需平台的实际包都能被可信信息验证。审查依赖更新时，应一起查看来源、选择版本和校验信息的变化，而不是只看新增了几行 hash。

### 如何建立离线 Provider 镜像
<!-- src: md/commands/providers/mirror.md -->

离线安装需要先在有网络的受控环境下载目标配置依赖的 Provider 包，再把镜像目录转入离线环境，并配置安装规则。`providers mirror` 准备的是包与目录结构，不会自动改变另一台机器的 CLI 配置。

```bash
terraform providers mirror \
  -platform=darwin_arm64 \
  -platform=linux_amd64 \
  ./provider-mirror
```

默认只准备当前平台，跨平台要重复提供 `-platform`。有锁文件时默认使用其选择版本；`-lock-file=false` 会忽略锁文件，不宜用于要求复现已批准依赖的镜像构建。

目标目录包含按 Provider 来源组织的 zip 包与网络镜像 JSON 索引。文件镜像以目录内容为准并忽略索引；若部署为 HTTPS 静态镜像，索引才参与协议。重复 mirror 可增加平台和包，并合并更新索引，不会自动删除旧包。

消费端需把 `provider_installation` 指向镜像。若仍允许匹配的 direct 来源，init 可能继续访问注册表；验证离线能力时应检查规则是否关闭相应直连，以及镜像版本和平台是否完整。

Provider 镜像不含 Terraform CLI 二进制、子模块源码或云 API，本地有镜像不等于 plan 能完全离线。应分别准备这些依赖，并用受控配置确认 init 安装的是批准的包和锁文件选择。

#### 镜像目录必须带上包身份

文件镜像支持 packed 和 unpacked 两种布局。以下是同一个 AWS 发布包的替代布局：

```text
packed/
└── registry.terraform.io/hashicorp/aws/
    └── terraform-provider-aws_6.0.0_linux_amd64.zip

unpacked/
└── registry.terraform.io/hashicorp/aws/6.0.0/linux_amd64/
    └── terraform-provider-aws_v6.0.0_x5
```

最后的可执行文件名应以真实包内容为准。仅把二进制放在一个任意目录，并不能让文件镜像推断 Provider 来源、版本和平台。

若镜像位于 `/opt/terraform/provider-mirror`，对应 CLI 安装配置可以只允许该目录提供公共 AWS Provider：

```hcl
provider_installation {
  filesystem_mirror {
    path    = "/opt/terraform/provider-mirror"
    include = ["registry.terraform.io/hashicorp/aws"]
  }
  direct {
    exclude = ["registry.terraform.io/hashicorp/aws"]
  }
}
```

其他 Provider 仍可 direct，这不是完全断网安装策略。希望所有包都来自内部镜像时，应覆盖全部实际来源并准备对应包；不能仅扩大 include 就假定镜像内容已经齐备。

### 如何读取 Provider Schema 辅助配置与工具开发
<!-- src: md/commands/providers/schema.md -->

Provider Schema（以下为独立示例片段）是配置接口的机器描述，适合编辑器提示、参数盘点和工具开发。它描述可配置字段、计算字段与嵌套结构，不能替代运行时计划和平台 API 约束。

```bash
terraform providers schema -json > provider-schema.json
jq '.provider_schemas | keys' provider-schema.json
```

`-json` 必需，键通常是完整 Provider 来源地址。顶层 `format_version` 控制输出格式兼容性；内部 Schema 的 `version` 是状态 Schema 版本，不是 Provider 发布版本。消费端应忽略可兼容的新字段，拒绝未知主版本。

属性可包含 `required`、`optional`、`computed`、`sensitive` 和类型说明。optional 与 computed 可以共同出现，表示可配置也可由 Provider 决定；纯 computed 值不能机械复制为配置。嵌套块还包含 nesting_mode 及适用时的数量限制，生成工具不能只扫描顶层 attributes。

新版本可能附带 Provider 函数与 ephemeral 资源 Schema，函数描述包含固定和可变参数、返回类型以及弃用信息。旧版本或特定 Provider 没有这些字段时应正常降级，而不是视为损坏。

Schema 可帮助判断“这个参数是否存在”，不能完整回答“改变它是否必然替换资源”或“组合参数是否被远端接受”。这些仍需对应版本文档、计划和受控运行。示例要求依赖已安装，本节后面的 JSON 用来解释字段结构。

#### 从 Schema 字段判断输入与计算结果

下面是虚构类型 `example_service` 的教学 Schema 节选，使用官方输出结构解释字段；它不是 AWS 的真实 Schema，也不用于创建资源：

```json
{
  "format_version": "1.0",
  "provider_schemas": {
    "registry.example.com/platform/example": {
      "resource_schemas": {
        "example_service": {
          "version": 1,
          "block": {
            "attributes": {
              "name": {"type": "string", "required": true},
              "id": {"type": "string", "computed": true},
              "token": {"type": "string", "optional": true, "sensitive": true}
            },
            "block_types": {
              "endpoint": {
                "nesting_mode": "list",
                "max_items": 1,
                "block": {"attributes": {"url": {"type": "string", "required": true}}}
              }
            }
          }
        }
      }
    }
  }
}
```

name 必须提供，id 由 Provider 计算，token 可省略但值可能敏感。endpoint 是嵌套块而不是名为 endpoint 的字符串属性，其内部还需 url；只遍历顶层 attributes 会漏掉这部分结构。

```bash
jq '.provider_schemas["registry.example.com/platform/example"].resource_schemas.example_service.block.attributes' provider-schema.json
```

该 jq 路径对应上面的教学 JSON。实际读取 AWS Schema 时必须换成真实 Provider 地址和类型。内部 version=1 描述资源 Schema，不是 Provider 1.0 版本，也不直接说明改 name 是否替换；后者仍需计划与实现规则。

## 第 15 章 · 配置 CLI 运行环境与自动化行为

### CLI 配置文件与项目配置分别控制什么
<!-- src: md/config.md; md/config/config-file.md -->

CLI 配置控制用户级安装、凭据和客户端行为，基础设施 `.tf` 配置声明资源目标。二者同用 HCL 语法，但块的含义不同；把 `provider_installation` 写进项目 main.tf 并不能配置插件镜像。

Unix/macOS 默认读取用户主目录的 `.terraformrc`，Windows 默认读取 `%APPDATA%/terraform.rc`。Windows 要防止隐藏扩展名导致实际文件为 `terraform.rc.txt`。隔离流程可以用 `TF_CLI_CONFIG_FILE` 指向单独的 `*.tfrc` 文件。

```hcl
# 此片段属于 CLI 配置文件
plugin_cache_dir   = "/opt/terraform/plugin-cache"
disable_checkpoint = true
```

缓存目录必须预先存在且可读写。这里的路径是示例，不应为了运行正文命令而直接修改用户全局文件。可以在任务专用目录准备配置，再限定到当前进程：

```bash
TF_CLI_CONFIG_FILE=/path/to/ci.tfrc terraform version
```

禁用 Checkpoint 会关闭升级与安全公告请求，不能因此不再跟踪版本漏洞。`disable_checkpoint_signature` 只禁用匿名去重标识，与完全禁止请求不同。

旧 CLI `providers` 配置块不能表达现代 Provider 来源与版本，应使用 provider_installation。需要实验 Provider 时可使用临时 dev_overrides，放在安装规则首位；它会使实际操作使用本地开发包并绕过该 Provider 的常规版本与校验和选择，不适合作为普通离线安装方案。开发结束应移除覆盖并重新选择发布版本。

#### 文件类型相同语法不同职责

| 文件 | 应包含的内容 | 不应放入的内容 |
|---|---|---|
| 项目 versions.tf | terraform、required_providers、版本限制 | 用户 CLI 缓存与凭据 helper |
| 项目 provider.tf | Provider 的区域等运行配置 | provider_installation |
| 任务 ci.tfrc | Provider 安装渠道、缓存、客户端设置 | resource、module |

以下 `ci.tfrc` 例子只配置缓存目录，实际目录需要预先存在。它不影响项目选择哪个 Backend：

```hcl
plugin_cache_dir = "/opt/terraform/plugin-cache"
```

用 `TF_CLI_CONFIG_FILE=/path/to/ci.tfrc` 指向它，只是让这次 CLI 读取该文件。若需要复现另一个人的环境，应该明确记录配置路径及作用，而不是把其整个主目录配置复制进项目。

### 凭据来源、安装规则与插件缓存如何共同生效
<!-- src: md/config/config-file.md -->

凭据、安装规则与缓存分别回答“用什么身份访问服务”“从哪里获得 Provider”“能否复用已下载包”。一个设置正确不会补齐另外两个，例如缓存中有包也不一定能访问私有模块注册表。

对支持 `TF_TOKEN_...` 的版本，主机凭据优先级是环境变量、CLI 明确配置、credentials helper。`TF_TOKEN_app_terraform_io` 对应 `app.terraform.io`；带连字符的主机名可按文档用双下划线编码，国际化域名要先转 punycode。主机名称必须与 Backend 或模块来源一致，避免同一服务多个别名导致凭据找不到。

HCP/TFE 的 CLI 使用 user 或 team token，不能拿 organization token 代替。helper 最多配置一个，且不会覆盖显式配置的主机凭据；环境变量覆盖又可能解释为何 logout 后仍能访问。不得在排查日志中打印 token 本身。

```hcl
provider_installation {
  filesystem_mirror {
    path    = "/opt/terraform/provider-mirror"
    include = ["registry.terraform.io/*/*"]
  }
  direct {
    exclude = ["registry.terraform.io/*/*"]
  }
}
```

此例让公共注册表 Provider 只从文件镜像安装，其他来源仍允许 direct。安装方法不是简单的“先镜像失败再直连”顺序列表；匹配的方法会共同参与可用版本选择，再受约束与锁文件限制。exclude 优先于同方法的 include，`*/*` 只简写公共注册表，不是所有主机。

network_mirror 要求 HTTPS 且 URL 以 `/` 结尾，并实现镜像协议。TLS 验证服务器身份，不证明其提供的包一定等同原始发布包，应结合可信锁文件。没有显式安装规则时，Terraform 会探测平台相关的隐式镜像目录并对发现的 Provider 排除隐式 direct；改成显式配置后，这些排除需自己写出。

缓存发生在选好版本之后，仍可能查询安装源元数据；缓存目录不能同时作为镜像目录，也不保证多进程 init 并发安全。Terraform 不自动清理旧缓存，应制定保留策略。`plugin_cache_may_break_dependency_lock_file` 可能产生仅适合当前平台的不完整锁记录，不能为加速就默认启用。

#### 凭据配置与 helper 的覆盖关系

CLI HCL 凭据配置可以写成下面形式，token 是不可用占位值。helper 名称 example 也代表外部已安装程序，并非 Terraform 自带能力：

```hcl
credentials "app.terraform.io" {
  token = "REPLACE_WITH_USER_OR_TEAM_TOKEN"
}
credentials_helper "example" {
  args = []
}
```

对于 app.terraform.io，显式 credentials 在 helper 之前；如果又有该主机的 TF_TOKEN 环境变量，则环境变量优先。对于未显式配置的另一主机，才可能咨询 helper。多来源排查应围绕具体 hostname，不能笼统说“CLI 登录过了”。

#### 安装规则如何选择可用渠道

下面是与文件镜像方案互为替代的网络镜像 `ci.tfrc` 片段。HTTPS URL 是示意，需实现 Provider 网络镜像协议：

```hcl
provider_installation {
  network_mirror {
    url     = "https://mirror.example.com/terraform/providers/"
    include = ["registry.terraform.io/hashicorp/*"]
  }
  direct {
    exclude = ["registry.terraform.io/hashicorp/*"]
  }
}
```

| Provider 来源 | 此例允许的方法 |
|---|---|
| registry.terraform.io/hashicorp/aws | network_mirror |
| registry.terraform.io/hashicorp/random | network_mirror |
| registry.example.com/platform/internal | direct |

如果只写 mirror.include 而没有 direct.exclude，匹配的 Provider 仍可能通过 direct 参与版本选择。这不是镜像不可用时才会启动的简单回退机制，配置时应明确允许的渠道集合。

#### 缓存命中发生在版本选择之后

假设已选择 AWS 6.0.0/linux_amd64：缓存有该包且校验符合锁文件时，可复用；只有 darwin_arm64 的包时，则不能拿它给 Linux 执行。包相同版本不同平台，是不同安装对象。

即使命中缓存，初始化仍可能查询元数据，所以缓存不等于离线镜像。缓存与镜像使用不同目录：前者由下载与复用逻辑管理，后者作为安装来源。把两个目录合并可能破坏管理假设，不能仅为节省空间这样配置。

### 如何通过环境变量控制输入、日志与自动化执行
<!-- src: md/config/environment-variables.md -->

环境变量适合把非交互行为限定到作业，但也会隐藏关键目标。脚本应明确设置必要项，并在结束后避免遗留到交互 shell。尤其是 Workspace 与运行数据目录，必须从 init 到后续命令保持一致。

```bash
TF_INPUT=0 TF_IN_AUTOMATION=1 \
  TF_CLI_ARGS_plan='-lock-timeout=60s -no-color' \
  terraform plan -var-file=dev.tfvars -out=tfplan
```

`TF_INPUT=0` 关闭缺失输入提示，不代表批准 apply；`TF_IN_AUTOMATION` 只调整人类提示文本，不改变执行策略。`TF_CLI_ARGS` 会对全部子命令插入参数，容易把不支持的参数传给其他命令；优先使用如 `TF_CLI_ARGS_plan` 的限定形式。显式命令行参数在插入参数之后，通常覆盖对应设置。不要把其他子命令的 force 选项套到 apply。

`TF_VAR_name` 提供根变量值，集合需是可解析的 HCL 表达式；自动变量文件和显式参数可覆盖环境输入。`TF_WORKSPACE` 会覆盖 Workspace 选择，`TF_DATA_DIR` 改变 `.terraform` 运行元数据位置，但不是状态 Backend 迁移开关。

| 设置 | 作用 | 判断边界 |
|---|---|---|
| `TF_LOG` 与 `TF_LOG_PATH` | 开启调试并写日志 | PATH 单独设置不会启用日志，内容可能敏感 |
| `TF_REGISTRY_CLIENT_TIMEOUT` | 注册表客户端超时秒数 | 不等同云 API 超时 |
| `TF_REGISTRY_DISCOVERY_RETRY` | 可重试注册表请求的重试次数 | 不能修正无效凭据或错误来源 |
| `TF_STATE_PERSIST_INTERVAL` | apply 中远端状态持久化尝试间隔 | 受 Backend 最小间隔限制，不是恢复点保证 |
| `TF_PLUGIN_CACHE_DIR` | 指定 Provider 缓存 | 不替代镜像与校验策略 |

需要短期调试时可为单次命令设置 `TF_LOG=DEBUG TF_LOG_PATH=./terraform.log`，结束后限制日志访问并清除环境设置。状态持久化默认最小间隔为 20 秒，Backend 可覆写；调得更低不一定更频繁。配置文件环境变量使用 `TF_CLI_CONFIG_FILE`，不再采用弃用别名 `TERRAFORM_CONFIG`。

#### 让隐藏输入变成可解释的覆盖

在第 2 章输入基础上，下例最后应采用 prod.tfvars 的 environment=prod，而不是环境变量中的 staging：

```bash
TF_VAR_environment=staging terraform plan -var-file=prod.tfvars
```

若希望在命令末尾临时覆盖，则可以显式增加 `-var='environment=canary'`。此时最终值改变是输入优先级的结果，不应归因于 Workspace 切换。

单次调试可以使用以下命令形式，假设当前目录和变量文件已经准备好：

```bash
TF_LOG=DEBUG TF_LOG_PATH=./terraform.log \
  terraform plan -var-file=dev.tfvars
```

这种前缀设置只传给该次进程，不把调试级别长期留在 shell 中。日志仍需限制共享，调试完成后按保留策略处理文件。一般 CI 可组合 TF_INPUT、TF_IN_AUTOMATION 和命令限定的 TF_CLI_ARGS_plan，但输入值、Workspace 与计划制品应另外明确，避免靠一组不可见环境变量决定关键目标。

## 第 16 章 · 连接 HCP Terraform 并迁移现有状态

### CLI 如何连接组织与远端 Workspace
<!-- src: md/cloud.md; md/cloud/settings.md -->

HCP Terraform 的 CLI 集成让本地命令成为平台运行入口。默认远端执行模式下，plan/apply 在平台运行并把日志流回终端；Workspace 也可设置为 local 执行，此时主要由平台保存状态。先确认执行模式，才能判断凭据、文件和网络访问必须放在哪里。

```hcl
terraform {
  cloud {
    organization = "example-org"
    workspaces {
      name = "service-dev"
    }
  }
}
```

这是连接片段，不含真实组织或 token，也不与 backend 块同时配置。先通过 login 或受控凭据来源认证，再初始化连接。CLI cloud 集成自 Terraform 1.1.0、Terraform Enterprise 202201-1 起支持；项目与标签等具体扩展能力仍应核对目标版本。

可以用 `workspaces.name` 固定一个 Workspace，或用 `tags` 关联符合条件的 Workspace，不能同时指定 name 和 tags。project 可限定项目范围。标签匹配范围较大时，应确认没有把不相干环境引入候选集；没有匹配项时初始化可能提示创建，需要判断是否确实应创建。

`TF_CLOUD_ORGANIZATION`、`TF_CLOUD_HOSTNAME`、`TF_CLOUD_PROJECT` 与 `TF_WORKSPACE` 可参与连接配置或目标选择，但空 cloud 块等前提仍需满足，不能只导出变量就期待普通 Backend 自动转换。显式 cloud 属性优先于对应 `TF_CLOUD_...` 环境变量；以 `TF_WORKSPACE` 指定的远端 Workspace 必须已经存在，采用 tags 时还需落在匹配集合内。凭据不写入共享 `.tf`；远端运行所需 Provider 权限也要在远端环境配置。

#### name 和 tags 是两种替代选择

前面的 name 片段固定 service-dev。若需要在项目内选择一组符合标签的 Workspace，可替换为以下 `cloud-tags.tf`；它和 name 方案不同时加载：

```hcl
terraform {
  cloud {
    organization = "example-org"
    workspaces {
      project = "sre-lab"
      tags = {
        application = "service"
        source      = "cli"
      }
    }
  }
}
```

键值标签要求支持这种标签形式的版本；较旧环境只支持 key-only tags 时应采用其对应语法。标签决定候选集合，最终仍要选中一个正确的 Workspace。

| 执行模式 | Terraform/Provider 进程 | 主要文件与变量准备位置 | 云 API 网络可达性 |
|---|---|---|---|
| 本地执行，HCP 存状态 | 本地机器 | 本地配置与输入，另有平台状态认证 | 本地执行机 |
| HCP 远端执行 | 平台执行环境 | 上传配置及平台运行变量/身份 | 平台或相应执行环境 |

因此“我本地能 curl 到内网 API”不能证明远端 Provider 可以访问。对远端问题，应按执行位置检查网络和认证，不要只重复本地 login。

### 如何初始化连接并迁移已有状态
<!-- src: md/cloud/settings.md -->

状态迁移把已有管理记录交给 HCP Terraform 保存，目标是保留资源绑定。它不应该导致云资源重新创建，也不自动证明远端执行环境已经具备全部变量与网络权限。

```mermaid
graph TD
  A[记录旧 Backend 和各 Workspace] --> B[保存迁移前快照]
  B --> C[配置平台凭据与 cloud]
  C --> D[初始化并审查迁移提示]
  D --> E[核对远端状态与对象 ID]
  E --> F[配置运行变量与凭据]
  F --> G[验证远端计划]
```

```bash
# 先在旧连接下逐 Workspace 保存快照
terraform workspace show
terraform state pull > before-cloud-migration.tfstate
# 完成 cloud 配置修改后
terraform init
terraform workspace list
terraform state list
```

迁移前先暂停相关执行者，并验证备份有效。init 可能要求迁移和重命名多个本地 Workspace，HCP 名称需在组织内唯一，可用组件、环境、区域组合命名。应逐项记录旧名到新名及状态对应，不能只检查 default。

从 `backend "remote"` 切到 cloud 时，可以继续使用同一组 HCP Workspace。原来的 prefix 选取方式要改为 cloud 支持的 name 或 tags；迁移后 CLI 使用远端完整 Workspace 名，而非只使用前缀后的短名。

连接成功后先核对状态地址和 ID，再进入受控远端计划验证。若计划突然大量创建已有对象，优先检查目标与迁移记录。状态接入与远端执行就绪是分别验收的结果。

#### 从 remote backend 迁到 cloud 的配置变化

对于固定同一个 Workspace 的情况，可以用以下 diff 表达变化。该代码块是差异说明，不作为完整 `.tf` 文件使用：

```diff
 terraform {
-  backend "remote" {
+  cloud {
     organization = "example-org"
     workspaces {
       name = "service-dev"
     }
   }
 }
```

若原来使用 prefix，则还要重新表达 Workspace 选择。例如旧前缀为 `service-`、CLI 原先选择短名 dev，迁到 cloud 后选择完整名称 service-dev。记录表可写成：

| 旧连接选择 | 远端完整名 | 迁移后 CLI 名称 | 应核对 |
|---|---|---|---|
| prefix=service-，dev | service-dev | service-dev | 原对象 ID 与状态归属 |
| prefix=service-，prod | service-prod | service-prod | 生产状态没有落到 dev |

从 remote backend 继续使用已有 HCP Workspace，不等于复制创建一套新对象。完成连接后核对绑定，再检查平台变量与执行模式，才能判断迁移是否满足后续运行要求。

### 如何控制上传内容并处理远端版本兼容性
<!-- src: md/cloud/settings.md; md/cloud/command-line-arguments.md -->

远端 plan/apply 会上传配置目录的副本，远端只能使用上传内容和平台提供的数据。多余大文件会拖慢上传，本地秘密文件则可能泄漏，遗漏必要模块或模板又会让远端失败。

在配置根目录设置 `.terraformignore`，下例是需要按项目实际文件调整的文本模式：

```text
# 排除本地临时材料
screenshots/
notes-private/
*.log
*.tfplan
*.tfstate
*.tfstate.backup
```

规则接近 gitignore，支持注释、空行、目录斜杠和 `!` 反向匹配；只读取根目录对应文件。没有该文件时也默认排除 `.git/` 与 `.terraform/` 的部分内容，但模块目录有特殊处理。不能假设 `.gitignore` 自动等价于上传规则，也不要排除运行必需的模块和输入模板。

本地状态修改后向远端推送时，CLI 会检查与远端选择的 Terraform 版本是否兼容。`-ignore-remote-version` 跳过检查，可能写出远端无法解码的快照，不是升级远端版本的命令。

遇到版本不匹配，应先统一工具链或制定升级流程，再进行导入、状态修改等操作。除非有具体恢复理由和兼容性证据，不使用跳过检查参数。验证上传规则与版本匹配只是远端运行准备，最终仍要检查远端计划、Provider 网络访问和实际执行结果。

#### 用文件清单理解上传范围

假设目录包含以下内容：

```text
main.tf
modules/service/main.tf
screenshots/review.png
notes-private/token-notes.txt
terraform.log
```

使用本节前面的 `.terraformignore` 后，教学上的预期上传集合应保留 main.tf 和 modules/service/main.tf，排除 screenshots、notes-private 与日志。实际上传仍需遵循目标版本的默认规则。

如果额外加上 `modules/`，远端可能找不到 source 指向的本地模块；本地命令曾经成功也不能弥补远端文件缺失。上传规则应从“运行必需文件有哪些”出发，再排除其他内容，而不是笼统忽略所有大目录。

## 第 17 章 · 通过测试验证配置行为

### 测试断言与日常配置校验分别解决什么问题
<!-- src: md/test.md -->

Terraform 的日常验证与测试断言都检查约束，但触发时机和读者不同。输入校验、前置和后置条件面向正常使用配置的人；test 专门选择输入和执行方式，验证模块在特定场景中的行为。

| 机制 | 主要场景 | 失败判断 |
|---|---|---|
| 输入变量 validation | 输入是否允许 | 不合法输入应阻止相应运行 |
| precondition/postcondition | 资源或数据的约束 | 不满足条件按其位置阻止相关操作 |
| check 块 | 持续或运行中的辅助检查 | 常规工作流通常报告警告，不能等同阻断条件 |
| test assert | 明确测试场景的行为预期 | 断言不满足则测试失败 |

应始终成立且影响安全执行的条件尽量留在配置中，并提供使用者能采取行动的错误信息。仅在测试中成立的场景，如某开关关闭时输出特定值，则放在测试文件中，不应迫使所有模块调用者接受测试专用约束。

```mermaid
graph TD
  A[发现测试文件] --> B[设置场景输入]
  B --> C[执行 plan 或 apply]
  C --> D[检查断言]
  D --> E[尝试清理测试资源]
  E --> F[检查结果与残余资源]
```

现代 `.tftest.hcl` 测试框架自 1.6 起提供，与更早的实验 test 不等价。默认 run 可执行 apply 并创建真实资源；仅做计算逻辑示例时明确 `command = plan`，并使用适合该场景的配置。

#### 输入约束与测试断言配合

在本章独立命名测试根模块中，用下面的定义替换原 environment 变量，而不是增加同名变量。输出仍为 `"api-${var.environment}"`：

```hcl
variable "environment" {
  type    = string
  default = "dev"
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment 必须是 dev 或 prod"
  }
}
```

这条约束定义正常调用者允许的输入范围；命名测试则检查每个合法环境是否得到正确输出。如果传入 staging，应触发输入约束，而不是等到命名断言再解释错误。

已有 service-demo 的变量可保持更通用的环境名称，本例是增加枚举约束的独立测试变体；第 13 章的临时环境命名不应反过来被误判为违反整本笔记的全局规则。

### 如何组织测试文件并执行目标测试
<!-- src: md/commands/test.md -->

测试文件通常放在根配置的 `tests/` 目录，名称以 `.tftest.hcl` 结尾，从根配置目录执行 test。这样配置和测试的路径上下文一致，避免把 tests 当作独立 Terraform 项目初始化。

以下例子只验证本地输出，无云资源。在独立目录的 main.tf 中写入：

```hcl
variable "environment" {
  type    = string
  default = "dev"
}

output "service_name" {
  value = "api-${var.environment}"
}
```

在 `tests/naming.tftest.hcl` 中写入：

```hcl
run "development_name" {
  command = plan

  variables {
    environment = "dev"
  }

  assert {
    condition     = output.service_name == "api-dev"
    error_message = "开发环境服务名应为 api-dev"
  }
}
```

```bash
terraform init -backend=false
terraform test -filter=tests/naming.tftest.hcl
```

预期命名断言通过；把期望值改成错误字符串，应得到测试断言失败。这比只检查退出成功更能确认断言真的被发现和执行。`-filter` 选择测试文件，`-test-directory` 可以替换默认目录，但根配置目录中的测试文件仍会加载。

`-verbose` 展开每个 run 的计划或状态，适合诊断也可能输出敏感内容。测试执行从根配置上下文处理路径，测试辅助 setup 模块则放在单独目录并通过测试模块设置引用，不应把辅助配置混进被测根模块。

`-cloud-run` 使用 HCP 私有注册表模块来源关联远端测试，需要匹配主机的认证，不能传公共 Registry 模块代替。不同版本的附加参数以帮助为准；测试框架版本支持不等于所有新报告选项都在最初版本提供。

#### 给两个合法输入各写一个 run

下面替换 `tests/naming.tftest.hcl`，保留 development_name 并增加 production_name。两次 command 都为 plan，描述测试应采用的执行方式；本轮没有执行这些测试：

```hcl
run "development_name" {
  command = plan
  variables {
    environment = "dev"
  }
  assert {
    condition     = output.service_name == "api-dev"
    error_message = "dev 应生成 api-dev"
  }
}

run "production_name" {
  command = plan
  variables {
    environment = "prod"
  }
  assert {
    condition     = output.service_name == "api-prod"
    error_message = "prod 应生成 api-prod"
  }
}
```

每个 run 显式设置输入，避免第二个测试无意依赖默认 dev 值。改变实现输出前缀时，两项断言都应重新审查；不能只改断言让它机械迎合错误实现。

#### 辅助模块与被测根模块的关系

如果需要展示测试模块调用，可使用独立的辅助输出模块。以下是布局和短片段示例，不要求把辅助模块混进根资源声明：

```text
naming-test/
├── main.tf
├── tests/naming.tftest.hcl
├── tests/setup.tftest.hcl
└── testing/setup/main.tf
```

```hcl
# testing/setup/main.tf
output "prefix" {
  value = "api"
}
```

```hcl
# tests/setup.tftest.hcl
run "setup_prefix" {
  command = plan
  module {
    source = "./testing/setup"
  }
  assert {
    condition     = output.prefix == "api"
    error_message = "辅助模块应提供 api 前缀"
  }
}
```

路径按根配置目录理解。这个 run 的 output.prefix 来自它显式选择的辅助模块，不是原根模块的 service_name；切换被测模块也改变了断言的作用域。若辅助模块创建真实资源，还会带来额外状态与清理要求。

### 如何处理测试状态、资源清理与结果报告
<!-- src: md/commands/test.md -->

测试使用独立的内存状态，从空状态开始，不会直接沿用日常 Backend 中的资源绑定。但 Provider 仍可能使用相同账号访问真实平台，同名资源、外部脚本和引用数据也可能影响环境，因此独立状态不是账号隔离。

有 apply 的测试完成后，Terraform 尝试销毁留下的测试资源。断言失败、权限不足或删除保护都可能让清理不能完成，应阅读诊断中残留地址与真实 ID，并在专门测试账号中处理。不能只看到某个 run 通过就忽略最终 teardown 错误。

```bash
terraform test -json > test-events.jsonl
terraform test -junit-xml=test-results.xml
```

两条是替代报告示例，实际使用时不必为不同格式无谓重复创建资源。JSON 是机器事件输出，JUnit XML 适合 CI；`-junit-xml` 与 `-cloud-run` 不兼容。测试文件映射 testsuite，run 映射 testcase，失败、跳过和错误有不同元素，不能把 skipped 计作通过。

输出文件存在不代表测试成功，要检查进程退出码、执行数量、断言结果与清理结果。`-parallelism` 控制相关操作并行度，不能简单当成所有测试文件的并发数，更不能消除资源名称冲突。

实际采用模块测试时，应准备测试账号、资源标签、清理权限与残余巡检，并把清理失败作为需处理的结果。独立测试状态不保证真实 API 行为与生产资源隔离。

#### 报告中失败和跳过不能合并统计

下列 XML 是教学结果示意，不是本轮实际运行产物：

```xml
<testsuites>
  <testsuite name="tests/naming.tftest.hcl" tests="2" failures="1" skipped="0" errors="0">
    <testcase name="development_name" />
    <testcase name="production_name">
      <failure message="prod 应生成 api-prod" />
    </testcase>
  </testsuite>
</testsuites>
```

第一项没有 failure 只能在完整有效报告的上下文中解释为通过；第二项明确断言失败。出现 skipped 表示没有完成相应验证，不能当作通过；运行初始化等错误与断言失败也应分开调查。

即使所有 assert 都通过，仍须看测试末尾的资源清理诊断。cleanup 失败可能意味着遗留对象和费用，而不是命名逻辑失败。报告应与对应配置版本关联，不能拿另一版测试结果证明当前实现正确。

## 第 18 章 · 盘点模块依赖并支持审计

### 如何从模块清单追踪来源与版本并支持依赖审计
<!-- src: md/commands/modules.md -->

模块审计需要知道配置从哪里取得模块、选择了什么版本以及有哪些嵌套调用。`terraform modules` 提供当前工作目录声明模块的整体视图，适合发现未批准来源或版本范围过宽的问题。它与 providers 依赖树关注的对象不同，也不等同已创建资源清单。

```bash
terraform modules
terraform modules -json > module-inventory.json
jq '.modules[] | {key, source, version}' module-inventory.json
```

命令需要 Terraform 1.10.0 或更高版本。应先准备模块依赖，再生成清单，并把结果与配置提交、CLI 版本一起保存，便于解释审计发生在哪个代码快照上。

人类输出呈现组合层次，JSON 包含模块 key、source 和 version。下面是格式示意，不是本次真实项目的依赖结果：

```json
{
  "format_version": "1.0",
  "modules": [
    {
      "key": "service",
      "source": "./modules/service",
      "version": ""
    }
  ]
}
```

本地模块没有 Registry 发布版本，空 version 不一定是采集失败，应转而绑定仓库提交。Git 来源中的固定 ref 也要结合 source 解释，不能把所有非版本字符串都判为不合规。JSON 消费端需处理格式主次版本，给解析器的 JSON 不应含尾逗号或伪 JSON 注释。

审计可依次确认允许的来源主机、是否有明确版本或固定引用、间接依赖是否符合预期，再抽查具体模块代码和 Provider 需求。清单只能证明声明与解析信息，不能证明模块没有危险行为、接口设计合理或云资源已安全部署。

下面用两层本地模块补齐文件上下文，说明清单如何关联到源码。

#### 从两层模块调用读出来源

下面是独立的 `module-audit` 例子，根模块只调用 service，service 再调用 naming。每个文件都给出完整最小内容，不依赖其他章节的模块副本：

```text
module-audit/
├── main.tf
└── modules/service/
    ├── main.tf
    └── modules/naming/main.tf
```

```hcl
# module-audit/main.tf
module "service" {
  source = "./modules/service"
}
output "service_name" {
  value = module.service.name
}
```

```hcl
# module-audit/modules/service/main.tf
module "naming" {
  source = "./modules/naming"
}
output "name" {
  value = module.naming.name
}
```

```hcl
# module-audit/modules/service/modules/naming/main.tf
output "name" {
  value = "api-dev"
}
```

本地相对 source 按声明所在模块解析：第二层的 `./modules/naming` 相对于 service 目录，不是仓库根目录。人类清单可以概括为 root → service → naming；JSON 消费者仍应按真实格式处理键和层次。

下面是两个模块条目的精简教学清单。key 表示调用标签，不应假定它一定是全局唯一的完整地址；定位层次仍需结合模块树与来源上下文：

```json
{
  "format_version": "1.0",
  "modules": [
    {"key": "service", "source": "./modules/service", "version": ""},
    {"key": "naming", "source": "./modules/naming", "version": ""}
  ]
}
```

这两个 version 都为空，因为没有 Registry 发布版本；审计应绑定仓库提交，并沿 source 找到模块内容。若换成 Registry 来源，应同时核对其发布版本；若换成 Git 来源，则检查 source 中的引用是否固定。仅统计“有几个模块”会漏掉来源变化，清单比较应优先看来源、版本或固定引用的差异。

