import { useCallback, useState } from 'react'
import { useDidShow } from '@tarojs/taro'

import { api } from '@/utils/request'
import { can, currentRole } from '@/utils/permission'
import type { Alert, Base, Batch, CloudData, Dashboard, Demand, Device, ExpertQuestion, Product, Reading, Task } from '@/types'

/** 空数据结构：后台没有数据时页面显示空状态，绝不填充虚构数字 */
export const EMPTY_CLOUD_DATA: CloudData = {
  dashboard: {
    bases: 0,
    batches: 0,
    devices: 0,
    openAlerts: 0,
    questions: 0,
    products: 0,
    demands: 0,
    latestReadings: [],
    alerts: [],
    latestQuestions: []
  },
  bases: [],
  batches: [],
  devices: [],
  readings: [],
  alerts: [],
  questions: [],
  products: [],
  demands: [],
  tasks: []
}

/**
 * 无权限的模块直接返回空列表，不发请求。
 * 关键：采购商、专家、政府等角色对部分模块（设备 / 环境数据 / 预警 / 任务）没有读权限，
 * 若照常请求会返回 403，而 Promise.all 一失败整页就变成「后台连接失败」——
 * 表现就是「采购商页面打不开、看不到任何内容」。
 */
function fetchIfAllowed<T>(allowed: boolean, request: () => Promise<T[]>): Promise<T[]> {
  return allowed ? request() : Promise.resolve([])
}

/**
 * 页面进入时并发拉取后台全部业务数据，与 HTML 原型保持同一套接口。
 * 拉取失败只提示失败，不回退到任何编造数据。
 */
export function useCloudData() {
  const [data, setData] = useState<CloudData>(EMPTY_CLOUD_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /**
   * silent = true 时不显示全屏加载态，用于定时自动刷新（设备上报的数据会自动出现）。
   */
  const reload = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setError('')
    }
    try {
      const role = currentRole()
      const allow = (moduleName: Parameters<typeof can>[0]) => can(moduleName, 'r', role)
      const [dashboard, bases, batches, devices, readings, alerts, questions, products, demands, tasks] = await Promise.all([
        api<Dashboard>('/api/dashboard'),
        fetchIfAllowed(allow('bases'), () => api<Base[]>('/api/bases')),
        fetchIfAllowed(allow('batches'), () => api<Batch[]>('/api/batches')),
        fetchIfAllowed(allow('devices'), () => api<Device[]>('/api/devices')),
        fetchIfAllowed(allow('readings'), () => api<Reading[]>('/api/readings?limit=100')),
        fetchIfAllowed(allow('alerts'), () => api<Alert[]>('/api/alerts?limit=100')),
        fetchIfAllowed(allow('questions'), () => api<ExpertQuestion[]>('/api/questions')),
        fetchIfAllowed(allow('products'), () => api<Product[]>('/api/products')),
        fetchIfAllowed(allow('demands'), () => api<Demand[]>('/api/demands')),
        fetchIfAllowed(allow('tasks'), () => api<Task[]>('/api/tasks'))
      ])
      setData({ dashboard, bases, batches, devices, readings, alerts, questions, products, demands, tasks })
    } catch (err) {
      // 静默刷新（定时 / 页面再次显示）失败时保留已有数据、不弹全屏错误，
      // 避免网络抖动一下整个页面变成「后台连接失败」
      if (!silent) setError((err as Error).message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useDidShow(() => {
    reload()
  })

  return { data, loading, error, reload }
}

/** 根据 id 找基地名称，找不到时给出明确占位，不使用假数据 */
export function baseNameOf(bases: Base[], id?: number | null): string {
  if (!id) return '未关联基地'
  return bases.find((item) => item.id === Number(id))?.name || '未关联基地'
}

/** 根据 id 找批次编号 */
export function batchCodeOf(batches: Batch[], id?: number | null): string {
  if (!id) return '未关联批次'
  return batches.find((item) => item.id === Number(id))?.code || '未关联批次'
}
