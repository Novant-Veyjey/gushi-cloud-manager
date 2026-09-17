const { loadEnvFile } = require('./env');

// 先加载 .env，保证后续模块能读到 AI / MQTT / 数据库配置
loadEnvFile();

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db } = require('./db');
const auth = require('./auth');
const deviceService = require('./devices');
const aiService = require('./ai');
const orderService = require('./orders');
const { evaluateReadingAlerts } = require('./alerts');
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
    columns: ['base_id', 'title', 'content', 'category', 'answer', 'status', 'answered_at', 'answer_source', 'ai_model'],
    required: ['title', 'content'],
    updatedAt: false,
    order: 'created_at DESC',
    numeric: ['base_id']
  },
  products: {
    columns: ['batch_id', 'name', 'icon', 'quantity', 'unit', 'price', 'available_date', 'off_shelf_date', 'status', 'description'],
    required: ['name'],
    order: 'created_at DESC',
    numeric: ['batch_id', 'quantity', 'price'],
    // 供应信息用 'available' 表示「可供应」，与其它模块的 'active' 不同，单独指定兜底值
    defaultStatus: 'available'
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
  if (config.columns.includes('status') && row.status === undefined && !partial) row.status = config.defaultStatus || 'active';
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
      const where = [];
      const params = {};
      // 提问模块对专家/管理员开放：他们要能看到所有人的问题才能人工回复；其它数据仍按账号隔离
      const seeAll = name === 'questions' && auth.canAnswerQuestion(req.user.role);
      if (!seeAll) {
        where.push('user_id = @user_id');
        params.user_id = req.user.id;
      }
      for (const key of ['base_id', 'batch_id', 'status', 'stage', 'level']) {
        if (req.query[key] !== undefined && config.columns.includes(key)) {
          where.push(`${key} = @${key}`);
          params[key] = (config.numeric || []).includes(key) ? number(req.query[key]) : text(req.query[key]);
        }
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const rows = db.prepare(`SELECT * FROM ${table} ${clause} ORDER BY ${config.order} LIMIT @limit`).all({ ...params, limit });
      ok(res, rows);
    } catch (error) {
      fail(res, 400, error.message);
    }
  });

  router.get('/:id', requirePermission(name, 'r'), (req, res) => {
    const seeAll = name === 'questions' && auth.canAnswerQuestion(req.user.role);
    const row = seeAll
      ? db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(Number(req.params.id))
      : db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).get(Number(req.params.id), req.user.id);
    if (!row) return fail(res, 404, '记录不存在');
    ok(res, row);
  });

  router.post('/', requirePermission(name, 'w'), async (req, res) => {
    try {
      const row = normalizeRow(config, req.body || {});
      // 提问类资源：不管是从「AI 问答」提问还是「向专家提问」表单提交，
      // 保存时就顺手自动回答一次，避免记录落库后一直停在“待回复”。
      // 有 AI 密钥走大模型，否则走规则知识库；自动回答失败也不影响提问本身保存，专家仍可人工补充回复。
      if (name === 'questions' && !row.answer) {
        try {
          const auto = await aiService.answerQuestion({
            question: row.content,
            userId: req.user.id,
            baseId: row.base_id || null,
            category: row.category || '',
            save: false
          });
          row.answer = auto.answer;
          row.answer_source = auto.source;
          row.ai_model = auto.model || '';
          row.status = 'answered';
          row.answered_at = new Date().toISOString();
        } catch (error) {
          console.warn('自动回答失败，问题按待回复保存：', error.message);
        }
      }
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
      const target = db.prepare(`SELECT id, user_id FROM ${table} WHERE id = ?`).get(id);
      if (!target) {
        return fail(res, 404, '记录不存在');
      }
      const isOwner = target.user_id === req.user.id;
      // 专家/管理员回复提问时，问题可能属于其它账号：仅限写入 answer 字段
      const replying = name === 'questions' && auth.canAnswerQuestion(req.user.role) && !isOwner;
      // 不是本人、又不能代专家回复的（如菇农改别人的提问），明确拒绝
      if (name === 'questions' && !isOwner && !auth.canAnswerQuestion(req.user.role)) {
        return fail(res, 403, `当前角色（${req.user.role_label}）不能代替专家回复问题`);
      }
      const row = normalizeRow(config, req.body || {}, true);
      if (!Object.keys(row).length) return fail(res, 400, '没有可更新字段');
      // 专家回复只能由专家/平台管理员执行：
      // questions 的写权限代表能“提问”，不能拿来替专家“回复”，否则菇农也能冒充专家答题。
      if (name === 'questions' && row.answer && !auth.canAnswerQuestion(req.user.role)) {
        return fail(res, 403, `当前角色（${req.user.role_label}）不能代替专家回复问题`);
      }
      // 专家人工补充回复：自动补上回答来源与状态，避免出现“已有回答但界面仍显示待回复”
      if (name === 'questions' && row.answer && !row.answer_source) {
        row.answer_source = 'expert';
        if (!row.status) row.status = 'answered';
        if (!row.answered_at) row.answered_at = new Date().toISOString();
      }
      if (config.updatedAt !== false) row.updated_at = new Date().toISOString();
      const assignments = Object.keys(row).map((key) => `${key} = @${key}`).join(', ');
      // 只允许改自己账号的数据：UPDATE 带 user_id 条件，影响 0 行说明这条记录不属于当前账号，
      // 必须显式报错 —— 否则接口会返回“更新成功”却什么都没改，前端与调用方都会被误导。
      const result = replying
        ? db.prepare(`UPDATE ${table} SET ${assignments} WHERE id = @id`).run({ ...row, id })
        : db.prepare(`UPDATE ${table} SET ${assignments} WHERE id = @id AND user_id = @user_id`).run({ ...row, id, user_id: req.user.id });
      if (!result.changes) {
        return fail(res, 403, '只能修改自己账号发布的内容，其它账号的记录只能查看');
      }
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

app.get('/api/health', (req, res) =>
  ok(res, {
    status: 'ok',
    time: new Date().toISOString(),
    ai_configured: aiService.aiConfigured(),
    ai_model: aiService.modelName()
  })
);

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

/** 按目标账号 + 密码分配职务：管理员输入对方账号密码核验后直接指定角色 */
app.post('/api/admin/users/assign', requireAuth, requireRole('admin'), (req, res) => {
  try {
    ok(res, auth.assignRoleByCredentials(req.body || {}), '角色已更新，对方重新登录后生效');
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

/** 管理员重置指定账号的登录密码：密码只存哈希无法查看，忘记密码时由管理员设置新密码 */
app.put('/api/admin/users/:id/password', requireAuth, requireRole('admin'), (req, res) => {
  try {
    ok(res, auth.adminResetPassword(Number(req.params.id), String(req.body?.password || '')), '密码已重置，请把新密码告知对方');
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

/** ---------- 大棚硬件设备：设备档案、密钥与在线状态 ---------- */

app.get('/api/devices', requireAuth, requirePermission('devices', 'r'), (req, res) => {
  try {
    ok(res, deviceService.listDevices(req.user.id));
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

app.post('/api/devices', requireAuth, requirePermission('devices', 'w'), (req, res) => {
  try {
    ok(res, deviceService.createDevice(req.user.id, req.body || {}), '设备已创建，请把编号和密钥填入大棚网关');
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

app.get('/api/devices/:id', requireAuth, requirePermission('devices', 'r'), (req, res) => {
  try {
    const device = deviceService.getDevice(req.params.id, req.user.id);
    if (!device) return fail(res, 404, '设备不存在');
    ok(res, deviceService.listDevices(req.user.id).find((item) => item.id === device.id));
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

app.put('/api/devices/:id', requireAuth, requirePermission('devices', 'w'), (req, res) => {
  try {
    ok(res, deviceService.updateDevice(req.params.id, req.user.id, req.body || {}), '设备已更新');
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

app.delete('/api/devices/:id', requireAuth, requirePermission('devices', 'w'), (req, res) => {
  try {
    ok(res, deviceService.deleteDevice(req.params.id, req.user.id), '设备已删除');
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

/** 设备历史曲线：等长分桶聚合，供小程序画趋势 */
app.get('/api/devices/:id/series', requireAuth, requirePermission('devices', 'r'), (req, res) => {
  try {
    ok(res, deviceService.seriesForDevice(req.params.id, req.user.id, req.query.hours || 24, req.query.buckets || 12));
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

app.get('/api/devices/:id/secret', requireAuth, requirePermission('devices', 'w'), (req, res) => {
  try {
    ok(res, deviceService.revealSecret(req.params.id, req.user.id));
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

app.post('/api/devices/:id/rotate', requireAuth, requirePermission('devices', 'w'), (req, res) => {
  try {
    ok(res, deviceService.rotateSecret(req.params.id, req.user.id), '设备密钥已重置，请同步更新硬件配置');
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

/**
 * ---------- 硬件自动上报入口（设备密钥鉴权，不需要账号登录）----------
 *
 * 大棚网关 / 传感器按下面格式定时上报即可，环境数据自动写入数据库并触发阈值预警：
 *
 *   curl -X POST http://<后台地址>/api/ingest/readings \
 *     -H "X-Device-Code: GS-XXXXXX" \
 *     -H "X-Device-Secret: <设备密钥>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"temperature":24.5,"humidity":88,"co2":650,"light":320}'
 *
 * 也支持 Authorization: Device <编号>:<密钥>
 */
app.post('/api/ingest/readings', (req, res) => {
  try {
    const device = deviceService.resolveDevice(req);
    const result = deviceService.ingestReading(device, req.body || {});
    ok(res, result, result.alerts.length ? `已保存，自动生成 ${result.alerts.length} 条预警` : '已保存');
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

app.post('/api/ingest/heartbeat', (req, res) => {
  try {
    const device = deviceService.resolveDevice(req);
    ok(res, deviceService.heartbeat(device), '心跳已记录');
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

/** 设备开机自检：读取自己的阈值配置与服务器时间 */
app.get('/api/ingest/config', (req, res) => {
  try {
    const device = deviceService.resolveDevice(req);
    ok(res, {
      code: device.code,
      name: device.name,
      status: device.status,
      base_id: device.base_id,
      thresholds: { temp_max: device.temp_max, humidity_min: device.humidity_min, co2_max: device.co2_max },
      server_time: new Date().toISOString()
    });
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
    devices: db.prepare('SELECT COUNT(*) AS count FROM devices WHERE user_id = ?').get(uid).count,
    devicesOnline: db
      .prepare('SELECT COUNT(*) AS count FROM devices WHERE user_id = ? AND last_seen_at >= ?')
      .get(uid, new Date(Date.now() - deviceService.ONLINE_WINDOW_MS).toISOString()).count,
    deviceReadings: db
      .prepare("SELECT COUNT(*) AS count FROM readings WHERE user_id = ? AND source = 'device'")
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

/** ---------- AI 智能问答（专家服务的 AI 接入）---------- */

app.get('/api/ai/status', requireAuth, requirePermission('ai', 'r'), (req, res) =>
  ok(res, {
    configured: aiService.aiConfigured(),
    model: aiService.modelName(),
    knowledge_entries: aiService.KNOWLEDGE.length,
    note: aiService.aiConfigured() ? '已接入大模型' : '未配置 AI_API_KEY，当前使用规则知识库'
  })
);

app.post('/api/ai/ask', requireAuth, requirePermission('ai', 'r'), async (req, res) => {
  try {
    const result = await aiService.answerQuestion({
      question: text(req.body?.question),
      userId: req.user.id,
      baseId: req.body?.base_id || null,
      category: text(req.body?.category),
      save: req.body?.save !== false
    });
    ok(res, result, result.source === 'ai' ? 'AI 已回答' : '已给出规则知识库答复');
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

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

/**
 * 产销对接：所有账号上架的供应信息互通可见（只读）。
 * 每个账号的生产数据仍然互相隔离，供应信息是唯一的例外 ——
 * 否则采购商登录后看不到任何货源，平台就没有撮合的意义。
 * 修改 / 删除仍然只能作用于自己发布的记录（见 /api/products/:id，带 user_id 校验）。
 *
 * 必须定义在下面的通用 CRUD 之前，否则会被 /api/products/:id 抢先匹配。
 */
app.get('/api/products/shared', requireAuth, requirePermission('products', 'r'), (req, res) => {
  try {
    const rows = db
      .prepare(`
        SELECT p.*,
               u.display_name AS owner_name,
               u.username AS owner_username,
               u.role AS owner_role,
               b.name AS base_name,
               bt.code AS batch_code
        FROM products p
        LEFT JOIN users u ON u.id = p.user_id
        LEFT JOIN batches bt ON bt.id = p.batch_id
        LEFT JOIN bases b ON b.id = bt.base_id
        WHERE p.user_id <> ?
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT 100
      `)
      .all(req.user.id);
    ok(res, rows);
  } catch (error) {
    fail(res, 400, error.message);
  }
});

/**
 * ---------- 产销对接：订单交易 ----------
 * 采购商在「市场」里对供应信息下单，走完整链路：下单 → 支付 → 发货 → 收货。
 * 订单同时属于买卖双方，因此不走通用 CRUD 的 user_id 单向隔离，单独实现。
 */
app.get('/api/orders', requireAuth, requirePermission('orders', 'r'), (req, res) => {
  try {
    ok(res, orderService.listOrders(req.user, req.query || {}));
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

app.post('/api/orders', requireAuth, requirePermission('orders', 'w'), (req, res) => {
  try {
    const order = orderService.createOrder(req.user, req.body || {});
    ok(res, order, order.pay_method === 'offline' ? '下单成功，等待供货方发货' : '下单成功，请完成支付');
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

app.get('/api/orders/:id', requireAuth, requirePermission('orders', 'r'), (req, res) => {
  try {
    ok(res, orderService.getOrder(req.user, req.params.id));
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

/** 买家支付（演示环境无真实支付通道，点确认即视为已支付） */
app.post('/api/orders/:id/pay', requireAuth, requirePermission('orders', 'w'), (req, res) => {
  try {
    ok(res, orderService.payOrder(req.user, req.params.id), '支付成功，等待供货方发货');
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

/** 卖家发货 */
app.post('/api/orders/:id/ship', requireAuth, requirePermission('orders', 'w'), (req, res) => {
  try {
    ok(res, orderService.shipOrder(req.user, req.params.id), '已标记发货');
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

/** 买家确认收货 */
app.post('/api/orders/:id/receive', requireAuth, requirePermission('orders', 'w'), (req, res) => {
  try {
    ok(res, orderService.receiveOrder(req.user, req.params.id), '已确认收货，订单完成');
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

/** 取消订单（发货前买卖双方均可，库存自动回补） */
app.post('/api/orders/:id/cancel', requireAuth, requirePermission('orders', 'w'), (req, res) => {
  try {
    ok(res, orderService.cancelOrder(req.user, req.params.id, req.body?.reason), '订单已取消');
  } catch (error) {
    fail(res, error.status || 400, error.message);
  }
});

for (const [name, config] of Object.entries(configs)) app.use(`/api/${name}`, makeCrudRouter(name, config));

/**
 * 一体部署：设置环境变量 H5_DIST 时，把小程序浏览器版产物直接挂到根路径（含 SPA 兜底）。
 * 这样静态页面与接口共用同一个端口，云端部署只需要暴露一个端口即可访问完整应用。
 */
const H5_DIST = process.env.H5_DIST ? path.resolve(process.env.H5_DIST) : '';
const H5_INDEX = H5_DIST ? path.join(H5_DIST, 'index.html') : '';
const HAS_H5 = Boolean(H5_INDEX) && fs.existsSync(H5_INDEX);
if (HAS_H5) {
  app.use(express.static(H5_DIST));
}

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (HAS_H5) return res.sendFile(H5_INDEX);
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
