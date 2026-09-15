import { useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import BrandBar from '@/components/BrandBar'
import EmptyState from '@/components/EmptyState'
import FormSheet from '@/components/FormSheet'
import StateHint from '@/components/StateHint'
import { buildFormConfigs, type FormConfig } from '@/config/forms'
import { THRESHOLDS } from '@/config'
import { FORM_MODULE, guard } from '@/utils/permission'
import { baseNameOf, useCloudData } from '@/hooks/useCloudData'
import { api } from '@/utils/request'
import { readableTime } from '@/utils/format'

export default function Monitor() {
  const { data, loading, error, reload } = useCloudData()
  const forms = buildFormConfigs(data)
  const [activeForm, setActiveForm] = useState<FormConfig | null>(null)

  const openForm = (key: string) => {
    if (!guard(FORM_MODULE[key] || 'readings', 'w')) return
    if (key === 'reading' && !data.bases.length) {
      Taro.showToast({ title: '请先新增基地', icon: 'none' })
      return
    }
    setActiveForm(forms[key] || null)
  }

  const handleAck = async (id: number) => {
    if (!guard('alerts', 'w')) return
    try {
      await api(`/api/alerts/${id}/ack`, { method: 'POST', data: {} })
      Taro.showToast({ title: '预警已处理', icon: 'success' })
      await reload()
    } catch (err) {
      Taro.showToast({ title: (err as Error).message, icon: 'none' })
    }
  }

  const readings = data.readings.slice(0, 20)
  const openAlerts = data.alerts.filter((alert) => alert.status === 'open')

  return (
    <View className='page'>
      <BrandBar title='环境监测' sub='设备数据与自动预警' onAdd={() => openForm('reading')} />

      <View className='toolbar'>
        <View className='btn primary' onClick={() => openForm('reading')}>
          ＋ 录入环境数据
        </View>
      </View>

      {loading || error ? (
        <StateHint loading={loading} error={error} onRetry={reload} />
      ) : (
        <View>
          <View className='notice'>
            阈值规则：温度 &gt; {THRESHOLDS.temperatureMax}℃、湿度 &lt; {THRESHOLDS.humidityMin}%、CO₂ &gt;{' '}
            {THRESHOLDS.co2Max} ppm 时，后台自动生成预警。
          </View>

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>环境数据</Text>
              <Text className='section-title-sub'>保存后自动判断温度、湿度和 CO₂ 阈值</Text>
            </View>
          </View>

          {readings.length ? (
            readings.map((reading) => (
              <View className='card' key={reading.id}>
                <View className='row-top'>
                  <View>
                    <Text className='row-title'>{reading.device_name || '未命名设备'}</Text>
                    <Text className='row-desc'>
                      {baseNameOf(data.bases, reading.base_id)}
                      {'\n'}
                      {readableTime(reading.recorded_at)}
                    </Text>
                  </View>
                  <Text className='badge'>已保存</Text>
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
                {reading.light !== null && reading.light !== undefined ? (
                  <Text className='meta'>光照：{reading.light} lux</Text>
                ) : null}
              </View>
            ))
          ) : (
            <EmptyState title='暂无环境数据' text='请先新增基地，再录入设备名称和环境指标。' />
          )}

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>待处理预警</Text>
              <Text className='section-title-sub'>预警由后台规则自动生成，可点击处理</Text>
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

      <FormSheet visible={!!activeForm} config={activeForm} onClose={() => setActiveForm(null)} onSaved={reload} />
    </View>
  )
}
