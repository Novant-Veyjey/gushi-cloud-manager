import { useState } from 'react'
import { Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import BrandBar from '@/components/BrandBar'
import EmptyState from '@/components/EmptyState'
import FormSheet from '@/components/FormSheet'
import StateHint from '@/components/StateHint'
import { buildFormConfigs, type FormConfig } from '@/config/forms'
import { batchCodeOf, useCloudData } from '@/hooks/useCloudData'
import { FORM_MODULE, can, guard } from '@/utils/permission'
import { assetUrl } from '@/utils/request'
import { dateOnly, money } from '@/utils/format'

export default function Market() {
  const { data, loading, error, reload } = useCloudData()
  const forms = buildFormConfigs(data)

  const [activeForm, setActiveForm] = useState<FormConfig | null>(null)

  const openForm = (key: string, preset?: Record<string, string>) => {
    const config = forms[key]
    if (!config) return
    if (!guard(FORM_MODULE[key] || 'products', 'w')) return
    if (key === 'product' && !data.batches.length) {
      Taro.showToast({ title: '请先新增生产批次', icon: 'none' })
      return
    }
    setActiveForm(
      preset
        ? { ...config, fields: config.fields.map((field) => (preset[field.name] !== undefined ? { ...field, defaultValue: preset[field.name] } : field)) }
        : config
    )
  }

  const renderIcon = (icon: string, name: string) => {
    const url = assetUrl(icon)
    if (url) {
      return <Image className='product-icon-img' src={url} mode='aspectFill' />
    }
    return <Text>{icon || '🍄'}</Text>
  }

  return (
    <View className='page'>
      <BrandBar title='产销对接' sub='真实供应与采购需求' onAdd={() => openForm('product')} />

      <View className='toolbar'>
        <View className='btn primary' onClick={() => openForm('product')}>
          ＋ 发布供应
        </View>
        <View className='btn secondary' onClick={() => openForm('demand')}>
          发布采购需求
        </View>
      </View>

      {loading || error ? (
        <StateHint loading={loading} error={error} onRetry={reload} />
      ) : (
        <View>
          <View className='section-title'>
            <View>
              <Text className='section-title-main'>供应信息</Text>
              <Text className='section-title-sub'>只展示后台已保存的真实供应数据</Text>
            </View>
          </View>

          {data.products.length ? (
            data.products.map((product) => (
              <View className='card' key={product.id}>
                <View className='row-top'>
                  <View className='product-row'>
                    <View className='product-icon'>{renderIcon(product.icon, product.name)}</View>
                    <View>
                      <Text className='row-title'>{product.name}</Text>
                      <Text className='row-desc'>
                        批次：{batchCodeOf(data.batches, product.batch_id)}
                        {'\n'}
                        可售日期：{dateOnly(product.available_date) || '未设置'}
                      </Text>
                    </View>
                  </View>
                  <Text className={`badge${product.status === 'available' ? '' : ' plain'}`}>
                    {product.status === 'available' ? '可供应' : '已下架'}
                  </Text>
                </View>
                <View className='metric-line'>
                  <View className='metric-line-item'>
                    <Text className='metric-line-label'>数量</Text>
                    <Text className='metric-line-value'>
                      {product.quantity} {product.unit}
                    </Text>
                  </View>
                  <View className='metric-line-item'>
                    <Text className='metric-line-label'>价格</Text>
                    <Text className='metric-line-value'>¥{money(product.price)}</Text>
                  </View>
                  <View className='metric-line-item'>
                    <Text className='metric-line-label'>单位</Text>
                    <Text className='metric-line-value'>{product.unit}</Text>
                  </View>
                </View>
                <Text className='meta'>{product.description || '暂无说明'}</Text>
                {/* 仅基地管理员与平台管理员可修改保存产品图标（后端同样校验 products 写权限） */}
                {can('products', 'w') ? (
                  <View className='toolbar' style='margin-bottom:0'>
                    <View
                      className='btn secondary'
                      onClick={() => openForm('icon', { id: String(product.id), icon: product.icon || '🍄' })}
                    >
                      更换产品图标
                    </View>
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            <EmptyState title='暂无供应信息' text='点击发布供应，保存真实产品、数量、价格和批次。' />
          )}

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>采购需求</Text>
              <Text className='section-title-sub'>采购商通过表单录入并保存到数据库</Text>
            </View>
          </View>

          {data.demands.length ? (
            data.demands.map((demand) => (
              <View className='card' key={demand.id}>
                <View className='row-top'>
                  <View>
                    <Text className='row-title'>{demand.buyer_name}</Text>
                    <Text className='row-desc'>
                      {demand.product_name} · {demand.quantity} {demand.unit}
                    </Text>
                  </View>
                  <Text className='badge'>¥{money(demand.price)}</Text>
                </View>
                <Text className='meta'>
                  {demand.requirements || '暂无补充要求'}
                  {demand.contact ? ` · 联系方式：${demand.contact}` : ''}
                </Text>
              </View>
            ))
          ) : (
            <EmptyState title='暂无采购需求' text='点击发布采购需求，保存真实采购方和产品需求。' />
          )}
        </View>
      )}

      <FormSheet visible={!!activeForm} config={activeForm} onClose={() => setActiveForm(null)} onSaved={reload} />
    </View>
  )
}
