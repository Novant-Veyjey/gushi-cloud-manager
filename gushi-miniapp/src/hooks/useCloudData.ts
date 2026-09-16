import { useCallback, useState } from 'react'
import { useDidShow } from '@tarojs/taro'

import { api } from '@/utils/request'
import { can, type PermissionModule } from '@/utils/permission'
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
 * 页面进入时并发拉取后台业务数据，与 HTML 原型保持同一套接口。
 * 拉取失败只提示失败，不回退到任何编造数据。
 *
 * 按角色权限过滤：没有读权限的模块直接留空、不发请求。
 * 之前是无条件请求全部接口，采购商（无环境/预警/设备权限）会因 403
 * 让 Promise.all 整体失败，整个页面都打不开。
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
    const failures: string[] = []
    let attempted = 0

    /** 有读权限才请求；无权限返回空，个别接口失败也不影响其它模块渲染 */
    const load = async <T,>(moduleName: PermissionModule, path: string, fallback: T): Promise<T> => {
      if (!can(moduleName, 'r')) return fallback
      attempted += 1
      try {
        return await api<T>(path)
      } catch (err) {
        failures.push((err as Error).message)
        return fallback
      }
    }

    try {
      const [dashboard, bases, batches, devices, readings, alerts, questions, products, demands, tasks] = await Promise.all([
        load<Dashboard>('dashboard', '/api/dashboard', EMPTY_CLOUD_DATA.dashboard),
        load<Base[]>('bases', '/api/bases', []),
        load<Batch[]>('batches', '/api/batches', []),
        load<Device[]>('devices', '/api/devices', []),
        load<Reading[]>('readings', '/api/readings?limit=100', []),
        load<Alert[]>('alerts', '/api/alerts?limit=100', []),
        load<ExpertQuestion[]>('questions', '/api/questions', []),
        load<Product[]>('products', '/api/products', []),
        load<Demand[]>('demands', '/api/demands', []),
        load<Task[]>('tasks', '/api/tasks', [])
      ])
      setData({ dashboard, bases, batches, devices, readings, alerts, questions, products, demands, tasks })
      // 有权限的接口全部失败 → 说明后台不可用，明确提示；个别失败只让该模块为空
      if (attempted > 0 && failures.length === attempted) {
        setError(failures[0])
      }
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
