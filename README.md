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

Windows 上也可以双击启动脚本，省去敲命令：

| 脚本 | 作用 |
|---|---|
| `后台/启动菇事云管家.cmd` | 启动后台服务（自动查找 Node，缺依赖自动安装，并在浏览器打开服务地址） |
| `gushi-miniapp/启动浏览器预览.cmd` | 首次自动构建浏览器版，启动预览并打开 http://localhost:5173 |

### 用手机查看浏览器预览

浏览器版的接口地址会**自动跟随当前访问地址**：本机用 `localhost:5173` 打开就自动连 `localhost:3000`；手机用 `http://<电脑局域网IP>:5173` 打开就自动连 `http://<电脑局域网IP>:3000`，换 IP 不需要重新构建。

前提是手机与电脑在同一 WiFi（或连电脑的移动热点），且两个服务都在运行（后台 `3000`、预览 `5173`）。

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

**提问即自动作答**，不需要等人工专家：

- 小程序「AI 问答」页或「＋ → 问题提问」表单提交后，后台立即调用大模型回答并存档（走 `answerQuestion`，自动带入该账号最近的基地、批次、环境数据作为上下文）；
- 回答标注来源：`ai`（大模型）/ `rule`（未配置密钥或调用失败时降级为内置规则知识库）；
- 提问失败不影响记录保存，仍可在问答记录中查看。

`POST /api/ai/ask` 为直接问答接口；`POST /api/questions` 保存提问时也会自动作答。

**人工回复（专家回复）不是所有人都能做**：只有 `expert`（专家）与 `admin`（平台管理员）能回答提问。其它角色即使有 `questions` 写权限（用于提问），回复也会被 `403 当前角色（…）不能代替专家回复问题` 拦下。

## 账号与权限

- **自助注册一律创建普通菇农**：客户端传 `role` 不生效，避免任何人注册时自选「专家」就拿到回复权限；专家、采购商、基地管理员等角色由平台管理员通过 `PUT /api/admin/users/:id/role` 分配。登录与注册页均不提供角色选择。
- 注册后每个账号的数据互相隔离；JWT 登录态 7 天有效，退出立即失效。
- 六种角色（菇农 / 基地管理员 / 专家 / 采购商 / 政府机构 / 平台管理员）由后端强制校验，越权返回 403；前端只是隐藏无权限入口。
- 提升管理员：`cd 后台 && npm run make:admin -- 账号`。

## 测试

```bash
cd 后台
npm test          # 接口 + RBAC + 账号隔离 + 管理员接口 + 硬件上报预警 + AI 问答 + 公开溯源
npm run test:mqtt # MQTT 端到端
```

## 技术栈

后端 Node.js + Express + better-sqlite3 + JWT（自研 HS256）；小程序 Taro 4 + React 18 + TypeScript；接口统一返回 `{ code, message, data }`。

## 数据真实性原则

只展示数据库中已保存的记录，无数据时显示空状态，统计数字与数据库一致，连不上或未登录时明确提示失败，不做虚构数据兜底；演示数据全部带“演示”标记。

## 常见问题（开发中踩过的坑）

| 现象 | 原因与处理 |
|---|---|
| H5 页面白屏、控制台 `process is not defined` | webpack5 的 h5 构建不再注入 Node 的 `process`。自定义环境变量必须在 `gushi-miniapp/config/index.ts` 的 `defineConstants` 里声明，否则打包后会残留裸 `process` 引用 |
| H5 里按钮「白字白底」看不见（小程序正常） | 主题变量原先只挂在 `page` 上，而 H5 没有 `page` 元素（Taro 渲染的是 `div.taro_page`）。`app.scss` 里已把变量抽成 mixin，同时挂到 `page` 与 `:root` |
| H5 底部 TabBar 图标是空白破图 | TabBar 的 `iconPath` 是相对产物根目录的路径，而 H5 构建会把图片放进 `static/images/...`。`npm run build:h5` 会执行 `scripts/copy-tabbar.js` 把图标补一份到 `assets/tabbar/` |
| 弹层里滚不到底部的「取消 / 保存」 | 弹层需 flex 纵向布局 + 内容区 `.sheet-body` 独立滚动（关键是 `min-height: 0`），底部按钮 `flex-shrink: 0` 固定；H5 端打开弹层时会锁住背景页面滚动 |
| 改了代码但页面没变化 | 清缓存：浏览器 `Ctrl + F5`；微信开发者工具点一次「编译」 |

---

详细说明见 [`后台/README.md`](./后台/README.md) 与 [`gushi-miniapp/README.md`](./gushi-miniapp/README.md)。
