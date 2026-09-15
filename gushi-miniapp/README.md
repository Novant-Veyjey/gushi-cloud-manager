# 菇事云管家 · 微信小程序（Taro + React + TypeScript）

数字技术赋能赣北食用菌产业振兴 —— 小程序端，复用「后台」的 Express + better-sqlite3 接口。

## 一、怎么查看这个小程序

有三种方式，任选一种。

### 方式一：微信开发者工具（正式方式，推荐）

```bash
# 1. 先启动后台（必须，否则小程序连不上数据）
cd 后台 && npm install && npm start        # http://localhost:3000

# 2. 构建小程序
cd gushi-miniapp && npm install
npm run build:weapp          # 只构建一次（产物在 dist/）
# 或者：npm run dev:weapp    # 边改边编译（开发时用这个）
```

然后打开**微信开发者工具**：

1. 新建/导入项目 → 目录选择 `gushi-miniapp` 文件夹（`project.config.json` 已把 `miniprogramRoot` 指向 `dist/`）
2. AppID 选择「测试号」即可（正式发布需换成自己的 AppID）
3. 顶部「详情」→「本地设置」→ 勾选 **不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**
4. 点击「编译」，模拟器里就能看到小程序：登录页 → 登录后进入五个 Tab

真机预览：把 `src/config/index.ts` 里的 `BASE_URL` 改成电脑局域网 IP（例如 `http://192.168.1.10:3000`），手机与电脑连同一个 WiFi，再点开发者工具的「预览」扫码。

### 方式二：浏览器快速预览（不用装开发者工具）

```bash
cd gushi-miniapp
npm install
npm run build:h5        # 构建浏览器版到 dist-h5
npm run preview:h5      # 启动本地预览服务
```

浏览器打开 http://localhost:5173 ，可以直接看界面、登录、增删数据。
注意：扫码、图片上传等**小程序专有能力需要在微信开发者工具里体验**，浏览器版只是快速预览。

### 方式三：后台自带的手机风格原型

后台启动后直接打开 http://localhost:3000 ，是单文件 HTML 原型（同样支持注册登录、数据保存），适合演示和答辩时快速展示。

## 二、登录方式

| 方式 | 说明 |
|---|---|
| 账号密码登录 | 注册自己的账号，数据只属于该账号；可自选角色 |
| 微信一键登录 | 小程序内点「微信一键登录」，后台用 `code2session` 换 openid，首次自动建号。**需在后台 `.env` 配置 `WX_APPID` / `WX_SECRET`**，未配置时会提示并改用账号密码 |
| 演示账号 | `demo` / `demo123456`（数据带“演示”标记，可删除） |

登录态用 JWT 表示，缓存在本地，7 天有效；退出登录后服务端立即撤销。

## 三、角色与权限（RBAC）

注册时可选角色，不同角色能做的事不同（后端强制校验，前端自动隐藏无权限入口）：

| 角色 | 主要权限 |
|---|---|
| 菇农 farmer | 基地/批次/环境/预警/溯源/任务 读写，供应与采购只读 |
| 合作社/基地管理员 base | 除账号管理外几乎全部读写 |
| 专家 expert | 专家问答读写，其余只读 |
| 采购商 buyer | 发布采购需求，浏览供应与溯源，其余只读 |
| 政府/服务机构 government | 全部只读 + 统计 |
| 平台管理员 admin | 全部权限 + 账号管理（不能自助注册，由管理员在后台调整） |

## 四、技术栈与目录

| 层 | 技术 |
|---|---|
| 框架 | Taro 4.2.1 + React 18 |
| 语言 | TypeScript 5 |
| 样式 | 原生 SCSS（设计宽度 750） |
| 登录态 | JWT（`Authorization: Bearer`） |
| 后端 | 「后台」Express + better-sqlite3 |

