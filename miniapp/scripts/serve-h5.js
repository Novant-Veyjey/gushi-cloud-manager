const http = require('http');
const fs = require('fs');
const path = require('path');

/**
 * 浏览器预览用的极简静态服务器（零依赖）。
 * 先执行 npm run build:h5，再执行 npm run preview:h5，然后打开 http://localhost:5173
 *
 * 注意：这是 h5 预览版，用于快速查看界面与接口联通情况；
 * 扫码、图片上传等小程序专有能力需要在微信开发者工具中体验。
 */
const root = path.resolve(__dirname, '..', 'dist-h5');
const port = Number(process.env.PREVIEW_PORT || 5173);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
};

if (!fs.existsSync(root)) {
  console.error('未找到 dist-h5，请先执行：npm run build:h5');
  process.exit(1);
}

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(String(req.url || '/').split('?')[0]);
    let filePath = path.join(root, urlPath);
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(root, 'index.html');
    }
    res.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  })
  .listen(port, () => {
    console.log(`菇事云管家浏览器预览：http://localhost:${port}`);
    console.log('请确保服务端已启动（在 server/ 目录执行 npm start，地址 http://localhost:3000）');
  });
