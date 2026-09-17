import Taro from '@tarojs/taro'

import { api } from '@/utils/request'
import { guard, type PermissionModule } from '@/utils/permission'

interface DeleteOptions {
  /** 权限模块，用于前端先校验一次（后端仍会再校验） */
  module: PermissionModule
  /** 接口资源名，例如 readings / batches / trace-events / products / demands / tasks / questions */
  resource: string
  id: number
  /** 记录名称，用于确认弹窗文案，例如「环境记录」 */
  label: string
  /** 删除成功后的回调（一般是重新拉取数据） */
  onDone: () => void | Promise<void>
}

/**
 * 删除一条记录：先弹确认提醒，确认后调用 DELETE /api/<resource>/:id。
 * 每个账号只能删除自己的数据，越权由后端 403 拦下。
 */
export async function deleteRecord({ module, resource, id, label, onDone }: DeleteOptions): Promise<void> {
  if (!guard(module, 'w')) return

  const confirmed = await Taro.showModal({
    title: '删除提醒',
    content: `确定删除这条${label}吗？删除后不可恢复。`,
    confirmText: '删除',
    confirmColor: '#bf4545'
  })
  if (!confirmed.confirm) return

  try {
    await api(`/api/${resource}/${id}`, { method: 'DELETE' })
    Taro.showToast({ title: '已删除', icon: 'success' })
    await onDone()
  } catch (error) {
    Taro.showToast({ title: (error as Error).message, icon: 'none' })
  }
}
