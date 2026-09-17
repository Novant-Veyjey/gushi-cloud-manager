import { useEffect, useState } from 'react'
import { Picker, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import BrandBar from '@/components/BrandBar'
import EmptyState from '@/components/EmptyState'
import FormSheet from '@/components/FormSheet'
import StateHint from '@/components/StateHint'
import { buildFormConfigs, type FormConfig } from '@/config/forms'
import { baseNameOf, useCloudData } from '@/hooks/useCloudData'
import { api } from '@/utils/request'
import { readableTime } from '@/utils/format'
import { FORM_MODULE, canAnswerQuestion, currentRole, guard } from '@/utils/permission'
import { roleLabel } from '@/utils/auth'
import type { AiAnswer, AiStatus, ExpertQuestion } from '@/types'

const QUICK_QUESTIONS = [
  '菌棒表面发绿霉是什么原因，应该怎么处理？',
  '棚内 CO₂ 偏高、菇柄细长应该怎么调整？',
  '出菇期温度和湿度分别控制在多少合适？',
  '菌丝生长慢、不吃料如何排查？'
]

/** 把多行回答按行渲染，避免小程序 Text 不换行 */
function Multiline({ text, className }: { text: string; className?: string }) {
  const lines = String(text || '').split('\n')
  return (
    <View className={className}>
      {lines.map((line, index) => (
        <Text className='line' key={`${index}-${line.slice(0, 8)}`}>
          {line}
        </Text>
      ))}
    </View>
  )
}

function sourceLabel(source?: string) {
  if (source === 'ai') return 'AI 大模型'
  if (source === 'rule') return '规则知识库'
  if (source === 'expert') return '人工专家'
  return '待回复'
}

function sourceBadgeClass(source?: string) {
  if (source === 'ai') return 'badge'
  if (source === 'rule') return 'badge warn'
  return 'badge plain'
}

export default function Expert() {
  const { data, loading, error, reload } = useCloudData()
  const forms = buildFormConfigs(data)

  const [activeForm, setActiveForm] = useState<FormConfig | null>(null)
  const [question, setQuestion] = useState('')
  const [baseIndex, setBaseIndex] = useState(0) // 0 = 不指定基地
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<AiAnswer | null>(null)
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)

  // 读取 AI 配置状态（是否已接入大模型）
  useEffect(() => {
    api<AiStatus>('/api/ai/status')
      .then(setAiStatus)
      .catch(() => setAiStatus(null))
  }, [])

  const baseOptions = [{ label: '不指定基地', value: '' }, ...data.bases.map((item) => ({ label: item.name, value: String(item.id) }))]

  const openForm = (key: string, preset?: Record<string, string>) => {
    if (!guard(FORM_MODULE[key] || 'questions', 'w')) return
    const config = forms[key]
    if (!config) return
    setActiveForm(
      preset
        ? { ...config, fields: config.fields.map((field) => (preset[field.name] !== undefined ? { ...field, defaultValue: preset[field.name] } : field)) }
        : config
    )
  }

  const ask = async () => {
    if (!guard('ai', 'r')) return
    const value = question.trim()
    if (value.length < 4) {
      Taro.showToast({ title: '请把问题描述得再具体一些', icon: 'none' })
      return
    }
    setAsking(true)
    try {
      const result = await api<AiAnswer>('/api/ai/ask', {
        method: 'POST',
        data: { question: value, base_id: baseOptions[baseIndex].value || null, save: true },
        // 大模型作答偶尔会超过默认 10 秒，单独放宽到 60 秒，避免被中断后误报“无法连接后台”
        timeout: 60000
      })
      setAnswer(result)
      setQuestion('')
      Taro.showToast({ title: result.source === 'ai' ? 'AI 已回答' : '已给出知识库答复', icon: 'none' })
      await reload(true)
    } catch (err) {
      Taro.showToast({ title: (err as Error).message, icon: 'none' })
    } finally {
      setAsking(false)
    }
  }

  const questions: ExpertQuestion[] = data.questions

  /** 返回上一级：有历史记录就回退；从分享链接直接打开时没有上一页，回首页 */
  const goBack = () => {
    if (Taro.getCurrentPages().length > 1) {
      Taro.navigateBack()
      return
    }
    Taro.switchTab({ url: '/pages/home/index' })
  }

  return (
    <View className='page'>
      {/* 左上角返回箭头：回到上一级页面 */}
      <View className='back-row'>
        <View className='back-bar' onClick={goBack} aria-role='button' aria-label='返回上一级'>
          <Text className='back-arrow'>←</Text>
          <Text className='back-label'>返回</Text>
        </View>
      </View>

      <BrandBar
        title='AI 智能问答'
        sub={aiStatus?.configured ? `已接入大模型 ${aiStatus.model}` : '未配置大模型时使用规则知识库'}
        onAdd={() => openForm('question')}
      />

      <View className='toolbar'>
        <View className='btn secondary' onClick={() => Taro.switchTab({ url: '/pages/home/index' })}>
          返回首页
        </View>
      </View>

      {loading || error ? (
        <StateHint loading={loading} error={error} onRetry={reload} />
      ) : (
        <View>
          <View className={`notice${aiStatus?.configured ? ' success' : ''}`}>
            {aiStatus?.configured
              ? `已接入大模型（${aiStatus.model}），回答会自动参考本账号最近的批次与环境数据；AI 仅作辅助，重要决策请咨询当地农技专家。`
              : '后台尚未配置 AI_API_KEY，当前使用内置规则知识库回答；配置后自动切换为大模型回答，无需改小程序。'}
          </View>

          <View className='card'>
            <View className='field'>
              <Text className='field-label'>问题描述</Text>
              <Textarea
                className='field-textarea'
                value={question}
                maxlength={1000}
                placeholder='例如：菌棒表面发绿霉，温度 28℃、湿度 92%，应该怎么处理？'
                onInput={(event) => setQuestion(event.detail.value)}
              />
            </View>

            <View className='field'>
              <Text className='field-label'>关联基地（可选，用于结合最近数据作答）</Text>
              <Picker mode='selector' range={baseOptions.map((item) => item.label)} value={baseIndex} onChange={(event) => setBaseIndex(Number(event.detail.value))}>
                <View className='field-picker filled'>{baseOptions[baseIndex].label}</View>
              </Picker>
            </View>

            <View className='btn primary' onClick={ask}>
              {asking ? 'AI 思考中...' : '向 AI 提问'}
            </View>

            <View className='preset-icons' style='margin-top:24px'>
              {QUICK_QUESTIONS.map((item) => (
                <View className='quick-question' key={item} onClick={() => setQuestion(item)}>
                  <Text>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          {answer ? (
            <View className='card'>
              <View className='row-top'>
                <Text className='row-title'>AI 回答</Text>
                <Text className={sourceBadgeClass(answer.source)}>{sourceLabel(answer.source)}</Text>
              </View>
              {answer.model ? <Text className='meta'>模型：{answer.model}</Text> : null}
              {answer.context_summary ? (
                <View className='notice' style='margin:16px 0'>
                  <Text>参考的本账号数据：{'\n'}</Text>
                  <Multiline text={answer.context_summary} />
                </View>
              ) : null}
              <Multiline className='answer' text={answer.answer} />
              {answer.fallback_reason ? <Text className='meta'>降级原因：{answer.fallback_reason}</Text> : null}
            </View>
          ) : null}

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>问答记录</Text>
              <Text className='section-title-sub'>
                {canAnswerQuestion()
                  ? `共 ${questions.length} 条 · 你是${roleLabel(currentRole())}，可查看全部账号的提问并人工回复`
                  : `共 ${questions.length} 条 · 仅显示本账号的提问，其他账号看不到你提的问题`}
              </Text>
            </View>
          </View>

          {questions.length ? (
            questions.map((item) => (
              <View className='card' key={item.id}>
                <View className='row-top'>
                  <View>
                    <Text className='row-title'>{item.title}</Text>
                    <Text className='row-desc'>
                      {/* 专家 / 管理员会看到全部账号的提问，这里标出提问者，避免分不清是谁提的 */}
                      {item.is_mine === false && item.owner_name ? `提问者：${item.owner_name} · ` : ''}
                      {baseNameOf(data.bases, item.base_id)} · {readableTime(item.created_at)}
                    </Text>
                  </View>
                  <Text className={sourceBadgeClass(item.answer_source)}>{sourceLabel(item.answer_source)}</Text>
                </View>

                <Multiline className='meta' text={item.content} />

                {item.answer ? (
                  <View className='notice success' style='margin:18px 0 0'>
                    <Text>回答（{item.answer_source === 'ai' ? `${item.ai_model || 'AI'} 生成` : sourceLabel(item.answer_source)}，{readableTime(item.answered_at)}）：</Text>
                    <Multiline text={item.answer} />
                  </View>
                ) : (
                  <View className='notice' style='margin:18px 0 0'>
                    该记录暂无回答，可在上方重新提问，AI 会立即作答。
                  </View>
                )}
              </View>
            ))
          ) : (
            <EmptyState title='暂无问答记录' text='在上方输入问题，AI 会立即回答并存档，便于后续专家复核。' />
          )}
        </View>
      )}

      <FormSheet visible={!!activeForm} config={activeForm} onClose={() => setActiveForm(null)} onSaved={() => reload(true)} />
    </View>
  )
}
