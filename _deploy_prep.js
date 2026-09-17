/* 临时脚本：组装 Cloud Studio 一体部署目录（含干净数据库快照） */
const path = require('path');
const fs = require('fs');
const root = process.cwd();
const Database = require(path.join(root, '后台', 'node_modules', 'better-sqlite3'));

(async () => {
  const deploy = path.join(root, '_deploy');
  fs.rmSync(deploy, { recursive: true, force: true });
  fs.mkdirSync(path.join(deploy, 'server', 'data'), { recursive: true });

  const db = new Database(path.join(root, '后台', 'server', 'data', 'gushi.sqlite'), { readonly: true, fileMustExist: true });
  const dstDb = path.join(deploy, 'server', 'data', 'gushi.sqlite');
  await db.backup(dstDb);
  const counts = {
    users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
    products: db.prepare('SELECT COUNT(*) c FROM products').get().c,
    demands: db.prepare('SELECT COUNT(*) c FROM demands').get().c,
    orders: db.prepare('SELECT COUNT(*) c FROM orders').get().c
  };
  db.close();
  console.log('DB 快照: ' + (fs.statSync(dstDb).size / 1024).toFixed(0) + ' KB');
  console.log(`  账号 ${counts.users} · 供应 ${counts.products} · 采购需求 ${counts.demands} · 订单 ${counts.orders}`);

  fs.copyFileSync(path.join(root, '后台', 'package.json'), path.join(deploy, 'package.json'));
  fs.copyFileSync(path.join(root, '后台', '.env'), path.join(deploy, '.env'));
  for (const f of fs.readdirSync(path.join(root, '后台', 'server'))) {
    if (f.endsWith('.js')) fs.copyFileSync(path.join(root, '后台', 'server', f), path.join(deploy, 'server', f));
  }
  const jwt = path.join(root, '后台', 'server', 'data', 'jwt.secret');
  if (fs.existsSync(jwt)) fs.copyFileSync(jwt, path.join(deploy, 'server', 'data', 'jwt.secret'));
  const pub = path.join(root, '后台', 'public');
  if (fs.existsSync(pub)) fs.cpSync(pub, path.join(deploy, 'public'), { recursive: true });
  fs.cpSync(path.join(root, 'gushi-miniapp', 'dist-h5'), path.join(deploy, 'dist-h5'), { recursive: true });

  const checks = ['package.json', '.env', 'dist-h5/index.html', 'server/app.js', 'server/orders.js', 'server/data/gushi.sqlite'];
  let ok = true;
  for (const c of checks) {
    const exists = fs.existsSync(path.join(deploy, c));
    console.log((exists ? 'ok  ' : '缺失! ') + c);
    if (!exists) ok = false;
  }
  if (!ok) process.exit(1);
  console.log('组装完成');
})().catch((e) => { console.error('失败:', e); process.exit(1); });
