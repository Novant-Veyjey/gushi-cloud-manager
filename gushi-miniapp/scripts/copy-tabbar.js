/**
 * H5 产物补丁：构建后把 TabBar 图标补到产物根目录。
 *
 * 原因：Taro 的 h5 构建会把 copy 进来的图片放到 static/images/...，
 * 而 app.config 里 TabBar 的 iconPath 是相对产物根目录的路径（assets/tabbar/xxx.png），
 * 浏览器打开 http://localhost:5173/#/pages/home/index 时会去请求 /assets/tabbar/xxx.png，
 * 对不上就是一堆破图占位框。这里在构建后统一补一份，保证 H5 预览与小程序表现一致。
 */
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const source = path.join(projectRoot, 'src', 'assets', 'tabbar');
const outputDirs = ['dist-h5', 'dist'].map((dir) => path.join(projectRoot, dir, 'assets', 'tabbar'));

if (!fs.existsSync(source)) {
  console.error('[copy-tabbar] 找不到源目录：' + source);
  process.exit(1);
}

const files = fs.readdirSync(source).filter((name) => name.endsWith('.png'));

for (const target of outputDirs) {
  if (!fs.existsSync(path.dirname(path.dirname(target)))) continue; // 该端还没构建就跳过
  fs.mkdirSync(target, { recursive: true });
  for (const file of files) {
    fs.copyFileSync(path.join(source, file), path.join(target, file));
  }
  console.log(`[copy-tabbar] ${files.length} 个图标 -> ${path.relative(projectRoot, target)}`);
}
