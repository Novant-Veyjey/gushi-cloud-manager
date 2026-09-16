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
import { dateOnly, money, today } from '@/utils/format'
import type { Demand, Product } from '@/types'

/** 供应信息状态：按「上架日期 / 下架日期」与当天日期自动判定 */
const productState = (product: Product): { label: string; plain: boolean } => {
  const now = today()
  const start = dateOnly(product.available_date)
  const end = dateOnly(product.off_shelf_date)
  if (end && now > end) return { label: '已下架', plain: true }
  if (start && now < start) return { label: '未上架', plain: true }
  return { label: '可供应', plain: false }
}

/** 修改供应信息时，把原记录转成表单默认值（空值用空串，避免显示 undefined） */
const productPreset = (product: Product): Record<string, string> => ({
  id: String(product.id),
  batch_id: product.batch_id === null || product.batch_id === undefined ? '' : String(product.batch_id),
  name: product.name || '',
  icon: product.icon || '🍄',
  quantity: product.quantity === null || product.quantity === undefined ? '' : String(product.quantity),
  unit: product.unit || 'kg',
  price: product.price === null || product.price === undefined ? '' : String(product.price),
  available_date: dateOnly(product.available_date),
  off_shelf_date: dateOnly(product.off_shelf_date),
  description: product.description || ''
})

/** 修改采购需求时，把原记录转成表单默认值 */
const demandPreset = (demand: Demand): Record<string, string> => ({
  id: String(demand.id),
  buyer_name: demand.buyer_name || '',
  product_name: demand.product_name || '',
  quantity: demand.quantity === null || demand.quantity === undefined ? '' : String(demand.quantity),
  unit: demand.unit || 'kg',
  price: demand.price === null || demand.price === undefined ? '' : String(demand.price),
  contact: demand.contact || '',
  requirements: demand.requirements || ''
})

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
                        上架：{dateOnly(product.available_date) || '未设置'} · 下架：{dateOnly(product.off_shelf_date) || '未设置'}
                      </Text>
                    </View>
                  </View>
                  <Text className={`badge${productState(product).plain ? ' plain' : ''}`}>
                    {productState(product).label}
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
                {/* 仅基地管理员与平台管理员可修改自己发布的供应（后端同样校验 products 写权限） */}
                {can('products', 'w') ? (
                  <View className='toolbar' style='margin-bottom:0'>
                    <View className='btn secondary' onClick={() => openForm('productEdit', productPreset(product))}>
                      修改
                    </View>
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
                {/* 仅采购商、基地管理员与平台管理员可修改自己发布的采购需求 */}
                {can('demands', 'w') ? (
                  <View className='toolbar' style='margin-bottom:0'>
                    <View className='btn secondary' onClick={() => openForm('demandEdit', demandPreset(demand))}>
                      修改
                    </View>
                  </View>
                ) : null}
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
