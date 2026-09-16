import { useState } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import BrandBar from '@/components/BrandBar'
import EmptyState from '@/components/EmptyState'
import FormSheet from '@/components/FormSheet'
import StateHint from '@/components/StateHint'
import { buildFormConfigs, RECORD_MENU, type FormConfig } from '@/config/forms'
import { baseNameOf, useCloudData } from '@/hooks/useCloudData'
import { logout, roleLabel } from '@/utils/auth'
import { FORM_MODULE, can, guard } from '@/utils/permission'
import { getUser } from '@/utils/storage'
import { api } from '@/utils/request'
import { dateOnly, readableTime } from '@/utils/format'
import type { AuthUser } from '@/types'

export default function Home() {
  const { data, loading, error, reload } = useCloudData()
  const forms = buildFormConfigs(data)

  const [activeForm, setActiveForm] = useState<FormConfig | null>(null)
  const [menuVisible, setMenuVisible] = useState(false)

  const openForm = (key: string) => {
    const config = forms[key]
    if (!config) return

    // 角色权限：无写权限时直接提示，后端还会再校验一次
    if (!guard(FORM_MODULE[key] || 'bases', 'w')) return

    // 与后台外键约束保持一致：缺少前置数据时给出明确提示，而不是保存一条无效记录
    if (['batch', 'reading'].includes(key) && !data.bases.length) {
      Taro.showToast({ title: '请先新增基地', icon: 'none' })
      return
    }
    if (['trace-event', 'product'].includes(key) && !data.batches.length) {
      Taro.showToast({ title: '请先新增生产批次', icon: 'none' })
      return
    }

    setMenuVisible(false)
    setActiveForm(config)
  }

  const account: AuthUser | null = data.dashboard.user || getUser()

  const handleLogout = async () => {
    const confirm = await Taro.showModal({ title: '退出登录', content: '退出后需要重新登录才能查看本账号数据。' })
    if (!confirm.confirm) return
    await logout()
    Taro.reLaunch({ url: '/pages/login/index' })
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

  const dashboard = data.dashboard
  const latestReadings = (dashboard.latestReadings || []).slice(0, 4)
  const openAlerts = (dashboard.alerts || []).slice(0, 4)
  const tasks = data.tasks.slice(0, 4)

  return (
    <View className='page'>
      <BrandBar title='菇事云管家' sub='真实业务数据管理' onAdd={() => setMenuVisible(true)} />

      {loading || error ? (
        <StateHint loading={loading} error={error} onRetry={reload} />
      ) : (
        <View>
          <View className='hero'>
            <Text className='hero-small'>GU SHI CLOUD · 真实数据可保存</Text>
            <Text className='hero-title'>
              生产有记录{'\n'}数据能追溯，后台能保存
            </Text>
            <Text className='hero-desc'>所有数字均来自后台数据库。没有录入数据时显示空状态，不编造业务数据。</Text>
            <View className='hero-tags'>
              <Text className='hero-tag'>基地</Text>
              <Text className='hero-tag'>批次</Text>
              <Text className='hero-tag'>监测</Text>
              <Text className='hero-tag'>溯源</Text>
            </View>
          </View>

          <View className='quick'>
            <View className='quick-item' onClick={() => openForm('base')}>
              <Text className='quick-icon'>＋</Text>
              <Text className='quick-label'>新增基地</Text>
            </View>
            <View className='quick-item' onClick={() => openForm('batch')}>
              <Text className='quick-icon'>▤</Text>
              <Text className='quick-label'>新增批次</Text>
            </View>
            <View className='quick-item' onClick={() => openForm('device')}>
              <Text className='quick-icon'>📡</Text>
              <Text className='quick-label'>大棚设备</Text>
            </View>
            <View className='quick-item' onClick={() => Taro.navigateTo({ url: '/pages/expert/index' })}>
              <Text className='quick-icon'>🤖</Text>
              <Text className='quick-label'>AI 问答</Text>
            </View>
          </View>

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>今日数据</Text>
              <Text className='section-title-sub'>来自后台数据库的实时汇总</Text>
            </View>
          </View>
          <View className='stats'>
            <View className='stat'>
              <Text className='stat-label'>生产基地</Text>
              <Text className='stat-value'>
                {dashboard.bases}
                <Text className='stat-unit'>处</Text>
              </Text>
              <Text className='stat-foot'>已保存基地</Text>
            </View>
            <View className='stat'>
              <Text className='stat-label'>生产批次</Text>
              <Text className='stat-value'>
                {dashboard.batches}
                <Text className='stat-unit'>批</Text>
              </Text>
              <Text className='stat-foot'>已保存批次</Text>
            </View>
            <View className='stat'>
              <Text className='stat-label'>监测设备</Text>
              <Text className='stat-value'>
                {dashboard.devices}
                <Text className='stat-unit'>台</Text>
              </Text>
              <Text className='stat-foot'>
                在线 {dashboard.devicesOnline ?? 0} 台 · 自动上报 {dashboard.deviceReadings ?? 0} 条
              </Text>
            </View>
            <View className='stat'>
              <Text className='stat-label'>待处理预警</Text>
              <Text className='stat-value'>
                {dashboard.openAlerts}
                <Text className='stat-unit'>条</Text>
              </Text>
              <Text className='stat-foot'>自动规则生成</Text>
            </View>
          </View>

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>最新环境记录</Text>
              <Text className='section-title-sub'>大棚设备自动上报，异常时自动预警</Text>
            </View>
            <Text className='section-title-action' onClick={() => openForm('reading')}>
              手动补录
            </Text>
          </View>
          <View className='card'>
            {latestReadings.length ? (
              latestReadings.map((reading) => (
                <View className='todo-row' key={reading.id}>
                  <View className='todo-icon green'>
                    <Text>🌡</Text>
                  </View>
                  <View className='todo-copy'>
                    <Text className='todo-title'>{reading.base_name || baseNameOf(data.bases, reading.base_id)}</Text>
                    <Text className='todo-desc'>
                      {reading.device_name || '未命名设备'} · {reading.temperature ?? '--'}℃ · 湿度 {reading.humidity ?? '--'}% · CO₂{' '}
                      {reading.co2 ?? '--'}ppm · {reading.source === 'device' ? '硬件自动' : '手动补录'}
                    </Text>
                  </View>
                  <Text className='todo-action'>{dateOnly(reading.recorded_at)}</Text>
                </View>
              ))
            ) : (
              <EmptyState title='暂无环境记录' text='请先新增基地，再录入环境数据。' />
            )}
          </View>

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>待处理预警</Text>
              <Text className='section-title-sub'>环境数据保存后自动按阈值生成</Text>
            </View>
            <Text className='section-title-action' onClick={() => Taro.switchTab({ url: '/pages/monitor/index' })}>
              全部
            </Text>
          </View>
          <View className='card'>
            {openAlerts.length ? (
              openAlerts.map((alert) => (
                <View className='todo-row' key={alert.id}>
                  <View className={`todo-icon${alert.level === 'high' ? ' red' : ''}`}>
                    <Text>!</Text>
                  </View>
                  <View className='todo-copy'>
                    <Text className='todo-title'>{alert.message}</Text>
                    <Text className='todo-desc'>
                      {alert.base_name || baseNameOf(data.bases, alert.base_id)} · {alert.alert_type} · {readableTime(alert.created_at)}
                    </Text>
                  </View>
                  <Text className='todo-action' onClick={() => handleAck(alert.id)}>
                    处理
                  </Text>
                </View>
              ))
            ) : (
              <EmptyState title='暂无待处理预警' text='录入环境数据后，超过阈值的记录会自动生成预警。' />
            )}
          </View>

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>生产任务</Text>
              <Text className='section-title-sub'>任务建议由规则引擎或 AI 生成</Text>
            </View>
            <Text className='section-title-action' onClick={() => openForm('task')}>
              新增任务
            </Text>
          </View>
          <View className='card'>
            {tasks.length ? (
              tasks.map((task) => (
                <View className='todo-row' key={task.id}>
                  <View className={`todo-icon${task.priority === 'high' ? ' red' : ''}`}>
                    <Text>{task.priority === 'high' ? '!' : '✓'}</Text>
                  </View>
                  <View className='todo-copy'>
                    <Text className='todo-title'>{task.title}</Text>
                    <Text className='todo-desc'>
                      {task.description || '无补充说明'} · 截止 {dateOnly(task.due_date) || '未设置'}
                    </Text>
                  </View>
                  <Text className='todo-action'>{task.priority}</Text>
                </View>
              ))
            ) : (
              <EmptyState title='暂无生产任务' text='点击新增任务，可先调用优先级建议接口。' />
            )}
          </View>

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>当前账号</Text>
              <Text className='section-title-sub'>数据按账号隔离，保存在后台数据库</Text>
            </View>
          </View>
          <View className='card'>
            <View className='row-top'>
              <View>
                <Text className='row-title'>{account?.display_name || account?.username || '未登录'}</Text>
                <Text className='row-desc'>
                  账号：{account?.username || '--'} · 角色：{account?.role_label || roleLabel(account?.role)}
                  {'\n'}
                  本账号已保存基地 {dashboard.bases} 处、批次 {dashboard.batches} 批，记录仅本账号可见
                </Text>
              </View>
              <Text className='badge'>数据独立保存</Text>
            </View>
            <View className='toolbar' style='margin-bottom:0'>
              <View className='btn secondary' onClick={handleLogout}>
                退出登录
              </View>
            </View>
          </View>
        </View>
      )}

      <FormSheet visible={!!activeForm} config={activeForm} onClose={() => setActiveForm(null)} onSaved={reload} />

      {menuVisible ? (
        <View className='sheet-mask' onClick={() => setMenuVisible(false)}>
          <View className='sheet' onClick={(event) => event.stopPropagation()}>
            <Text className='sheet-title'>新增数据</Text>
            <Text className='sheet-desc'>选择要保存到后台数据库的记录类型</Text>
            {/* 菜单项放进滚动区，条目多时也不会把底部「取消」顶出屏幕 */}
            <ScrollView className='sheet-body' scrollY>
              {RECORD_MENU.filter((item) => can(FORM_MODULE[item.key], 'w')).map((item) => (
                <View className='sheet-menu-item' key={item.key} onClick={() => openForm(item.key)}>
                  {item.label}
                </View>
              ))}
              {RECORD_MENU.some((item) => !can(FORM_MODULE[item.key], 'w')) ? (
                <View className='notice'>部分数据类型当前角色没有录入权限，已自动隐藏。</View>
              ) : null}
            </ScrollView>
            <View className='sheet-actions'>
              <View className='btn secondary' onClick={() => setMenuVisible(false)}>
                取消
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}
