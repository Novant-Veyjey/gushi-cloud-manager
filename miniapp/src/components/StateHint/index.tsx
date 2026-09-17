import { Text, View } from '@tarojs/components'

import { BASE_URL } from '@/config'

interface Props {
  loading: boolean
  error: string
  onRetry?: () => void
}

/** 加载中 / 连接失败提示。失败时明确提示，绝不使用虚构数据兜底 */
export default function StateHint({ loading, error, onRetry }: Props) {
  if (loading) {
    return (
      <View className='state-hint'>
        <Text>正在连接后台并读取数据...</Text>
      </View>
    )
  }

  if (error) {
    return (
      <View className='state-error' onClick={onRetry}>
        <Text className='state-error-title'>后台连接失败</Text>
        <Text>{error}</Text>
        <Text className='meta'>当前接口地址：{BASE_URL}（点击此处重试）</Text>
      </View>
    )
  }

  return null
}
