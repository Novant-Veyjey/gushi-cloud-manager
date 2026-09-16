import { api } from '@/utils/request'
import { clearAuth, getToken, saveAuth } from '@/utils/storage'
import type { AuthSession, AuthUser } from '@/types'

/** 可自助注册的角色，与后台 server/auth.js 的 ROLES 保持一致 */
export const ROLE_OPTIONS = [
  { label: '菇农', value: 'farmer' },
  { label: '合作社/基地管理员', value: 'base' },
  { label: '专家', value: 'expert' },
  { label: '采购商', value: 'buyer' },
  { label: '政府/服务机构', value: 'government' },
  { label: '平台管理员', value: 'admin' }
]

export function roleLabel(role?: string): string {
  return ROLE_OPTIONS.find((item) => item.value === role)?.label || '未设置'
}

/**
 * 注册新账号，成功后后台直接返回登录 token。
 * 注意：后台固定把新账号建为普通菇农，传 role 也不会生效（专家等角色由平台管理员分配）。
 */
export async function register(payload: {
  username: string
  password: string
  display_name?: string
}): Promise<AuthSession> {
  const session = await api<AuthSession>('/api/auth/register', { method: 'POST', data: payload })
  saveAuth(session.token, session.user)
  return session
}

export async function login(username: string, password: string): Promise<AuthSession> {
  const session = await api<AuthSession>('/api/auth/login', { method: 'POST', data: { username, password } })
  saveAuth(session.token, session.user)
  return session
}

/**
 * 微信小程序一键登录：wx.login 拿到 code，由后台换取 openid 并签发 JWT。
 * 后台未配置 WX_APPID/WX_SECRET 时会返回明确提示，此时改用账号密码登录。
 */
export async function wechatLogin(code: string): Promise<AuthSession> {
  const session = await api<AuthSession>('/api/auth/wechat', { method: 'POST', data: { code } })
  saveAuth(session.token, session.user)
  return session
}

/** 校验本地 token 是否仍然有效，并返回服务端最新账号信息 */
export async function fetchCurrentUser(): Promise<AuthUser> {
  const user = await api<AuthUser>('/api/auth/me')
  saveAuth(getToken(), user)
  return user
}

export async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST', data: {} })
  } catch (error) {
    // 即使后台请求失败也要清掉本地登录态
  } finally {
    clearAuth()
  }
}
