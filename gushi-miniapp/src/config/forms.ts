import { BATCH_STAGES, QUESTION_CATEGORIES, TRACE_EVENT_TYPES, UNITS } from '@/config'
import { nowLocalDateTime, today } from '@/utils/format'
import type { CloudData } from '@/types'

export type FieldType = 'text' | 'number' | 'textarea' | 'select' | 'date' | 'time' | 'datetime' | 'icons' | 'image'

export interface FieldOption {
  label: string
  value: string | number
}

export interface FormField {
  name: string
  label: string
  type?: FieldType
  required?: boolean
  /** 仅作为接口参数使用，不在界面上展示 */
  hidden?: boolean
  placeholder?: string
  options?: FieldOption[]
  defaultValue?: string
}

export interface FormConfig {
  key: string
  title: string
  desc: string
  notice?: string
  endpoint: string | ((payload: Record<string, any>, values: Record<string, string>) => string)
  method?: 'POST' | 'PUT'
  fields: FormField[]
  transform?: (payload: Record<string, any>, values: Record<string, string>) => Record<string, any>
}

/** 首页“＋”面板里的记录类型 */
export const RECORD_MENU: Array<{ key: string; label: string }> = [
  { key: 'base', label: '基地档案' },
  { key: 'batch', label: '生产批次' },
  { key: 'device', label: '大棚设备' },
  { key: 'reading', label: '环境数据（手动补录）' },
  { key: 'question', label: '专家问题' },
  { key: 'trace-event', label: '溯源事件' },
  { key: 'product', label: '供应信息' },
  { key: 'demand', label: '采购需求' },
  { key: 'task', label: '生产任务' },
  { key: 'partner', label: '合作方' }
]

const priorityOptions: FieldOption[] = [
  { label: '高', value: 'high' },
  { label: '中', value: 'medium' },
  { label: '低', value: 'low' }
]

/**
 * 表单配置：字段与后台 server/app.js 的 configs 一一对应，
 * 提交后会写入 SQLite，刷新页面数据仍然存在。
 */
