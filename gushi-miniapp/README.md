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

**浏览器预览（不用开发者工具）**

```bash
npm run build:h5 && npm run preview:h5    # http://localhost:5173
```

Windows 上也可直接双击 `启动浏览器预览.cmd`：首次会自动构建，然后启动预览并打开浏览器。

扫码、图片上传等小程序专有能力需在开发者工具里体验。

### 接口地址（BASE_URL）怎么定

`src/config/index.ts` 会按以下顺序解析，**不需要为了换 IP 改代码重新构建**：

1. 构建时显式指定（在 `config/index.ts` 的 `defineConstants` 里注入）：

   ```bash
   # Git Bash / macOS / Linux
   TARO_APP_API_BASE=http://192.168.1.10:3000 npm run build:h5
   # Windows PowerShell
   $env:TARO_APP_API_BASE='http://192.168.1.10:3000'; npm run build:h5
   ```
2. 浏览器端自动跟随访问地址：用 `http://10.23.53.47:5173` 打开就自动连 `http://10.23.53.47:3000`，本机 `localhost:5173` 就自动连 `localhost:3000`；
3. 兜底 `http://localhost:3000`。

所以手机只要和电脑在同一个 WiFi，直接打开 `http://<电脑局域网IP>:5173` 即可（前提是后台 3000 与预览 5173 都在运行、防火墙放行 Node 入站）。

微信小程序真机预览时，用第 1 种方式把地址写成电脑局域网 IP。

## 二、登录与权限

| 登录方式 | 说明 |
|---|---|
| 账号密码 | 注册后数据只属于该账号；**注册一律是普通菇农**，不能自选角色 |
| 演示账号 | `demo` / `demo123456` |

JWT 登录态本地缓存 7 天，退出后服务端立即撤销。角色由**平台管理员在后台分配**（登录/注册页不提供角色选择）。

角色能力：

| 角色 | 可写模块 |
|---|---|
| 菇农 `farmer` | 基地 / 批次 / 设备 / 环境 / 预警 / 溯源 / 任务 / 订单（供应、采购需求、合作方只读） |
| 基地管理员 `base` | 除账号管理外全部（含订单） |
| 专家 `expert` | 只有问答可写，其余只读（订单只读） |
| 采购商 `buyer` | 采购需求、问答、**订单（下单 / 支付 / 确认收货）** |
| 政府机构 `government` | 全部只读 + 统计（订单只读） |
| 平台管理员 `admin` | 全部 + 账号管理 |

两点细节：

- **提问 ≠ 回复**：任何有 `questions` 写权限的角色都能提问（提交后 AI 自动作答）；但**人工专家回复只有专家与平台管理员能做**，其它角色调用会被 403 拦下（`permission.ts` 的 `canAnswerQuestion` 与后台规则一致）。
- 前端只是隐藏无权限入口（`can()` / `guard()` / `FORM_MODULE`），真正的权限校验在后端。

## 三、目录结构

