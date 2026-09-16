import { useRef, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'

import BrandBar from '@/components/BrandBar'
import EmptyState from '@/components/EmptyState'
import FormSheet from '@/components/FormSheet'
import StateHint from '@/components/StateHint'
import { buildFormConfigs, type FormConfig } from '@/config/forms'
import { THRESHOLDS } from '@/config'
import { baseNameOf, useCloudData } from '@/hooks/useCloudData'
import { api } from '@/utils/request'
import { readableTime } from '@/utils/format'
import { FORM_MODULE, guard } from '@/utils/permission'
import type { Device, DeviceSeries } from '@/types'

/** 设备近 24 小时温度趋势（等长分桶的平均值柱状图） */
function TemperatureTrend({ series }: { series: DeviceSeries }) {
  const points = series.buckets.filter((bucket) => bucket.temperature)
  if (!points.length) {
    return <Text className='meta'>该时间段暂无上报数据</Text>
  }
  const values = points.map((point) => point.temperature!.avg)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, 0.1)
  const average = values.reduce((total, value) => total + value, 0) / values.length

  return (
    <View>
      <View className='chart'>
        {points.map((point, index) => {
          const height = Math.round(20 + ((point.temperature!.avg - min) / span) * 130)
          const hour = new Date(point.start).getHours()
          return (
            <View className='chart-col' key={`${index}-${point.start}`}>
              <View className='chart-bar' style={`height:${height}px`} />
              <Text className='chart-x'>{String(hour).padStart(2, '0')}</Text>
            </View>
          )
        })}
      </View>
      <Text className='meta'>
        平均 {average.toFixed(1)}℃ · 最低 {min.toFixed(1)}℃ · 最高 {max.toFixed(1)}℃ · 共 {series.total_records} 条记录（每桶{' '}
        {series.bucket_minutes} 分钟）
      </Text>
    </View>
  )
}

const REFRESH_INTERVAL = 30000

