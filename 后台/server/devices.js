const crypto = require('crypto');

const { db } = require('./db');
const { DEFAULT_THRESHOLDS, evaluateReadingAlerts } = require('./alerts');

/** 超过该时间没有上报即视为离线 */
const ONLINE_WINDOW_MS = 10 * 60 * 1000;

function text(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function numberOr(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function maskSecret(secret) {
  const value = text(secret);
  if (!value) return '';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function generateDeviceCode() {
  return `GS-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function generateSecret() {
  return crypto.randomBytes(16).toString('hex');
}

function isOnline(device) {
  if (!device || !device.last_seen_at) return false;
  const seen = new Date(String(device.last_seen_at).replace(' ', 'T')).getTime();
  if (Number.isNaN(seen)) return false;
  return Date.now() - seen < ONLINE_WINDOW_MS;
}

function publicDevice(device, options = {}) {
  if (!device) return null;
  const base = db.prepare('SELECT name FROM bases WHERE id = ?').get(device.base_id);
  return {
    id: device.id,
    base_id: device.base_id,
    base_name: base ? base.name : '',
    name: device.name,
    code: device.code,
    model: device.model || '',
    status: device.status,
    temp_max: device.temp_max,
    humidity_min: device.humidity_min,
    co2_max: device.co2_max,
    last_seen_at: device.last_seen_at || '',
    last_values: device.last_values ? JSON.parse(device.last_values) : null,
    notes: device.notes || '',
    online: isOnline(device),
    created_at: device.created_at,
    ...(options.withSecret ? { secret: device.secret } : { secret_masked: maskSecret(device.secret) })
  };
}

function listDevices(userId) {
  const rows = db.prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  return rows.map((row) => publicDevice(row));
}

function getDevice(id, userId) {
  return db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(Number(id), userId);
}

function deviceByCode(code) {
  return db.prepare('SELECT * FROM devices WHERE code = ?').get(text(code));
}

function createDevice(userId, payload = {}) {
  const name = text(payload.name);
  if (!name) {
    const error = new Error('设备名称必填');
    error.status = 400;
    throw error;
  }

  // 设备编号可以自定义，也可以由后台生成；必须唯一
  let code = text(payload.code).toUpperCase();
  if (code) {
    if (!/^[A-Z0-9\-_]{4,32}$/.test(code)) {
      const error = new Error('设备编号只能使用字母、数字、中划线和下划线，长度 4-32 位');
      error.status = 400;
      throw error;
    }
    if (deviceByCode(code)) {
      const error = new Error('设备编号已存在');
      error.status = 409;
      throw error;
    }
  } else {
    do {
      code = generateDeviceCode();
    } while (deviceByCode(code));
  }

  const secret = generateSecret();
  const baseId = numberOrNull(payload.base_id);
  if (baseId && !db.prepare('SELECT id FROM bases WHERE id = ? AND user_id = ?').get(baseId, userId)) {
    const error = new Error('所属基地不存在');
    error.status = 400;
    throw error;
  }

  const result = db
    .prepare(
      `INSERT INTO devices (user_id, base_id, name, code, secret, model, status, temp_max, humidity_min, co2_max, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      baseId,
      name,
      code,
      secret,
      text(payload.model),
      text(payload.status) || 'active',
      numberOr(payload.temp_max, DEFAULT_THRESHOLDS.temp_max),
      numberOr(payload.humidity_min, DEFAULT_THRESHOLDS.humidity_min),
      numberOr(payload.co2_max, DEFAULT_THRESHOLDS.co2_max),
      text(payload.notes)
    );

  return publicDevice(db.prepare('SELECT * FROM devices WHERE id = ?').get(result.lastInsertRowid), { withSecret: true });
}

function updateDevice(id, userId, payload = {}) {
  const device = getDevice(id, userId);
  if (!device) {
    const error = new Error('设备不存在');
    error.status = 404;
    throw error;
  }

  const fields = {};
  if (payload.name !== undefined) fields.name = text(payload.name);
  if (payload.model !== undefined) fields.model = text(payload.model);
  if (payload.status !== undefined) fields.status = text(payload.status) || 'active';
  if (payload.notes !== undefined) fields.notes = text(payload.notes);
  if (payload.base_id !== undefined) {
    const baseId = numberOrNull(payload.base_id);
    if (baseId && !db.prepare('SELECT id FROM bases WHERE id = ? AND user_id = ?').get(baseId, userId)) {
      const error = new Error('所属基地不存在');
      error.status = 400;
      throw error;
    }
    fields.base_id = baseId;
  }
  if (payload.temp_max !== undefined) fields.temp_max = numberOr(payload.temp_max, device.temp_max);
  if (payload.humidity_min !== undefined) fields.humidity_min = numberOr(payload.humidity_min, device.humidity_min);
  if (payload.co2_max !== undefined) fields.co2_max = numberOr(payload.co2_max, device.co2_max);

  if (!Object.keys(fields).length) {
    const error = new Error('没有可更新字段');
    error.status = 400;
    throw error;
  }

  fields.updated_at = new Date().toISOString();
  const assignments = Object.keys(fields).map((key) => `${key} = @${key}`).join(', ');
  db.prepare(`UPDATE devices SET ${assignments} WHERE id = @id AND user_id = @user_id`).run({ ...fields, id: Number(id), user_id: userId });
  return publicDevice(getDevice(id, userId));
}

function deleteDevice(id, userId) {
  const result = db.prepare('DELETE FROM devices WHERE id = ? AND user_id = ?').run(Number(id), userId);
  if (!result.changes) {
    const error = new Error('设备不存在');
    error.status = 404;
    throw error;
  }
  return { id: Number(id) };
}

function rotateSecret(id, userId) {
  const device = getDevice(id, userId);
  if (!device) {
    const error = new Error('设备不存在');
    error.status = 404;
    throw error;
  }
  const secret = generateSecret();
  db.prepare('UPDATE devices SET secret = ?, updated_at = ? WHERE id = ?').run(secret, new Date().toISOString(), device.id);
  return publicDevice(getDevice(id, userId), { withSecret: true });
}

function revealSecret(id, userId) {
  const device = getDevice(id, userId);
  if (!device) {
    const error = new Error('设备不存在');
    error.status = 404;
    throw error;
  }
  return { id: device.id, code: device.code, secret: device.secret };
}

/** 从请求头解析设备身份，支持 X-Device-Code / X-Device-Secret 或 Authorization: Device code:secret */
function resolveDevice(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Device\s+(.+)$/i);
  let code = text(req.headers['x-device-code']);
  let secret = text(req.headers['x-device-secret']);

  if (match) {
    const [c, s] = match[1].split(':');
    code = code || text(c);
    secret = secret || text(s);
  }

  if (!code || !secret) {
    const error = new Error('缺少设备编号或设备密钥');
    error.status = 401;
    throw error;
  }

  const device = deviceByCode(code);
  if (!device || device.secret !== secret) {
    const error = new Error('设备编号或密钥不正确');
    error.status = 401;
    throw error;
  }
  if (device.status !== 'active') {
    const error = new Error('设备已被停用，请先在后台启用');
    error.status = 403;
    throw error;
  }
  return device;
}

/**
 * 写入一条设备上报的环境数据：
 * 1) 保存到 readings（source=device，带 device_id）
 * 2) 按设备阈值自动生成预警
 * 3) 刷新设备在线状态与最新读数
 */
function ingestReading(device, payload = {}) {
  const reading = {
    base_id: device.base_id || null,
    device_id: device.id,
    device_name: device.name,
    temperature: numberOrNull(payload.temperature),
    humidity: numberOrNull(payload.humidity),
    co2: numberOrNull(payload.co2),
    light: numberOrNull(payload.light),
    recorded_at: text(payload.recorded_at) || new Date().toISOString(),
    notes: text(payload.notes) || '硬件自动上报',
    user_id: device.user_id,
    source: 'device'
  };

  if (reading.temperature === null && reading.humidity === null && reading.co2 === null && reading.light === null) {
    const error = new Error('至少需要上报温度、湿度、CO₂ 或光照中的一项');
    error.status = 400;
    throw error;
  }

  const result = db
    .prepare(
      `INSERT INTO readings (base_id, device_id, device_name, temperature, humidity, co2, light, recorded_at, notes, user_id, source)
       VALUES (@base_id, @device_id, @device_name, @temperature, @humidity, @co2, @light, @recorded_at, @notes, @user_id, @source)`
    )
    .run(reading);

  const created = db.prepare('SELECT * FROM readings WHERE id = ?').get(result.lastInsertRowid);
  const alerts = evaluateReadingAlerts(created, {
    temp_max: device.temp_max,
    humidity_min: device.humidity_min,
    co2_max: device.co2_max
  });

  touchDevice(device, created);
  db.prepare('INSERT INTO ingest_logs (device_id, user_id, temperature, humidity, co2, light, result) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    device.id,
    device.user_id,
    reading.temperature,
    reading.humidity,
    reading.co2,
    reading.light,
    alerts.length ? `预警 ${alerts.length} 条` : '正常'
  );

  return { reading: created, alerts };
}

function touchDevice(device, reading) {
  db.prepare('UPDATE devices SET last_seen_at = ?, last_values = ?, updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    JSON.stringify({
      temperature: reading.temperature,
      humidity: reading.humidity,
      co2: reading.co2,
      light: reading.light,
      recorded_at: reading.recorded_at
    }),
    new Date().toISOString(),
    device.id
  );
}

/** 心跳：只刷新在线状态，不写入环境数据 */
function heartbeat(device) {
  touchDevice(device, { ...(device.last_values ? JSON.parse(device.last_values) : {}) });
  const fresh = db.prepare('SELECT * FROM devices WHERE id = ?').get(device.id);
  return { device: publicDevice(fresh), online: isOnline(fresh) };
}

module.exports = {
  ONLINE_WINDOW_MS,
  DEFAULT_THRESHOLDS,
  maskSecret,
  isOnline,
  listDevices,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
  rotateSecret,
  revealSecret,
  resolveDevice,
  ingestReading,
  heartbeat
};
