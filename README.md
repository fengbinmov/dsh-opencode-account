# OpenCode 账户页（dsh-opencode-account）

非官方 DeepSeek Harness 插件：把 **DeepSeek Harness** 接到 **OpenCode Go / Go Plus**（[opencode.ai](https://opencode.ai)），
并在 **设置 → OpenCode** 里显示账户页——配额窗口、Console 消费报表、各模型额度换算、实时模型目录。
页面形态与 `@mars-sea/dsh-commandcode-provider` 的设置页一致（同一套 `cc-` 风格行、同款配额条、同样的浮动保存条）。

```
F:\Code\Ai\Opencode Provider\
├─ package.json          插件清单（dsh.bundle + dsh.client）
├─ cordis.patch.yml      插件包层：注册 provider 路由 + 账户页
├─ lib/
│  ├─ index.js           host 半：注册 GET /opencode/account（零第三方依赖）
│  ├─ opencode.js        host 半：opencode.ai HTTP 客户端（两张命名空间）
│  ├─ catalog.js         静态额度表与价目表（来自官方文档）
│  └─ client.js          浏览器半：设置页（window.__ModuleLoader__ 格式，无构建步骤）
├─ test-host.mjs         host 半验证：真调 /opencode/account
└─ test-client.mjs       浏览器半验证：假 __ModuleLoader__ + stub react 渲染全分支
```

## 一、它接入了什么

| 面 | 做法 |
|---|---|
| **模型 provider** | 以 pi-ai 内置 `opencode-go` 目录为元数据来源，按你的套餐补全成 **30 个模型**；因协议不同拆成 **3 条路由**（见下） |
| **账户页** | 插件在 host 注册 `GET /opencode/account`，浏览器页只读这个接口；**API key 永不进浏览器**（只回掩码） |

### 为什么是 3 条路由

两个约束是从 dsh-llm-pi-ai 的解析器里读出来的，不是推测：

1. **`models` 条目没有 `api` 字段**（schema 的 `modelFields` 里没有它），而
   `resolveRouteModels` 取的是 `api = request.api ?? base.api ?? routeApi` ——
   **条目自己写的 `api` 完全不参与**。所以一个 pi-ai 目录里没有描述的模型，
   只能靠**路由级**的 `api` 拿到协议。
2. **一条路由只能有一个 `api`**。

你的 Go 套餐 30 个模型跨三种协议，于是拆成三条（同一个 key、同一组 headers）：

| 路由 | 协议 | 模型数 | 网关端点 |
|---|---|---|---|
| `opencode-go` | `openai-completions` | 22 | `/chat/completions` |
| `opencode-go-responses` | `openai-responses` | 6 | `/responses` |
| `opencode-go-messages` | `anthropic-messages` | 2 | `/messages` |

> **选择器里会出现三个 OpenCode Go 条目**（`OpenCode Go` / `OpenCode Go (Responses)` /
> `OpenCode Go (Messages)`）。这是当前 DSH 配置形状的硬约束，不是设计偏好：
> 一个模型属于哪条路由，由网关给它分配的端点决定。

### 为什么模型清单要自己维护

pi-ai 内置目录与线上套餐会漂移。2026-09-28 实测：

- 内置目录只有 **27** 个，比网关**少 8 个**：`gpt-6-luna`、`grok-4.7`、`deepseek-v4.1-flash`、
  `deepseek-flash`、`mimo-v2.6-flash`、`mimo-v2.6-pro`、`space-bunny-free`、
  `longcat-2.5-preview-free` —— 这些在 Models 页面里**根本选不到**；
- 还多带 **5 个已下线**的 id：`glm-5.1`、`kimi-k2.6`、`omen-alpha`、`qwen3.6-plus`、`qwen3.7-max`。

清单由脚本对齐（可随时重跑）：

```sh
node scripts/build-provider-models.mjs           # 拉网关清单，重写两个配置文件
node scripts/build-provider-models.mjs --check   # 校验是否已对齐（不一致则退出码 1）
node scripts/build-provider-models.mjs --offline # 无网络时沿用已提交清单
```

结果写进 `cordis.patch.yml`（插件包层）**和** `$DSH_HOME/settings.yaml`（用户层，即 Models
页面会改写的那个文档）——两处都要写，否则在 GUI 里点一次保存就会把清单丢掉。

### 路由级 `baseURL`（漏了会直接报错）

每条路由都必须写 `baseURL`，而且**拼法由该路由的 `api` 决定**——这不是风格问题，
`resolveRouteModels` 对"目录未描述的模型"会强制要求它，拼错则路径翻倍：

| 协议 | 正确的 `baseURL` | SDK 追加 | 最终端点 |
|---|---|---|---|
| `openai-completions` | `…/zen/go/v1` | `/chat/completions` | `/zen/go/v1/chat/completions` |
| `openai-responses` | `…/zen/go/v1` | `/responses` | `/zen/go/v1/responses` |
| `anthropic-messages` | `…/zen/go`（**不要 `/v1`**） | `/v1/messages` | `/zen/go/v1/messages` |

漏写时的症状是 Models 页每张卡都报
`model "…" needs a baseURL; the installed catalog does not describe this route`。

### 推理等级（`reasoningEfforts`）

选不了推理等级是同一处 config 的疏漏，而且成因更绕——两个"没有值"的含义正好相反：

| 写法 | pi-ai 的意思 | dsh 的意思 |
|---|---|---|
| `level: null`（空值键） | **不支持**该等级（`getSupportedThinkingLevels` 把它过滤掉） | **支持**，但发送时不带该参数 |
| 键缺失 | 整个 map 缺失 → **全部等级可用** | — |

所以 dsh 只允许 `off` 留空，其余等级留空会直接报
`reasoningEfforts.minimal needs the wire value dispatch should send`。

pi-ai 还有个陷阱：`getSupportedThinkingLevels` 对 `reasoning` 未置位的模型只回 `['off']`，
而**目录里没有描述的模型（也就是新补的那 8 个）正是这种情况** —— 于是它们的推理等级
选择器整个不出现。所以生成器现在给全部 30 个模型显式写出 `reasoningEfforts`：

```yaml
        - id: gpt-6-luna
          name: GPT 6 Luna
          contextWindow: 1050000
          maxTokens: 128000
          input: ['text', 'image']
          reasoningEfforts:      # off 可以留空，其余必须带 wire 值
            off:
            minimal: minimal
            low: low
            medium: medium
            high: high
            max: max
```

规则：**`null` 的等级直接不写**（表示不支持），`off` 始终补上，其余等级带 wire 值。
生成器写文件前会断言"每个模型至少有一个 `off` 以外的等级"——这个回归在 diff 里几乎
看不出来，却会让所有模型的推理控制一起消失。

### 会话头

`x-opencode-session` 是**必需**的：缺了直接 `400 MissingSessionID`，而 pi-ai 与 dsh
都不会生成这个名字的头（pi-ai 只对目录里显式开启 session affinity 的厂商发
`x-session-affinity` / `x-client-request-id`，`opencode-go` 不在其中）。所以它静态写在
每条路由的 `headers` 里：

```yaml
- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      opencode-go:
        displayName: OpenCode Go
        api: openai-completions
        baseURL: https://opencode.ai/zen/go/v1
        apiKeyEnv: OPENCODE_API_KEY
        headers:
          x-opencode-session: 7f3c1a92-5d84-4e6b-9c07-2ab5e13f8d40
        models:
        - id: deepseek-v4-flash
          name: DeepSeek V4 Flash
          contextWindow: 1000000
          maxTokens: 384000
          input: ['text']
        # … 另外 29 个（清单由脚本生成）
```

> 网关要的是**稳定**的会话 id，不是唯一的。dsh 的 `headers` 是纯字符串字典，没有
> `${ENV}` 插值，所以这里就是一个固定 UUID。
> dsh 的 harness 归属头只有 `user-agent`，与 `x-opencode-session` 不冲突，会被原样发出。

## 二、数据从哪来（以及为什么没有"余额"）

插件只调用 opencode.ai 自己的接口，分两个命名空间：

| 接口 | 内容 | 实测 |
|---|---|---|
| `GET {baseURL}/usage` | `rolling` / `weekly` / `monthly` 的 `status`、`percent`、`resetsAt` | 200，**只有百分比，没有金额** |
| `GET {baseURL}/models` | 该密钥可调用的模型目录 | 200，本次 30 个 |
| `GET {consoleURL}/api/v1/budgets/members` | 成员预算报表：`limit_micro_cents`、`spent_micro_cents`、`exceeded`、`resets_at`，以及账号 email/user_id | 200（真实账户消费） |
| `GET {consoleURL}/api/v1/usage/export?scope=member&range=30d` | 逐日消费 CSV（含 `cost_micro_cents`、token 列） | 403（该密钥权限不足；inference-only 密钥都会 403） |

**没有余额端点，这不是本插件的取舍**：

- `GET /zen/v1/balance`、`GET /zen/v1/credits`、`GET /console/api/v1/balance` 实测全部 **404**；
- Zen 命名空间下**没有** balance/credits 路由（源码目录里只有 chat/messages/models/responses）；
- Console 的余额字段只经浏览器 OAuth 会话的 `billing.get` 暴露，`/console/api/billing/status` 对 API key 回 **403**；
- 官方 feature request [anomalyco/opencode#10448](https://github.com/anomalyco/opencode/issues/10448) 仍然 **open**，无官方回复。

所以页面把**能观测到的**都摊开，并明确标注哪些是推算：

- **真实数字**：三个窗口的百分比与重置时间、预算报表的金额（micro-cents ÷ 1e8）、账号、模型目录。
- **推算数字（页面标 `折算`）**：`月额度 × 月度窗口百分比` = 该模型已用金额，进而得到剩余。
  月额度来自官方文档的静态表（见 `lib/catalog.js`），按档位换算：Go 档沿用文档数字，
  Go Plus 档统一放大到 $60 上限。

## 三、页面结构（自上而下）

1. **页头**：标题、说明、刷新按钮、更新时间、每 5 分钟自动刷新提示。
2. **账户**：账号（email/user_id）、密钥掩码、密钥来源、provider 路由、API 根、会话 ID、更新时间；下面一行是**订阅档位**徽章，配置里的那一档标 `← 当前档位`。
3. **用量配额**：三行，每行是 `label + 百分比 + 4px 填充条 + 重置时间 · 倒计时`；触限（`status: rate-limited` 或 100%）时百分比行加红字、条变红。
4. **消费与额度**：区间消费、预算上限（未设上限就写"未设上限"，绝不写成 0）、请求数、统计区间；有 Top 模型条形时按消费排序展示；下面附「为什么没有"余额"数字」的说明与 Console 链接。
5. **模型目录**：每个模型一张小卡——id、名称、月额度徽章（`不限量` / `未收录额度`）、已用/剩余折算条、官方价格（入/出/缓存读/缓存写，DeepSeek 系列另标峰时价）。
6. **设置**：订阅档位下拉 + 折叠的「高级设置」（API 根、Console 根、统计区间、会话 ID、超时）。
7. **浮动保存条**：有改动才出现，含「放弃 / 保存」。

## 四、安装

### 1. 凭据

API key 存进 harness 凭据（`$DSH_HOME/.credentials.yaml` 的 `refs`，或在 **设置 → Models** 里保存）：

```yaml
refs:
  OPENCODE_API_KEY: oc_sk_…
```

解析顺序（先命中者胜）：harness 凭据服务的 `apiKeyEnv` 引用 → 同名环境变量 → `OPENCODE_GO_API_KEY` / `OPENCODE_ZEN_API_KEY`。
都没有时页面显示"未找到 API 密钥"并给出该存到哪里，而不是静默空白。

### 2. 装进 profile

```sh
dsh plugin --profile web add "F:/Code/Ai/Opencode Provider"
```

或在 `$DSH_HOME/profiles/web/package.json` 里写依赖，并把包名加进 `dsh.profile.bundles`：

```json
{
  "dependencies": { "dsh-opencode-account": "file:F:/Code/Ai/Opencode Provider" },
  "dsh": { "profile": { "bundles": ["…", "dsh-opencode-account"] } }
}
```

然后 `cd "$DSH_HOME/profiles/web" && pnpm install`，**重启 dsh**。

装完在 **设置 → OpenCode** 就能看到页面；**设置 → Models** 里会出现三条 OpenCode Go 路由。

## 五、验证

```sh
node test-host.mjs           # 真调 opencode.ai，断言配额/目录/预算与"响应体不含完整 key"
node test-host.mjs --offline # 无网络：断言缺凭据时的提示路径
node test-client.mjs         # 渲染 loading/就绪/触限/缺密钥/上游失败/权限不足/中英文 + 表单交互
node scripts/build-provider-models.mjs --check   # 模型清单是否仍与套餐一致
```

端到端验证用**隔离实例**，不碰正在用的那个：

```sh
$env:DSH_HOME="F:\Code\Ai\Opencode Provider\.dsh-test"
# 起界面（3099）
dsh --profile octest --patch "./.dsh-test/port-overlay.yml"
# 或一次性跑通一条真实请求（把默认 agent 指向补齐的新模型）
dsh --profile octest --patch "./.dsh-test/model-overlay.yml" "reply with exactly: OK"
```

已验证的事实（本机实测）：

- `GET http://127.0.0.1:3099/opencode/account` → 200，真实账号 `fengbinmov@outlook.com`、30 个模型、30/30 命中额度表、预算报表 1 行；
- `--dump-config` 显示插件层 patch 了 `@deepseek-ai/dsh-base` 的 `llm-pi-ai` 行，`providers.opencode-go` 带着 `x-opencode-session`；
- 客户端 bundle 已随启动 payload 下发（含 `id: 'dsh-opencode-account'`）。

## 六、已知限制

- `/usage`、`/console/api/...` 属非公开契约；上游改动时页面显示错误而不是崩溃。
- **`/console/api/v1/usage/export` 需要 "All" 权限的 service account key**；inference-only 密钥一律 403。此时消费卡退回预算报表口径，并明说权限不足。
- **档位不是自动探测的**：官方 API 不暴露它，`plan` 是配置里记录的一个事实。
- **额度换算是推算**：官方只给百分比；月额度来自文档静态表，文档未收录的模型标 `未收录额度`（`deepseek-flash` 标 `inherited`）。
- **模型可用性受工作区区域设置影响**：实测 `deepseek-v4-flash` 曾返回 `400 This Go model requires Global regions`，需在 [控制台](https://opencode.ai/auth) 把工作区隐私区域设为 Global。
- 页面只展示，不提供充值或切换订阅入口。

## License

MIT。`@mars-sea/dsh-commandcode-provider` 仅作为页面形态的参考（同为 MIT），本插件未复制其代码。
