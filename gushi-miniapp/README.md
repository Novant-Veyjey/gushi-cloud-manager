# 菇事云管家 · 微信小程序

Taro 4 + React 18 + TypeScript，复用「后台」的 Express + better-sqlite3 接口。五个 Tab：首页、生产、监测、溯源、市场，另含 AI 问答页与登录注册。

## 一、怎么查看

**微信开发者工具（正式）**

```bash
cd 后台 && npm install && npm start      # 必须先启动后台
cd gushi-miniapp && npm install
npm run dev:weapp                        # 或 npm run build:weapp 只编译一次
```

导入项目选 `gushi-miniapp` 目录 → AppID 用测试号 → 详情/本地设置勾选 **不校验合法域名** → 编译。
真机预览：把 `src/config/index.ts` 的 `BASE_URL` 改成电脑局域网 IP。

**浏览器预览（不用开发者工具）**

```bash
npm run build:h5 && npm run preview:h5    # http://localhost:5173
```

扫码、图片上传、微信一键登录等小程序专有能力需在开发者工具里体验。
后台启动后打开 http://localhost:3000 也可用手机风格 HTML 原型。

## 二、登录与权限

| 登录方式 | 说明 |
|---|---|
| 账号密码 | 注册后数据只属于该账号，可自选角色 |
| 微信一键登录 | `wx.login` → `code2session`，首次自动建号；需后台配置 `WX_APPID`/`WX_SECRET`，未配置会提示改用账号密码 |
| 演示账号 | `demo` / `demo123456` |

JWT 登录态本地缓存 7 天，退出后服务端立即撤销。角色能力：菇农（生产/设备/环境/溯源/任务读写）、基地管理员（除账号管理外全部）、专家（问答读写，其余只读）、采购商（采购需求读写、无设备权限）、政府机构（只读+统计）、平台管理员（全部+账号管理）。前端会隐藏无权限入口，后端强制校验。

## 三、目录结构

```
gushi-miniapp/
├── config/                     # Taro 编译配置（@ → src 别名、小程序/H5 输出目录）
├── scripts/serve-h5.js         # 浏览器预览用的零依赖静态服务器
└── src/
    ├── app.config.ts           # 页面注册 + 五个 Tab
    ├── index.html              # H5 入口模板
    ├── assets/logo.jpg         # 品牌图标
    ├── config/                 # BASE_URL/阈值等常量、10 类录入表单配置
    ├── types/                  # 数据模型与账号模型
    ├── utils/                  # request（携带 JWT、401 跳登录）、auth、storage、permission、format
    ├── hooks/useCloudData.ts   # 并发拉取本账号数据（支持静默刷新）
    ├── components/             # BrandBar / FormSheet / EmptyState / StateHint
    └── pages/                  # login、home、production、monitor、trace、market、expert(AI)
```

## 四、硬件自动上报

1. 「监测」页 → 接入大棚设备（填名称、基地、阈值，可自定义编号）。
2. 创建后弹出**设备接入凭证**（编号 + 密钥），配置到温室网关（ESP32/智能网关）。
3. 设备定时上报，页面每 30 秒自动刷新；超阈值自动预警，10 分钟无上报显示离线：

```bash
curl -X POST http://<后台地址>/api/ingest/readings \
  -H "X-Device-Code: GS-XXXXXX" -H "X-Device-Secret: <设备密钥>" \
  -H "Content-Type: application/json" \
  -d '{"temperature":24.5,"humidity":88,"co2":650,"light":320}'
```

4. 设备卡片可展开 **近 24 小时温度曲线**（2 小时分桶，含平均/最低/最高与记录数）。
5. 也支持 MQTT（后台 `npm run mqtt`），报文同上加 `secret` 字段。
6. 「手动补录」仅用于断网/维修/核对历史，记录标注来源（硬件自动 / 手动补录）。

## 五、AI 问答

- 输入问题即答，回答自动带上本账号最近的基地、批次、环境数据作为上下文。
- 来源标记：**AI 大模型**（`source=ai`）/ **规则知识库**（`rule`，未配置 Key 或调用失败时降级）/ **人工专家**。
- 问答自动存档，人工专家可补充纠正。切换模型只改后台 `.env`，小程序无需改动。

## 六、常用命令

```bash
npm run dev:weapp      # 小程序开发模式（监听编译）
npm run build:weapp    # 小程序构建 → dist/
npm run build:h5       # 浏览器版构建 → dist-h5/
npm run preview:h5     # 浏览器预览 → http://localhost:5173
npm run type-check     # TypeScript 类型检查
```

## 七、功能与需求对应

基地管理、批次台账、环境自动上报与阈值预警、AI 问答、质量溯源（扫码/编号）、供应与采购需求、任务管理（AI 优先级建议）、统计汇总、JWT+RBAC 权限、微信小程序——分别对应需求文档 FR-01 ~ FR-14，接口均复用后台 REST API。

## 八、数据真实性原则

数据全部来自后台 SQLite，无数据时显示空状态，统计与数据库一致；连不上或未登录明确提示失败，不做虚构数据兜底；环境数据以硬件上报为准，AI 回答为辅助建议且必须标注来源，演示数据带“演示”标记。
