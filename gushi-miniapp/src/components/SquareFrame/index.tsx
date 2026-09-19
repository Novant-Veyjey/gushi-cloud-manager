import Taro from '@tarojs/taro'
import { View } from '@tarojs/components'
import type { ReactNode } from 'react'

import './index.scss'

/** 正方形在自己所在行里的水平位置 */
type Align = 'left' | 'center' | 'right'

export interface SquareFrameProps {
  /**
   * 边长。
   * - number：按设计稿 px 传（750 基准），内部走 Taro.pxTransform 换算，
   *   小程序端得到 rpx、H5 端得到 rem，两端视觉尺寸一致；
   * - string：百分比（如 '68%'）或其他带单位的值，原样透传，用于跟随父容器自适应。
   */
  size?: number | string
  /** 水平位置：left / center / right，默认居中 */
  align?: Align
  /** 背景色 */
  background?: string
  /** 圆角；数字按设计稿 px 换算，传 '50%' 可做圆形 */
  radius?: number | string
  /** 边框宽度（设计稿 px），0 表示不画边框 */
  borderWidth?: number
  /** 边框颜色 */
  borderColor?: string
  /** 边框线型 */
  borderStyle?: 'solid' | 'dashed' | 'dotted'
  /** 最大边长：宽屏（桌面浏览器）下避免正方形被无限放大 */
  maxSize?: number | string
  /** 内容字号：emoji / 文字图标需要跟着正方形一起放大时使用 */
  fontSize?: number | string
  className?: string
  children?: ReactNode
}

/** 数字按设计稿 px 换算成当前端可用的单位，字符串原样透传 */
function toUnit(value?: number | string): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'string') return value
  return Taro.pxTransform(value)
}

const ALIGN_STYLE: Record<Align, string> = {
  left: 'margin-right:auto',
  center: 'margin-left:auto;margin-right:auto',
  right: 'margin-left:auto'
}

/**
 * 正方形容器。
 *
 * 宽高严格相等完全交给 CSS：外层只负责宽度，高度由内部的 padding-bottom: 100% 撑开。
 * 百分比 padding 永远按「父元素宽度」计算，所以宽度无论是固定值、百分比还是
 * 随屏幕缩放的单位，渲染结果都是完美正方形，不会被拉成矩形。
 * 内容层绝对定位铺满并 flex 居中，因此内容尺寸不会反过来影响正方形本身。
 *
 * box-sizing: border-box 保证加上边框后外框依然严格等宽等高。
 */
export default function SquareFrame({
  size = 240,
  align = 'center',
  background = '#eef6ef',
  radius = 36,
  borderWidth = 0,
  borderColor = '#d7e3da',
  borderStyle = 'solid',
  maxSize,
  fontSize,
  className = '',
  children
}: SquareFrameProps) {
  const frameStyle = [
    `width:${toUnit(size)}`,
    maxSize ? `max-width:${toUnit(maxSize)}` : '',
    background ? `background:${background}` : '',
    radius ? `border-radius:${toUnit(radius)}` : '',
    borderWidth > 0 ? `border:${Taro.pxTransform(borderWidth)} ${borderStyle} ${borderColor}` : '',
    ALIGN_STYLE[align] || ALIGN_STYLE.center
  ]
    .filter(Boolean)
    .join(';')

  return (
    <View className={`square-frame${className ? ` ${className}` : ''}`} style={frameStyle}>
      {/* 撑高元素：把容器高度锁成与宽度严格相等 */}
      <View className='square-frame__ratio' />
      {/* 内容层：绝对定位铺满并居中，不影响正方形的尺寸计算 */}
      <View className='square-frame__content' style={fontSize ? `font-size:${toUnit(fontSize)}` : undefined}>
        {children}
      </View>
    </View>
  )
}
