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
      { pagePath: 'pages/home/index', text: '首页', iconPath: 'assets/tabbar/home.png', selectedIconPath: 'assets/tabbar/home-on.png' },
      { pagePath: 'pages/production/index', text: '生产', iconPath: 'assets/tabbar/production.png', selectedIconPath: 'assets/tabbar/production-on.png' },
      { pagePath: 'pages/monitor/index', text: '监测', iconPath: 'assets/tabbar/monitor.png', selectedIconPath: 'assets/tabbar/monitor-on.png' },
      { pagePath: 'pages/trace/index', text: '溯源', iconPath: 'assets/tabbar/trace.png', selectedIconPath: 'assets/tabbar/trace-on.png' },
      { pagePath: 'pages/market/index', text: '市场', iconPath: 'assets/tabbar/market.png', selectedIconPath: 'assets/tabbar/market-on.png' }
    ]
  },
  permission: {
    'scope.userLocation': {
      desc: '用于给基地标注位置'
    }
  }
})
