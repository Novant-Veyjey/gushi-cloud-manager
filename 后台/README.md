# 菇事云管家 - 可保存后台（Express + better-sqlite3）

## 技术栈

- 后端：Express.js
- 数据库：SQLite + better-sqlite3（数据文件：`server/data/gushi.sqlite`，重启不丢失）
- 登录：JWT（HS256，自研零依赖）+ scrypt 加盐密码哈希，退出登录立即失效
- 权限：RBAC 角色权限矩阵，后端强制执行
- AI：OpenAI 兼容接口，无 Key 时自动降级为规则引擎

## 启动

```bash
npm install
npm start          # http://localhost:3000
```

需要配置 AI / 微信登录 / JWT 密钥时：

```bash
copy .env.example .env      # Windows；macOS/Linux 用 cp
npm run start:env
```

## 账号、JWT 与权限

- 所有业务接口都需要登录：请求头 `Authorization: Bearer <JWT>`，未登录返回 401。
- JWT 载荷包含 `sub`（账号 id）、`username`、`role`、`jti`、`exp`；`jti` 记录在 `sessions` 表，因此**退出登录后 token 立即失效**。
- JWT 密钥优先读环境变量 `JWT_SECRET`，未配置时自动生成并保存到 `server/data/jwt.secret`，所以服务重启后已登录状态不丢。
- 数据通过 `user_id` 隔离：任何账号都查不到、也改不了别人的数据。
- 质量溯源 `/api/trace/:code` 公开，供消费者扫码查询。

### 角色权限矩阵（RBAC）

| 模块 | 菇农 farmer | 基地管理员 base | 专家 expert | 采购商 buyer | 政府/服务机构 government | 平台管理员 admin |
|---|---|---|---|---|---|---|
| 基地 bases | 读写 | 读写 | 读 | 读 | 读 | 全部 |
| 批次 batches | 读写 | 读写 | 读 | 读 | 读 | 全部 |
| 环境 readings | 读写 | 读写 | 读 | — | 读 | 全部 |
| 预警 alerts | 读写 | 读写 | 读 | — | 读 | 全部 |
| 溯源事件 trace-events | 读写 | 读写 | 读 | 读 | 读 | 全部 |
| 专家问答 questions | 读写 | 读写 | 读写 | 读写 | 读 | 全部 |
| 供应 products | 读 | 读写 | 读 | 读 | 读 | 全部 |
| 采购 demands | 读 | 读写 | 读 | 读写 | 读 | 全部 |
| 任务 tasks | 读写 | 读写 | 读 | — | 读 | 全部 |
| 合作方 partners | 读 | 读写 | 读 | — | 读 | 全部 |
| 统计 / 上传 / AI | 读 / 写 / 读 | 同左 | 同左 | 同左 | 仅统计 | 全部 |

未列出的组合一律 403，并返回明确的提示信息。

### 登录相关接口

```text
GET  /api/auth/roles                 角色列表 + 权限矩阵
POST /api/auth/register              {username, password, display_name?, role?}
POST /api/auth/login                 {username, password}
POST /api/auth/wechat                {code} 微信一键登录（需配置 WX_APPID/WX_SECRET）
POST /api/auth/logout                需要登录，退出后 JWT 立即失效
GET  /api/auth/me                    当前账号 + 自己的权限矩阵
```

平台管理员专用：

```text
GET /api/admin/users                 账号列表（含各自数据量）
PUT /api/admin/users/:id/role        {role:'farmer|base|expert|buyer|government|admin'}
```

### 微信一键登录说明

1. 在微信公众平台 → 开发管理 → 开发设置 获取 AppID 与 AppSecret，填入 `.env` 的 `WX_APPID` / `WX_SECRET`。
2. 小程序端调用 `wx.login` 拿到 `code`，POST `/api/auth/wechat`，后台用 `jscode2session` 换 `openid`。
3. 首次登录自动建账号（用户名形如 `wx_xxxxxxxxxx`，角色默认菇农），之后自动复用同一账号。
4. **未配置时接口返回 501 和明确提示**，小程序会提醒改用账号密码登录，不会静默失败。

