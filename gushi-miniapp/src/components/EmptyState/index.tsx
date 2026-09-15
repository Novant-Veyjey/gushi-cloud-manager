import { Text, View } from '@tarojs/components'

interface Props {
  title?: string
  text?: string
}

/** 空状态：后台没有真实记录时统一展示 */
export default function EmptyState({ title = '暂无真实数据', text = '请点击页面右上角“＋”录入。系统不会自动生成业务数据。' }: Props) {
  return (
    <View className='empty'>
      <Text className='empty-title'>{title}</Text>
      <Text>{text}</Text>
    </View>
  )
}
