# 菇事云管家

**数字技术赋能赣北食用菌产业振兴的先行者**

面向赣北食用菌产业的数字化管理平台：以基地、批次、菌棒为核心档案，打通生产记录、环境监测预警、专家服务、质量溯源与产销对接，并提供微信小程序端。

本仓库包含两部分：

| 目录 | 内容 |
|---|---|
| [`后台/`](./后台) | Express + better-sqlite3 服务端：RESTful 接口、JWT 登录、RBAC 权限、SQLite 持久化、手机风格 HTML 原型 |
| [`gushi-miniapp/`](./gushi-miniapp) | Taro 4 + React 18 + TypeScript 微信小程序：五个 Tab + 专家服务 + 登录注册 |

## 功能对照

| 编号 | 模块 | 说明 |
|---|---|---|
| FR-01 | 基地管理 | 基地档案新增/查询/修改 |
| FR-02 | 批次管理 | 批次与菌棒信息，批次编号唯一 |
| FR-03 | 环境录入 | 温度、湿度、CO₂、光照与记录时间 |
| FR-04 | 自动预警 | 超过阈值自动生成预警并可处理 |
| FR-05 | 专家问答 | 提问、专家回复、知识沉淀 |
| FR-06 | 质量溯源 | 批次事件时间线 + 公开查询（扫码/编号） |
| FR-07 | 供应信息 | 产品、数量、价格、日期、图标、批次 |
| FR-08 | 采购需求 | 采购方、产品、数量与联系要求 |
| FR-09 | 任务管理 | 任务、截止日期与优先级建议（AI / 规则引擎） |
| FR-10 | 统计分析 | 首页汇总只反映真实数据库记录 |
| FR-11 | 权限控制 | JWT 登录 + RBAC 六角色 + 账号级数据隔离 |
| FR-14 | 微信小程序 | 复用后台接口，五个主要 Tab |

## 快速开始

### 1. 启动后台

```bash
cd 后台
npm install
npm start                 # http://localhost:3000
```

可选：写入演示数据（演示账号 `demo` / `demo123456`，数据均带“演示”标记）

```bash
npm run seed:demo
```

数据库文件为 `后台/server/data/gushi.sqlite`，服务重启数据不丢失；`npm run backup` 可备份数据库与图片目录。

### 2. 查看小程序

**方式 A：微信开发者工具（正式）**

```bash
cd gushi-miniapp
npm install
npm run dev:weapp         # 或 npm run build:weapp 只编译一次
```

微信开发者工具 → 导入项目 → 目录选 `gushi-miniapp` → AppID 选测试号 → 详情/本地设置里勾选 **不校验合法域名** → 编译。

**方式 B：浏览器快速预览**

```bash
cd gushi-miniapp
npm install
npm run build:h5 && npm run preview:h5    # http://localhost:5173
```

**方式 C：后台自带手机风格原型**：后台启动后直接打开 http://localhost:3000

## 账号与权限

- 注册登录后每个账号拥有独立数据，互相不可见；数据由用户自己录入。
- JWT（HS256）登录态，7 天有效，退出登录立即失效；密钥持久化在 `server/data/jwt.secret`。
- 小程序支持**微信一键登录**（`wx.login` → `code2session`），需在 `后台/.env` 配置 `WX_APPID` / `WX_SECRET`；未配置时会明确提示并建议改用账号密码。
- RBAC 六种角色：菇农、合作社/基地管理员、专家、采购商、政府/服务机构、平台管理员。后端强制校验，越权返回 403。

把某个账号提升为平台管理员：

```bash
cd 后台
npm run make:admin -- 你的账号
```

## 技术栈

- **后端**：Node.js + Express，better-sqlite3（SQLite），JWT（自研 HS256，零依赖），scrypt 密码哈希
- **小程序**：Taro 4.2.1、React 18、TypeScript 5、SCSS
- **接口约定**：RESTful JSON，统一返回 `{ code, message, data }`

## 数据真实性原则

1. 所有页面只展示数据库中已保存的记录，不使用硬编码业务数据。
2. 没有数据时显示空状态，统计数字与数据库记录数严格一致。
3. 后台连不上或未登录时明确提示失败，不做虚构数据兜底。
4. 演示数据全部带“演示”标记，比赛与上线前替换为经确认的真实数据。

## 常见问题

- **git 提示 SSL certificate problem**：本机 git 可使用 Windows 证书库，命令前加 `-c http.sslBackend=schannel`，或自行执行一次 `git config --global http.sslBackend schannel`。
- **小程序连不上后台**：确认后台已启动；真机预览时把 `gushi-miniapp/src/config/index.ts` 的 `BASE_URL` 改成电脑局域网 IP。
- **微信一键登录不可用**：未配置 `WX_APPID`/`WX_SECRET` 时属正常降级，改用账号密码登录即可。

---

各子项目的详细说明见 [`后台/README.md`](./后台/README.md) 与 [`gushi-miniapp/README.md`](./gushi-miniapp/README.md)。