export function buildFormConfigs(data: CloudData): Record<string, FormConfig> {
  const baseOptions: FieldOption[] = [
    { label: '不关联基地', value: '' },
    ...data.bases.map((item) => ({ label: item.name, value: item.id }))
  ]
  const requiredBaseOptions: FieldOption[] = data.bases.map((item) => ({ label: item.name, value: item.id }))
  const batchOptions: FieldOption[] = [
    { label: '不关联批次', value: '' },
    ...data.batches.map((item) => ({ label: item.code, value: item.id }))
  ]
  const requiredBatchOptions: FieldOption[] = data.batches.map((item) => ({ label: item.code, value: item.id }))

  return {
    base: {
      key: 'base',
      title: '新增基地',
      desc: '保存真实基地信息，写入后台数据库。',
      endpoint: '/api/bases',
      fields: [
        { name: 'name', label: '基地名称', required: true, placeholder: '例如：德安食用菌种植基地' },
        { name: 'township', label: '所属乡镇' },
        { name: 'area_mu', label: '面积（亩）', type: 'number' },
        { name: 'address', label: '详细地址' },
        { name: 'contact_name', label: '联系人' },
        { name: 'contact_phone', label: '联系电话' },
        { name: 'notes', label: '备注', type: 'textarea' }
      ]
    },
    batch: {
      key: 'batch',
      title: '新增生产批次',
      desc: '批次编号必须唯一，创建后作为监测、溯源和销售的共同主线。',
      endpoint: '/api/batches',
      fields: [
        { name: 'code', label: '批次编号', required: true, placeholder: '例如：GUSHI-20260915-01' },
        {
          name: 'base_id',
          label: '所属基地',
          type: 'select',
          required: true,
          options: requiredBaseOptions,
          placeholder: '请选择基地'
        },
        { name: 'mushroom_type', label: '菌菇种类', required: true, placeholder: '例如：香菇' },
        { name: 'variety', label: '品种' },
        { name: 'quantity', label: '菌棒数量', type: 'number', required: true },
        {
          name: 'stage',
          label: '当前阶段',
          type: 'select',
          options: BATCH_STAGES.map((stage) => ({ label: stage, value: stage })),
          defaultValue: BATCH_STAGES[0]
        },
        { name: 'start_date', label: '入库日期', type: 'date', required: true, defaultValue: today() },
        { name: 'expected_harvest_date', label: '预计出菇日期', type: 'date' },
        { name: 'notes', label: '备注', type: 'textarea' }
      ]
    },
    reading: {
      key: 'reading',
      title: '手动补录环境数据',
      desc: '正常情况下环境数据由大棚设备自动上报；断网、设备维修或核对历史数据时可在此手动补录，超出阈值同样会自动生成预警。',
      endpoint: '/api/readings',
      fields: [
        {
          name: 'base_id',
          label: '所属基地',
          type: 'select',
          required: true,
          options: requiredBaseOptions,
          placeholder: '请选择基地'
        },
        { name: 'device_name', label: '设备名称', required: true, placeholder: '例如：1 号棚温湿度传感器' },
        { name: 'temperature', label: '温度（℃）', type: 'number' },
        { name: 'humidity', label: '湿度（%）', type: 'number' },
        { name: 'co2', label: 'CO₂（ppm）', type: 'number' },
        { name: 'light', label: '光照（lux）', type: 'number' },
        { name: 'recorded_at', label: '记录时间', type: 'datetime', required: true, defaultValue: nowLocalDateTime() },
        { name: 'notes', label: '备注', type: 'textarea' }
      ]
    },
    device: {
      key: 'device',
      title: '接入大棚检测设备',
      desc: '创建后把「设备编号 + 设备密钥」配置到温室网关，设备定时上报温湿度、CO₂、光照，后台自动入库并触发阈值预警。',
      notice: '上报接口：POST /api/ingest/readings，请求头 X-Device-Code 与 X-Device-Secret。',
      endpoint: '/api/devices',
      fields: [
        { name: 'name', label: '设备名称', required: true, placeholder: '例如：1 号棚温湿度网关' },
        {
          name: 'base_id',
          label: '所属基地',
          type: 'select',
          required: true,
          options: requiredBaseOptions,
          placeholder: '请选择基地'
        },
        { name: 'code', label: '设备编号（留空自动生成）', placeholder: '例如 GS-1A2B3C' },
        { name: 'model', label: '设备型号', placeholder: '例如 ESP32-S3 / 智能网关' },
        { name: 'temp_max', label: '温度上限（℃）', type: 'number', defaultValue: '26' },
        { name: 'humidity_min', label: '湿度下限（%）', type: 'number', defaultValue: '80' },
        { name: 'co2_max', label: 'CO₂ 上限（ppm）', type: 'number', defaultValue: '800' },
        { name: 'notes', label: '备注', type: 'textarea' }
      ]
    },
    question: {
      key: 'question',
      title: '向专家提问',
      desc: '问题保存后状态为待回复，专家在后台或小程序内回复。',
      endpoint: '/api/questions',
      fields: [
        { name: 'base_id', label: '所属基地', type: 'select', options: baseOptions, placeholder: '不关联基地' },
        { name: 'title', label: '问题标题', required: true },
        {
          name: 'category',
          label: '问题类型',
          type: 'select',
          options: QUESTION_CATEGORIES.map((item) => ({ label: item, value: item })),
          placeholder: '请选择问题类型'
        },
        { name: 'content', label: '问题描述', type: 'textarea', required: true }
      ]
    },
    'trace-event': {
      key: 'trace-event',
      title: '新增溯源事件',
      desc: '溯源事件绑定到具体批次，消费者可按批次编号查询完整时间线。',
      endpoint: '/api/trace-events',
      fields: [
        {
          name: 'batch_id',
          label: '所属批次',
          type: 'select',
          required: true,
          options: requiredBatchOptions,
          placeholder: '请选择批次'
        },
        {
          name: 'event_type',
          label: '事件类型',
          type: 'select',
          required: true,
          options: TRACE_EVENT_TYPES.map((item) => ({ label: item, value: item })),
          defaultValue: TRACE_EVENT_TYPES[0]
        },
        { name: 'title', label: '事件标题', required: true, placeholder: '例如：菌棒入库' },
        { name: 'event_date', label: '事件日期', type: 'date', required: true, defaultValue: today() },
        { name: 'operator', label: '操作人' },
        { name: 'description', label: '事件说明', type: 'textarea' }
      ]
    },
    product: {
      key: 'product',
      title: '发布供应信息',
      desc: '供应信息必须关联真实批次，产品图标可选择预设或上传图片。',
      endpoint: '/api/products',
      fields: [
        {
          name: 'batch_id',
          label: '所属批次',
          type: 'select',
          required: true,
          options: requiredBatchOptions,
          placeholder: '请选择批次'
        },
        { name: 'name', label: '产品名称', required: true, placeholder: '例如：鲜香菇' },
        { name: 'icon', label: '产品图标', type: 'icons', defaultValue: '🍄' },
        { name: 'quantity', label: '数量', type: 'number', required: true },
        {
          name: 'unit',
          label: '单位',
          type: 'select',
          options: UNITS.map((item) => ({ label: item, value: item })),
          defaultValue: 'kg'
        },
        { name: 'price', label: '参考价格（元）', type: 'number' },
        { name: 'available_date', label: '可售日期', type: 'date', defaultValue: today() },
        { name: 'description', label: '产品说明', type: 'textarea' }
      ]
    },
    demand: {
      key: 'demand',
      title: '发布采购需求',
      desc: '首期只做信息撮合，不在平台内结算。',
      endpoint: '/api/demands',
      fields: [
        { name: 'buyer_name', label: '采购方名称', required: true },
        { name: 'product_name', label: '采购产品', required: true },
        { name: 'quantity', label: '采购数量', type: 'number', required: true },
        {
          name: 'unit',
          label: '单位',
          type: 'select',
          options: UNITS.map((item) => ({ label: item, value: item })),
          defaultValue: 'kg'
        },
        { name: 'price', label: '意向价格（元）', type: 'number' },
        { name: 'contact', label: '联系方式' },
        { name: 'requirements', label: '具体要求', type: 'textarea' }
      ]
    },
    task: {
      key: 'task',
      title: '新增生产任务',
      desc: '可先使用优先级建议，再把任务保存到后台。',
      endpoint: '/api/tasks',
      fields: [
        { name: 'title', label: '任务标题', required: true },
        { name: 'description', label: '任务说明', type: 'textarea' },
        { name: 'batch_id', label: '关联批次', type: 'select', options: batchOptions, placeholder: '不关联批次' },
        { name: 'due_date', label: '截止日期', type: 'date' },
        { name: 'priority', label: '优先级', type: 'select', options: priorityOptions, defaultValue: 'medium' }
      ]
    },
    partner: {
      key: 'partner',
      title: '新增合作方',
      desc: '保存真实合作单位或专家团队。',
      endpoint: '/api/partners',
      fields: [
        { name: 'name', label: '合作方名称', required: true },
        { name: 'role', label: '合作角色', placeholder: '例如：技术指导 / 采购商' },
        { name: 'contact', label: '联系方式' }
      ]
    },
    /** 专家回复：更新专家问题状态为已回复 */
    reply: {
      key: 'reply',
      title: '专家回复',
      desc: '回复内容会保存到后台，问题状态更新为已回复。',
      endpoint: (payload) => `/api/questions/${payload.id}`,
      method: 'PUT',
      fields: [
        { name: 'id', label: '问题编号', hidden: true, required: true },
        { name: 'answer', label: '回复内容', type: 'textarea', required: true }
      ],
      transform: (payload) => ({
        answer: payload.answer,
        status: 'answered',
        answered_at: new Date().toISOString()
      })
    },
    /** 更换产品图标：只更新 icon 字段 */
    icon: {
      key: 'icon',
      title: '更换产品图标',
      desc: '选择预设图标，或上传自己的图片，保存后写入后台。',
      endpoint: (payload) => `/api/products/${payload.id}`,
      method: 'PUT',
      fields: [
        { name: 'id', label: '产品编号', hidden: true, required: true },
        { name: 'icon', label: '产品图标', type: 'icons', defaultValue: '🍄' }
      ],
      transform: (payload) => ({ icon: payload.icon })
    }
  }
}
