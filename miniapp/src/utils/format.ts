/** 只保留日期部分：2026-09-15T10:20 → 2026-09-15 */
export function dateOnly(value?: string | null): string {
  if (!value) return ''
  return String(value).slice(0, 10)
}

/** 数据库时间文本转成本地可读时间 */
export function readableTime(value?: string | null): string {
  if (!value) return '--'
  const text = String(value).replace(' ', 'T')
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return String(value)
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function money(value?: number | null): string {
  const num = Number(value || 0)
  const text = num.toFixed(2)
  return text.endsWith('.00') ? text.slice(0, -3) : text
}

export function today(): string {
  const date = new Date()
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 与后台 recorded_at 保持一致：YYYY-MM-DDTHH:mm（本地时间） */
export function nowLocalDateTime(): string {
  const date = new Date()
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function currentTime(): string {
  const date = new Date()
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function valueOf(input?: string | number | null): string {
  if (input === undefined || input === null) return '--'
  return String(input)
}
