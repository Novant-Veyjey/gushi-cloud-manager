import type { UserConfigExport } from '@tarojs/cli'

export default {
  mini: {},
  h5: {
    /**
     * 如果 h5 端首屏体积过大，可以使用 webpack-bundle-analyzer 插件对打包体积进行分析。
     */
  }
} satisfies UserConfigExport<'webpack5'>
