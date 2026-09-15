# 菇事云管家：后续开发关键词与 GitHub 参考

> 当前基础：小程序风格 HTML、Express 后台、better-sqlite3、真实数据录入、环境预警、专家问答、质量溯源、产销对接、产品图标上传。
> 更新时间：2026-09-15

## 一、下一步要开发什么

1. 管理员登录、角色权限、数据修改和删除。
2. 基地、批次、环境记录的真实数据批量导入。
3. 传感器 MQTT 接入、设备心跳和实时预警。
4. 溯源二维码生成、消费者公开查询页。
5. 专家知识库、RAG 问答和 AI 农业建议。
6. 订单、采购需求、供应信息匹配和交易状态。
7. Taro + React + TypeScript 微信小程序。
8. 云服务器部署、数据库备份和日志监控。

## 二、给 AI 继续生成代码的关键词

### 后台与数据

```text
Express.js
better-sqlite3
RESTful API
{code,message,data}
Zod 参数校验
JWT 登录
RBAC 角色权限
admin farmer expert buyer government
参数化 SQL
数据库迁移 migration
审计日志 audit log
软删除 deleted_at
分页 pagination
CSV/Excel 批量导入
数据备份 backup
```

### 前端与小程序

```text
React 18
TypeScript
Vite
原生 CSS
React Router
移动端优先 mobile first
小程序 tabBar
状态管理 Zustand
Taro React
WXML WXSS
微信登录
wx.request
二维码扫码
图片上传
离线数据同步
```

### 环境监测与 IoT

```text
MQTT
EMQX
WebSocket
Socket.IO
device heartbeat
telemetry
time series data
threshold alert
temperature humidity CO2 light
sensor calibration
设备在线状态
历史曲线
告警确认
```

### 溯源与专家服务

```text
QR code traceability
batch trace
event timeline
quality inspection
supply chain
public trace page
RAG knowledge base
OpenAI compatible API
rule engine fallback
expert Q&A
prompt injection protection
```

## 三、GitHub 搜索关键词

```text
express better-sqlite3 react admin dashboard
express sqlite jwt rbac
express sqlite image upload
mqtt express sqlite react dashboard
react typescript agricultural management
agricultural traceability qr react
farm management system react node
agricultural marketplace react express
openai compatible express sqlite
rag knowledge base express sqlite
taro react agriculture mini program
微信小程序 农业 管理
食用菌 菌棒 批次 管理
农产品 溯源 二维码
农机 监测 物联网 大屏
```

建议在 GitHub 搜索时使用组合条件：

```text
"better-sqlite3" "Express" "React" agriculture
"MQTT" "Express" "SQLite" dashboard
"traceability" "QR" "React" "Express"
"mushroom" "management" "React"
"Taro" "React" "TypeScript" "mini program"
```

## 四、GitHub 项目参考

### 技术骨架