export default function Monitor() {
  const { data, loading, error, reload } = useCloudData()
  const forms = buildFormConfigs(data)

  const [activeForm, setActiveForm] = useState<FormConfig | null>(null)
  const [credential, setCredential] = useState<Device | null>(null)
  const [seriesMap, setSeriesMap] = useState<Record<number, DeviceSeries>>({})
  const [seriesLoading, setSeriesLoading] = useState(0)
  const [lastRefresh, setLastRefresh] = useState('')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // 页面可见时每 30 秒静默刷新一次：大棚设备上报的数据会自动出现在列表里
  useDidShow(() => {
    setLastRefresh(readableTime(new Date().toISOString()))
    timer.current = setInterval(() => {
      reload(true).then(() => setLastRefresh(readableTime(new Date().toISOString())))
    }, REFRESH_INTERVAL)
  })

  useDidHide(() => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  })

  const openForm = (key: string, preset?: Record<string, string>) => {
    if (!guard(FORM_MODULE[key] || 'readings', 'w')) return
    const config = forms[key]
    if (!config) return
    if (key === 'reading' && !data.bases.length) {
      Taro.showToast({ title: '请先新增基地', icon: 'none' })
      return
    }
    if (key === 'device' && !data.bases.length) {
      Taro.showToast({ title: '请先新增基地，再接入设备', icon: 'none' })
      return
    }
    setActiveForm(
      preset
        ? { ...config, fields: config.fields.map((field) => (preset[field.name] !== undefined ? { ...field, defaultValue: preset[field.name] } : field)) }
        : config
    )
  }

  const handleSaved = async (result?: any) => {
    if (result && result.secret) setCredential(result as Device)
    await reload(true)
  }

  const handleAck = async (id: number) => {
    if (!guard('alerts', 'w')) return
    try {
      await api(`/api/alerts/${id}/ack`, { method: 'POST', data: {} })
      Taro.showToast({ title: '预警已处理', icon: 'success' })
      await reload(true)
    } catch (err) {
      Taro.showToast({ title: (err as Error).message, icon: 'none' })
    }
  }

  /** 展开/收起设备近 24 小时温度曲线（按需拉取，避免每次刷新都请求） */
  const toggleSeries = async (deviceId: number) => {
    if (seriesMap[deviceId]) {
      setSeriesMap((prev) => {
        const next = { ...prev }
        delete next[deviceId]
        return next
      })
      return
    }
    setSeriesLoading(deviceId)
    try {
      const result = await api<DeviceSeries>(`/api/devices/${deviceId}/series?hours=24&buckets=12`)
      setSeriesMap((prev) => ({ ...prev, [deviceId]: result }))
    } catch (err) {
      Taro.showToast({ title: (err as Error).message, icon: 'none' })
    } finally {
      setSeriesLoading(0)
    }
  }

  const copy = (value: string) => {
    Taro.setClipboardData({ data: value }).then(() => Taro.showToast({ title: '已复制', icon: 'success' }))
  }

  const devices = data.devices
  const online = devices.filter((item) => item.online).length
  const readings = data.readings.slice(0, 20)
  const openAlerts = data.alerts.filter((alert) => alert.status === 'open')
  const deviceReported = readings.filter((item) => item.source === 'device').length

  return (
    <View className='page'>
      <BrandBar title='环境监测' sub='大棚设备自动上报 · 超阈值自动预警' onAdd={() => openForm('device')} />

      <View className='toolbar'>
        <View className='btn primary' onClick={() => openForm('device')}>
          ＋ 接入大棚设备
        </View>
        <View className='btn secondary' onClick={() => openForm('reading')}>
          手动补录
        </View>
      </View>

      {loading || error ? (
        <StateHint loading={loading} error={error} onRetry={reload} />
      ) : (
        <View>
          <View className='notice'>
            温度 &gt; {THRESHOLDS.temperatureMax}℃、湿度 &lt; {THRESHOLDS.humidityMin}%、CO₂ &gt; {THRESHOLDS.co2Max} ppm 时后台自动生成预警
            （阈值可按设备单独设置）。设备每 30 秒自动上报一次，页面每 30 秒自动刷新。
            {lastRefresh ? `上次刷新：${lastRefresh}` : ''}
          </View>

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>大棚设备</Text>
              <Text className='section-title-sub'>
                共 {devices.length} 台，在线 {online} 台{devices.length ? '（10 分钟内有上报视为在线）' : ''}
              </Text>
            </View>
          </View>

          {devices.length ? (
            devices.map((device) => (
              <View className='card' key={device.id}>
                <View className='row-top'>
                  <View>
                    <Text className='row-title'>{device.name}</Text>
                    <Text className='row-desc'>
                      编号 {device.code}
                      {device.model ? ` · ${device.model}` : ''}
                      {'\n'}
                      {device.base_name || baseNameOf(data.bases, device.base_id)}
                    </Text>
                  </View>
                  <Text className={`badge${device.online ? '' : ' plain'}`}>{device.online ? '在线' : '离线'}</Text>
                </View>

                <View className='metric-line'>
                  <View className='metric-line-item'>
                    <Text className='metric-line-label'>温度</Text>
                    <Text className='metric-line-value'>{device.last_values?.temperature ?? '--'}℃</Text>
                  </View>
                  <View className='metric-line-item'>
                    <Text className='metric-line-label'>湿度</Text>
                    <Text className='metric-line-value'>{device.last_values?.humidity ?? '--'}%</Text>
                  </View>
                  <View className='metric-line-item'>
                    <Text className='metric-line-label'>CO₂</Text>
                    <Text className='metric-line-value'>{device.last_values?.co2 ?? '--'} ppm</Text>
                  </View>
                </View>

                <Text className='meta'>
                  阈值：温度 ≤ {device.temp_max}℃ · 湿度 ≥ {device.humidity_min}% · CO₂ ≤ {device.co2_max} ppm
                  {'\n'}
                  最近上报：{device.last_seen_at ? readableTime(device.last_seen_at) : '尚未上报'}
                  {'\n'}
                  密钥：{device.secret_masked || '可在详情中查看'}
                </Text>

                <View className='toolbar' style='margin-bottom:0'>
                  <View
                    className='btn secondary'
                    onClick={() =>
                      api<{ code: string; secret: string }>(`/api/devices/${device.id}/secret`).then((res) =>
                        setCredential({ ...device, code: res.code, secret: res.secret })
                      )
                    }
                  >
                    查看设备密钥
                  </View>
                  <View className='btn secondary' onClick={() => toggleSeries(device.id)}>
                    {seriesLoading === device.id ? '加载中...' : seriesMap[device.id] ? '收起曲线' : '近 24 小时曲线'}
                  </View>
                </View>

                {seriesMap[device.id] ? (
                  <View>
                    <Text className='meta'>温度趋势（每根柱为该时间段的平均值，横轴为小时）</Text>
                    <TemperatureTrend series={seriesMap[device.id]} />
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            <EmptyState
              title='还没有接入设备'
              text='点击“接入大棚设备”，把生成的设备编号与密钥填入温室网关（ESP32/智能网关），设备就会自动上报温度、湿度、CO₂ 和光照。'
            />
          )}

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>环境数据</Text>
              <Text className='section-title-sub'>共 {readings.length} 条记录，其中设备自动上报 {deviceReported} 条</Text>
            </View>
          </View>

          {readings.length ? (
            readings.map((reading) => (
              <View className='card' key={reading.id}>
                <View className='row-top'>
                  <View>
                    <Text className='row-title'>{reading.device_name || '未命名设备'}</Text>
                    <Text className='row-desc'>
                      {baseNameOf(data.bases, reading.base_id)} · {readableTime(reading.recorded_at)}
                    </Text>
                  </View>
                  <Text className={`badge${reading.source === 'device' ? '' : ' plain'}`}>
                    {reading.source === 'device' ? '硬件自动' : '手动补录'}
                  </Text>
                </View>
                <View className='metric-line'>
                  <View className='metric-line-item'>
                    <Text className='metric-line-label'>温度</Text>
                    <Text className='metric-line-value'>{reading.temperature ?? '--'}℃</Text>
                  </View>
                  <View className='metric-line-item'>
                    <Text className='metric-line-label'>湿度</Text>
                    <Text className='metric-line-value'>{reading.humidity ?? '--'}%</Text>
                  </View>
                  <View className='metric-line-item'>
                    <Text className='metric-line-label'>CO₂</Text>
                    <Text className='metric-line-value'>{reading.co2 ?? '--'} ppm</Text>
                  </View>
                </View>
                {reading.light !== null && reading.light !== undefined ? <Text className='meta'>光照：{reading.light} lux</Text> : null}
              </View>
            ))
          ) : (
            <EmptyState title='暂无环境数据' text='接入大棚设备后数据会自动上报；也可以点击“手动补录”录入历史数据。' />
          )}

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>待处理预警</Text>
              <Text className='section-title-sub'>设备上报的数据超过阈值时自动生成</Text>
            </View>
          </View>
          {openAlerts.length ? (
            <View className='card'>
              {openAlerts.map((alert) => (
                <View className='todo-row' key={alert.id}>
                  <View className={`todo-icon${alert.level === 'high' ? ' red' : ''}`}>
                    <Text>!</Text>
                  </View>
                  <View className='todo-copy'>
                    <Text className='todo-title'>{alert.message}</Text>
                    <Text className='todo-desc'>
                      {alert.base_name || baseNameOf(data.bases, alert.base_id)} · {readableTime(alert.created_at)}
                    </Text>
                  </View>
                  <Text className='todo-action' onClick={() => handleAck(alert.id)}>
                    处理
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState title='暂无待处理预警' text='环境数据超过阈值后会自动生成预警。' />
          )}
        </View>
      )}

      <FormSheet
        visible={!!activeForm}
        config={activeForm}
        onClose={() => setActiveForm(null)}
        onSaved={handleSaved}
      />

      {credential ? (
        <View className='sheet-mask' onClick={() => setCredential(null)}>
          <View className='sheet' onClick={(event) => event.stopPropagation()}>
            <Text className='sheet-title'>设备接入凭证</Text>
            <Text className='sheet-desc'>把下面两项配置到温室网关，设备即可自动上报数据（密钥请勿外泄）。</Text>

            <View className='field'>
              <Text className='field-label'>设备编号</Text>
              <View className='field-picker filled'>{credential.code}</View>
            </View>
            <View className='field'>
              <Text className='field-label'>设备密钥</Text>
              <View className='field-picker filled'>{credential.secret || '（已隐藏，请重新获取）'}</View>
            </View>

            {/* 接口说明较长，放进滚动区，避免两个按钮区被顶出屏幕 */}
            <View className='sheet-body'>
              <View className='notice'>
                上报地址：POST /api/ingest/readings{'\n'}
                请求头：X-Device-Code、X-Device-Secret{'\n'}
                请求体示例：{'{'}"temperature":24.5,"humidity":88,"co2":650,"light":320{'}'}
              </View>
            </View>

            <View className='sheet-actions'>
              <View className='btn secondary' onClick={() => copy(credential.code)}>
                复制编号
              </View>
              <View className='btn primary' onClick={() => copy(credential.secret || '')}>
                复制密钥
              </View>
            </View>
            <View className='sheet-actions'>
              <View className='btn secondary' onClick={() => setCredential(null)}>
                关闭
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}
