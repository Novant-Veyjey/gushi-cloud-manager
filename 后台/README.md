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

## 主要业务接口（均需登录，并按角色校验）

```text
GET  /api/dashboard              当前账号的数据汇总
GET  /api/health                 健康检查（公开）

GET/POST/PUT/DELETE /api/bases           基地
GET/POST/PUT/DELETE /api/batches         生产批次
GET/POST/PUT/DELETE /api/readings        环境记录（保存后自动按阈值生成预警）
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
npm test
```

覆盖：JWT 结构、注册登录、重复注册 409、密码错误 401、未登录 401、账号隔离、跨账号修改拦截、RBAC（采购商建基地 403、专家发供应 403、政府写入 403、管理员接口 403/可用）、微信登录未配置返回 501、数据持久化、密码加密、公开溯源、退出后 token 失效。

## 数据真实性原则

1. 页面只展示 SQLite 中已经保存的记录，不使用硬编码业务数据。
2. 没有录入数据时显示空状态，统计数字与数据库记录数严格一致。
3. 演示数据全部带“演示”标记，避免与真实数据混淆。
4. 比赛或上线前必须录入由基地、合作社、企业或农户确认的真实数据。
