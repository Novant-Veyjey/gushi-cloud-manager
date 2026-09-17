# 菇事云管家

**数字技术赋能赣北食用菌产业振兴**

菇事云管家是一套面向食用菌产业的生产管理与产销对接平台。系统以基地、批次和菌棒为核心档案，提供生产记录、环境监测预警、AI 问答、质量溯源、供应采购和市场交易能力，并同时支持微信小程序与浏览器访问。

## 项目结构

| 目录 | 内容 |
|---|---|
| [`server/`](./server) | Express + better-sqlite3 服务端，提供 REST API、JWT 登录、RBAC 权限、SQLite 持久化和 MQTT 设备接入 |
| [`miniapp/`](./miniapp) | Taro 4 + React 18 + TypeScript 小程序，也可构建为浏览器版本 |
| [`docs/`](./docs) | 用户功能说明与项目需求文档 |
| [`assets/`](./assets) | 后台与小程序共用的品牌资源 |
| [`scripts/`](./scripts) | 文档生成、部署组装和 Windows 启动脚本 |

```text
.
├── server/                 # 服务端与网页版管理端
│   ├── server/             # Express 业务代码
│   └── public/             # 网页版静态资源
├── miniapp/                # Taro 小程序
│   ├── src/
│   └── config/
├── docs/
│   ├── 功能说明.md
│   └── 项目需求文档.docx
├── assets/
│   └── logo.jpg
├── scripts/
│   ├── windows/
│   ├── md-to-docx.js
│   └── prep-deploy.js
├── package.json
└── README.md
```

详细功能说明见 [`docs/功能说明.md`](./docs/功能说明.md)，接口与权限说明见 [`server/README.md`](./server/README.md)，小程序开发说明见 [`miniapp/README.md`](./miniapp/README.md)。

## 功能概览

- 基地、批次、菌棒与生产任务台账
- 大棚设备接入、环境记录、阈值预警与历史曲线
- AI 智能问答、专家人工回复与问答记录
- 二维码质量溯源与公开查询
- 供应发布、采购需求、下单、支付演示、发货和收货
- 六类角色权限、账号隔离、管理员职位分配与密码重置
- 微信小程序与浏览器端共用同一套账号、接口和数据库

## 快速开始

环境要求：Node.js 18 或更高版本。

### 1. 安装依赖

在项目根目录执行：

```bash
npm run install:all
```

### 2. 启动服务端

```bash
npm start
```

服务地址：`http://localhost:3000`

首次体验可以先写入演示数据：

```bash
npm run seed:demo
```

演示账号：`demo / demo123456`

### 3. 浏览器预览小程序

另开一个终端，在项目根目录执行：

```bash
npm run build:h5
npm run preview:h5
```

预览地址：`http://localhost:5173`

### 4. 微信小程序

```bash
npm run build:weapp
```

随后在微信开发者工具中导入 [`miniapp/`](./miniapp) 目录，本地开发时勾选“不校验合法域名”。

## Windows 一键启动

启动脚本位于 [`scripts/windows/`](./scripts/windows)：

| 脚本 | 作用 |
|---|---|
| `start-all.cmd` | 同时启动服务端和浏览器预览 |
| `start-backend.cmd` | 只启动服务端，地址为 `http://localhost:3000` |
| `start-browser-preview.cmd` | 启动浏览器版预览，地址为 `http://localhost:5173` |

## 配置

在 [`server/`](./server) 目录复制 `.env.example` 为 `.env` 后按需配置：

```text
AI_BASE_URL=https://api.deepseek.com/v1
AI_API_KEY=你的密钥
AI_MODEL=deepseek-chat
MQTT_URL=mqtt://127.0.0.1:1883
```

这些配置均为可选。未配置 AI 密钥时，系统会自动使用内置规则知识库。

数据库默认保存在 `server/server/data/gushi.sqlite`，重启后数据不会丢失。

## 测试

```bash
npm test
npm run type-check
npm run test:mqtt
```

## 部署

先构建浏览器版：

```bash
npm run build:h5
```

再生成 Cloud Studio 部署目录：

```bash
node scripts/prep-deploy.js
```

部署产物会生成到 `_deploy/`，该目录不会提交到 Git。

## 数据原则

页面只展示数据库中已经保存的数据，无数据时显示空状态，不使用虚构数据兜底。演示数据均带“演示”标记，正式使用前应替换为经过确认的真实业务数据。
