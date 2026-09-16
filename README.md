# 菇事云管家

**数字技术赋能赣北食用菌产业振兴**

食用菌产业数字化管理平台：以基地、批次、菌棒为核心档案，打通生产记录、环境监测预警、AI 问答、质量溯源与产销对接，并提供微信小程序端。

| 目录 | 内容 |
|---|---|
| [`后台/`](./后台) | Express + better-sqlite3：RESTful 接口、JWT 登录、RBAC 权限、SQLite 持久化、设备接入与 MQTT 适配层 |
| [`gushi-miniapp/`](./gushi-miniapp) | Taro 4 + React 18 + TypeScript 微信小程序：五个 Tab + AI 问答 + 登录注册 |

**功能**：基地 / 批次 / 环境监测预警 / AI 问答 / 质量溯源 / 供应与采购 / 任务管理 / 统计 / 权限 / 微信小程序

## 快速开始

```bash
# 1) 后台（必须先启动）
cd 后台 && npm install && npm start          # http://localhost:3000
npm run seed:demo                            # 可选：演示数据，账号 demo / demo123456

# 2) 小程序
cd gushi-miniapp && npm install
npm run dev:weapp                            # 微信开发者工具导入本目录，勾选“不校验合法域名”
# 或浏览器预览：npm run build:h5 && npm run preview:h5   → http://localhost:5173
```

后台启动后也可直接打开 http://localhost:3000 使用手机风格原型。

`.env` 可选配置（不填也能跑，AI 会自动降级为规则知识库）：

```text
AI_BASE_URL=https://api.deepseek.com/v1     # AI 问答（OpenAI 兼容接口）
AI_API_KEY=你的密钥
AI_MODEL=deepseek-chat
WX_APPID= / WX_SECRET=                       # 微信一键登录（可选）
MQTT_URL=mqtt://127.0.0.1:1883              # MQTT 设备接入（可选）
```

数据保存在 `后台/server/data/gushi.sqlite`，重启不丢失；`npm run backup` 备份数据库与图片。

## 大棚硬件接入

环境数据由大棚设备自动上报，无需人工录入：

```bash
# 硬件端定时上报（设备密钥鉴权，无需登录）
curl -X POST http://localhost:3000/api/ingest/readings \
  -H "X-Device-Code: GS-XXXXXX" -H "X-Device-Secret: <设备密钥>" \
  -H "Content-Type: application/json" \
  -d '{"temperature":24.5,"humidity":88,"co2":650,"light":320}'

# 也可走 MQTT：npm run mqtt（适配层） + npm run mqtt:broker（本地演示 broker）
```

上报即入库并按阈值自动预警；超过 10 分钟无上报显示离线；`GET /api/devices/:id/series?hours=24` 提供历史曲线。设备编号与密钥在「监测 → 接入大棚设备」生成。

## AI 问答

`POST /api/ai/ask` 调用大模型回答种植问题，并自动带入该账号最近的基地、批次、环境数据。回答标注来源：`ai`（大模型）/ `rule`（未配置密钥时降级为规则知识库）/ 人工专家补充。AI 仅作辅助，重要决策请咨询当地农技专家。

## 账号与权限

注册后每个账号的数据互相隔离；JWT 登录态 7 天有效，退出立即失效。六种角色（菇农 / 基地管理员 / 专家 / 采购商 / 政府机构 / 平台管理员）由后端强制校验，越权返回 403。提升管理员：`cd 后台 && npm run make:admin -- 账号`。

## 技术栈

后端 Node.js + Express + better-sqlite3 + JWT（自研 HS256）；小程序 Taro 4 + React 18 + TypeScript；接口统一返回 `{ code, message, data }`。

## 数据真实性原则

只展示数据库中已保存的记录，无数据时显示空状态，统计数字与数据库一致，连不上或未登录时明确提示失败，不做虚构数据兜底；演示数据全部带“演示”标记。

---

详细说明见 [`后台/README.md`](./后台/README.md) 与 [`gushi-miniapp/README.md`](./gushi-miniapp/README.md)。
