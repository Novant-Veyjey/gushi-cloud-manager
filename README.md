# 菇事云管家

**数字技术赋能赣北食用菌产业振兴**

菇事云管家是一套面向食用菌产业的生产管理与产销对接平台。系统以基地、批次和菌棒为核心档案，提供生产记录、环境监测预警、AI 问答、质量溯源、供应采购和市场交易能力，并同时支持微信小程序与浏览器访问。

[功能说明](./小程序介绍书.md) · [浏览器预览](./菇事云管家-功能预览.html) · [Word 版说明](./菇事云管家-功能介绍书.docx) · [项目需求文档](./后台/docs/菇事云管家-项目需求文档.docx)

## 核心功能

- 基地、批次、菌棒与生产任务台账
- 大棚设备接入、环境记录、阈值预警与历史曲线
- AI 智能问答、专家人工回复与问答记录
- 二维码质量溯源与公开查询
- 供应发布、采购需求与完整订单交易流程
- 六类角色权限、账号隔离、职位分配与记录管理
- 微信小程序与浏览器端共用同一套账号、接口和数据库

## 项目结构

| 目录 | 内容 |
|---|---|
| [`后台/`](./后台) | Express + better-sqlite3 服务端、REST API、JWT、RBAC、SQLite 与 MQTT 设备接入 |
| [`gushi-miniapp/`](./gushi-miniapp) | Taro 4 + React 18 + TypeScript 小程序，也可构建为浏览器版本 |
| [`scripts/`](./scripts) | 文档生成与部署组装脚本 |

## 快速开始

环境要求：Node.js 18 或更高版本。

```bash
# 1. 安装依赖
npm run install:all

# 2. 写入演示数据（可选，账号 demo / demo123456）
npm run seed:demo

# 3. 启动服务端
npm start
```

服务端地址：`http://localhost:3000`

浏览器预览小程序需要另开一个终端：

```bash
npm run build:h5
npm run preview:h5
```

预览地址：`http://localhost:5173`

微信小程序开发：

```bash
npm run build:weapp
```

随后在微信开发者工具中导入 [`gushi-miniapp/`](./gushi-miniapp) 目录，本地开发时勾选“不校验合法域名”。

Windows 用户也可以直接双击 [`一键启动.cmd`](./一键启动.cmd)。

## 配置

在 [`后台/`](./后台) 目录复制 `.env.example` 为 `.env` 后按需配置：

```text
AI_BASE_URL=https://api.deepseek.com/v1
AI_API_KEY=你的密钥
AI_MODEL=deepseek-chat
MQTT_URL=mqtt://127.0.0.1:1883
```

这些配置均为可选。未配置 AI 密钥时，系统会自动使用内置规则知识库。

数据库默认保存在 `后台/server/data/gushi.sqlite`，重启后数据不会丢失。

## 详细文档

- [小程序功能说明](./小程序介绍书.md)
- [后台开发说明](./后台/README.md)
- [小程序开发说明](./gushi-miniapp/README.md)
- [项目需求文档](./后台/docs/菇事云管家-项目需求文档.docx)

## 测试与部署

```bash
npm test
npm run type-check
npm run test:mqtt

npm run deploy:prepare
```

部署产物会生成到 `_deploy/`，该目录不会提交到 Git。

## 数据原则

页面只展示数据库中已经保存的数据，无数据时显示空状态，不使用虚构数据兜底。演示数据均带“演示”标记，正式使用前应替换为经过确认的真实业务数据。
