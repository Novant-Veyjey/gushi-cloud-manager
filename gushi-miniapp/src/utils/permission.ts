import Taro from '@tarojs/taro'

import { getUser } from '@/utils/storage'

export type PermissionModule =
  | 'bases'
  | 'batches'
  | 'readings'
  | 'alerts'
  | 'trace-events'
  | 'questions'
  | 'products'
  | 'demands'
  | 'tasks'
  | 'partners'
  | 'devices'
  | 'dashboard'
  | 'uploads'
  | 'ai'
  | 'users'

export type PermissionAction = 'r' | 'w'

type Level = 'r' | 'w' | 'rw'
type Rule = '*' | Record<string, Level>

/**
 * 与后台 server/auth.js 的 PERMISSIONS 保持一致。
 * 小程序端只用来隐藏/提示，真正的权限校验在后端。
 */
const MATRIX: Record<string, Rule> = {
  admin: '*',
  base: {
    bases: 'rw', batches: 'rw', readings: 'rw', alerts: 'rw', 'trace-events': 'rw',
    questions: 'rw', products: 'rw', demands: 'rw', tasks: 'rw', partners: 'rw',
    devices: 'rw', dashboard: 'r', uploads: 'w', ai: 'r', users: 'r'
  },
  farmer: {
    bases: 'rw', batches: 'rw', readings: 'rw', alerts: 'rw', 'trace-events': 'rw',
    questions: 'rw', products: 'r', demands: 'r', tasks: 'rw', partners: 'r',
    devices: 'rw', dashboard: 'r', uploads: 'w', ai: 'r'
  },
  expert: {
    bases: 'r', batches: 'r', readings: 'r', alerts: 'r', 'trace-events': 'r',
    questions: 'rw', products: 'r', demands: 'r', tasks: 'r', partners: 'r',
    devices: 'r', dashboard: 'r', uploads: 'w', ai: 'r'
  },
  buyer: {
    bases: 'r', batches: 'r', 'trace-events': 'r', questions: 'rw',
    products: 'r', demands: 'rw', dashboard: 'r', uploads: 'w', ai: 'r'
  },
  government: {
    bases: 'r', batches: 'r', readings: 'r', alerts: 'r', 'trace-events': 'r',
    questions: 'r', products: 'r', demands: 'r', tasks: 'r', partners: 'r',
    devices: 'r', dashboard: 'r', ai: 'r'
  }
}

/** 表单类型 → 权限模块 */
export const FORM_MODULE: Record<string, PermissionModule> = {
  base: 'bases',
  batch: 'batches',
  reading: 'readings',
  question: 'questions',
  'trace-event': 'trace-events',
  product: 'products',
  demand: 'demands',
  task: 'tasks',
  partner: 'partners',
  device: 'devices',
  icon: 'products'
}

/**
 * 能否回答提问（专家回复）：只有专家与平台管理员。
 * 与后台 server/auth.js 的 canAnswerQuestion 保持一致 ——
 * questions 的写权限只代表账号能“提问”，不代表能替专家“回复”。
 */
export function canAnswerQuestion(role = currentRole()): boolean {
  return role === 'expert' || role === 'admin'
}

export function currentRole(): string {
  return getUser()?.role || 'farmer'
}

export function can(moduleName: PermissionModule, action: PermissionAction = 'r', role = currentRole()): boolean {
  const rules = MATRIX[role]
  if (!rules) return false
  if (rules === '*') return true
  const level = rules[moduleName]
  if (!level) return false
  return action === 'w' ? level === 'rw' || level === 'w' : level === 'r' || level === 'rw'
}

/** 无权限时给出明确提示并返回 false，直接用在按钮点击处 */
export function guard(moduleName: PermissionModule, action: PermissionAction = 'w'): boolean {
  if (can(moduleName, action)) return true
  Taro.showToast({ title: '当前角色没有该操作权限', icon: 'none' })
  return false
}
