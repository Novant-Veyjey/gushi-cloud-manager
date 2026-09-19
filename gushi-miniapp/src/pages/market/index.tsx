import { useCallback, useState } from 'react'
import { Image, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'

import BrandBar from '@/components/BrandBar'
import EmptyState from '@/components/EmptyState'
import FormSheet from '@/components/FormSheet'
import SquareFrame from '@/components/SquareFrame'
import StateHint from '@/components/StateHint'
import { buildFormConfigs, type FormConfig } from '@/config/forms'
import { batchCodeOf, useCloudData } from '@/hooks/useCloudData'
import { FORM_MODULE, can, guard } from '@/utils/permission'
import { deleteRecord } from '@/utils/deleteRecord'
import { getUser } from '@/utils/storage'
import { api, assetUrl } from '@/utils/request'
import { dateOnly, money, readableTime, today } from '@/utils/format'
import type { Demand, Order, Product } from '@/types'

/**
 * 平台其他账号发布的供应信息：跨账号可见，但只读。
 * 修改 / 删除仍然只能作用于自己发布的记录（后端按 user_id 校验）。
 */
interface SharedProduct extends Product {
  owner_name?: string
  owner_username?: string
  base_name?: string
  batch_code?: string
}

/** 平台其他账号发布的有效采购需求（status 为 open / active），只读对接 */
interface SharedDemand extends Demand {
  owner_name?: string
  owner_username?: string
}

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

/**
 * 产品图标的正方形容器参数：订单卡片、我的供应信息、其他账号供应信息三处共用同一套配置，
 * 需要调整尺寸 / 底色 / 圆角 / 边框时只改这里即可。
 */
const ICON_FRAME_PROPS = {
  /** 占满卡片内容宽度：两端行为一致，任何屏幕都是「大图」效果 */
  size: '100%',
  /** 桌面浏览器上的上限，避免在超宽卡片里被无限放大 */
  maxSize: '320px',
  align: 'center' as const,
  /** 商品图底衬：自上而下的极浅绿渐变，比纯色更有质感 */
  background: 'linear-gradient(160deg, #f9fcf9 0%, #e8f4ec 100%)',
  /** 图片圆角：比卡片圆角略小，层次更清楚（两端都是 20 CSS px） */
  radius: '20px',
  /** emoji 占位图标的字号（两端一致） */
  fontSize: '120px'
}

/** 订单状态徽章配色：待付款/待发货=橙色提醒，待收货=绿色，已完成/已取消=灰色 */
const ORDER_BADGE: Record<string, string> = {
  created: ' warn',
  paid: ' warn',
  shipped: '',
  received: ' plain',
  cancelled: ' plain'
}

/** 订单可执行操作：按钮文案与二次确认提示 */
const ORDER_ACTIONS: Record<string, { label: string; confirm: string; success: string }> = {
  pay: { label: '立即支付', confirm: '演示环境不产生真实扣款，确认后订单进入「待发货」。', success: '支付成功' },
  ship: { label: '确认发货', confirm: '确认该订单已经安排发货？', success: '已标记发货' },
  receive: { label: '确认收货', confirm: '确认已经收到货物？确认后订单完成。', success: '订单已完成' },
  cancel: { label: '取消订单', confirm: '取消后预占的库存会回补给供应信息，确认取消？', success: '订单已取消' }
}

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
  const [sharedProducts, setSharedProducts] = useState<SharedProduct[]>([])
  const [sharedLoading, setSharedLoading] = useState(true)
  const [sharedDemands, setSharedDemands] = useState<SharedDemand[]>([])
  const [sharedDemandsLoading, setSharedDemandsLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  /** 订单分区：buyer=我采购的，seller=我收到的（作为供货方） */
  const [orderTab, setOrderTab] = useState<'buyer' | 'seller'>('buyer')
  /** 图片图标加载失败的记录：失败后回退到 emoji，避免图标区只剩一片空白 */
  const [brokenIcons, setBrokenIcons] = useState<Record<string, boolean>>({})

  /** 拉取平台其他账号上架的供应信息（只读，用于产销对接） */
  const loadShared = useCallback(async () => {
    try {
      const rows = await api<SharedProduct[]>('/api/products/shared')
      setSharedProducts(rows || [])
    } catch (err) {
      // 无权限或后台异常时保持空列表，绝不填充编造数据
      setSharedProducts([])
    } finally {
      setSharedLoading(false)
    }
  }, [])

  /** 拉取平台其他账号发布的有效采购需求（只读，用于产销对接） */
  const loadSharedDemands = useCallback(async () => {
    if (!can('demands', 'r')) {
      setSharedDemands([])
      setSharedDemandsLoading(false)
      return
    }
    try {
      const rows = await api<SharedDemand[]>('/api/demands/shared')
      setSharedDemands(rows || [])
    } catch (err) {
      // 无权限或后台异常时保持空列表，绝不填充编造数据
      setSharedDemands([])
    } finally {
      setSharedDemandsLoading(false)
    }
  }, [])

  /** 拉取与我相关的订单（我采购的 + 我作为供货方收到的） */
  const loadOrders = useCallback(async () => {
    if (!can('orders', 'r')) {
      setOrders([])
      setOrdersLoading(false)
      return
    }
    try {
      const rows = await api<Order[]>('/api/orders')
      setOrders(rows || [])
    } catch (err) {
      setOrders([])
    } finally {
      setOrdersLoading(false)
    }
  }, [])

  useDidShow(() => {
    loadShared()
    loadSharedDemands()
    loadOrders()
  })

  /**
   * 立即采购：把当前商品带进下单表单。
   * 标题与数量上限按这条供应信息的实际库存生成，避免用户填了超量再被后台拒绝。
   */
  const openPurchase = (item: Product | SharedProduct) => {
    if (!guard('orders', 'w')) return
    const config = forms.order
    if (!config) return
    const stock = Number(item.quantity || 0)
    const unit = item.unit || 'kg'
    if (!(stock > 0)) {
      Taro.showToast({ title: '该供应信息已售罄', icon: 'none' })
      return
    }
    setActiveForm({
      ...config,
      title: '确认采购',
      desc: `${item.name} · 可供应 ${stock} ${unit} · ¥${money(item.price)}/${unit}`,
      fields: config.fields.map((field) => {
        if (field.name === 'product_id') return { ...field, defaultValue: String(item.id) }
        if (field.name === 'quantity') return { ...field, defaultValue: '1', placeholder: `不能超过 ${stock} ${unit}` }
        return field
      })
    })
  }

  /** 订单操作：支付 / 发货 / 确认收货 / 取消（具体能不能做由后端按身份与状态判定） */
  const handleOrderAction = async (order: Order, action: 'pay' | 'ship' | 'receive' | 'cancel') => {
    if (!guard('orders', 'w')) return
    const meta = ORDER_ACTIONS[action]
    const confirm = await Taro.showModal({ title: meta.label, content: meta.confirm })
    if (!confirm.confirm) return
    try {
      await api(`/api/orders/${order.id}/${action}`, {
        method: 'POST',
        data: action === 'cancel' ? { reason: '' } : {},
        successText: meta.success
      })
      await Promise.all([loadOrders(), reload(true)])
    } catch (err) {
      Taro.showToast({ title: (err as Error).message, icon: 'none' })
    }
  }

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

  /** 订单按当前身份分区展示：我采购的 / 我作为供货方收到的 */
  const buyerOrders = orders.filter((item) => item.side === 'buyer')
  const sellerOrders = orders.filter((item) => item.side === 'seller')
  const visibleOrders = orderTab === 'buyer' ? buyerOrders : sellerOrders

  /**
   * 产品图标：emoji 直接渲染文本，图片地址渲染 Image。
   * 图片加载失败（文件被清理、域名不可达等）时回退到 emoji，
   * 否则图标区只会剩一片空白，看不出是「图标没换成」还是「图片取不到」。
   */
  const renderIcon = (icon: string, name: string) => {
    const url = assetUrl(icon)
    if (url && !brokenIcons[icon]) {
      return (
        <Image
          className='product-icon-img'
          src={url}
          mode='aspectFit'
          onError={() => setBrokenIcons((prev) => (prev[icon] ? prev : { ...prev, [icon]: true }))}
        />
      )
    }
    return <Text>{url ? '🍄' : icon || '🍄'}</Text>
  }

  return (
    <View className='page'>
      {/* 顶部「＋」= 发布供应，需要供应信息写权限；采购商没有该权限时不显示，避免点了才报错 */}
      <BrandBar
        title='产销对接'
        sub='真实供应与采购需求'
        onAdd={can('products', 'w') ? () => openForm('product') : undefined}
      />

      <View className='toolbar'>
        {can('products', 'w') ? (
          <View className='btn primary' onClick={() => openForm('product')}>
            ＋ 发布供应
          </View>
        ) : null}
        {can('demands', 'w') ? (
          <View
            className={`btn ${can('products', 'w') ? 'secondary' : 'primary'}`}
            onClick={() => {
              // 采购方名称默认带当前账号昵称（可在表单里改），减少重复填写
              const me = getUser()
              openForm('demand', { buyer_name: me?.display_name || me?.username || '' })
            }}
          >
            发布采购需求
          </View>
        ) : null}
      </View>

      {/* 我的订单：把「下单 → 支付 → 发货 → 收货」的闭环放在最上面，下单后立刻能看到状态与待办 */}
      {can('orders', 'r') ? (
        <View>
          <View className='section-title'>
            <View>
              <Text className='section-title-main'>我的订单</Text>
              <Text className='section-title-sub'>
                {can('orders', 'w')
                  ? '下单后可在这里完成支付、发货与确认收货，全流程留痕'
                  : '当前角色可查看订单，采购下单需要采购权限'}
              </Text>
            </View>
            <Text className='badge plain'>{orders.length} 单</Text>
          </View>

          <View className='seg-tabs' style='margin-bottom:16px'>
            <View className={`seg-tab${orderTab === 'buyer' ? ' active' : ''}`} onClick={() => setOrderTab('buyer')}>
              我采购的（{buyerOrders.length}）
            </View>
            <View className={`seg-tab${orderTab === 'seller' ? ' active' : ''}`} onClick={() => setOrderTab('seller')}>
              我收到的（{sellerOrders.length}）
            </View>
          </View>

          {ordersLoading ? (
            <Text className='meta'>正在加载订单...</Text>
          ) : visibleOrders.length ? (
            visibleOrders.map((order) => (
              <View className='card card-center product-card' key={order.id}>
                {/* 订单卡片同样居中：图标一行、商品名、状态徽标、订单信息依次居中 */}
                <SquareFrame {...ICON_FRAME_PROPS}>{renderIcon(order.product_icon, order.product_name)}</SquareFrame>
                <Text className='row-title card-center-title'>{order.product_name}</Text>
                <Text className={`badge card-center-badge${ORDER_BADGE[order.status] || ''}`}>{order.status_label}</Text>
                <Text className='row-desc card-center-desc'>
                  订单号：{order.order_no}
                  {'\n'}
                  {order.side === 'buyer'
                    ? `供货方：${order.seller_name || '其他账号'}`
                    : `采购方：${order.buyer_name || '其他账号'}`}
                  {order.base_name ? ` · ${order.base_name}` : ''}
                </Text>

                <View className='metric-line'>
                  <View className='metric-line-item'>
                    <Text className='metric-line-label'>数量</Text>
                    <Text className='metric-line-value'>
                      {order.quantity} {order.unit}
                    </Text>
                  </View>
                  <View className='metric-line-item'>
                    <Text className='metric-line-label'>单价</Text>
                    <Text className='metric-line-value'>¥{money(order.price)}</Text>
                  </View>
                  <View className='metric-line-item'>
                    <Text className='metric-line-label'>总额</Text>
                    <Text className='metric-line-value'>¥{money(order.amount)}</Text>
                  </View>
                </View>

                <Text className='meta'>
                  {order.pay_method_label}
                  {order.buyer_contact ? ` · 联系：${order.buyer_contact}` : ''}
                  {'\n'}收货地址：{order.address || '未填写'}
                  {order.remark ? `\n备注：${order.remark}` : ''}
                  {'\n'}下单时间：{readableTime(order.created_at)}
                </Text>

                {/* 操作按钮由后端按「当前身份 + 订单状态」下发，避免出现点了必然失败的按钮 */}
                {order.actions.pay || order.actions.ship || order.actions.receive || order.actions.cancel ? (
                  <View className='toolbar' style='margin-bottom:0'>
                    {order.actions.pay ? (
                      <View className='btn primary' onClick={() => handleOrderAction(order, 'pay')}>
                        {ORDER_ACTIONS.pay.label}
                      </View>
                    ) : null}
                    {order.actions.ship ? (
                      <View className='btn primary' onClick={() => handleOrderAction(order, 'ship')}>
                        {ORDER_ACTIONS.ship.label}
                      </View>
                    ) : null}
                    {order.actions.receive ? (
                      <View className='btn primary' onClick={() => handleOrderAction(order, 'receive')}>
                        {ORDER_ACTIONS.receive.label}
                      </View>
                    ) : null}
                    {order.actions.cancel ? (
                      <View className='btn secondary' onClick={() => handleOrderAction(order, 'cancel')}>
                        {ORDER_ACTIONS.cancel.label}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            <EmptyState
              title={orderTab === 'buyer' ? '暂无采购订单' : '暂无销售订单'}
              text={
                orderTab === 'buyer'
                  ? '在下方「其他供应商的供应信息」里点「立即采购」即可下单。'
                  : '别人采购你的供应信息后，订单会出现在这里。'
              }
            />
          )}
        </View>
      ) : null}

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
              <View className='card card-center product-card' key={product.id}>
                {/* 产品图标、名称、状态徽标与说明统一居中，与批次 / 基地卡片同一套对齐规则 */}
                <SquareFrame {...ICON_FRAME_PROPS}>{renderIcon(product.icon, product.name)}</SquareFrame>
                <Text className='row-title card-center-title'>{product.name}</Text>
                <Text className={`badge card-center-badge${productState(product).plain ? ' plain' : ''}`}>
                  {productState(product).label}
                </Text>
                <Text className='row-desc card-center-desc'>
                  批次：{batchCodeOf(data.batches, product.batch_id)}
                  {'\n'}
                  上架：{dateOnly(product.available_date) || '未设置'} · 下架：{dateOnly(product.off_shelf_date) || '未设置'}
                </Text>
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
                  <View>
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
                    <View className='row-actions'>
                      <Text
                        className='link-danger'
                        onClick={() =>
                          deleteRecord({
                            module: 'products',
                            resource: 'products',
                            id: product.id,
                            label: '供应信息',
                            onDone: () => reload(true)
                          })
                        }
                      >
                        删除下架
                      </Text>
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
              <View className='card card-center' key={demand.id}>
                {/* 采购方、价格徽标与需求说明居中，与供应信息卡片保持一致 */}
                <Text className='row-title card-center-title'>{demand.buyer_name}</Text>
                <Text className='badge card-center-badge'>¥{money(demand.price)}</Text>
                <Text className='row-desc card-center-desc'>
                  {demand.product_name} · {demand.quantity} {demand.unit}
                </Text>
                <Text className='meta'>
                  {demand.requirements || '暂无补充要求'}
                  {demand.contact ? ` · 联系方式：${demand.contact}` : ''}
                </Text>
                {/* 仅采购商、基地管理员与平台管理员可修改自己发布的采购需求 */}
                {can('demands', 'w') ? (
                  <View>
                    <View className='toolbar' style='margin-bottom:0'>
                      <View className='btn secondary' onClick={() => openForm('demandEdit', demandPreset(demand))}>
                        修改
                      </View>
                    </View>
                    <View className='row-actions'>
                      <Text
                        className='link-danger'
                        onClick={() =>
                          deleteRecord({
                            module: 'demands',
                            resource: 'demands',
                            id: demand.id,
                            label: '采购需求',
                            onDone: () => reload(true)
                          })
                        }
                      >
                        删除需求
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            <EmptyState title='暂无采购需求' text='点击发布采购需求，保存真实采购方和产品需求。' />
          )}

          {/* 平台其他账号发布的有效采购需求：互通可见、只读查看（没有修改/删除入口） */}
          <View className='section-title'>
            <View>
              <Text className='section-title-main'>其他采购需求</Text>
              <Text className='section-title-sub'>来自平台其他账号的有效需求，只读查看，便于对接供货</Text>
            </View>
            <Text className='badge plain'>只读</Text>
          </View>

          {sharedDemandsLoading ? (
            <Text className='meta'>正在加载其他采购需求...</Text>
          ) : sharedDemands.length ? (
            sharedDemands.map((item) => (
              <View className='card card-center' key={item.id}>
                {/* 只读的其他账号需求，同样居中显示 */}
                <Text className='row-title card-center-title'>{item.product_name}</Text>
                <Text className='badge plain card-center-badge'>其他账号</Text>
                <Text className='row-desc card-center-desc'>
                  发布者：{item.owner_name || item.owner_username || '其他账号'}
                  {'\n'}
                  {item.quantity} {item.unit} · 期望 ¥{money(item.price)}/{item.unit}
                </Text>
                <Text className='meta'>
                  采购方：{item.buyer_name || '未填写'}
                  {item.requirements ? ` · 要求：${item.requirements}` : ''}
                  {item.contact ? `\n联系方式：${item.contact}` : ''}
                </Text>
              </View>
            ))
          ) : (
            <EmptyState title='暂无其他采购需求' text='其他账号发布采购需求后会自动出现在这里，方便产销对接。' />
          )}

          {/* 平台其他账号上架的供应信息：互通可见、只读查看（没有修改/删除入口） */}
          <View className='section-title'>
            <View>
              <Text className='section-title-main'>其他供应商的供应信息</Text>
              <Text className='section-title-sub'>来自平台其他账号，只读查看，便于对接采购</Text>
            </View>
            <Text className='badge plain'>只读</Text>
          </View>

          {sharedLoading ? (
            <Text className='meta'>正在加载其他账号的供应信息...</Text>
          ) : sharedProducts.length ? (
            sharedProducts.map((item) => (
              <View className='card card-center product-card' key={item.id}>
                {/* 只读的其他账号供应信息，与自建供应卡片同一套居中规则 */}
                <SquareFrame {...ICON_FRAME_PROPS}>{renderIcon(item.icon, item.name)}</SquareFrame>
                <Text className='row-title card-center-title'>{item.name}</Text>
                <Text className='badge plain card-center-badge'>其他账号</Text>
                <Text className='row-desc card-center-desc'>
                  发布者：{item.owner_name || item.owner_username || '其他账号'}
                  {item.base_name ? ` · ${item.base_name}` : ''}
                  {'\n'}
                  批次：{item.batch_code || batchCodeOf(data.batches, item.batch_id)} · 上架：
                  {dateOnly(item.available_date) || '未设置'} · 下架：{dateOnly(item.off_shelf_date) || '未设置'}
                </Text>
                <View className='metric-line'>
                  <View className='metric-line-item'>
                    <Text className='metric-line-label'>数量</Text>
                    <Text className='metric-line-value'>
                      {item.quantity} {item.unit}
                    </Text>
                  </View>
                  <View className='metric-line-item'>
                    <Text className='metric-line-label'>价格</Text>
                    <Text className='metric-line-value'>¥{money(item.price)}</Text>
                  </View>
                  <View className='metric-line-item'>
                    <Text className='metric-line-label'>单位</Text>
                    <Text className='metric-line-value'>{item.unit}</Text>
                  </View>
                </View>
                <Text className='meta'>{item.description || '暂无说明'}</Text>
                {/* 有采购权限的账号可以直接下单，走完整交易流程（不能采购自己发布的，后端会拦截） */}
                {can('orders', 'w') ? (
                  <View className='toolbar' style='margin-bottom:0'>
                    <View className='btn primary' onClick={() => openPurchase(item)}>
                      立即采购
                    </View>
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            <EmptyState
              title='暂无其他供应商的供应信息'
              text='其他账号发布供应信息后会自动出现在这里，方便产销对接。'
            />
          )}
        </View>
      )}

      <FormSheet
        visible={!!activeForm}
        config={activeForm}
        onClose={() => setActiveForm(null)}
        onSaved={async () => {
          // 下单/发布/更换图标后同时刷新业务数据、我的订单与两个共享列表，库存和图标立刻同步
          await Promise.all([loadOrders(), loadShared(), loadSharedDemands(), reload(true)])
        }}
      />
    </View>
  )
}
