import { useState } from 'react'
import { Input, Picker, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import BrandBar from '@/components/BrandBar'
import EmptyState from '@/components/EmptyState'
import FormSheet from '@/components/FormSheet'
import StateHint from '@/components/StateHint'
import { buildFormConfigs, RECORD_MENU, type FormConfig } from '@/config/forms'
import { baseNameOf, useCloudData } from '@/hooks/useCloudData'
import { logout, ROLE_OPTIONS, roleLabel } from '@/utils/auth'
import { FORM_MODULE, can, guard } from '@/utils/permission'
import { getUser, saveAuth } from '@/utils/storage'
import { api } from '@/utils/request'
import { dateOnly, readableTime } from '@/utils/format'
import type { AuthSession, AuthUser } from '@/types'

/** 角色列表复用 utils/auth 的 ROLE_OPTIONS（与后台 server/auth.js 的 ROLES 保持一致） */

export default function Home() {
  const { data, loading, error, reload } = useCloudData()
  const forms = buildFormConfigs(data)

  const [activeForm, setActiveForm] = useState<FormConfig | null>(null)
  const [menuVisible, setMenuVisible] = useState(false)
  const [userSheet, setUserSheet] = useState(false)
  const [users, setUsers] = useState<any[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [adminSheet, setAdminSheet] = useState(false)
  const [adminUser, setAdminUser] = useState('')
  const [adminPwd, setAdminPwd] = useState('')
  const [adminSubmitting, setAdminSubmitting] = useState(false)
  const [assignUser, setAssignUser] = useState('')
  const [assignResults, setAssignResults] = useState<any[]>([])
  const [assignTarget, setAssignTarget] = useState<any>(null)
  const [assignRoleIndex, setAssignRoleIndex] = useState(0)
  const [assigning, setAssigning] = useState(false)
  const [resetFor, setResetFor] = useState(0)
  const [resetPwd, setResetPwd] = useState('')
  const [permSheet, setPermSheet] = useState(false)

  const openForm = (key: string) => {
    const config = forms[key]
    if (!config) return

    // 角色权限：无写权限时直接提示，后端还会再校验一次
    if (!guard(FORM_MODULE[key] || 'bases', 'w')) return

    // 与后台外键约束保持一致：缺少前置数据时给出明确提示，而不是保存一条无效记录
    if (['batch', 'reading'].includes(key) && !data.bases.length) {
      Taro.showToast({ title: '请先新增基地', icon: 'none' })
      return
    }
    if (['trace-event', 'product'].includes(key) && !data.batches.length) {
      Taro.showToast({ title: '请先新增生产批次', icon: 'none' })
      return
    }

    setMenuVisible(false)
    setActiveForm(config)
  }

  const account: AuthUser | null = data.dashboard.user || getUser()

  const handleLogout = async () => {
    const confirm = await Taro.showModal({ title: '退出登录', content: '退出后需要重新登录才能查看本账号数据。' })
    if (!confirm.confirm) return
    await logout()
    Taro.reLaunch({ url: '/pages/login/index' })
  }

  /** 平台管理员：打开账号管理弹层，加载全部注册账号 */
  const openUserSheet = async () => {
    if (!guard('users', 'w')) return
    setUserSheet(true)
    setUsersLoading(true)
    try {
      const list = await api<any[]>('/api/admin/users')
      setUsers(list || [])
    } catch (err) {
      Taro.showToast({ title: (err as Error).message, icon: 'none' })
      setUserSheet(false)
    } finally {
      setUsersLoading(false)
    }
  }

  /** 平台管理员：给账号分配职务，保存后对方重新登录生效 */
  const assignRole = async (target: any, role: { value: string; label: string }) => {
    if (target.role === role.value) return
    const confirm = await Taro.showModal({
      title: '分配职务',
      content: `把账号「${target.username}」设为「${role.label}」？`
    })
    if (!confirm.confirm) return
    try {
      await api(`/api/admin/users/${target.id}/role`, {
        method: 'PUT',
        data: { role: role.value },
        successText: '职务已更新'
      })
      setUsers((prev) => prev.map((item) => (item.id === target.id ? { ...item, role: role.value } : item)))
      await reload()
    } catch (err) {
      Taro.showToast({ title: (err as Error).message, icon: 'none' })
    }
  }

  /**
   * 搜索账号：管理员输入账号关键字，从全部账号里筛选出匹配结果，点选后直接修改职位。
   * 管理员操作不需要对方密码。
   */
  const handleSearchUser = async () => {
    const keyword = assignUser.trim()
    if (!keyword) {
      Taro.showToast({ title: '请输入要搜索的账号', icon: 'none' })
      return
    }
    try {
      const list = await api<any[]>('/api/admin/users')
      const matched = (list || []).filter(
        (item) => item.username.includes(keyword) || (item.display_name || '').includes(keyword)
      )
      setAssignResults(matched)
      setAssignTarget(null)
      if (!matched.length) Taro.showToast({ title: '没有找到匹配的账号', icon: 'none' })
    } catch (err) {
      Taro.showToast({ title: (err as Error).message, icon: 'none' })
    }
  }

  /** 点选搜索结果中的账号作为分配目标 */
  const pickAssignTarget = (target: any) => {
    setAssignTarget(target)
    setAssignResults((prev) => prev.map((item) => ({ ...item, _picked: item.id === target.id })))
  }

  /** 确认分配：把选中的账号改为点选的职位（管理员无需对方密码） */
  const handleAssignByRole = async () => {
    if (assigning) return
    if (!assignTarget) {
      Taro.showToast({ title: '请先搜索并点选要修改的账号', icon: 'none' })
      return
    }
    setAssigning(true)
    try {
      await api(`/api/admin/users/${assignTarget.id}/role`, {
        method: 'PUT',
        data: { role: ROLE_OPTIONS[assignRoleIndex].value },
        successText: '角色已更新，对方重新登录后生效'
      })
      setAssignTarget(null)
      setAssignUser('')
      setAssignResults([])
      const list = await api<any[]>('/api/admin/users')
      setUsers(list || [])
      await reload()
    } catch (err) {
      Taro.showToast({ title: (err as Error).message, icon: 'none' })
    } finally {
      setAssigning(false)
    }
  }

  /** 管理员重置用户密码：密码加密保存无法查看，忘记密码时直接设置一个新密码 */
  const handleResetPassword = async (target: any) => {
    if (resetPwd.length < 6) {
      Taro.showToast({ title: '新密码至少 6 位', icon: 'none' })
      return
    }
    const confirmed = await Taro.showModal({
      title: '重置密码',
      content: `确定重置「${target.username}」的登录密码吗？重置后原密码立即失效，请把新密码告知对方。`
    })
    if (!confirmed.confirm) return
    try {
      await api(`/api/admin/users/${target.id}/password`, {
        method: 'PUT',
        data: { password: resetPwd },
        successText: '密码已重置，请把新密码告知对方'
      })
      setResetFor(0)
      setResetPwd('')
    } catch (err) {
      Taro.showToast({ title: (err as Error).message, icon: 'none' })
    }
  }

  /**
   * 管理员登录：输入管理员账号密码，验证通过后切换为管理员身份并直接打开账号管理。
   * 非管理员账号验证通过也不切换登录，当前登录状态不受影响。
   */
  const handleAdminLogin = async () => {
    if (adminSubmitting) return
    const name = adminUser.trim()
    if (!name || !adminPwd) {
      Taro.showToast({ title: '请填写管理员账号和密码', icon: 'none' })
      return
    }
    setAdminSubmitting(true)
    try {
      const session = await api<AuthSession>('/api/auth/login', { method: 'POST', data: { username: name, password: adminPwd } })
      if (session.user.role !== 'admin') {
        Taro.showToast({ title: `该账号是「${session.user.role_label || roleLabel(session.user.role)}」，不是平台管理员`, icon: 'none' })
        return
      }
      saveAuth(session.token, session.user)
      setAdminSheet(false)
      setAdminPwd('')
      Taro.showToast({ title: '已切换为管理员账号', icon: 'success' })
      await reload()
      await openUserSheet()
    } catch (err) {
      Taro.showToast({ title: (err as Error).message, icon: 'none' })
    } finally {
      setAdminSubmitting(false)
    }
  }

  const handleAck = async (id: number) => {
    if (!guard('alerts', 'w')) return
    try {
      await api(`/api/alerts/${id}/ack`, { method: 'POST', data: {} })
      Taro.showToast({ title: '预警已处理', icon: 'success' })
      await reload()
    } catch (err) {
      Taro.showToast({ title: (err as Error).message, icon: 'none' })
    }
  }

  const dashboard = data.dashboard
  const latestReadings = (dashboard.latestReadings || []).slice(0, 4)
  const openAlerts = (dashboard.alerts || []).slice(0, 4)
  const tasks = data.tasks.slice(0, 4)

  return (
    <View className='page'>
      <BrandBar title='菇事云管家' sub='真实业务数据管理' onAdd={() => setMenuVisible(true)} />

      {loading || error ? (
        <StateHint loading={loading} error={error} onRetry={reload} />
      ) : (
        <View>
          <View className='hero'>
            <Text className='hero-small'>GU SHI CLOUD · 真实数据可保存</Text>
            <Text className='hero-title'>
              生产有记录{'\n'}数据能追溯，后台能保存
            </Text>
            <Text className='hero-desc'>所有数字均来自后台数据库。没有录入数据时显示空状态，不编造业务数据。</Text>
            <View className='hero-tags'>
              <Text className='hero-tag'>基地</Text>
              <Text className='hero-tag'>批次</Text>
              <Text className='hero-tag'>监测</Text>
              <Text className='hero-tag'>溯源</Text>
            </View>
          </View>

          <View className='quick'>
            <View className='quick-item' onClick={() => openForm('base')}>
              <Text className='quick-icon'>＋</Text>
              <Text className='quick-label'>新增基地</Text>
            </View>
            <View className='quick-item' onClick={() => openForm('batch')}>
              <Text className='quick-icon'>▤</Text>
              <Text className='quick-label'>新增批次</Text>
            </View>
            <View className='quick-item' onClick={() => openForm('device')}>
              <Text className='quick-icon'>📡</Text>
              <Text className='quick-label'>大棚设备</Text>
            </View>
            <View className='quick-item' onClick={() => Taro.navigateTo({ url: '/pages/expert/index' })}>
              <Text className='quick-icon'>🤖</Text>
              <Text className='quick-label'>AI 问答</Text>
            </View>
          </View>

          {/* 账号管理入口永远显示：管理员直接打开分配；
              其他角色点击后先输入管理员账号密码，验证通过自动进入分配界面 */}
          <View className='toolbar' style='margin-top:20px'>
            <View
              className='btn secondary'
              onClick={() => (can('users', 'w') ? openUserSheet() : setAdminSheet(true))}
            >
              账号管理 · 分配职务
            </View>
            <View className='btn secondary' onClick={() => setPermSheet(true)}>
              角色权限说明
            </View>
          </View>

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>今日数据</Text>
              <Text className='section-title-sub'>来自后台数据库的实时汇总</Text>
            </View>
          </View>
          <View className='stats'>
            <View className='stat'>
              <Text className='stat-label'>生产基地</Text>
              <Text className='stat-value'>
                {dashboard.bases}
                <Text className='stat-unit'>处</Text>
              </Text>
              <Text className='stat-foot'>已保存基地</Text>
            </View>
            <View className='stat'>
              <Text className='stat-label'>生产批次</Text>
              <Text className='stat-value'>
                {dashboard.batches}
                <Text className='stat-unit'>批</Text>
              </Text>
              <Text className='stat-foot'>已保存批次</Text>
            </View>
            <View className='stat'>
              <Text className='stat-label'>监测设备</Text>
              <Text className='stat-value'>
                {dashboard.devices}
                <Text className='stat-unit'>台</Text>
              </Text>
              <Text className='stat-foot'>
                在线 {dashboard.devicesOnline ?? 0} 台 · 自动上报 {dashboard.deviceReadings ?? 0} 条
              </Text>
            </View>
            <View className='stat'>
              <Text className='stat-label'>待处理预警</Text>
              <Text className='stat-value'>
                {dashboard.openAlerts}
                <Text className='stat-unit'>条</Text>
              </Text>
              <Text className='stat-foot'>自动规则生成</Text>
            </View>
          </View>

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>最新环境记录</Text>
              <Text className='section-title-sub'>大棚设备自动上报，异常时自动预警</Text>
            </View>
            <Text className='section-title-action' onClick={() => openForm('reading')}>
              手动补录
            </Text>
          </View>
          <View className='card'>
            {latestReadings.length ? (
              latestReadings.map((reading) => (
                <View className='todo-row' key={reading.id}>
                  <View className='todo-icon green'>
                    <Text>🌡</Text>
                  </View>
                  <View className='todo-copy'>
                    <Text className='todo-title'>{reading.base_name || baseNameOf(data.bases, reading.base_id)}</Text>
                    <Text className='todo-desc'>
                      {reading.device_name || '未命名设备'} · {reading.temperature ?? '--'}℃ · 湿度 {reading.humidity ?? '--'}% · CO₂{' '}
                      {reading.co2 ?? '--'}ppm · {reading.source === 'device' ? '硬件自动' : '手动补录'}
                    </Text>
                  </View>
                  <Text className='todo-action'>{dateOnly(reading.recorded_at)}</Text>
                </View>
              ))
            ) : (
              <EmptyState title='暂无环境记录' text='请先新增基地，再录入环境数据。' />
            )}
          </View>

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>待处理预警</Text>
              <Text className='section-title-sub'>环境数据保存后自动按阈值生成</Text>
            </View>
            <Text className='section-title-action' onClick={() => Taro.switchTab({ url: '/pages/monitor/index' })}>
              全部
            </Text>
          </View>
          <View className='card'>
            {openAlerts.length ? (
              openAlerts.map((alert) => (
                <View className='todo-row' key={alert.id}>
                  <View className={`todo-icon${alert.level === 'high' ? ' red' : ''}`}>
                    <Text>!</Text>
                  </View>
                  <View className='todo-copy'>
                    <Text className='todo-title'>{alert.message}</Text>
                    <Text className='todo-desc'>
                      {alert.base_name || baseNameOf(data.bases, alert.base_id)} · {alert.alert_type} · {readableTime(alert.created_at)}
                    </Text>
                  </View>
                  <Text className='todo-action' onClick={() => handleAck(alert.id)}>
                    处理
                  </Text>
                </View>
              ))
            ) : (
              <EmptyState title='暂无待处理预警' text='录入环境数据后，超过阈值的记录会自动生成预警。' />
            )}
          </View>

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>生产任务</Text>
              <Text className='section-title-sub'>任务建议由规则引擎或 AI 生成</Text>
            </View>
            <Text className='section-title-action' onClick={() => openForm('task')}>
              新增任务
            </Text>
          </View>
          <View className='card'>
            {tasks.length ? (
              tasks.map((task) => (
                <View className='todo-row' key={task.id}>
                  <View className={`todo-icon${task.priority === 'high' ? ' red' : ''}`}>
                    <Text>{task.priority === 'high' ? '!' : '✓'}</Text>
                  </View>
                  <View className='todo-copy'>
                    <Text className='todo-title'>{task.title}</Text>
                    <Text className='todo-desc'>
                      {task.description || '无补充说明'} · 截止 {dateOnly(task.due_date) || '未设置'}
                    </Text>
                  </View>
                  <Text className='todo-action'>{task.priority}</Text>
                </View>
              ))
            ) : (
              <EmptyState title='暂无生产任务' text='点击新增任务，可先调用优先级建议接口。' />
            )}
          </View>

          <View className='section-title'>
            <View>
              <Text className='section-title-main'>当前账号</Text>
              <Text className='section-title-sub'>数据按账号隔离，保存在后台数据库</Text>
            </View>
          </View>
          <View className='card'>
            <View className='row-top'>
              <View>
                <Text className='row-title'>{account?.display_name || account?.username || '未登录'}</Text>
                <Text className='row-desc'>
                  账号：{account?.username || '--'} · 角色：{account?.role_label || roleLabel(account?.role)}
                  {'\n'}
                  本账号已保存基地 {dashboard.bases} 处、批次 {dashboard.batches} 批，记录仅本账号可见
                </Text>
              </View>
              <Text className='badge'>数据独立保存</Text>
            </View>
            <View className='toolbar' style='margin-bottom:0'>
              <View className='btn secondary' onClick={handleLogout}>
                退出登录
              </View>
            </View>
          </View>
        </View>
      )}

      <FormSheet visible={!!activeForm} config={activeForm} onClose={() => setActiveForm(null)} onSaved={reload} />

      {menuVisible ? (
        <View className='sheet-mask' onClick={() => setMenuVisible(false)}>
          <View className='sheet' onClick={(event) => event.stopPropagation()}>
            <Text className='sheet-title'>新增数据</Text>
            <Text className='sheet-desc'>选择要保存到后台数据库的记录类型</Text>
            {/* 菜单项与底部「取消」都放进滚动区，滑到底一定能看到按钮 */}
            <ScrollView className='sheet-body' scrollY>
              {RECORD_MENU.filter((item) => can(FORM_MODULE[item.key], 'w')).map((item) => (
                <View className='sheet-menu-item' key={item.key} onClick={() => openForm(item.key)}>
                  {item.label}
                </View>
              ))}
              {RECORD_MENU.some((item) => !can(FORM_MODULE[item.key], 'w')) ? (
                <View className='notice'>部分数据类型当前角色没有录入权限，已自动隐藏。</View>
              ) : null}
              <View className='sheet-actions'>
                <View className='btn secondary' onClick={() => setMenuVisible(false)}>
                  取消
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      ) : null}

      {userSheet ? (
        <View className='sheet-mask' onClick={() => setUserSheet(false)}>
          <View className='sheet' onClick={(event) => event.stopPropagation()}>
            <Text className='sheet-title'>账号管理 · 分配职务</Text>
            <Text className='sheet-desc'>搜索账号并点选，再点一个职位即可直接修改，无需对方密码；修改后对方重新登录生效。</Text>
            <View className='notice' style='margin-top:14px'>
              密码是加密保存的，任何人都看不到原密码；用户忘记密码时，点其账号下方的「重置密码」设置一个新密码即可。
            </View>
            <ScrollView className='sheet-body' scrollY>
              {/* 搜索账号：管理员输入关键字，点选结果后直接改职位 */}
              <View className='field' style='margin-top:20px'>
                <Text className='field-label'>搜索账号</Text>
                <Input
                  className='field-input'
                  value={assignUser}
                  placeholder='输入账号关键字，例如：wang'
                  onInput={(event) => setAssignUser(event.detail.value)}
                />
              </View>
              <View className='btn secondary full' style='margin-top:2px' onClick={handleSearchUser}>
                搜索账号
              </View>
              {assignResults.length ? (
                <View className='card' style='padding:6px 14px;margin-top:14px'>
                  {assignResults.map((item) => (
                    <View
                      key={item.id}
                      className='todo-row'
                      style={item._picked ? 'background:#f2f9f4;border-radius:12px;padding:12px 10px' : ''}
                      onClick={() => pickAssignTarget(item)}
                    >
                      <View className='todo-icon green'>{item._picked ? '✓' : '○'}</View>
                      <View className='todo-copy'>
                        <Text className='todo-title'>
                          {item.username}
                          {item.id === account?.id ? '（我）' : ''}
                        </Text>
                        <Text className='todo-desc'>
                          {item.display_name || '未填称呼'} · 当前：{item.role_label || roleLabel(item.role)}
                        </Text>
                      </View>
                      <Text className='todo-action'>{item._picked ? '已选择' : '选择'}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {assignTarget ? (
                <View className='notice success'>
                  已选择：{assignTarget.username}（当前：{assignTarget.role_label || roleLabel(assignTarget.role)}），请在下方点选新职位。
                </View>
              ) : (
                <View className='notice'>先搜索并点选一个账号，再在下方点选新职位。</View>
              )}
              <View className='field' style='margin-top:14px'>
                <Text className='field-label'>分配职务（点选其中一个）</Text>
                <View className='role-options'>
                  {ROLE_OPTIONS.map((item, index) => (
                    <View
                      key={item.value}
                      className={`role-option${assignRoleIndex === index ? ' active' : ''}`}
                      onClick={() => setAssignRoleIndex(index)}
                    >
                      <Text>{item.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View className='btn primary' onClick={handleAssignByRole}>
                {assigning ? '分配中...' : '确认分配'}
              </View>
              <View className='section-title'>
                <View>
                  <Text className='section-title-main'>全部账号</Text>
                  <Text className='section-title-sub'>也可以在列表里直接点「分配职务」</Text>
                </View>
              </View>
              {usersLoading ? (
                <Text className='user-sub'>加载中...</Text>
              ) : (
                users.map((user) => (
                  <View key={user.id} style='border-bottom:1px solid #eef2ef;padding-bottom:12px;margin-bottom:12px'>
                    <View className='user-row' style='border-bottom:0;padding-bottom:0;margin-bottom:0'>
                      <View className='user-info'>
                        <Text className='user-name'>
                          {user.username}
                          {user.id === account?.id ? '（我）' : ''}
                        </Text>
                        <Text className='user-sub'>
                          {user.display_name || '未填称呼'} · 当前：{user.role_label || roleLabel(user.role)}
                        </Text>
                      </View>
                      <Picker
                        mode='selector'
                        range={ROLE_OPTIONS.map((item) => item.label)}
                        onChange={(event) => assignRole(user, ROLE_OPTIONS[Number(event.detail.value)])}
                      >
                        <View className='user-role-picker'>分配职务</View>
                      </Picker>
                    </View>
                    {resetFor === user.id ? (
                      <View>
                        <Input
                          className='field-input'
                          password
                          value={resetPwd}
                          placeholder='新密码（至少 6 位）'
                          onInput={(event) => setResetPwd(event.detail.value)}
                        />
                        <View className='toolbar' style='margin-top:10px'>
                          <View className='btn secondary' onClick={() => { setResetFor(0); setResetPwd('') }}>
                            取消
                          </View>
                          <View className='btn primary' onClick={() => handleResetPassword(user)}>
                            确认重置
                          </View>
                        </View>
                      </View>
                    ) : (
                      <Text className='todo-action' onClick={() => { setResetFor(user.id); setResetPwd('') }}>
                        重置密码
                      </Text>
                    )}
                  </View>
                ))
              )}
              <View className='sheet-actions'>
                <View className='btn secondary' onClick={() => setUserSheet(false)}>
                  关闭
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      ) : null}

      {adminSheet ? (
        <View className='sheet-mask' onClick={() => setAdminSheet(false)}>
          <View className='sheet' onClick={(event) => event.stopPropagation()}>
            <Text className='sheet-title'>管理员登录 · 分配职务</Text>
            <Text className='sheet-desc'>输入平台管理员的账号与密码，验证通过后自动切换为管理员身份并打开账号管理。当前登录状态会被替换为该管理员。</Text>
            <ScrollView className='sheet-body' scrollY>
              <View className='field'>
                <Text className='field-label'>管理员账号</Text>
                <Input
                  className='field-input'
                  value={adminUser}
                  placeholder='例如：demo'
                  onInput={(event) => setAdminUser(event.detail.value)}
                />
              </View>
              <View className='field'>
                <Text className='field-label'>密码</Text>
                <Input
                  className='field-input'
                  password
                  value={adminPwd}
                  placeholder='至少 6 位'
                  onInput={(event) => setAdminPwd(event.detail.value)}
                />
              </View>
              <View className='btn primary' onClick={handleAdminLogin}>
                {adminSubmitting ? '验证中...' : '登录并分配职务'}
              </View>
              <View className='notice' style='margin-top:20px'>
                还没有管理员账号？在电脑上进入「后台」目录执行：npm run make:admin -- 账号，即可把任意注册账号提升为平台管理员。
                自助注册的账号一律是普通菇农，无法自行成为管理员。
              </View>
              <View className='sheet-actions'>
                <View className='btn secondary' onClick={() => setAdminSheet(false)}>
                  取消
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      ) : null}

      {permSheet ? (
        <View className='sheet-mask' onClick={() => setPermSheet(false)}>
          <View className='sheet' onClick={(event) => event.stopPropagation()}>
            <Text className='sheet-title'>角色权限说明</Text>
            <Text className='sheet-desc'>权限由后端强制校验，越权一律返回 403；所有业务数据按账号隔离，互不可见。</Text>
            <ScrollView className='sheet-body' scrollY>
              <View className='notice success'>
                平台管理员：全部模块可读可写（含供应与采购发布）；唯一可以查看全部账号并分配职务；与专家一样可以回复用户提问。
              </View>
              <View className='notice'>
                合作社/基地管理员：基地、批次、环境监测、预警、溯源事件、生产任务、大棚设备、供应、采购需求、合作方全部可录；账号列表只读；只能提问，不能回复。
              </View>
              <View className='notice'>
                菇农（注册默认）：基地、批次、环境、预警、溯源、任务、设备可录；供应信息与采购需求只能浏览，不能发布采购需求；只能提问，不能回复他人提问。
              </View>
              <View className='notice'>
                专家：业务数据全部只读；提问模块可写（用于回复用户提问）；不能修改生产与设备数据。
              </View>
              <View className='notice'>
                采购商：基地、批次、溯源、供应信息只读；采购需求可发布；可提问。
              </View>
              <View className='notice'>
                政府/服务机构：全部业务数据只读，用于监管与统计查看，不能录入任何数据。
              </View>
              <View className='sheet-actions'>
                <View className='btn secondary' onClick={() => setPermSheet(false)}>
                  关闭
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  )
}
