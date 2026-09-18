const { db } = require('./db');

/** 默认阈值：温度上限、湿度下限、CO₂ 上限，可按设备单独配置 */
const DEFAULT_THRESHOLDS = { temp_max: 26, humidity_min: 80, co2_max: 800 };

/**
 * 按阈值判断一条环境记录，生成预警。
 * thresholds 可以来自设备配置，未提供的项使用默认值。
 * 返回本次生成的预警列表。
 */
function evaluateReadingAlerts(reading, thresholds = {}) {
  const rules = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const alerts = [];

  if (reading.temperature !== null && reading.temperature !== undefined && reading.temperature > rules.temp_max) {
    alerts.push({ type: '温度偏高', level: 'high', message: `温度 ${reading.temperature}℃ 超过 ${rules.temp_max}℃ 阈值` });
  }
  if (reading.humidity !== null && reading.humidity !== undefined && reading.humidity < rules.humidity_min) {
    alerts.push({ type: '湿度偏低', level: 'medium', message: `湿度 ${reading.humidity}% 低于 ${rules.humidity_min}% 阈值` });
  }
  if (reading.co2 !== null && reading.co2 !== undefined && reading.co2 > rules.co2_max) {
    alerts.push({ type: 'CO₂ 偏高', level: 'high', message: `CO₂ ${reading.co2} ppm 超过 ${rules.co2_max} ppm 阈值` });
  }

  const insert = db.prepare(
    `INSERT INTO alerts (base_id, reading_id, alert_type, level, message, status, user_id) VALUES (?, ?, ?, ?, ?, 'open', ?)`
  );
  // 设备每 30 秒上报一次，异常不解除时同类型预警会被刷爆。
  // 同一基地存在未处理（open）的同类型预警时先去重，处理后再次超阈值才会重新预警。
  const findOpen = db.prepare(
    `SELECT id FROM alerts WHERE status = 'open' AND COALESCE(base_id, 0) = COALESCE(?, 0) AND alert_type = ? LIMIT 1`
  );
  const created = [];
  for (const alert of alerts) {
    if (findOpen.get(reading.base_id || null, alert.type)) continue;
    const result = insert.run(reading.base_id || null, reading.id, alert.type, alert.level, alert.message, reading.user_id || null);
    created.push({
      id: Number(result.lastInsertRowid),
      alert_type: alert.type,
      level: alert.level,
      message: alert.message,
      status: 'open',
      reading_id: reading.id,
      base_id: reading.base_id || null
    });
  }
  return created;
}

module.exports = { DEFAULT_THRESHOLDS, evaluateReadingAlerts };
