import Taro from '@tarojs/taro'

import { BASE_URL } from '@/config'
import { clearAuth, getToken } from '@/utils/storage'

interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface RequestOptions {
  method?: HttpMethod
  data?: Record<string, any>
  /** 成功提示文案，传入后保存成功自动 toast */
  successText?: string
}

/**
 * 统一请求后台 REST 接口。
 * 后台所有接口都返回 { code, message, data }，code !== 0 即为业务失败。
 * 连接失败时直接抛出错误，页面必须提示失败，不能回退到虚构数据。
 */
export async function api<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', data, successText } = options
  const token = getToken()
  let response: Taro.request.SuccessCallbackResult<any>

  try {
    response = await Taro.request({
      url: `${BASE_URL}${path}`,
      method,
      data,
      timeout: 10000,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    })
  } catch (error) {
    throw new Error(`无法连接后台（${BASE_URL}）。请确认后台已运行，并在微信开发者工具中勾选“不校验合法域名”。`)
  }

  const payload = response.data as ApiEnvelope<T>

  // 未登录或登录过期：清除本地登录态并回到登录页，绝不展示编造数据
  if (response.statusCode === 401) {
    clearAuth()
    const pages = Taro.getCurrentPages()
    const current = pages.length ? pages[pages.length - 1].route : ''
    if (current !== 'pages/login/index') {
      Taro.reLaunch({ url: '/pages/login/index' })
    }
    throw new Error((payload && payload.message) || '请先登录账号')
  }

  if (!payload || typeof payload !== 'object' || payload.code !== 0) {
    throw new Error((payload && payload.message) || `请求失败：${response.statusCode}`)
  }

  if (successText) {
    Taro.showToast({ title: successText, icon: 'success' })
  }
  return payload.data
}

/** 读取本地临时文件为 base64 */
function readFileAsBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    Taro.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (res) => resolve(String(res.data)),
      fail: () => reject(new Error('读取图片失败，请重新选择'))
    })
  })
}

function mimeOf(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/jpeg'
}

/**
 * 选择图片并上传到后台 /api/uploads，返回数据库中保存的图片地址（如 /uploads/icon-xxx.jpg）。
 * 仅在用户主动选择图片时调用。
 */
export async function chooseAndUploadImage(): Promise<string> {
  const chosen = await Taro.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera']
  })
  const filePath = chosen.tempFilePaths[0]
  const base64 = await readFileAsBase64(filePath)
  if (base64.length * 0.75 > 4 * 1024 * 1024) {
    throw new Error('图片不能超过 4MB，请压缩后重试')
  }
  const result = await api<{ url: string }>('/api/uploads', {
    method: 'POST',
    data: { data: `data:${mimeOf(filePath)};base64,${base64}` }
  })
  return result.url
}

/** 把后台返回的图片地址拼成可显示的完整地址 */
export function assetUrl(icon?: string): string {
  if (!icon) return ''
  if (/^https?:\/\//.test(icon)) return icon
  if (icon.startsWith('/')) return `${BASE_URL}${icon}`
  return ''
}

export { BASE_URL }