## 大棚硬件接入（环境数据自动上报）

环境数据默认由大棚里的检测设备自动上报，不需要人工在界面上录入；小程序里的“手动补录”只用于断网、设备维修或核对历史数据。

### 1. 在后台或小程序创建设备

```bash
curl -X POST http://localhost:3000/api/devices \
  -H "Authorization: Bearer <你的 JWT>" -H "Content-Type: application/json" \
  -d '{"name":"1 号棚温湿度网关","base_id":1,"model":"ESP32-S3","temp_max":26,"humidity_min":80,"co2_max":800}'
```

返回里含 **设备编号 code** 与 **设备密钥 secret**（密钥只在创建/重置/单独查询时返回，列表里是掩码）。阈值可按设备单独配置。

### 2. 硬件端定时上报（设备密钥鉴权，不需要账号登录）

```bash
curl -X POST http://<后台地址>/api/ingest/readings \
  -H "X-Device-Code: GS-XXXXXX" \
  -H "X-Device-Secret: <设备密钥>" \
  -H "Content-Type: application/json" \
  -d '{"temperature":24.5,"humidity":88,"co2":650,"light":320}'
```

- 上报成功即写入 `readings`（`source=device`），并按设备阈值自动生成预警；
- 超过 10 分钟没有上报，小程序里该设备显示为离线；
- 也支持 `Authorization: Device <编号>:<密钥>`；`recorded_at` 不传则用服务器时间。

| 接口 | 说明 |
|---|---|
| `POST /api/ingest/readings` | 上报温湿度/CO₂/光照，自动预警 |
| `POST /api/ingest/heartbeat` | 心跳，仅刷新在线状态 |
| `GET /api/ingest/config` | 设备开机自检：读自己的阈值与服务器时间 |

设备管理接口（需登录 + `devices` 权限）：

```text
GET    /api/devices              设备列表（含在线状态、最新读数、密钥掩码）
POST   /api/devices              创建设备，返回编号与密钥
PUT    /api/devices/:id          修改名称/基地/阈值/状态
DELETE /api/devices/:id          删除设备
GET    /api/devices/:id/secret   查看完整密钥（用于填进硬件）
POST   /api/devices/:id/rotate   重置密钥
```

### 3. MQTT 接入（设备走 MQTT 而不是 HTTP）

设备也可以直接走 MQTT，适配层会把报文转成与 HTTP 上报**完全相同**的入库与预警逻辑。

```text
主题：<前缀>/devices/<设备编号>/readings     上报环境数据
      <前缀>/devices/<设备编号>/heartbeat   仅心跳（刷新在线状态）
前缀：默认 gushi，可用 MQTT_TOPIC_PREFIX 修改

报文：{"secret":"<设备密钥>","temperature":24.5,"humidity":88,"co2":650,"light":320}
     密钥也可通过 broker 的连接用户名传入（MQTT_USERNAME），报文里就不必再带
```

启动适配层：

```bash
# 指向真实 broker（EMQX / Mosquitto 等）
# .env: MQTT_URL=mqtt://127.0.0.1:1883  MQTT_USERNAME=  MQTT_PASSWORD=
npm run mqtt
```

没有真实 broker 时，用内置的纯 JS broker 演示（基于 aedes）：

```bash
npm run mqtt:broker      # 终端 A：本地 broker，默认 1883
npm run mqtt             # 终端 B：适配层，订阅并入库
npm start                # 终端 C：后台接口
```

适配层特性：报文不是合法 JSON、设备编号不存在、密钥错误、设备被停用 → 一律丢弃并打印原因，不会写入脏数据；正常入库后自动按设备阈值生成预警；单条异常不影响后续报文。

发布一条测试报文（任选一种客户端）：

```bash
npx mqtt pub -t gushi/devices/GS-XXXXXX/readings -m '{"secret":"<设备密钥>","temperature":24.5,"humidity":88,"co2":650,"light":320}'
```

