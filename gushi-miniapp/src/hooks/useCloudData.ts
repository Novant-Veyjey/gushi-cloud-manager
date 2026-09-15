import { useCallback, useState } from 'react'
import { useDidShow } from '@tarojs/taro'

import { api } from '@/utils/request'
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
      const [dashboard, bases, batches, devices, readings, alerts, questions, products, demands, tasks] = await Promise.all([
        api<Dashboard>('/api/dashboard'),
        api<Base[]>('/api/bases'),
        api<Batch[]>('/api/batches'),
        api<Device[]>('/api/devices'),
        api<Reading[]>('/api/readings?limit=100'),
        api<Alert[]>('/api/alerts?limit=100'),
        api<ExpertQuestion[]>('/api/questions'),
        api<Product[]>('/api/products'),
        api<Demand[]>('/api/demands'),
        api<Task[]>('/api/tasks')
      ])
      setData({ dashboard, bases, batches, devices, readings, alerts, questions, products, demands, tasks })
    } catch (err) {
      setError((err as Error).message)
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
