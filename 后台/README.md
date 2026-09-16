# 菇事云管家 · 后台

Express + better-sqlite3 服务端，为小程序与手机风格 HTML 原型提供接口。

- 数据库：SQLite（`server/data/gushi.sqlite`，重启不丢数据）
- 登录：JWT（自研 HS256，零依赖）+ scrypt 密码哈希，退出立即失效
- 权限：RBAC 六角色，后端强制校验，数据按账号隔离
- AI：OpenAI 兼容接口，未配置时降级为内置规则知识库

## 启动

```bash
npm install
copy .env.example .env      # 可选，填 AI / 微信 / MQTT 配置
npm start                   # http://localhost:3000
```

主要 `.env` 项（全部可选）：

```text
AI_BASE_URL=https://api.deepseek.com/v1   # AI 问答，OpenAI 兼容
AI_API_KEY= / AI_MODEL=deepseek-chat
WX_APPID= / WX_SECRET=                     # 微信一键登录
MQTT_URL=mqtt://127.0.0.1:1883             # MQTT 设备接入
MQTT_TOPIC_PREFIX=gushi
JWT_SECRET=                                # 留空则自动生成到 server/data/jwt.secret
```

## 账号与权限

- 业务接口都需要 `Authorization: Bearer <JWT>`，未登录 401；JWT 含 `sub/username/role/jti/exp`，`jti` 记在 `sessions` 表，**退出后 token 立即失效**，密钥持久化所以重启不掉线。
- 数据按 `user_id` 隔离；公开接口只有 `/api/health` 与 `/api/trace/:code`（消费者扫码溯源）。
- 角色能力：菇农（基地/批次/设备/环境/预警/溯源/任务读写）、基地管理员（除账号管理外全部）、专家（问答读写，其余只读）、采购商（采购需求读写、供应只读、无设备权限）、政府机构（全部只读+统计）、平台管理员（全部+账号管理）。
- **自助注册一律创建普通菇农**：客户端传 `role` 不生效（`register()` 固定使用 `SELF_REGISTER_ROLE`）。专家、采购商、基地管理员等角色只能由平台管理员通过 `PUT /api/admin/users/:id/role` 分配。
- **提问与回复分开授权**：拥有 `questions` 写权限只代表能**提问**（`POST /api/questions` 保存时会自动调用 AI 作答）；**人工专家回复**（`PUT /api/questions/:id` 带 `answer`）只有专家与平台管理员可执行，其它角色返回 `403 当前角色（…）不能代替专家回复问题`，规则见 `auth.canAnswerQuestion`。
- 越权返回 403 并带明确提示。

```text
GET  /api/auth/roles                 角色与权限矩阵
POST /api/auth/register|login|wechat 注册 / 登录 / 微信一键登录
POST /api/auth/logout                退出（token 立即失效）
GET  /api/auth/me                    当前账号 + 自己的权限
GET  /api/admin/users                管理员：账号列表
PUT  /api/admin/users/:id/role       管理员：改角色
```

微信一键登录：配置 `WX_APPID`/`WX_SECRET` 后，小程序 `wx.login` 的 code 换 openid，首次自动建号；**未配置返回 501 并提示改用账号密码**。

## 大棚硬件接入

环境数据默认由设备自动上报，手动补录仅作兜底（记录会标注 `source`）。

```bash
# 1) 创建设备（也可在小程序里操作），返回设备编号 code 与密钥 secret；阈值可按设备配置
curl -X POST http://localhost:3000/api/devices \
  -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" \
  -d '{"name":"1 号棚温湿度网关","base_id":1,"model":"ESP32-S3","temp_max":26,"humidity_min":80,"co2_max":800}'

# 2) 硬件端定时上报（设备密钥鉴权，无需登录）
curl -X POST http://localhost:3000/api/ingest/readings \
  -H "X-Device-Code: GS-XXXXXX" -H "X-Device-Secret: <设备密钥>" \
  -H "Content-Type: application/json" \
  -d '{"temperature":24.5,"humidity":88,"co2":650,"light":320}'
```

| 接口 | 说明 |
|---|---|
| `POST /api/ingest/readings` | 上报数据，入库 + 按阈值自动预警 |
| `POST /api/ingest/heartbeat` | 心跳，仅刷新在线状态 |
| `GET /api/ingest/config` | 设备开机自检：读自己的阈值与服务器时间 |
| `GET /api/devices` | 设备列表（在线状态、最新读数、密钥掩码） |
| `POST/PUT/DELETE /api/devices/:id` | 设备增改删 |
| `GET /api/devices/:id/secret` | 查看完整密钥（填进硬件） |
| `POST /api/devices/:id/rotate` | 重置密钥 |
| `GET /api/devices/:id/series?hours=24&buckets=12` | 历史曲线（等长分桶的均值与极值） |

超过 10 分钟无上报即判为离线；也支持 `Authorization: Device <编号>:<密钥>`。

### MQTT 接入

```text
主题：<前缀>/devices/<设备编号>/readings      上报数据
      <前缀>/devices/<设备编号>/heartbeat     心跳
报文：{"secret":"<设备密钥>","temperature":24.5,"humidity":88,"co2":650,"light":320}
```

```bash
npm run mqtt           # 启动适配层，订阅并转成同一套入库逻辑
npm run mqtt:broker    # 可选：本地 broker（aedes），没有真实 broker 时演示用
```

适配层与 HTTP 上报共用鉴权与入库代码：非法 JSON、设备不存在、密钥错误、设备停用一律丢弃并打印原因，不写脏数据。

## AI 问答

- `POST /api/ai/ask` `{question, base_id?, save?}`：大模型回答，**自动带入该账号最近的基地/批次/环境数据**；`save=true` 写入问答记录。
- `GET /api/ai/status`：是否已接入大模型、模型名、规则库条目数。
- 未配置密钥或调用失败 → 降级为内置规则知识库（8 类常见问题），回答注明来源与降级原因，不伪装成 AI 结论。
- 人工专家可用 `PUT /api/questions/:id` 补充回答，来源记为人工。
- `POST /api/ai/suggest-priority`：任务优先级建议（同样支持规则引擎降级）。

## 主要业务接口

```text
GET  /api/dashboard              当前账号汇总（含设备数/在线数/自动上报数）

GET/POST/PUT/DELETE /api/bases           基地
GET/POST/PUT/DELETE /api/batches         生产批次
GET/POST/PUT/DELETE /api/readings        环境记录
GET/POST/PUT/DELETE /api/alerts          预警
POST /api/alerts/:id/ack                 处理预警
GET/POST/PUT/DELETE /api/trace-events    溯源事件
GET/POST/PUT/DELETE /api/questions       问答记录
GET/POST/PUT/DELETE /api/products        供应信息
GET/POST/PUT/DELETE /api/demands         采购需求
GET/POST/PUT/DELETE /api/tasks           生产任务
GET/POST/PUT/DELETE /api/partners        合作方
POST /api/uploads                图片上传（按账号分目录）

GET  /api/trace/:code            公开溯源查询
```

## 常用命令

```bash
npm run seed:demo                            # 演示数据（账号 demo / demo123456）
npm run backup                               # 备份数据库与图片目录
npm run make:admin -- <账号> [角色]           # 提升为平台管理员 / 收回
npm test                                     # 接口与权限测试
npm run test:mqtt                            # MQTT 端到端测试
```

## 数据真实性原则

只展示 SQLite 中已保存的记录，无数据时显示空状态，统计与数据库一致；接口失败明确报错，不做虚构数据兜底；演示数据全部带“演示”标记，上线前替换为真实数据。