```
gushi-miniapp/
├── config/                     # Taro 编译配置（webpack5、@ → src 别名、h5/小程序输出目录）
├── scripts/serve-h5.js         # 浏览器预览用的零依赖静态服务器
├── src/
│   ├── app.config.ts           # 页面注册 + 五个 Tab
│   ├── index.html              # H5 入口模板
│   ├── assets/logo.jpg         # 品牌图标（登录页与顶部品牌栏共用）
│   ├── config/
│   │   ├── index.ts            # BASE_URL、阈值、阶段、单位
│   │   └── forms.ts            # 9 类录入表单配置（字段与后台表结构一致）
│   ├── types/index.ts          # 数据模型 + 账号模型
│   ├── utils/
│   │   ├── request.ts          # api()、携带 JWT、401 跳登录、图片上传
│   │   ├── auth.ts             # 注册 / 登录 / 微信一键登录 / 退出 / 当前账号
│   │   ├── storage.ts          # 登录态本地缓存
│   │   ├── permission.ts       # 前端权限矩阵（与后端一致）+ guard()
│   │   └── format.ts
│   ├── hooks/useCloudData.ts   # 页面进入时并发拉取本账号数据
│   ├── components/             # BrandBar / FormSheet / EmptyState / StateHint
│   └── pages/
│       ├── login/              # 登录 / 注册 / 微信一键登录（入口页）
│       ├── home/               # 首页：统计、最新环境、预警、任务、当前账号
│       ├── production/         # 生产：批次台账、任务优先级建议
│       ├── monitor/            # 监测：环境数据、阈值说明、预警处理
│       ├── trace/              # 溯源：批次编号/扫码查询、时间线
│       ├── market/             # 市场：供应、采购需求、产品图标
│       └── expert/             # 专家服务：提问、回复
```

## 五、接口地址配置

默认 `http://localhost:3000`，在 `src/config/index.ts` 修改，或使用环境变量：

```bash
# .env.development
TARO_APP_API_BASE=http://192.168.1.10:3000
```

- 模拟器调试：`http://localhost:3000`
- 真机预览：填电脑局域网 IP
- 正式发布：在微信公众平台配置 request 合法域名（必须 HTTPS）

## 六、常用命令

```bash
npm run dev:weapp      # 小程序开发模式（监听编译）
npm run build:weapp    # 小程序正式构建 → dist/
npm run build:h5       # 浏览器版构建 → dist-h5/
npm run preview:h5     # 启动浏览器预览 → http://localhost:5173
npm run type-check     # TypeScript 类型检查
```

## 七、功能与需求对应

| 需求 | 实现位置 |
|---|---|
| FR-01 基地管理 | 首页/生产页“新增基地”表单，POST `/api/bases` |
| FR-02 批次管理 | 生产页批次台账 + “新增批次”，POST `/api/batches` |
| FR-03 环境录入 | 监测页“录入环境数据”，POST `/api/readings` |
| FR-04 自动预警 | 后台规则生成，监测页/首页可“处理”，POST `/api/alerts/:id/ack` |
| FR-05 专家问答 | 专家服务页提问与回复 |
| FR-06 质量溯源 | 溯源页批次编号/扫码查询，GET `/api/trace/:code` |
| FR-07 供应信息 | 市场页“发布供应” + 产品图标上传 |
| FR-08 采购需求 | 市场页“发布采购需求” |
| FR-09 任务管理 | 生产页任务列表 + `/api/ai/suggest-priority` |
| FR-10 统计分析 | 首页今日数据与 `/api/dashboard` 一致 |
| FR-11 权限控制 | JWT + RBAC（6 种角色），前端隐藏 + 后端强制 |
| FR-12 编辑删除 | 小程序端提供新增与图标/回复更新；完整编辑删除在后台扩展 |
| FR-14 微信小程序 | 本工程，五个 Tab + 专家服务页 |

## 八、数据真实性原则

1. 所有页面数据均来自后台 SQLite，不使用硬编码业务数据。
2. 没有录入数据时显示空状态，统计数字与数据库记录数严格一致。
3. 后台连不上或未登录时明确提示失败，不做虚构数据兜底。
4. 演示数据必须带“演示”标记，比赛与上线前替换为真实数据。
