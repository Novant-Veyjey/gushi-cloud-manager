import Taro from '@tarojs/taro'

import type { AuthUser } from '@/types'

const TOKEN_KEY = 'gushi_token'
const USER_KEY = 'gushi_user'

/** 登录凭证与当前账号信息保存在本地，重启小程序仍然有效 */
export function getToken(): string {
  try {
    return Taro.getStorageSync(TOKEN_KEY) || ''
  } catch (error) {
    return ''
  }
}

export function getUser(): AuthUser | null {
  try {
    const raw = Taro.getStorageSync(USER_KEY)
    if (!raw) return null
    return typeof raw === 'string' ? (JSON.parse(raw) as AuthUser) : (raw as AuthUser)
  } catch (error) {
    return null
  }
}

export function saveAuth(token: string, user: AuthUser) {
  Taro.setStorageSync(TOKEN_KEY, token)
  Taro.setStorageSync(USER_KEY, user)
}

export function clearAuth() {
  try {
    Taro.removeStorageSync(TOKEN_KEY)
    Taro.removeStorageSync(USER_KEY)
  } catch (error) {
    // 忽略本地存储异常
  }
}
