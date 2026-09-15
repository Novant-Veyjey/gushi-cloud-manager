/**
 * 全局配置。
 *
 * BASE_URL 指向「菌云-可保存后台版」的 Express 服务：
 *   1. 本机调试：npm start 后填 http://localhost:3000
 *   2. 真机预览：填电脑局域网 IP，例如 http://192.168.1.10:3000（手机与电脑同一 WiFi）
 *   3. 微信开发者工具需勾选「不校验合法域名」，正式发布需在公众平台配置 request 合法域名
 */
export const BASE_URL = process.env.TARO_APP_API_BASE || 'http://localhost:3000'

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
