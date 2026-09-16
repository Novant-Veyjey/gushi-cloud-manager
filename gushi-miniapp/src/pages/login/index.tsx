import { useState } from 'react'
import { Image, Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'

import eyeClosed from '@/assets/icons/eye-closed.png'
import eyeOpen from '@/assets/icons/eye-open.png'
import logo from '@/assets/logo.jpg'
import { fetchCurrentUser, login, REGISTER_ROLE_OPTIONS, register, wechatLogin } from '@/utils/auth'
import { clearAuth, getToken } from '@/utils/storage'

type Mode = 'login' | 'register'

export default function Login() {
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [registerIndex, setRegisterIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(true)

  // 已登录则直接进入首页；token 失效则回到登录表单
  useDidShow(() => {
    if (!getToken()) {
      setChecking(false)
      return
    }
    fetchCurrentUser()
      .then(() => {
        setChecking(false)
        Taro.switchTab({ url: '/pages/home/index' })
      })
      .catch(() => {
        clearAuth()
        setChecking(false)
      })
  })

  const handleSubmit = async () => {
    if (submitting) return
    const name = username.trim()
    if (!name || !password) {
      Taro.showToast({ title: '请填写账号和密码', icon: 'none' })
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'login') {
        await login(name, password)
        Taro.showToast({ title: '登录成功', icon: 'success' })
      } else {
        await register({
          username: name,
          password,
          display_name: displayName.trim(),
          role: REGISTER_ROLE_OPTIONS[registerIndex].value
        })
        Taro.showToast({ title: '注册成功', icon: 'success' })
      }
      Taro.switchTab({ url: '/pages/home/index' })
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  /** 微信一键登录：后台未配置 AppID/Secret 时会明确提示，可改用账号密码 */
  const handleWechatLogin = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const result = await Taro.login()
      if (!result.code) throw new Error('未获取到微信登录凭证，请重试')
      await wechatLogin(result.code)
      Taro.showToast({ title: '登录成功', icon: 'success' })
      Taro.switchTab({ url: '/pages/home/index' })
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return (
      <View className='page'>
        <View className='state-hint'>
          <Text>正在检查登录状态...</Text>
        </View>
      </View>
    )
  }

  return (
    <View className='page'>
      <View className='login-brand'>
        <Image className='login-logo' src={logo} mode='aspectFit' />
        <Text className='login-title'>菇事云管家</Text>
        <Text className='login-sub'>数字技术赋能赣北食用菌产业振兴</Text>
      </View>

      <View className='hero login-hero'>
        <Text className='hero-small'>GU SHI CLOUD · 数据可保存</Text>
        <Text className='hero-title'>
          每个账号{'\n'}
          都有自己的一套数据
        </Text>
        <Text className='hero-desc'>
          基地、批次、环境、溯源、供应和采购记录都保存在后台数据库，服务重启不会丢失，其他账号看不到。
        </Text>
      </View>

      <View className='card login-card'>
        <View className='seg-tabs'>
          <View className={`seg-tab${mode === 'login' ? ' active' : ''}`} onClick={() => setMode('login')}>
            登录
          </View>
          <View className={`seg-tab${mode === 'register' ? ' active' : ''}`} onClick={() => setMode('register')}>
            注册新账号
          </View>
        </View>

        <View className='field'>
          <Text className='field-label'>
            账号<Text className='required'>*</Text>
          </Text>
          <Input
            className='field-input'
            value={username}
            placeholder='3-32 位字母、数字、下划线或中文'
            onInput={(event) => setUsername(event.detail.value)}
          />
        </View>

        <View className='field'>
          <Text className='field-label'>
            密码<Text className='required'>*</Text>
          </Text>
          <View className='field-input-wrap'>
            <Input
              className='field-input field-input-password'
              /** 明文/密文切换：H5 端直接用 type='password' / 'text'；
               *  小程序端 Input 的 type 不支持 password 值，由下方 password 布尔属性兜底，两端表现一致。
               *  Taro 的类型定义未把 password 列进 type 联合类型（H5 运行时实际支持），断言绕过 */
              type={(showPassword ? 'text' : 'password') as any}
              password={!showPassword}
              value={password}
              placeholder='至少 6 位'
              onInput={(event) => setPassword(event.detail.value)}
            />
            <View
              className='field-password-toggle'
              onClick={() => setShowPassword((value) => !value)}
              aria-role='button'
            >
              {/* 睁眼 = 点击可见密码；斜杠闭眼 = 点击隐藏密码 */}
              <Image
                className='field-password-eye'
                src={showPassword ? eyeClosed : eyeOpen}
                mode='aspectFit'
              />
            </View>
          </View>
        </View>

        {mode === 'register' ? (
          <View className='field'>
            <Text className='field-label'>称呼（可选）</Text>
            <Input
              className='field-input'
              value={displayName}
              placeholder='例如：王师傅 / 德安基地'
              onInput={(event) => setDisplayName(event.detail.value)}
            />
          </View>
        ) : null}

        {mode === 'register' ? (
          <View className='field'>
            <Text className='field-label'>注册身份（点选其中一个）</Text>
            <View className='role-options'>
              {REGISTER_ROLE_OPTIONS.map((item, index) => (
                <View
                  key={item.value}
                  className={`role-option${registerIndex === index ? ' active' : ''}`}
                  onClick={() => setRegisterIndex(index)}
                >
                  <Text>{item.label}</Text>
                </View>
              ))}
            </View>
            <Text className='field-hint'>{REGISTER_ROLE_OPTIONS[registerIndex].desc}</Text>
            <Text className='field-hint'>「政府/服务机构」「专家」「平台管理员」不可自选，注册后由平台管理员分配</Text>
          </View>
        ) : null}

        <View className='btn primary' onClick={handleSubmit}>
          {submitting ? '提交中...' : mode === 'login' ? '登录' : '注册并登录'}
        </View>

        {mode === 'login' ? (
          <View>
            <View className='login-divider'>
              <View className='login-divider-line' />
              <Text className='login-divider-text'>或</Text>
              <View className='login-divider-line' />
            </View>
            <View className='btn wechat' onClick={handleWechatLogin}>
              微信一键登录
            </View>
          </View>
        ) : null}

        <View className='notice' style='margin:24px 0 0'>
          演示账号：demo / demo123456（数据带“演示”标记，可直接删除）。<br />
          注册时可选择菇农 / 基地管理员 / 采购商；「政府/服务机构」「专家」「平台管理员」不可自选，由平台管理员分配。
          <br />
          微信一键登录需后台配置 WX_APPID / WX_SECRET（见 后台/.env.example），未配置时会提示并改用账号密码登录。
        </View>
      </View>
    </View>
  )
}
