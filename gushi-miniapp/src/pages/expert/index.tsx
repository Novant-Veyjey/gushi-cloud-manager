import { useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import BrandBar from '@/components/BrandBar'
import EmptyState from '@/components/EmptyState'
import FormSheet from '@/components/FormSheet'
import StateHint from '@/components/StateHint'
import { buildFormConfigs, type FormConfig } from '@/config/forms'
import { baseNameOf, useCloudData } from '@/hooks/useCloudData'
import { readableTime } from '@/utils/format'
import { FORM_MODULE, guard } from '@/utils/permission'

export default function Expert() {
  const { data, loading, error, reload } = useCloudData()
  const forms = buildFormConfigs(data)
  const [activeForm, setActiveForm] = useState<FormConfig | null>(null)

  const openForm = (key: string, preset?: Record<string, string>) => {
    const config = forms[key]
    if (!config) return
    if (!guard(FORM_MODULE[key] || 'questions', 'w')) return
    setActiveForm(
      preset
        ? { ...config, fields: config.fields.map((field) => (preset[field.name] !== undefined ? { ...field, defaultValue: preset[field.name] } : field)) }
        : config
    )
  }

  return (
    <View className='page'>
      <BrandBar title='专家服务' sub='问题与专家回复' onAdd={() => openForm('question')} />

      <View className='toolbar'>
        <View className='btn primary' onClick={() => openForm('question')}>
          ＋ 向专家提问
        </View>
        <View className='btn secondary' onClick={() => Taro.switchTab({ url: '/pages/home/index' })}>
          返回首页
        </View>
      </View>

      {loading || error ? (
        <StateHint loading={loading} error={error} onRetry={reload} />
      ) : (
        <View>
          <View className='notice'>
            问题与回答均保存到后台数据库；AI 只能辅助判断，不能替代专家意见，最终结论以专家回复为准。
          </View>

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>专家问答</Text>
              <Text className='section-title-sub'>共 {data.questions.length} 条真实记录</Text>
            </View>
          </View>

          {data.questions.length ? (
            data.questions.map((question) => (
              <View className='card' key={question.id}>
                <View className='row-top'>
                  <View>
                    <Text className='row-title'>{question.title}</Text>
                    <Text className='row-desc'>
                      {baseNameOf(data.bases, question.base_id)} · {question.category || '未分类'} ·{' '}
                      {readableTime(question.created_at)}
                    </Text>
                  </View>
                  <Text className={`badge${question.status === 'answered' ? '' : ' warn'}`}>
                    {question.status === 'answered' ? '已回复' : '待回复'}
                  </Text>
                </View>
                <Text className='meta'>{question.content}</Text>
                {question.answer ? (
                  <View className='notice success' style='margin:20px 0 0'>
                    专家回复（{readableTime(question.answered_at)}）：{question.answer}
                  </View>
                ) : null}
                <View className='toolbar' style='margin-bottom:0'>
                  <View className='btn secondary' onClick={() => openForm('reply', { id: String(question.id) })}>
                    {question.answer ? '补充回复' : '专家回复'}
                  </View>
                </View>
              </View>
            ))
          ) : (
            <EmptyState title='暂无专家问题' text='点击向专家提问，保存真实问题。' />
          )}
        </View>
      )}

      <FormSheet visible={!!activeForm} config={activeForm} onClose={() => setActiveForm(null)} onSaved={reload} />
    </View>
  )
}
