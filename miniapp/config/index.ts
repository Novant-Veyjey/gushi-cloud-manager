import path from 'path'
import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import devConfig from './dev'
import prodConfig from './prod'

export default defineConfig<'webpack5'>(async (merge) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'gushi-miniapp',
    date: '2026-9-15',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2
    },
    sourceRoot: 'src',
    // 小程序输出到 dist，浏览器预览版（h5）输出到 dist-h5，互不覆盖
    outputRoot: process.env.TARO_OUTPUT_ROOT || 'dist',
    plugins: [],
    /**
     * 必须显式定义自定义环境变量：
     * webpack5 的 h5 构建不再注入 Node 的 process 全局，源码里的 process.env.TARO_APP_API_BASE
     * 若不在此处替换，打包后会保留裸 process 引用，浏览器直接 ReferenceError 白屏。
     */
    defineConstants: {
      'process.env.TARO_APP_API_BASE': JSON.stringify(process.env.TARO_APP_API_BASE || '')
    },
    alias: {
      '@': path.resolve(__dirname, '..', 'src')
    },
    copy: {
      /**
       * TabBar 图标：显式复制到产物根目录的 assets/tabbar。
       * app.config 里写的是相对产物根目录的路径，两端落点不同
       * （小程序 dist/assets，浏览器预览 dist-h5/static/images/assets），
       * 用 copy 固定一份，保证小程序与 H5 预览都能取到图标。
       */
      patterns: [{ from: 'src/assets/tabbar', to: 'assets/tabbar' }],
      options: {}
    },
    framework: 'react',
    compiler: 'webpack5',
    cache: {
      enable: false
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {}
        },
        cssModules: {
          enable: false
        }
      }
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      output: {
        filename: 'js/[name].[hash:8].js',
        chunkFilename: 'js/[name].[chunkhash:8].js'
      },
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css'
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {}
        },
        cssModules: {
          enable: false
        }
      }
    }
  }

  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig)
  }
  return merge({}, baseConfig, prodConfig)
})