### 4. 历史曲线

`GET /api/devices/:id/series?hours=24&buckets=12` 把最近 N 小时的数据按等长时间桶聚合，返回每桶的温度/湿度/CO₂/光照平均值、最小值和最大值，小程序「监测」页设备卡片里可直接查看。

## AI 智能问答（原“专家服务”）

- `POST /api/ai/ask` `{question, base_id?, category?, save?}`：调用 OpenAI 兼容大模型回答，**自动把该账号最近的基地、批次和环境数据作为上下文**；`save=true`（默认）会写入问答记录，方便专家复核。
- `GET /api/ai/status`：返回是否已接入大模型、模型名、规则库条目数。
- 未配置 `AI_API_KEY` 或调用失败时，自动降级为内置规则知识库（8 类常见问题），回答里会注明来源与降级原因，不会把规则库答复伪装成 AI 结论。
- 人工专家仍可通过 `PUT /api/questions/:id` 补充/纠正回答，回答来源标记为人工。

当前 `.env` 已接入 DeepSeek（`deepseek-chat`），返回体里的 `source` 为 `ai` 表示大模型回答。

## 主要业务接口（均需登录，并按角色校验）

```text
GET  /api/dashboard              当前账号的数据汇总
GET  /api/health                 健康检查（公开）

GET/POST/PUT/DELETE /api/bases           基地
GET/POST/PUT/DELETE /api/batches         生产批次
GET/POST/PUT/DELETE /api/devices         大棚设备（编号、密钥、阈值、在线状态）
GET  /api/devices/:id/series             设备历史曲线（等长分桶聚合）
GET/POST/PUT/DELETE /api/readings        环境记录（设备自动上报为主，手动补录为辅）
GET/POST/PUT/DELETE /api/alerts          预警
POST /api/alerts/:id/ack                 处理预警
GET/POST/PUT/DELETE /api/trace-events    溯源事件
GET/POST/PUT/DELETE /api/questions       专家问答
GET/POST/PUT/DELETE /api/products        供应信息
GET/POST/PUT/DELETE /api/demands         采购需求
GET/POST/PUT/DELETE /api/tasks           生产任务
GET/POST/PUT/DELETE /api/partners        合作方

GET  /api/trace/:code            按批次编号公开溯源查询
POST /api/uploads                图片上传（每个账号单独目录 uploads/u<id>/）
POST /api/ai/suggest-priority    任务优先级建议
```

## 写入演示数据（可选）

```bash
npm run seed:demo
```

写入带“演示”标记的数据，全部绑定到演示账号：

```text
账号：demo      密码：demo123456
```

## 数据备份

```bash
npm run backup
```

把 SQLite 数据库和 `public/uploads` 图片目录复制到 `server/data/backups/`，文件名带时间戳。

## 自动化测试

```bash
npm test          # 接口与权限（含设备 HTTP 上报、AI 问答）
npm run test:mqtt # MQTT 适配层端到端（临时 broker → 订阅 → 入库 → 预警 → 密钥校验 → 曲线聚合）
```

覆盖：JWT 结构、注册登录、重复注册 409、密码错误 401、未登录 401、账号隔离、跨账号修改拦截、RBAC（采购商建基地 403、专家发供应 403、政府写入 403、管理员接口 403/可用）、微信登录未配置返回 501、**大棚设备接入（密钥错误 401、上报写入 `source=device`、超阈值自动生成 3 条预警、心跳在线、设备自检阈值、dashboard 统计设备数据、采购商无权建设备）**、**AI 问答（写入问答记录、来源标记、无密钥时降级规则知识库）**、数据持久化、密码加密、公开溯源、退出后 token 失效。

## 数据真实性原则

1. 页面只展示 SQLite 中已经保存的记录，不使用硬编码业务数据。
2. 没有录入数据时显示空状态，统计数字与数据库记录数严格一致。
3. 演示数据全部带“演示”标记，避免与真实数据混淆。
4. 比赛或上线前必须录入由基地、合作社、企业或农户确认的真实数据。
