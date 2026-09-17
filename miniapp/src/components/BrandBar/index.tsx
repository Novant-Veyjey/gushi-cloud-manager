import { Image, Text, View } from '@tarojs/components'

import logo from '@/assets/logo.jpg'

interface Props {
  title: string
  sub?: string
  onAdd?: () => void
}

/** 顶部品牌栏：品牌图标 + 页面标题 + 新增数据按钮 */
export default function BrandBar({ title, sub, onAdd }: Props) {
  return (
    <View className='brand-bar'>
      <View className='brand-left'>
        <Image className='brand-logo' src={logo} mode='aspectFit' />
        <View>
          <Text className='brand-title'>{title}</Text>
          {sub ? <Text className='brand-sub'>{sub}</Text> : null}
        </View>
      </View>
      {onAdd ? (
        <View className='brand-add' onClick={onAdd}>
          <Text>＋</Text>
        </View>
      ) : null}
    </View>
  )
}
