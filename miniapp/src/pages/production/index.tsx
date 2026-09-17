import { useState } from 'react'
import { Input, Picker, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import BrandBar from '@/components/BrandBar'
import EmptyState from '@/components/EmptyState'
import FormSheet from '@/components/FormSheet'
import StateHint from '@/components/StateHint'
import { buildFormConfigs, type FormConfig } from '@/config/forms'
import { baseNameOf, useCloudData } from '@/hooks/useCloudData'
import { PRIORITY_LABELS } from '@/config'
import { FORM_MODULE, guard } from '@/utils/permission'
import { api } from '@/utils/request'
import { dateOnly, today } from '@/utils/format'
import type { PrioritySuggestion } from '@/types'

export default function Production() {
  const { data, loading, error, reload } = useCloudData()
  const forms = buildFormConfigs(data)

  const [activeForm, setActiveForm] = useState<FormConfig | null>(null)
  const [suggestTitle, setSuggestTitle] = useState('')
  const [suggestDueDate, setSuggestDueDate] = useState(today())
  const [suggestion, setSuggestion] = useState<PrioritySuggestion | null>(null)
  const [suggesting, setSuggesting] = useState(false)

  const openForm = (key: string, preset?: Record<string, string>) => {
    const config = forms[key]
    if (!config) return
    if (!guard(FORM_MODULE[key] || 'bases', 'w')) return
    if (key === 'batch' && !data.bases.length) {
      Taro.showToast({ title: '请先新增基地', icon: 'none' })
      return
    }
    setActiveForm(
      preset
        ? { ...config, fields: config.fields.map((field) => (preset[field.name] ? { ...field, defaultValue: preset[field.name] } : field)) }
        : config
    )
  }

  const handleSuggest = async () => {
    if (!guard('ai', 'r')) return
    if (!suggestTitle.trim()) {
      Taro.showToast({ title: '请先填写任务标题', icon: 'none' })
      return
    }
    setSuggesting(true)
    try {
      const result = await api<PrioritySuggestion>('/api/ai/suggest-priority', {
        method: 'POST',
        data: { title: suggestTitle, due_date: suggestDueDate }
      })
      setSuggestion(result)
    } catch (err) {
      Taro.showToast({ title: (err as Error).message, icon: 'none' })
    } finally {
      setSuggesting(false)
    }
  }

  return (
    <View className='page'>
      <BrandBar title='生产批次' sub='菌棒与生产记录' onAdd={() => openForm('batch')} />

      <View className='toolbar'>
        <View className='btn primary' onClick={() => openForm('batch')}>
          ＋ 新增批次
        </View>
        <View className='btn secondary' onClick={() => openForm('base')}>
          新增基地
        </View>
      </View>

      {loading || error ? (
        <StateHint loading={loading} error={error} onRetry={reload} />
      ) : (
        <View>
          <View className='section-title'>
            <View>
              <Text className='section-title-main'>生产批次台账</Text>
              <Text className='section-title-sub'>批次是生产、监测、溯源与销售的共同主线</Text>
            </View>
          </View>

          {data.batches.length ? (
            data.batches.map((batch) => (
              <View className='card' key={batch.id}>
                <View className='row-top'>
                  <View>
                    <Text className='row-title'>{batch.code}</Text>
                    <Text className='row-desc'>
                      {baseNameOf(data.bases, batch.base_id)}
                      {'\n'}
                      {batch.mushroom_type}
                      {batch.variety ? ` · ${batch.variety}` : ''} · {batch.quantity} 棒
                    </Text>
                  </View>
                  <Text className='badge'>{batch.stage}</Text>
                </View>
                <View className='metric-line'>
                  <View className='metric-line-item'>
                    <Text className='metric-line-label'>入库日期</Text>
                    <Text className='metric-line-value'>{dateOnly(batch.start_date) || '--'}</Text>
                  </View>
                  <View className='metric-line-item'>
                    <Text className='metric-line-label'>预计出菇</Text>
                    <Text className='metric-line-value'>{dateOnly(batch.expected_harvest_date) || '--'}</Text>
                  </View>
                  <View className='metric-line-item'>
                    <Text className='metric-line-label'>状态</Text>
                    <Text className='metric-line-value'>{batch.status}</Text>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <EmptyState title='暂无生产批次' text='请先新增基地，再录入真实批次编号、菌种、数量和日期。' />
          )}

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>任务优先级建议</Text>
              <Text className='section-title-sub'>调用 /api/ai/suggest-priority，无 AI 密钥时自动降级为规则引擎</Text>
            </View>
          </View>
          <View className='card'>
            <View className='field'>
              <Text className='field-label'>任务标题</Text>
              <Input
                className='field-input'
                value={suggestTitle}
                placeholder='例如：3 号棚温度异常，立即检查通风'
                onInput={(event) => setSuggestTitle(event.detail.value)}
              />
            </View>
            <View className='field'>
              <Text className='field-label'>截止日期</Text>
              <Picker mode='date' value={suggestDueDate} onChange={(event) => setSuggestDueDate(String(event.detail.value))}>
                <View className='field-picker filled'>{suggestDueDate}</View>
              </Picker>
            </View>
            <View className='btn primary' onClick={handleSuggest}>
              {suggesting ? '分析中...' : '获取优先级建议'}
            </View>
            {suggestion ? (
              <View className='notice success' style='margin-top:20px'>
                建议优先级：{PRIORITY_LABELS[suggestion.priority] || suggestion.priority}（来源：
                {suggestion.source === 'ai' ? 'AI' : '规则引擎'}）{'\n'}
                {suggestion.reason}
              </View>
            ) : null}
            {suggestion ? (
              <View
                className='btn secondary'
                onClick={() =>
                  openForm('task', {
                    title: suggestTitle,
                    due_date: suggestDueDate,
                    priority: suggestion.priority
                  })
                }
              >
                按该建议新增任务
              </View>
            ) : null}
          </View>

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>生产任务</Text>
              <Text className='section-title-sub'>任务保存后写入数据库</Text>
            </View>
            <Text className='section-title-action' onClick={() => openForm('task')}>
              新增
            </Text>
          </View>
          <View className='card'>
            {data.tasks.length ? (
              data.tasks.map((task) => (
                <View className='todo-row' key={task.id}>
                  <View className={`todo-icon${task.priority === 'high' ? ' red' : ''}`}>
                    <Text>{task.priority === 'high' ? '!' : '✓'}</Text>
                  </View>
                  <View className='todo-copy'>
                    <Text className='todo-title'>{task.title}</Text>
                    <Text className='todo-desc'>
                      {task.description || '无补充说明'} · 截止 {dateOnly(task.due_date) || '未设置'} · 优先级{' '}
                      {PRIORITY_LABELS[task.priority] || task.priority}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <EmptyState title='暂无生产任务' text='点击新增，可先在上方获取优先级建议。' />
            )}
          </View>
        </View>
      )}

      <FormSheet visible={!!activeForm} config={activeForm} onClose={() => setActiveForm(null)} onSaved={reload} />
    </View>
  )
}
