const { db } = require('./db');

/**
 * 把指定账号提升为平台管理员。
 * 平台管理员不能自助注册，只能在服务器上执行本脚本。
 *
 * 用法：
 *   npm run make:admin -- 你的账号
 *   npm run make:admin -- 你的账号 farmer   # 收回管理员权限，改回菇农
 */
const username = String(process.argv[2] || '').trim();
const role = String(process.argv[3] || 'admin').trim();
const allowed = ['admin', 'farmer', 'base', 'expert', 'buyer', 'government'];

if (!username) {
  console.log('用法：npm run make:admin -- <账号> [角色，默认 admin]');
  console.log('可用角色：' + allowed.join(' / '));
  process.exit(1);
}
if (!allowed.includes(role)) {
  console.log(`角色不合法：${role}，可用角色：${allowed.join(' / ')}`);
  process.exit(1);
}

const user = db.prepare('SELECT id, username, role FROM users WHERE username = ?').get(username);
if (!user) {
  console.log(`未找到账号：${username}`);
  process.exit(1);
}

db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, new Date().toISOString(), user.id);
console.log(`已将账号 ${username} 的角色从 ${user.role} 改为 ${role}`);
console.log('该账号需重新登录后生效。');
