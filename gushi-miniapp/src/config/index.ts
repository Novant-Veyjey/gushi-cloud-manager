import { ENV_TYPE, getEnv } from '@tarojs/taro'

/**
 * API 地址解析顺序：
 *   1. 构建时显式指定的 TARO_APP_API_BASE（见 config/index.ts 的 defineConstants）
 *   2. 浏览器端按当前访问地址自动推导：用 http://192.168.x.x:5173 打开，就自动连 http://192.168.x.x:3000
 *      —— 同一个包在本机和手机（同一 WiFi）都能直接用，换 IP 不用重新打包
 *   3. 兜底 http://localhost:3000
 *
 * 微信开发者工具里预览真机需勾选「不校验合法域名」，正式发布需在公众平台配置 request 合法域名。
 */
const envApiBase =
  typeof process !== 'undefined' && process.env ? process.env.TARO_APP_API_BASE : undefined

function resolveBaseUrl(): string {
  if (envApiBase) return envApiBase
  if (getEnv() === ENV_TYPE.WEB && typeof window !== 'undefined' && window.location && window.location.hostname) {
    const { protocol, hostname, port } = window.location
    // 线上部署走标准端口（80/443），页面与接口同源，用相对地址即可；
    // 本地 / 局域网预览跑在 5173、接口在 3000，按主机名拼出后台地址。
    if (!port || port === '80' || port === '443') return ''
    return protocol + '//' + hostname + ':3000'
  }
  return 'http://localhost:3000'
}

export const BASE_URL = resolveBaseUrl()


/** 环境阈值，与后台 server/app.js 的 evaluateReadingAlerts 保持一致，仅用于界面提示 */
export const THRESHOLDS = {
  temperatureMax: 26,
  humidityMin: 80,
  co2Max: 800
}

/** 产品图标预设，与后台 products.icon 字段兼容（emoji 直接存储，图片存储 /uploads 地址） */
export const PRODUCT_ICON_PRESETS = ['🍄', '🌿', '🌱', '🥬', '🫘', '🍲', '📦', '🏷️']

/** 批次生产阶段 */
export const BATCH_STAGES = ['接种期', '养菌期', '催蕾期', '出菇期', '采摘期', '已完成']

/** 溯源事件类型 */
export const TRACE_EVENT_TYPES = ['入库', '接种', '养菌', '转房', '催蕾', '出菇', '采摘', '质检', '出库', '运输']

/** 专家问题分类 */
export const QUESTION_CATEGORIES = ['病虫害防治', '环境调控', '生产流程', '设备使用', '市场销售']

/** 计量单位 */
export const UNITS = ['kg', '500g', '棒', '箱', '吨']

/** 任务优先级文案 */
export const PRIORITY_LABELS: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低'
}

/** 批次状态文案，与后台 batches.status 默认值保持一致 */
export const BATCH_STATUS_LABELS: Record<string, string> = {
  active: '进行中',
  completed: '已完成',
  archived: '已归档'
}
