import qrcode from 'qrcode-generator'

import { BASE_URL } from '@/config'

/**
 * 生成二维码图片（GIF data URL）。
 * H5 的 <img> 与小程序 <Image> 都支持 data URL，两端共用一套实现。
 */
export function qrDataUrlOf(text: string, cellSize = 6, margin = 8): string {
  if (!text) return ''
  try {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    return qr.createDataURL(cellSize, margin)
  } catch (error) {
    return ''
  }
}

/**
 * 公开溯源页地址：扫码后无需登录即可查看该批次的完整记录。
 * 一体部署时页面与接口同源，用相对地址；本地开发时指向后台端口。
 */
export function tracePageUrl(code: string): string {
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : ''
  const base = BASE_URL || origin
  return `${base}/trace.html?code=${encodeURIComponent(code)}`
}
