/**
 * 组装 Cloud Studio 一体部署目录（_deploy/）。
 *
 * 用法（在项目根目录执行）：
 *   node scripts/prep-deploy.js
 *
 * 做三件事：
 *   1. 用 better-sqlite3 的 backup 生成数据库快照（会把 WAL 里的数据一起合并，
 *      直接复制文件会丢数据）；
 *   2. 复制后台源码、.env、public 静态资源；
 *   3. 复制小程序 H5 构建产物（dist-h5），并校验关键产物是否最新。
 *
 * 前置：先跑 `cd gushi-miniapp && npm run build:h5` 生成最新产物。
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const Database = require(path.join(ROOT, '后台', 'node_modules', 'better-sqlite3'));

(async () => {
  const deploy = path.join(ROOT, '_deploy');
  fs.rmSync(deploy, { recursive: true, force: true });
  fs.mkdirSync(path.join(deploy, 'server', 'data'), { recursive: true });

  // 1) 数据库快照（backup 会合并 WAL）
  const db = new Database(path.join(ROOT, '后台', 'server', 'data', 'gushi.sqlite'), { readonly: true, fileMustExist: true });
  const dstDb = path.join(deploy, 'server', 'data', 'gushi.sqlite');
  await db.backup(dstDb);
  const counts = {
    users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
    products: db.prepare('SELECT COUNT(*) c FROM products').get().c,
    questions: db.prepare('SELECT COUNT(*) c FROM expert_questions').get().c,
    orders: db.prepare('SELECT COUNT(*) c FROM orders').get().c
  };
  db.close();
  console.log('数据库快照: ' + (fs.statSync(dstDb).size / 1024).toFixed(0) + ' KB');
  console.log(`  账号 ${counts.users} · 供应信息 ${counts.products} · 提问 ${counts.questions} · 订单 ${counts.orders}`);

  // 2) 后台
  fs.copyFileSync(path.join(ROOT, '后台', 'package.json'), path.join(deploy, 'package.json'));
  fs.copyFileSync(path.join(ROOT, '后台', '.env'), path.join(deploy, '.env'));
  for (const file of fs.readdirSync(path.join(ROOT, '后台', 'server'))) {
    if (file.endsWith('.js')) fs.copyFileSync(path.join(ROOT, '后台', 'server', file), path.join(deploy, 'server', file));
  }
  const jwt = path.join(ROOT, '后台', 'server', 'data', 'jwt.secret');
  if (fs.existsSync(jwt)) fs.copyFileSync(jwt, path.join(deploy, 'server', 'data', 'jwt.secret'));
  const pub = path.join(ROOT, '后台', 'public');
  if (fs.existsSync(pub)) fs.cpSync(pub, path.join(deploy, 'public'), { recursive: true });

  // 3) 小程序 H5 产物
  const distH5 = path.join(ROOT, 'gushi-miniapp', 'dist-h5');
  if (!fs.existsSync(path.join(distH5, 'index.html'))) {
    console.error('缺少 gushi-miniapp/dist-h5/index.html，请先执行 npm run build:h5');
    process.exit(1);
  }
  fs.cpSync(distH5, path.join(deploy, 'dist-h5'), { recursive: true });

  // 校验关键产物
  const cssFile = fs.readdirSync(path.join(deploy, 'dist-h5', 'css')).filter((f) => f.endsWith('.css'))[0];
  const css = fs.readFileSync(path.join(deploy, 'dist-h5', 'css', cssFile), 'utf8');
  const checks = [
    ['后台服务 app.js', fs.existsSync(path.join(deploy, 'server', 'app.js'))],
    ['.env（AI 密钥等配置）', fs.existsSync(path.join(deploy, '.env'))],
    ['数据库快照', fs.existsSync(path.join(deploy, 'server', 'data', 'gushi.sqlite'))],
    ['市场交易接口 orders.js', fs.existsSync(path.join(deploy, 'server', 'orders.js'))],
    ['H5 首页', fs.existsSync(path.join(deploy, 'dist-h5', 'index.html'))],
    ['H5 样式（含图片居中修复）', css.includes('.taro-img__mode-aspectfit')]
  ];
  let ok = true;
  for (const [name, passed] of checks) {
    console.log((passed ? 'ok    ' : '缺失! ') + name);
    if (!passed) ok = false;
  }
  if (!ok) process.exit(1);
  console.log('组装完成：可直接用 _deploy/ 目录部署');
})().catch((error) => {
  console.error('组装失败:', error.message);
  process.exit(1);
});
