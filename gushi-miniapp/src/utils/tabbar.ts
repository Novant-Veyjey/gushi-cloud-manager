import { useEffect } from 'react'
import Taro from '@tarojs/taro'

/**
 * 隐藏 / 恢复底部 TabBar。
 * Taro H5 的 TabBar 是固定在视口底部的独立层，层级高于页面内的弹层，
 * 会把弹层最下方的「取消 / 确定」按钮盖住（手机上表现为内容显示不全）。
 * 非 Tab 页调用会抛错，这里吞掉异常——本来就没有 TabBar 需要处理。
 */
export async function hideTabBar(): Promise<void> {
  try {
    await Taro.hideTabBar({ animation: false })
  } catch (error) {
    // 当前页面没有 TabBar
  }
}

export async function showTabBar(): Promise<void> {
  try {
    await Taro.showTabBar({ animation: false })
  } catch (error) {
    // 当前页面没有 TabBar
  }
}

/**
 * 弹层打开期间隐藏底部 TabBar，关闭后恢复。
 * 保证弹层最下方的内容（按钮、说明文字）完整可见、不被任何元素覆盖。
 */
export function useHideTabBarWhen(visible: boolean): void {
  useEffect(() => {
    if (visible) {
      hideTabBar()
    } else {
      showTabBar()
    }
    // 组件卸载（例如表单保存后跳转）时也要恢复，避免 TabBar 一直消失
    return () => {
      showTabBar()
    }
  }, [visible])
}
