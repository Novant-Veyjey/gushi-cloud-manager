/// <reference types="@tarojs/taro" />

declare module '*.png'
declare module '*.jpg'
declare module '*.jpeg'
declare module '*.gif'
declare module '*.svg'
declare module '*.css'
declare module '*.scss'

declare namespace NodeJS {
  interface ProcessEnv {
    /** 后端接口地址，例如 http://192.168.1.10:3000 */
    TARO_APP_API_BASE?: string
    NODE_ENV: 'development' | 'production'
  }
}
