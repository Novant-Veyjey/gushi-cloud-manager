const { db } = require('./db');
const { hashPassword } = require('./auth');

/**
 * 写入演示数据（全部带“演示”标记，正式使用前请删除或替换）。
 * 演示数据绑定在演示账号下，其他账号看不到，保证每个账号的数据互不影响。
 *
 * 演示账号：demo / demo123456
 */
const DEMO_USERNAME = 'demo';
const DEMO_PASSWORD = 'demo123456';

function ensureDemoUser() {
  let user = db.prepare('SELECT * FROM users WHERE username = ?').get(DEMO_USERNAME);
  if (user) return user;
  const { hash, salt } = hashPassword(DEMO_PASSWORD);
  const result = db
    .prepare('INSERT INTO users (username, display_name, role, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)')
    .run(DEMO_USERNAME, '演示账号', 'farmer', hash, salt);
  user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  return user;
}

const demoUser = ensureDemoUser();
const uid = demoUser.id;

const run = db.transaction(() => {
  let base = db.prepare('SELECT * FROM bases WHERE name = ? AND user_id = ?').get('演示基地（可删除）', uid);
  if (!base) {
    const result = db.prepare(`INSERT INTO bases (name, township, address, contact_name, contact_phone, area_mu, status, notes, user_id) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`)
      .run('演示基地（可删除）', '演示乡镇', '演示地址', '演示联系人', '', 100, '仅供本地功能测试，请在上线前删除或替换', uid);
    base = db.prepare('SELECT * FROM bases WHERE id = ?').get(result.lastInsertRowid);
  }

  let batch = db.prepare('SELECT * FROM batches WHERE code = ? AND user_id = ?').get('DEMO-20260901-01', uid);
  if (!batch) {
    const result = db.prepare(`INSERT INTO batches (code, base_id, mushroom_type, variety, quantity, stage, start_date, expected_harvest_date, status, notes, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`)
      .run('DEMO-20260901-01', base.id, '香菇', '演示品种', 10000, '出菇期', '2026-09-01', '2026-09-20', '演示数据，请替换为真实批次', uid);
    batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(result.lastInsertRowid);
  }

  if (!db.prepare('SELECT id FROM readings WHERE base_id = ? AND user_id = ? LIMIT 1').get(base.id, uid)) {
    const reading = db.prepare(`INSERT INTO readings (base_id, device_name, temperature, humidity, co2, light, recorded_at, notes, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(base.id, '演示环境网关', 22.6, 86, 680, 420, new Date().toISOString(), '演示数据', uid);
    db.prepare(`INSERT INTO alerts (base_id, reading_id, alert_type, level, message, status, user_id) VALUES (?, ?, ?, ?, ?, 'open', ?)`)
      .run(base.id, reading.lastInsertRowid, 'CO₂ 偏高', 'medium', '演示预警：请在正式使用前替换', uid);
  }

  if (!db.prepare('SELECT id FROM trace_events WHERE batch_id = ? AND user_id = ? LIMIT 1').get(batch.id, uid)) {
    const add = db.prepare(`INSERT INTO trace_events (batch_id, event_type, title, description, event_date, operator, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    add.run(batch.id, '入库', '菌棒入库', '演示批次完成入库登记', '2026-09-01', '演示操作员', uid);
    add.run(batch.id, '养菌', '接种与养菌', '演示环境记录连续正常', '2026-09-02', '演示操作员', uid);
    add.run(batch.id, '出菇', '转房与催蕾', '演示批次进入出菇阶段', '2026-09-09', '演示操作员', uid);
  }

  if (!db.prepare('SELECT id FROM expert_questions WHERE user_id = ? LIMIT 1').get(uid)) {
    db.prepare(`INSERT INTO expert_questions (base_id, title, content, category, answer, status, answered_at, user_id) VALUES (?, ?, ?, ?, ?, 'answered', ?, ?)`)
      .run(base.id, '演示问题：湿度异常如何处理？', '这是一条演示问题。', '环境调控', '这是演示回复，请替换为专家真实回复。', new Date().toISOString(), uid);
  }

  if (!db.prepare('SELECT id FROM products WHERE user_id = ? LIMIT 1').get(uid)) {
    db.prepare(`INSERT INTO products (batch_id, name, quantity, unit, price, available_date, status, description, user_id) VALUES (?, ?, ?, ?, ?, ?, 'available', ?, ?)`)
      .run(batch.id, '演示鲜香菇', 1000, 'kg', 18.6, '2026-09-16', '演示供应信息', uid);
  }

  if (!db.prepare('SELECT id FROM demands WHERE user_id = ? LIMIT 1').get(uid)) {
    db.prepare(`INSERT INTO demands (buyer_name, product_name, quantity, unit, price, requirements, contact, status, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`)
      .run('演示采购商（可删除）', '鲜香菇', 2000, 'kg', 19.2, '要求可溯源，演示需求', '', uid);
  }

  if (!db.prepare('SELECT id FROM tasks WHERE user_id = ? LIMIT 1').get(uid)) {
    db.prepare(`INSERT INTO tasks (title, description, batch_id, priority, due_date, status, user_id) VALUES (?, ?, ?, ?, ?, 'pending', ?)`)
      .run('演示任务：检查 1 号棚环境', '演示任务，请替换为真实待办。', batch.id, 'medium', new Date(Date.now() + 86400000).toISOString().slice(0, 10), uid);
  }
});

run();
console.log('演示数据已写入，并绑定到演示账号。');
console.log(`演示账号：${DEMO_USERNAME}  密码：${DEMO_PASSWORD}`);
console.log('演示内容均带“演示”标记；登录演示账号后可在界面中删除或替换。');
console.log('现在可运行：npm start');
