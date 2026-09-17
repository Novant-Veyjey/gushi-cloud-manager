const fs = require('fs')
const path = require('path')

const source = path.resolve(__dirname, '..', '..', 'assets', 'logo.jpg')
const target = path.resolve(__dirname, '..', 'src', 'assets', 'logo.jpg')

fs.mkdirSync(path.dirname(target), { recursive: true })
fs.copyFileSync(source, target)
console.log('已同步共享品牌资源:', path.relative(path.resolve(__dirname, '..'), target))
