const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db } = require('./db');
const auth = require('./auth');
const { requireAuth, requirePermission, requireRole } = auth;

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '6mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function ok(res, data, message = 'success') {
  res.json({ code: 0, message, data });
}
function fail(res, status, message, details = null) {
  res.status(status).json({ code: status, message, data: details });
}
function text(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}
function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function dateText(value, fallback = '') {
  const v = text(value, fallback);
  return v || fallback;
}

const configs = {
  partners: {
    columns: ['name', 'role', 'contact'],
    required: ['name'],
    order: 'id DESC'
  },
  bases: {
    columns: ['name', 'township', 'address', 'contact_name', 'contact_phone', 'area_mu', 'status', 'notes'],
    required: ['name'],
    order: 'created_at DESC',
    numeric: ['area_mu']
  },
  batches: {
    columns: ['code', 'base_id', 'mushroom_type', 'variety', 'quantity', 'stage', 'start_date', 'expected_harvest_date', 'status', 'notes'],
    required: ['code', 'mushroom_type', 'start_date'],
    order: 'created_at DESC',
    numeric: ['base_id', 'quantity']
  },
  readings: {
    columns: ['base_id', 'device_name', 'temperature', 'humidity', 'co2', 'light', 'recorded_at', 'notes'],
    required: ['recorded_at'],
    updatedAt: false,
    order: 'recorded_at DESC, id DESC',
    numeric: ['base_id', 'temperature', 'humidity', 'co2', 'light']
  },
  alerts: {
    columns: ['base_id', 'reading_id', 'alert_type', 'level', 'message', 'status', 'handled_at'],
    required: ['alert_type', 'message'],
    updatedAt: false,
    order: 'created_at DESC',
    numeric: ['base_id', 'reading_id']
  },
  'trace-events': {
    table: 'trace_events',
    columns: ['batch_id', 'event_type', 'title', 'description', 'event_date', 'operator'],
    required: ['batch_id', 'event_type', 'title', 'event_date'],
    order: 'event_date ASC, id ASC',
    numeric: ['batch_id']
  },
  questions: {
    table: 'expert_questions',
    columns: ['base_id', 'title', 'content', 'category', 'answer', 'status', 'answered_at'],
    required: ['title', 'content'],
    updatedAt: false,
    order: 'created_at DESC',
    numeric: ['base_id']
  },
  products: {
    columns: ['batch_id', 'name', 'icon', 'quantity', 'unit', 'price', 'available_date', 'status', 'description'],
    required: ['name'],
    order: 'created_at DESC',
    numeric: ['batch_id', 'quantity', 'price']
  },
  demands: {
    columns: ['buyer_name', 'product_name', 'quantity', 'unit', 'price', 'requirements', 'contact', 'status'],
    required: ['buyer_name', 'product_name'],
    order: 'created_at DESC',
    numeric: ['quantity', 'price']
  },
  tasks: {
    columns: ['title', 'description', 'batch_id', 'priority', 'due_date', 'status'],
    required: ['title'],
    order: 'created_at DESC',
    numeric: ['batch_id']
  }
};

function normalizeRow(config, body, partial = false) {
  const row = {};
  for (const key of config.columns) {
    if (body[key] === undefined) continue;
    row[key] = (config.numeric || []).includes(key) ? number(body[key]) : text(body[key]);
  }
  if (!partial) {
    for (const key of config.required) {
      if (!row[key]) throw new Error(`缺少必填字段：${key}`);
    }
  }
  if (config.columns.includes('status') && row.status === undefined && !partial) row.status = 'active';
  return row;
}