```
gushi-miniapp/
├── config/                        # Taro 编译配置（@ → src 别名、小程序/H5 输出目录、defineConstants、TabBar 图标复制）
├── scripts/
│   ├── serve-h5.js                # 浏览器预览用的零依赖静态服务器
│   ├── copy-tabbar.js             # 构建后把 TabBar 图标补到产物根目录（H5 需要）
│   └── gen-tabbar-icons.py        # 生成 TabBar 图标（81×81，普通/选中两套，需 Pillow）
└── src/
    ├── app.config.ts              # 页面注册 + 五个 Tab（含 iconPath）
    ├── index.html                 # H5 入口模板
    ├── assets/logo.jpg            # 品牌图标
    ├── assets/tabbar/             # TabBar 图标（home / production / monitor / trace / market）
    ├── config/                    # BASE_URL/阈值等常量、录入表单配置与首页「＋」菜单
    ├── types/                     # 数据模型与账号模型
    ├── utils/                     # request（携带 JWT、可配超时、401 跳登录）、auth、storage、permission、format、tabbar（弹层期间收起 TabBar）
    ├── hooks/useCloudData.ts      # 并发拉取本账号数据（支持静默刷新，无权限模块自动跳过）
    ├── components/                # BrandBar / FormSheet / EmptyState / StateHint
    └── pages/                     # login、home、production、monitor、trace、market、expert(AI 问答)
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

- **提问即自动回答**：输入问题点「向 AI 提问」，或在「＋ → 问题提问」表单提交，后台会立即作答并写入问答记录，不用等人工专家。
- 回答自动带上本账号最近的基地、批次、环境数据作为上下文。
- 来源标记：**AI 大模型**（`source=ai`）/ **规则知识库**（`rule`，未配置 Key 或调用失败时降级）。
- 小程序端**不提供人工回复入口**：提问与查看记录面向所有角色，人工专家回复只由专家/管理员在后台完成。
- 切换模型只改后台 `.env`，小程序无需改动。

## 六、常用命令

```bash
npm run dev:weapp      # 小程序开发模式（监听编译）
npm run build:weapp    # 小程序构建 → dist/（构建后自动执行 copy-tabbar.js 补 TabBar 图标）
npm run build:h5       # 浏览器版构建 → dist-h5/（同样自动补图标）
npm run preview:h5     # 浏览器预览 → http://localhost:5173
npm run type-check     # TypeScript 类型检查
```

## 七、功能与需求对应

基地管理、批次台账、环境自动上报与阈值预警、AI 问答、质量溯源（扫码/编号）、供应与采购需求、**市场交易（立即采购、下单、支付、发货、确认收货、我的订单）**、任务管理（AI 优先级建议）、统计汇总、JWT+RBAC 权限、微信小程序——接口均复用后台 REST API。

## 八、数据真实性原则

数据全部来自后台 SQLite，无数据时显示空状态，统计与数据库一致；连不上或未登录明确提示失败，不做虚构数据兜底；环境数据以硬件上报为准，AI 回答为辅助建议且必须标注来源，演示数据带“演示”标记。

## 九、已知坑（改动前请注意）

1. **不要直接写 `process.env.自定义变量`**：webpack5 的 h5 构建不注入 `process`，会导致浏览器白屏。新增环境变量请在 `config/index.ts` 的 `defineConstants` 里声明。
2. **主题变量要同时挂 `page` 与 `:root`**：H5 没有 `page` 元素，只写 `page` 会让 H5 里所有 `var(--g*)` 失效（表现为按钮白字白底）。
3. **新增 TabBar 图标**：图标放 `src/assets/tabbar/`，`app.config.ts` 里用 `assets/tabbar/xxx.png` 相对路径；改完跑一次 `npm run build:h5` 让 `copy-tabbar.js` 补齐产物。
4. **弹层加长内容**：把滚动部分放进 `.sheet-body`，底部按钮留在 `.sheet-actions`，否则内容会溢出屏幕、按钮点不到。
5. **不要在页面里无条件 `Promise.all` 拉全部接口**：采购商、专家、政府角色对设备 / 环境 / 预警 / 任务没有读权限，403 会让整个 `Promise.all` 失败，页面表现为「后台连接失败、看不到任何内容」。`useCloudData` 已用 `fetchIfAllowed` 按 `can()` 跳过无权限模块——新增接口时请沿用同一写法。
6. **Taro 的 `View` 绑 `onKeyDown` 不生效**：Taro 只把触摸 / 点击类事件透传到真实 DOM，键盘事件需要在 `document` 上监听并判断 `document.activeElement`（参考登录页密码显隐按钮）。
7. **弹层底部被底部 TabBar 盖住**：H5 的 TabBar 是固定层且层级高于页面内弹层，弹层打开时用 `utils/tabbar.ts` 的 `useHideTabBarWhen(visible)` 收起它，关闭后自动恢复。
