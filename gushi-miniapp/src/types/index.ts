/** 与后台 SQLite 表结构一一对应的数据模型，字段名不可随意改动 */

export interface Base {
  id: number
  name: string
  township: string
  address: string
  contact_name: string
  contact_phone: string
  area_mu: number
  status: string
  notes: string
  created_at: string
  updated_at: string
}

export interface Batch {
  id: number
  code: string
  base_id: number | null
  mushroom_type: string
  variety: string
  quantity: number
  stage: string
  start_date: string
  expected_harvest_date: string
  status: string
  notes: string
  created_at: string
  updated_at: string
}

export interface Reading {
  id: number
  base_id: number | null
  device_name: string
  temperature: number | null
  humidity: number | null
  co2: number | null
  light: number | null
  recorded_at: string
  notes: string
  created_at: string
  base_name?: string
}

export interface Alert {
  id: number
  base_id: number | null
  reading_id: number | null
  alert_type: string
  level: 'high' | 'medium' | 'low' | string
  message: string
  status: 'open' | 'handled' | string
  created_at: string
  handled_at: string
  base_name?: string
}

export interface TraceEvent {
  id: number
  batch_id: number
  event_type: string
  title: string
  description: string
  event_date: string
  operator: string
  created_at: string
  updated_at: string
}

export interface ExpertQuestion {
  id: number
  base_id: number | null
  title: string
  content: string
  category: string
  answer: string
  status: 'pending' | 'answered' | string
  created_at: string
  answered_at: string
  base_name?: string
}

export interface Product {
  id: number
  batch_id: number | null
  name: string
  icon: string
  quantity: number
  unit: string
  price: number
  available_date: string
  status: string
  description: string
  created_at: string
  updated_at: string
}

export interface Demand {
  id: number
  buyer_name: string
  product_name: string
  quantity: number
  unit: string
  price: number
  requirements: string
  contact: string
  status: string
  created_at: string
  updated_at: string
}

export interface Task {
  id: number
  title: string
  description: string
  batch_id: number | null
  priority: 'high' | 'medium' | 'low' | string
  due_date: string
  status: string
  created_at: string
  updated_at: string
}

/** 登录账号：每个账号只能看到自己录入的数据 */
export interface AuthUser {
  id: number
  username: string
  display_name: string
  role: string
  role_label?: string
  created_at?: string
}

export interface AuthSession {
  token: string
  user: AuthUser
  expires_at?: string
}

export interface Dashboard {
  user?: AuthUser
  bases: number
  batches: number
  devices: number
  openAlerts: number
  questions: number
  products: number
  demands: number
  latestReadings: Reading[]
  alerts: Alert[]
  latestQuestions: ExpertQuestion[]
}

export interface TraceResult {
  batch: Batch & { base_name?: string; base_address?: string }
  events: TraceEvent[]
  products: Product[]
}

/** 一次拉取的全部业务数据，页面只展示这里的真实数据库记录 */
export interface CloudData {
  dashboard: Dashboard
  bases: Base[]
  batches: Batch[]
  readings: Reading[]
  alerts: Alert[]
  questions: ExpertQuestion[]
  products: Product[]
  demands: Demand[]
  tasks: Task[]
}

/** 任务优先级建议接口返回 */
export interface PrioritySuggestion {
  priority: 'high' | 'medium' | 'low'
  reason: string
  source: 'ai' | 'rule' | string
}
