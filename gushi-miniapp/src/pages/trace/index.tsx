import { useState } from 'react'
import { Image, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import BrandBar from '@/components/BrandBar'
import EmptyState from '@/components/EmptyState'
import FormSheet from '@/components/FormSheet'
import StateHint from '@/components/StateHint'
import { buildFormConfigs, type FormConfig } from '@/config/forms'
import { useCloudData } from '@/hooks/useCloudData'
import { FORM_MODULE, can, guard } from '@/utils/permission'
import { deleteRecord } from '@/utils/deleteRecord'
import { qrDataUrlOf, tracePageUrl } from '@/utils/qrcode'
import { api } from '@/utils/request'
import { dateOnly, money } from '@/utils/format'
import type { TraceResult } from '@/types'

/**
 * 从扫码结果里取出批次编号。
 * 二维码内容可能有三类：
 *   1. 公开溯源页链接：https://域名/trace.html?code=DEMO-20260901-01（本应用生成的就是这种）
 *   2. 短链形态：https://域名/trace/DEMO-20260901-01
 *   3. 直接写着批次编号：DEMO-20260901-01
 * 之前的写法是「取最后一段字母数字」，一旦链接后面还有别的参数（如 &from=xxx）就会取错，
 * 这里按参数 → 路径 → 纯文本的顺序判断，保证三类二维码都能识别。
 */
function codeFromScan(raw: string): string {
  const value = (raw || '').trim()
  if (!value) return ''
  const param = value.match(/[?&]code=([^&#]+)/i)
  if (param) return decodeURIComponent(param[1]).trim()
  if (/^https?:\/\//i.test(value)) {
    const segments = value.split(/[?#]/)[0].split('/').slice(1)
    // 取路径里最像批次编号的一段：同时含字母和数字，且不是 xxx.html 这类文件名
    const hit = segments
      .reverse()
      .find((item) => /[A-Za-z]/.test(item) && /\d/.test(item) && !/\.html?$/i.test(item))
    return hit ? decodeURIComponent(hit).trim() : ''
  }
  return value.replace(/\s+/g, '')
}

export default function Trace() {
  const { data, loading, error, reload } = useCloudData()
  const forms = buildFormConfigs(data)

  const [keyword, setKeyword] = useState('')
  const [result, setResult] = useState<TraceResult | null>(null)
  const [qrUrl, setQrUrl] = useState('')
  const [querying, setQuerying] = useState(false)
  const [activeForm, setActiveForm] = useState<FormConfig | null>(null)

  const canWriteTrace = can('trace-events', 'w')
  // H5 / 浏览器端没有摄像头扫码能力，直接隐藏扫码入口，引导手动输入批次编号
  const isH5 = process.env.TARO_ENV === 'h5'

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
      // 生成扫码即看的公开溯源页二维码（买家扫一下就能核对来源）
      setQrUrl(qrDataUrlOf(tracePageUrl(detail.batch.code)))
      Taro.showToast({ title: '查询成功', icon: 'success' })
    } catch (err) {
      setResult(null)
      setQrUrl('')
      Taro.showToast({ title: (err as Error).message, icon: 'none' })
    } finally {
      setQuerying(false)
    }
  }

  const scan = async () => {
    // 网页端没有摄像头扫码能力：直接提示改用手动输入，不走扫码 API（否则只会报“扫码失败”）
    if (isH5) {
      Taro.showToast({ title: '网页端不支持扫码，请手动输入批次编号', icon: 'none' })
      return
    }
    try {
      const res = await Taro.scanCode({ scanType: ['qrCode', 'barCode'] })
      const code = codeFromScan(res.result || '')
      if (!code) {
        Taro.showToast({ title: '没识别到批次编号，请手动输入', icon: 'none' })
        return
      }
      // 把识别到的编号回填到搜索框，查完也能直接看到查的是哪个批次
      setKeyword(code)
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
      <BrandBar
        title='质量溯源'
        sub='按真实批次查看全过程'
        onAdd={canWriteTrace ? () => openForm('trace-event') : undefined}
      />

      <View className='toolbar search-toolbar'>
        <View className='search'>
          <Text className='search-icon'>⌕</Text>
          <Input
            className='search-input'
            value={keyword}
            placeholder='输入批次编号'
            onInput={(event) => setKeyword(event.detail.value)}
            onConfirm={() => search(keyword)}
          />
        </View>
        <View className='btn primary search-submit' onClick={() => search(keyword)}>
          {querying ? '查询中' : '查询'}
        </View>
      </View>

      {/* 操作行：新增溯源事件（有写权限时）+ 扫码查询并排，不让新增按钮独占整行留出大片空白 */}
      <View className='toolbar add-toolbar'>
        {canWriteTrace ? (
          <View className='btn primary add-block' onClick={() => openForm('trace-event')}>
            ＋ 新增溯源事件
          </View>
        ) : null}
        <View className='btn secondary add-side' onClick={scan}>
          扫码查询
        </View>
      </View>

      {/* 说明行：按端给出不同的查询引导（扫码入口已移到上方操作行） */}
      <View className='toolbar intro-toolbar'>
        {isH5 ? (
          <Text className='meta'>网页端不支持扫码，请在上方手动输入批次编号（小程序端可扫码查询）。</Text>
        ) : (
          <Text className='meta'>扫描批次二维码，或在上方输入批次编号查询。</Text>
        )}
      </View>

      {loading || error ? (
        <StateHint loading={loading} error={error} onRetry={reload} />
      ) : (
        <View>
          <View className='notice'>
            输入真实批次编号后查询，例如 DEMO-20260901-01。批次、基地、生产事件和产品信息均来自后台数据库，
            没有记录时不展示任何编造内容。
          </View>

          {result ? (
            <View className='card card-center'>
              {/* 批次编号居中，与生产页批次卡片的对齐方式统一 */}
              <Text className='row-title card-center-title'>
                {result.batch.mushroom_type} · {result.batch.code}
              </Text>
              <Text className='badge card-center-badge'>数据库记录</Text>
              <Text className='row-desc card-center-desc'>
                {result.batch.base_name || '未关联基地'}
                {result.batch.base_address ? ` · ${result.batch.base_address}` : ''}
                {'\n'}
                入库 {dateOnly(result.batch.start_date) || '--'} · 预计出菇 {dateOnly(result.batch.expected_harvest_date) || '--'} ·{' '}
                {result.batch.quantity} 棒
              </Text>

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
                        {/* 公开溯源结果不含归属信息，仅当该批次在本账号批次列表里时显示删除入口 */}
                        {canWriteTrace && data.batches.some((batch) => batch.id === result!.batch.id) ? (
                          <Text
                            className='link-danger'
                            onClick={() =>
                              deleteRecord({
                                module: 'trace-events',
                                resource: 'trace-events',
                                id: event.id,
                                label: '溯源事件',
                                onDone: () => search(result!.batch.code)
                              })
                            }
                          >
                            删除事件
                          </Text>
                        ) : null}
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

              {/* 溯源二维码：扫码打开公开溯源页，买家无需登录即可核对来源 */}
              {qrUrl ? (
                <View className='qr-box'>
                  <Image className='qr-img' src={qrUrl} mode='aspectFit' />
                  <Text className='qr-tip'>扫码查看该批次公开溯源信息</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      )}

      <FormSheet
        visible={!!activeForm}
        config={activeForm}
        onClose={() => setActiveForm(null)}
        onSaved={async () => {
          await reload(true)
          // 正在查看某批次时新增 / 修改了事件，重新查询该批次，时间线立即更新
          if (keyword.trim()) await search(keyword.trim())
        }}
      />
    </View>
  )
}
