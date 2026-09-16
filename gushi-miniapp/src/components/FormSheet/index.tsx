import { useEffect, useRef, useState } from 'react'
import { Image, Input, Picker, ScrollView, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { PRODUCT_ICON_PRESETS } from '@/config'
import { api, assetUrl, chooseAndUploadImage } from '@/utils/request'
import { useHideTabBarWhen } from '@/utils/tabbar'
import { nowLocalDateTime, today } from '@/utils/format'
import type { FormConfig, FormField } from '@/config/forms'

interface Props {
  visible: boolean
  config: FormConfig | null
  onClose: () => void
  /** 保存成功后回调，参数是后台返回的记录（例如新建设备时可用于展示设备密钥） */
  onSaved: (result?: any) => void | Promise<void>
}

/**
 * 通用录入表单：所有新增/修改记录都通过后台接口保存到 SQLite，
 * 保存成功后由页面重新拉取真实数据。
 */
export default function FormSheet({ visible, config, onClose, onSaved }: Props) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // 表单打开期间收起底部 TabBar，避免它盖住弹层最下方的「取消 / 确定」
  useHideTabBarWhen(visible)

  /**
   * 输入法兼容（重点：中文「打不出字」）：
   * 微信小程序/部分 H5 端在中文输入法组词尚未上屏时，如果把 value 重新回写进输入框，
   * 会打断组词过程，现场表现就是「备注/输入框打不出中文」。
   * 处理方式：小程序端用打开表单时的初始值作为受控值（打字过程中不回写，输入始终跟手）；
   * H5 端在 composition 组词期间暂停回写，组词结束再统一写回。
   */
  const isMiniProgram = process.env.TARO_ENV !== 'h5'
  const initialRef = useRef<Record<string, string>>({})
  const composingRef = useRef<Record<string, boolean>>({})

  useEffect(() => {
    if (!visible || !config) return
    const next: Record<string, string> = {}
    config.fields.forEach((field) => {
      next[field.name] = field.defaultValue ?? ''
    })
    setValues(next)
    initialRef.current = next
    composingRef.current = {}
    setSubmitting(false)
  }, [visible, config])

  /**
   * H5 端：弹层打开时锁住背景页面滚动。
   * 否则在弹层里滚动会连带整页一起动，手感发飘、也容易划不到底部按钮。
   * 小程序没有 document，走原生滚动，这里直接跳过。
   */
  useEffect(() => {
    if (!visible || typeof document === 'undefined' || !document.body) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [visible])

  if (!visible || !config) return null

  const visibleFields = config.fields.filter((field) => !field.hidden)

  const setValue = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  /** 文本/多行输入的统一事件绑定，保证中文输入法组词不被打断（详见上方说明） */
  const textHandlers = (name: string): any => {
    const base: any = {
      onInput: (event: any) => setValue(name, event.detail.value),
    }
    if (isMiniProgram) return base
    return {
      ...base,
      onCompositionStart: () => {
        composingRef.current[name] = true
      },
      onCompositionEnd: (event: any) => {
        composingRef.current[name] = false
        const next = event?.detail?.value ?? event?.target?.value
        if (typeof next === 'string') setValue(name, next)
      },
      onInput: (event: any) => {
        if (composingRef.current[name]) return
        setValue(name, event.detail.value)
      },
    }
  }

  const pickImage = async (name: string) => {
    try {
      Taro.showLoading({ title: '上传中...' })
      const url = await chooseAndUploadImage()
      setValue(name, url)
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      Taro.hideLoading()
    }
  }

  const handleSubmit = async () => {
    if (submitting) return
    for (const field of visibleFields) {
      if (field.required && !String(values[field.name] || '').trim()) {
        Taro.showToast({ title: `请填写${field.label}`, icon: 'none' })
        return
      }
    }

    setSubmitting(true)
    try {
      const payload: Record<string, any> = {}
      config.fields.forEach((field) => {
        const raw = values[field.name]
        if (raw === undefined || raw === '') return
        payload[field.name] = field.type === 'number' ? Number(raw) : raw
      })
      const finalPayload = config.transform ? config.transform(payload, values) : payload
      const endpoint = typeof config.endpoint === 'function' ? config.endpoint(finalPayload, values) : config.endpoint
      const saved = await api(endpoint, { method: config.method || 'POST', data: finalPayload })
      Taro.showToast({ title: '已保存到后台', icon: 'success' })
      await onSaved(saved)
      onClose()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const renderField = (field: FormField) => {
    const value = values[field.name] ?? ''
    // 小程序端受控值固定为打开表单时的初始值：打字过程中不再回写，中文输入法不会被中断
    const displayValue = isMiniProgram ? initialRef.current[field.name] ?? '' : value
    const label = (
      <Text className='field-label'>
        {field.label}
        {field.required ? <Text className='required'>*</Text> : null}
      </Text>
    )

    if (field.type === 'textarea') {
      return (
        <View className='field' key={field.name}>
          {label}
          <Textarea
            className='field-textarea'
            value={displayValue}
            placeholder={field.placeholder || `请输入${field.label}`}
            {...textHandlers(field.name)}
          />
        </View>
      )
    }

    if (field.type === 'select') {
      const options = field.options || []
      const index = options.findIndex((option) => String(option.value) === String(value))
      return (
        <View className='field' key={field.name}>
          {label}
          <Picker
            mode='selector'
            range={options.map((option) => option.label)}
            value={index < 0 ? 0 : index}
            onChange={(event) => {
              const picked = options[Number(event.detail.value)]
              if (picked) setValue(field.name, String(picked.value))
            }}
          >
            <View className={`field-picker${index < 0 ? '' : ' filled'}`}>
              {index < 0 ? field.placeholder || `请选择${field.label}` : options[index].label}
            </View>
          </Picker>
        </View>
      )
    }

    if (field.type === 'date') {
      return (
        <View className='field' key={field.name}>
          {label}
          <Picker mode='date' value={value || today()} onChange={(event) => setValue(field.name, String(event.detail.value))}>
            <View className={`field-picker${value ? ' filled' : ''}`}>{value || field.placeholder || '请选择日期'}</View>
          </Picker>
        </View>
      )
    }

    if (field.type === 'time') {
      return (
        <View className='field' key={field.name}>
          {label}
          <Picker mode='time' value={value || '09:00'} onChange={(event) => setValue(field.name, String(event.detail.value))}>
            <View className={`field-picker${value ? ' filled' : ''}`}>{value || field.placeholder || '请选择时间'}</View>
          </Picker>
        </View>
      )
    }

    if (field.type === 'datetime') {
      const [datePart, timePart] = (value || nowLocalDateTime()).split('T')
      return (
        <View className='field' key={field.name}>
          {label}
          <View className='field-datetime'>
            <Picker
              mode='date'
              value={datePart}
              onChange={(event) => setValue(field.name, `${event.detail.value}T${timePart || '09:00'}`)}
            >
              <View className='field-picker filled'>{datePart || today()}</View>
            </Picker>
            <Picker
              mode='time'
              value={timePart || '09:00'}
              onChange={(event) => setValue(field.name, `${datePart || today()}T${event.detail.value}`)}
            >
              <View className='field-picker filled'>{timePart || '09:00'}</View>
            </Picker>
          </View>
        </View>
      )
    }

    if (field.type === 'icons') {
      const isImage = value.startsWith('/') || /^https?:\/\//.test(value)
      return (
        <View className='field' key={field.name}>
          {label}
          <View className='preset-icons'>
            {PRODUCT_ICON_PRESETS.map((icon) => (
              <View
                key={icon}
                className={`preset-icon${!isImage && value === icon ? ' active' : ''}`}
                onClick={() => setValue(field.name, icon)}
              >
                <Text>{icon}</Text>
              </View>
            ))}
          </View>
          <View className='btn secondary' onClick={() => pickImage(field.name)}>
            上传自己的图片
          </View>
          {isImage ? (
            <View className='meta'>
              <Text>已选择自定义图片：</Text>
              <Image className='product-icon-img' style='width:120px;height:120px;border-radius:24px' src={assetUrl(value)} mode='aspectFill' />
            </View>
          ) : null}
        </View>
      )
    }

    if (field.type === 'image') {
      return (
        <View className='field' key={field.name}>
          {label}
          <View className='btn secondary' onClick={() => pickImage(field.name)}>
            {value ? '重新选择图片' : '选择图片并上传'}
          </View>
          {value ? <Image style='width:160px;height:160px;border-radius:24px;margin-top:16px' src={assetUrl(value)} mode='aspectFill' /> : null}
        </View>
      )
    }

    return (
      <View className='field' key={field.name}>
        {label}
        <Input
          className='field-input'
          type={field.type === 'number' ? 'digit' : 'text'}
          value={displayValue}
          placeholder={field.placeholder || `请输入${field.label}`}
          {...textHandlers(field.name)}
        />
      </View>
    )
  }

  return (
    <View className='sheet-mask'>
      <View className='sheet'>
        <Text className='sheet-title'>{config.title}</Text>
        <Text className='sheet-desc'>{config.desc}</Text>
        {config.notice ? <View className='notice'>{config.notice}</View> : null}
        {/* 字段放在可滚动区域里，底部「取消 / 保存到后台」不会被内容顶出屏幕。
            用 ScrollView 而不是 View + overflow：小程序端 view 不支持内部滚动，ScrollView 两端通用 */}
        {/* enhanced + showScrollbar：小程序端也显示滚动条，提示还能往下滑 */}
        <ScrollView className='sheet-body' scrollY enhanced showScrollbar>
          {visibleFields.map(renderField)}
        </ScrollView>
        <View className='sheet-actions'>
          <View className='btn secondary' onClick={onClose}>
            取消
          </View>
          <View className='btn primary' onClick={handleSubmit}>
            {submitting ? '保存中...' : '保存到后台'}
          </View>
        </View>
      </View>
    </View>
  )
}