function makeCrudRouter(name, config) {
  const table = config.table || name;
  const router = express.Router();

  // 每个账号只能读写自己的数据；RBAC 在方法级别再次校验
  router.use(requireAuth);

  router.get('/', requirePermission(name, 'r'), (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
      const where = ['user_id = @user_id'];
      const params = { user_id: req.user.id };
      for (const key of ['base_id', 'batch_id', 'status', 'stage', 'level']) {
        if (req.query[key] !== undefined && config.columns.includes(key)) {
          where.push(`${key} = @${key}`);
          params[key] = (config.numeric || []).includes(key) ? number(req.query[key]) : text(req.query[key]);
        }
      }
      const clause = `WHERE ${where.join(' AND ')}`;
      const rows = db.prepare(`SELECT * FROM ${table} ${clause} ORDER BY ${config.order} LIMIT @limit`).all({ ...params, limit });
      ok(res, rows);
    } catch (error) {
      fail(res, 400, error.message);
    }
  });

  router.get('/:id', requirePermission(name, 'r'), (req, res) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).get(Number(req.params.id), req.user.id);
    if (!row) return fail(res, 404, '记录不存在');
    ok(res, row);
  });

  router.post('/', requirePermission(name, 'w'), (req, res) => {
    try {
      const row = normalizeRow(config, req.body || {});
      row.user_id = req.user.id;
      const cols = Object.keys(row);
      const placeholders = cols.map((col) => `@${col}`).join(', ');
      const result = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`).run(row);
      const created = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(result.lastInsertRowid);
      if (name === 'readings') evaluateReadingAlerts(created);
      ok(res, created, '保存成功');
    } catch (error) {
      const status = /UNIQUE constraint/.test(error.message) ? 409 : 400;
      fail(res, status, error.message);
    }
  });

  router.put('/:id', requirePermission(name, 'w'), (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!db.prepare(`SELECT id FROM ${table} WHERE id = ? AND user_id = ?`).get(id, req.user.id)) {
        return fail(res, 404, '记录不存在');
      }
      const row = normalizeRow(config, req.body || {}, true);
      if (!Object.keys(row).length) return fail(res, 400, '没有可更新字段');
      if (config.updatedAt !== false) row.updated_at = new Date().toISOString();
      const assignments = Object.keys(row).map((key) => `${key} = @${key}`).join(', ');
      db.prepare(`UPDATE ${table} SET ${assignments} WHERE id = @id AND user_id = @user_id`).run({ ...row, id, user_id: req.user.id });
      const updated = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
      ok(res, updated, '更新成功');
    } catch (error) {
      fail(res, 400, error.message);
    }
  });

  router.delete('/:id', requirePermission(name, 'w'), (req, res) => {
    const id = Number(req.params.id);
    const result = db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).run(id, req.user.id);
    if (!result.changes) return fail(res, 404, '记录不存在');
    ok(res, { id }, '删除成功');
  });

  return router;
}

function evaluateReadingAlerts(reading) {
  const alerts = [];
  if (reading.temperature !== null && reading.temperature !== undefined && reading.temperature > 26) {
    alerts.push({ type: '温度偏高', level: 'high', message: `温度 ${reading.temperature}°C，超过 26°C 阈值` });
  }
  if (reading.humidity !== null && reading.humidity !== undefined && reading.humidity < 80) {
    alerts.push({ type: '湿度偏低', level: 'medium', message: `湿度 ${reading.humidity}%，低于 80% 阈值` });
  }
  if (reading.co2 !== null && reading.co2 !== undefined && reading.co2 > 800) {
    alerts.push({ type: 'CO₂ 偏高', level: 'high', message: `CO₂ ${reading.co2} ppm，超过 800 ppm 阈值` });
  }
  const insert = db.prepare(`INSERT INTO alerts (base_id, reading_id, alert_type, level, message, status, user_id) VALUES (?, ?, ?, ?, ?, 'open', ?)`);
  for (const alert of alerts) insert.run(reading.base_id || null, reading.id, alert.type, alert.level, alert.message, reading.user_id || null);
}

app.get('/api/health', (req, res) => ok(res, { status: 'ok', time: new Date().toISOString() }));

/** ---------- 账号：注册 / 登录 / 登出 / 当前用户 ---------- */

app.get('/api/auth/roles', (req, res) =>
  ok(res, {
    roles: auth.ROLES,
    self_register: auth.SELF_REGISTER_ROLES.map((item) => item.value),
    permissions: auth.PERMISSIONS
  })
);

app.post('/api/auth/register', (req, res) => {
  try {
    ok(res, auth.register(req.body || {}), '注册成功');
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    ok(res, auth.login(req.body || {}), '登录成功');
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

/** 微信小程序一键登录：前端 wx.login 拿 code，后台换 openid */
app.post('/api/auth/wechat', async (req, res) => {
  try {
    ok(res, await auth.wechatLogin(text(req.body?.code)), '登录成功');
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  auth.destroySession(req);
  ok(res, { id: req.user.id }, '已退出登录');
});

app.get('/api/auth/me', requireAuth, (req, res) =>
  ok(res, { ...req.user, permissions: auth.PERMISSIONS[req.user.role] || {} })
);

/** ---------- 平台管理员：账号管理 ---------- */

app.get('/api/admin/users', requireAuth, requireRole('admin'), (req, res) => {
  try {
    ok(res, auth.listUsers());
  } catch (error) {
    fail(res, 400, error.message);
  }
});

app.put('/api/admin/users/:id/role', requireAuth, requireRole('admin'), (req, res) => {
  try {
    ok(res, auth.updateUserRole(req.params.id, text(req.body?.role)), '角色已更新');
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

/** ---------- 图片上传：每个账号单独目录，按账号鉴权 ---------- */

const uploadRoot = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(uploadRoot, { recursive: true });
app.post('/api/uploads', requireAuth, requirePermission('uploads', 'w'), (req, res) => {
  try {
    const data = text(req.body?.data);
    const match = data.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return fail(res, 400, '只支持 JPG、PNG、WebP 或 GIF 图片');
    const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 4 * 1024 * 1024) return fail(res, 413, '图片不能超过 4MB');
    const userDir = path.join(uploadRoot, `u${req.user.id}`);
    fs.mkdirSync(userDir, { recursive: true });
    const filename = `icon-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extensions[match[1]]}`;
    fs.writeFileSync(path.join(userDir, filename), buffer);
    ok(res, { url: `/uploads/u${req.user.id}/${filename}` }, '图片上传成功');
  } catch (error) {
    fail(res, 400, error.message);
  }
});

app.get('/api/dashboard', requireAuth, requirePermission('dashboard', 'r'), (req, res) => {
  const uid = req.user.id;
  const data = {
    user: req.user,
    bases: db.prepare('SELECT COUNT(*) AS count FROM bases WHERE user_id = ?').get(uid).count,
    batches: db.prepare('SELECT COUNT(*) AS count FROM batches WHERE user_id = ?').get(uid).count,
    devices: db
      .prepare("SELECT COUNT(DISTINCT device_name) AS count FROM readings WHERE user_id = ? AND device_name <> ''")
      .get(uid).count,
    openAlerts: db.prepare("SELECT COUNT(*) AS count FROM alerts WHERE user_id = ? AND status = 'open'").get(uid).count,
    questions: db.prepare("SELECT COUNT(*) AS count FROM expert_questions WHERE user_id = ? AND status = 'pending'").get(uid).count,
    products: db.prepare("SELECT COUNT(*) AS count FROM products WHERE user_id = ? AND status = 'available'").get(uid).count,
    demands: db.prepare("SELECT COUNT(*) AS count FROM demands WHERE user_id = ? AND status = 'open'").get(uid).count,
    latestReadings: db.prepare(`
      SELECT r.*, b.name AS base_name
      FROM readings r LEFT JOIN bases b ON b.id = r.base_id
      WHERE r.user_id = @uid
        AND r.id IN (SELECT MAX(id) FROM readings WHERE user_id = @uid GROUP BY COALESCE(base_id, 0), device_name)
      ORDER BY r.recorded_at DESC LIMIT 8
    `).all({ uid }),
    alerts: db.prepare(`
      SELECT a.*, b.name AS base_name FROM alerts a LEFT JOIN bases b ON b.id = a.base_id
      WHERE a.user_id = @uid AND a.status = 'open' ORDER BY a.created_at DESC LIMIT 5
    `).all({ uid }),
    latestQuestions: db.prepare(`
      SELECT q.*, b.name AS base_name FROM expert_questions q LEFT JOIN bases b ON b.id = q.base_id
      WHERE q.user_id = @uid ORDER BY q.created_at DESC LIMIT 5
    `).all({ uid })
  };
  ok(res, data);
});

/**
 * 质量溯源查询保持公开：消费者扫码或按批次编号查询，无需登录。
 * 只返回批次、溯源事件和产品信息，不暴露账号相关的其他数据。
 */
app.get('/api/trace/:code', (req, res) => {
  const code = text(req.params.code);
  const batch = db.prepare(`SELECT b.*, o.name AS base_name, o.address AS base_address FROM batches b LEFT JOIN bases o ON o.id = b.base_id WHERE b.code = ?`).get(code);
  if (!batch) return fail(res, 404, '未找到该批次');
  const events = db.prepare('SELECT * FROM trace_events WHERE batch_id = ? ORDER BY event_date ASC, id ASC').all(batch.id);
  const products = db.prepare('SELECT * FROM products WHERE batch_id = ? ORDER BY id DESC').all(batch.id);
  ok(res, { batch, events, products });
});

app.post('/api/alerts/:id/ack', requireAuth, requirePermission('alerts', 'w'), (req, res) => {
  const id = Number(req.params.id);
  const result = db
    .prepare("UPDATE alerts SET status = 'handled', handled_at = ? WHERE id = ? AND user_id = ?")
    .run(new Date().toISOString(), id, req.user.id);
  if (!result.changes) return fail(res, 404, '预警不存在');
  ok(res, db.prepare('SELECT * FROM alerts WHERE id = ?').get(id), '已处理');
});

function rulePriority(title, dueDate) {
  const value = `${title} ${dueDate}`.toLowerCase();
  const now = new Date();
  const due = dueDate ? new Date(dueDate) : null;
  const days = due && !Number.isNaN(due.getTime()) ? Math.ceil((due.setHours(23, 59, 59, 999) - now.getTime()) / 86400000) : null;
  if (/紧急|立即|马上|故障|报警|抢救|污染/.test(value) || (days !== null && days <= 1)) return { priority: 'high', reason: '任务含紧急关键词或将在 1 天内到期' };
  if (days !== null && days <= 3) return { priority: 'medium', reason: '任务将在 3 天内到期' };
  return { priority: 'low', reason: '未发现紧急关键词，截止日期较充足' };
}

app.post('/api/ai/suggest-priority', requireAuth, requirePermission('ai', 'r'), async (req, res) => {
  const title = text(req.body?.title);
  const dueDate = text(req.body?.due_date);
  if (!title) return fail(res, 400, 'title 必填');
  let result = rulePriority(title, dueDate);
  const key = process.env.AI_API_KEY;
  const baseUrl = text(process.env.AI_BASE_URL);
  if (key && baseUrl) {
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: process.env.AI_MODEL || 'gpt-4o-mini',
          temperature: 0.1,
          messages: [
            { role: 'system', content: '你是食用菌生产任务调度助手。只返回 JSON：{"priority":"high|medium|low","reason":"简短原因"}' },
            { role: 'user', content: `任务：${title}\n截止日期：${dueDate || '未填写'}` }
          ]
        })
      });
      if (response.ok) {
        const payload = await response.json();
        const content = payload?.choices?.[0]?.message?.content || '';
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (['high', 'medium', 'low'].includes(parsed.priority)) result = { priority: parsed.priority, reason: text(parsed.reason, result.reason), source: 'ai' };
        }
      }
    } catch (error) {
      console.warn('AI suggestion failed, fallback to rules:', error.message);
    }
  }
  ok(res, { ...result, source: result.source || 'rule' });
});

for (const [name, config] of Object.entries(configs)) app.use(`/api/${name}`, makeCrudRouter(name, config));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.use((error, req, res, next) => {
  console.error(error);
  fail(res, 500, '服务器内部错误');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`菇事云管家已启动：http://localhost:${PORT}`);
    console.log(`数据库文件：${require('./db').dbPath}`);
  });
}

module.exports = { app, db };
