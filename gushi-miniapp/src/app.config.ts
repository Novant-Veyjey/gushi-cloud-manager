export default defineAppConfig({
  pages: [
    'pages/login/index',
    'pages/home/index',
    'pages/production/index',
    'pages/monitor/index',
    'pages/trace/index',
    'pages/market/index',
    'pages/expert/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#1f6a4a',
    navigationBarTitleText: '菇事云管家',
    navigationBarTextStyle: 'white',
    backgroundColor: '#eaf0e8'
  },
  tabBar: {
    color: '#8b9990',
    selectedColor: '#1f6a4a',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/home/index', text: '首页' },
      { pagePath: 'pages/production/index', text: '生产' },
      { pagePath: 'pages/monitor/index', text: '监测' },
      { pagePath: 'pages/trace/index', text: '溯源' },
      { pagePath: 'pages/market/index', text: '市场' }
    ]
  },
  permission: {
    'scope.userLocation': {
      desc: '用于给基地标注位置'
    }
  }
})