| 项目 | 用途 | 许可证 |
|---|---|---|
| [shinyobject/fullstack-ts-template](https://github.com/shinyobject/fullstack-ts-template) | React + Vite + Express + better-sqlite3 完整骨架 | 未标许可证 |
| [AutomationPanda/buggyboard-web-app](https://github.com/AutomationPanda/buggyboard-web-app) | React + TypeScript + Express + SQLite，适合学习 CRUD 组织 | MIT |
| [Harrison-Thorne/StrategicInteractionLab](https://github.com/Harrison-Thorne/StrategicInteractionLab) | 同技术栈的 JWT、受保护路由和 REST API | 未标许可证 |
| [somilror200/fleet-tracker](https://github.com/somilror200/fleet-tracker) | React + TypeScript + Express + SQLite 驾驶舱与预警 | 未标许可证 |

### 后台权限、数据与上传

| 项目 | 用途 | 许可证 |
|---|---|---|
| [amanbsrepo/Finance-Dashboard-Backend](https://github.com/amanbsrepo/Finance-Dashboard-Backend) | Express + SQLite，JWT + RBAC + 数据分析接口 | 未标许可证 |
| [Pranjaltyagi76/Hostel-Buddy-College-Semester-5-Project](https://github.com/Pranjaltyagi76/Hostel-Buddy-College-Semester-5-Project) | Express + SQLite + 图片上传 + RBAC 的完整例子 | 未标许可证 |
| [Vahidrezaee021/profile-image-uploader](https://github.com/Vahidrezaee021/profile-image-uploader) | 图片校验、WebP 处理和 SQLite 储存 | 未标许可证 |
| [sbdh11/cdn](https://github.com/sbdh11/cdn) | Express + SQLite 图片上传和静态服务 | 未标许可证 |

### IoT 和环境监测

| 项目 | 用途 | 许可证 |
|---|---|---|
| [vugarfamiloglu/smartfacility-dashboard](https://github.com/vugarfamiloglu/smartfacility-dashboard) | MQTT + SQLite 规则预警 + WebSocket + React | Apache-2.0 |
| [Serkanbyx/iot-dashboard](https://github.com/Serkanbyx/iot-dashboard) | React + Express + MQTT + Socket.IO + 历史分析 | 许可证不明确 |
| [tsar0705/wattwatch-energy-dashboard](https://github.com/tsar0705/wattwatch-energy-dashboard) | React + Express + SQLite + 多角色 IoT 仪表盘 | 未标许可证 |
| [abysse8/esp8266-soil-node](https://github.com/abysse8/esp8266-soil-node) | ESP8266 + MQTT + Express + SQLite + React | 未标许可证 |

### 农业业务

| 项目 | 用途 | 许可证 |
|---|---|---|
| [kartikuparkar4-cmy/KisanMitra](https://github.com/kartikuparkar4-cmy/KisanMitra) | 农场管理、天气、AI 农技问答 | 未标许可证 |
| [GSShubhang2006/Crop-management-System](https://github.com/GSShubhang2006/Crop-management-System) | 农户、经销商、零售商、管理员角色 | 未标许可证 |
| [IgnacioJSoto/agrotrack-fullstack](https://github.com/IgnacioJSoto/agrotrack-fullstack) | React + TypeScript + Express + PostgreSQL 土地管理 | MIT |
| [YOGESHVENKATAPATHI/Agri-Forecast-Public](https://github.com/YOGESHVENKATAPATHI/Agri-Forecast-Public) | 土地、天气、干旱预警、AI 建议 | 未标许可证 |
| [inmis/Pmrms](https://github.com/inmis/Pmrms) | 食用菌生产、库存、销售字段参考 | 未标许可证 |

### 溯源和专家知识库

| 项目 | 用途 | 许可证 |
|---|---|---|
| [Shashank0126/farm_to_plate](https://github.com/Shashank0126/farm_to_plate) | QR 溯源、角色、供应链、图片上传 | 未标许可证 |
| [Jai0652/AgriNexus](https://github.com/Jai0652/AgriNexus) | IoT + SHA-256 + QR 验证 | 未标许可证 |
| [TrueTechLabs/fabric-trace](https://github.com/TrueTechLabs/fabric-trace) | Hyperledger Fabric 溯源模板 | Apache-2.0 |
| [nasrindev/ironlady-chat-crud](https://github.com/nasrindev/ironlady-chat-crud) | Express + SQLite + OpenAI 知识库问答 | 未标许可证 |
| [kajykk/nexusrag](https://github.com/kajykk/nexusrag) | RAG 知识库和 AI 分析 | MIT |

### OpenAI 兼容接口

| 项目 | 用途 | 许可证 |
|---|---|---|
| [Pic2LaTeX](https://github.com/nan527/Pic2LaTeX) | React + Vite + Express + SQLite + OpenAI 格式接口 | MIT |
| [ai-api-relay](https://github.com/webVueBlog/ai-api-relay) | OpenAI 兼容网关、密钥隔离和 SQLite | MIT |

### 小程序方向

当前关键词 `Taro React agricultural mini program` 在 GitHub 上没有直接命中项目。后续建议：

1. 使用 `Taro + React + TypeScript` 自建小程序；
2. 通过 `wx.request` 复用当前 Express `/api` 接口；
3. 参考原生小程序 `WXML + WXSS` 的页面结构；
4. 把底部 Tab 对应为 `首页、生产、监测、溯源、市场`；
5. 产品图标和图片继续使用后台 `/uploads` 地址。

## 五、使用原则

1. 未标许可证的项目只做阅读和架构参考，不要直接复制代码到闭源比赛项目。
2. MIT、Apache-2.0 项目也需要保留许可证和版权声明。
3. 食用菌行业真实项目很少与技术栈完全一致，应该采用“技术骨架 + 业务字段”的组合方式。
4. 先补齐真实数据、权限和可编辑功能，再考虑区块链和复杂 AI。
