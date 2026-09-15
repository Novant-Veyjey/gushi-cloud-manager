import { useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import BrandBar from '@/components/BrandBar'
import EmptyState from '@/components/EmptyState'
import FormSheet from '@/components/FormSheet'
import StateHint from '@/components/StateHint'
import { buildFormConfigs, type FormConfig } from '@/config/forms'
import { useCloudData } from '@/hooks/useCloudData'
import { FORM_MODULE, guard } from '@/utils/permission'
import { api } from '@/utils/request'
import { dateOnly, money } from '@/utils/format'
import type { TraceResult } from '@/types'

export default function Trace() {
  const { data, loading, error, reload } = useCloudData()
  const forms = buildFormConfigs(data)

  const [keyword, setKeyword] = useState('')
  const [result, setResult] = useState<TraceResult | null>(null)
  const [querying, setQuerying] = useState(false)
  const [activeForm, setActiveForm] = useState<FormConfig | null>(null)

  const openForm = (key: string) => {
    if (!guard(FORM_MODULE[key] || 'trace-events', 'w')) return
    if (key === 'trace-event' && !data.batches.length) {
      Taro.showToast({ title: '请先新增生产批次', icon: 'none' })
      return
    }
    setActiveForm(forms[key] || null)
  }

  const search = async (code: string) => {
    const value = code.trim()
    if (!value) {
      Taro.showToast({ title: '请输入批次编号', icon: 'none' })
      return
    }
    setQuerying(true)
    try {
      const detail = await api<TraceResult>(`/api/trace/${encodeURIComponent(value)}`)
      setResult(detail)
      setKeyword(value)
      Taro.showToast({ title: '查询成功', icon: 'success' })
    } catch (err) {
      setResult(null)
      Taro.showToast({ title: (err as Error).message, icon: 'none' })
    } finally {
      setQuerying(false)
    }
  }

  const scan = async () => {
    try {
      const res = await Taro.scanCode({ scanType: ['qrCode', 'barCode'] })
      const raw = res.result || ''
      // 二维码内容可能是纯批次编号，也可能是带批次参数的链接
      const matched = raw.match(/[A-Za-z0-9_-]{4,}/g)
      const code = matched ? matched[matched.length - 1] : raw
      await search(code)
    } catch (err) {
      // 用户主动取消扫码时不提示错误
      if (!/cancel/i.test((err as Error).message || '')) {
        Taro.showToast({ title: '扫码失败，请手动输入批次编号', icon: 'none' })
      }
    }
  }

  return (
    <View className='page'>
      <BrandBar title='质量溯源' sub='按真实批次查看全过程' onAdd={() => openForm('trace-event')} />

      <View className='toolbar'>
        <View className='search'>
          <Text className='search-icon'>⌕</Text>
          <Input
            className='search-input'
            value={keyword}
            placeholder='输入批次编号，例如 GUSHI-20260915-01'
            onInput={(event) => setKeyword(event.detail.value)}
            onConfirm={() => search(keyword)}
          />
        </View>
        <View className='btn primary' style='flex:0 0 150px;margin-left:16px' onClick={() => search(keyword)}>
          {querying ? '查询中' : '查询'}
        </View>
      </View>

      <View className='toolbar'>
        <View className='btn secondary' onClick={scan}>
          扫码查询
        </View>
        <View className='btn primary' onClick={() => openForm('trace-event')}>
          ＋ 新增溯源事件
        </View>
      </View>

      {loading || error ? (
        <StateHint loading={loading} error={error} onRetry={reload} />
      ) : (
        <View>
          <View className='notice'>
            输入真实批次编号后查询。批次、基地、生产事件和产品信息均来自后台数据库，没有记录时不展示任何编造内容。
          </View>

          {result ? (
            <View className='card'>
              <View className='row-top'>
                <View>
                  <Text className='row-title'>
                    {result.batch.mushroom_type} · {result.batch.code}
                  </Text>
                  <Text className='row-desc'>
                    {result.batch.base_name || '未关联基地'}
                    {result.batch.base_address ? ` · ${result.batch.base_address}` : ''}
                    {'\n'}
                    入库 {dateOnly(result.batch.start_date) || '--'} · 预计出菇 {dateOnly(result.batch.expected_harvest_date) || '--'} ·{' '}
                    {result.batch.quantity} 棒
                  </Text>
                </View>
                <Text className='badge'>数据库记录</Text>
              </View>

              <View className='timeline'>
                {result.events.length ? (
                  result.events.map((event) => (
                    <View className='event' key={event.id}>
                      <View className='event-dot'>✓</View>
                      <View className='event-body'>
                        <Text className='event-title'>{event.title}</Text>
                        <Text className='event-desc'>
                          {event.description || event.event_type}
                          {event.operator ? ` · 操作人：${event.operator}` : ''}
                        </Text>
                      </View>
                      <Text className='event-time'>{dateOnly(event.event_date)}</Text>
                    </View>
                  ))
                ) : (
                  <EmptyState title='该批次暂无溯源事件' text='点击“新增溯源事件”，把入库、接种、采摘等环节补录到数据库。' />
                )}
              </View>

              {result.products.length ? (
                <View>
                  <View className='section-title'>
                    <View>
                      <Text className='section-title-main'>该批次产品</Text>
                    </View>
                  </View>
                  {result.products.map((product) => (
                    <View className='todo-row' key={product.id}>
                      <View className='todo-copy'>
                        <Text className='todo-title'>{product.name}</Text>
                        <Text className='todo-desc'>
                          {product.quantity} {product.unit} · ¥{money(product.price)}/{product.unit}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      )}

      <FormSheet visible={!!activeForm} config={activeForm} onClose={() => setActiveForm(null)} onSaved={reload} />
    </View>
  )
}
