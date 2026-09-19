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
  /** 超时时间（毫秒），默认 10000；AI 问答这类耗时接口可单独放宽 */
  timeout?: number
}

/**
 * 统一请求后台 REST 接口。
 * 后台所有接口都返回 { code, message, data }，code !== 0 即为业务失败。
 * 连接失败时直接抛出错误，页面必须提示失败，不能回退到虚构数据。
 */
export async function api<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', data, successText, timeout = 10000 } = options
  const token = getToken()
  let response: Taro.request.SuccessCallbackResult<any>

  try {
    response = await Taro.request({
      url: `${BASE_URL}${path}`,
      method,
      data,
      timeout,
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

/** 浏览器版（TARO_ENV=h5）与小程序端的图片选择/压缩行为不同，这里统一区分 */
const isH5 = process.env.TARO_ENV === 'h5'

/**
 * 浏览器端压缩：等比缩放到最长边不超过 maxSize，再按质量转成 JPEG。
 * Taro 的 H5 实现会忽略 chooseImage 的 sizeType（不做任何压缩，见 @tarojs/taro-h5 的 chooseMedia），
 * 手机原图动辄三四 MB 以上，会直接撞上后台 4MB 限制，所以在这里兜底压缩。
 */
function compressInBrowser(src: string, maxSize = 1280, quality = 0.82): Promise<{ mime: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    // 图片来源是本地 blob，声明 crossOrigin 便于后续 canvas 读取像素
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
      const width = Math.max(1, Math.round(image.width * scale))
      const height = Math.max(1, Math.round(image.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('当前浏览器不支持图片压缩，请更换浏览器后重试'))
        return
      }
      // 透明 PNG 转 JPEG 后透明区域会变黑，先铺一层白底
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)
      const matched = canvas.toDataURL('image/jpeg', quality).match(/^data:(image\/[a-z+]+);base64,(.+)$/)
      if (!matched) {
        reject(new Error('图片处理失败，请重新选择'))
        return
      }
      resolve({ mime: matched[1], base64: matched[2] })
    }
    image.onerror = () => reject(new Error('读取图片失败，请重新选择'))
    image.src = src
  })
}

/** 统一提交到 /api/uploads，返回后台保存的图片地址（如 /uploads/u1/icon-xxx.jpg） */
async function uploadImageData(mime: string, base64: string): Promise<string> {
  if (base64.length * 0.75 > 4 * 1024 * 1024) {
    throw new Error('图片不能超过 4MB，请压缩后重试')
  }
  const result = await api<{ url: string }>('/api/uploads', {
    method: 'POST',
    data: { data: `data:${mime};base64,${base64}` },
    // 图片 base64 体积较大，弱网下用默认 10 秒容易超时失败
    timeout: 30000
  })
  return result.url
}

/** 用户主动取消/放弃选择：小程序与 Taro H5 的 errMsg 都是 chooseImage:fail cancel 或 abort */
function isPickCancel(error: unknown): boolean {
  const message = (error as { errMsg?: string })?.errMsg || (error instanceof Error ? error.message : '')
  return /cancel|abort/i.test(String(message || ''))
}

/** 标记「用户自己取消了选择」的错误，调用方据此静默返回，不要弹报错 */
function cancelledPick(): Error {
  return Object.assign(new Error('已取消选择图片'), { cancelled: true })
}

/** 判断是否为用户取消选择（取消不是失败，不该弹提示） */
export function isCancelledPick(error: unknown): boolean {
  return Boolean((error as { cancelled?: boolean })?.cancelled)
}

/**
 * 让用户选一张本地图片，返回可读取的本地路径（小程序端是临时文件路径，浏览器端是 blob 地址）。
 *
 * 这里只负责「选」，不上传：调用方必须在选图完成后再展示 loading，
 * 否则 H5 端的全屏 loading 遮罩会盖住选择器，现场表现就是「点了选不了图」。
 *
 * sourceType 按端区分：H5 端只要带上 'camera'，Taro 就会给隐藏的 file input 加 capture 属性，
 * 部分移动浏览器会因此直接进入相机、连系统选择器都不弹；只传 'album' 时，
 * 系统的图片选择器本身仍然提供「拍照」入口，两种能力都不会丢。
 */
export async function chooseLocalImage(): Promise<string> {
  try {
    const chosen = await Taro.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: isH5 ? ['album'] : ['album', 'camera']
    })
    const filePath = chosen?.tempFilePaths?.[0]
    if (!filePath) throw cancelledPick()
    return filePath
  } catch (error) {
    if (isCancelledPick(error) || isPickCancel(error)) throw cancelledPick()
    const message = String((error as { errMsg?: string })?.errMsg || '')
    // 微信未在小程序后台声明相册隐私权限时会返回 api scope is not declared in the privacy agreement
    if (/privacy|scope/i.test(message)) {
      throw new Error('未获得相册权限，请在微信「设置 - 隐私」中允许后重试')
    }
    console.error('选择图片失败：', error)
    throw new Error('打开图片选择器失败，请重试')
  }
}

/** 压缩并上传已经选中的图片，返回后台保存的图片地址 */
export async function uploadLocalImage(filePath: string): Promise<string> {
  if (isH5) {
    // H5 端 Taro 会忽略 sizeType（不做压缩），手机原图很容易超过后台 4MB 限制，这里兜底压缩
    const compressed = await compressInBrowser(filePath)
    return uploadImageData(compressed.mime, compressed.base64)
  }

  const base64 = await readFileAsBase64(filePath)
  return uploadImageData(mimeOf(filePath), base64)
}

/**
 * 选择图片并上传到后台 /api/uploads，返回数据库中保存的图片地址（如 /uploads/icon-xxx.jpg）。
 * 选择 + 上传一步到位；需要自己控制 loading 时机的场景请分别调用 chooseLocalImage / uploadLocalImage。
 */
export async function chooseAndUploadImage(): Promise<string> {
  const filePath = await chooseLocalImage()
  return uploadLocalImage(filePath)
}

/** 把后台返回的图片地址拼成可显示的完整地址 */
export function assetUrl(icon?: string): string {
  if (!icon) return ''
  if (/^https?:\/\//.test(icon)) return icon
  if (icon.startsWith('/')) return `${BASE_URL}${icon}`
  return ''
}

export { BASE_URL }
