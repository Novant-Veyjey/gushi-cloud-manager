/**
 * MQTT 适配层：把 MQTT broker 上的设备报文转换成后台入库 + 阈值预警。
 *
 * 数据链路：大棚设备 --MQTT--> broker --订阅--> 本适配层 --> readings / alerts / devices
 * 复用 server/devices.js 的同一套鉴权与入库逻辑，HTTP 上报与 MQTT 上报结果完全一致。
 *
 * 主题约定（前缀可用 MQTT_TOPIC_PREFIX 配置，默认 gushi）：
 *   gushi/devices/<设备编号>/readings    上报环境数据
 *   gushi/devices/<设备编号>/heartbeat   仅心跳
 *
 * 报文必须是 JSON，且带设备密钥（也可用 MQTT 用户名代替密钥）：
 *   {"secret":"<设备密钥>","temperature":24.5,"humidity":88,"co2":650,"light":320}
 *
 * 启动：npm run mqtt
 */
const { loadEnvFile } = require('./env');

loadEnvFile();

const deviceService = require('./devices');

const TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX || 'gushi';
const READINGS_TOPIC = `${TOPIC_PREFIX}/devices/+/readings`;
const HEARTBEAT_TOPIC = `${TOPIC_PREFIX}/devices/+/heartbeat`;

function log(...args) {
  console.log(`[mqtt-bridge ${new Date().toISOString()}]`, ...args);
}

/** 从主题里取设备编号：gushi/devices/<code>/readings */
function codeFromTopic(topic) {
  const parts = String(topic).split('/');
  return parts.length >= 3 ? parts[parts.length - 2] : '';
}

function parsePayload(buffer) {
  try {
    return JSON.parse(String(buffer));
  } catch (error) {
    throw new Error('报文不是合法 JSON');
  }
}

/**
 * 处理一条 MQTT 报文。
 * @param {string} topic 主题
 * @param {Buffer|string} payload 报文
 * @param {string} username broker 连接用户名（可选，作为密钥来源）
 */
function handleMessage(topic, payload, username = '') {
  const code = codeFromTopic(topic);
  const body = parsePayload(payload);
  const secret = String(body.secret || username || '');
  const device = deviceService.authenticateDevice(code, secret);

  if (String(topic).endsWith('/heartbeat')) {
    deviceService.heartbeat(device);
    return { type: 'heartbeat', code: device.code, online: true };
  }

  const result = deviceService.ingestReading(device, body);
  return {
    type: 'reading',
    code: device.code,
    reading_id: result.reading.id,
    alerts: result.alerts.length
  };
}

/**
 * 连接 broker 并订阅。
 * 单独导出便于测试（测试里可以先起一个本地 broker 再调用）。
 */
function createBridge(options = {}) {
  let mqtt;
  try {
    mqtt = require('mqtt');
  } catch (error) {
    throw new Error('未安装 mqtt 依赖，请先在 后台 目录执行：npm install mqtt');
  }

  const url = options.url || process.env.MQTT_URL || 'mqtt://127.0.0.1:1883';
  const client = mqtt.connect(url, {
    username: options.username || process.env.MQTT_USERNAME || undefined,
    password: options.password || process.env.MQTT_PASSWORD || undefined,
    clientId: `${TOPIC_PREFIX}-bridge-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 3000
  });

  const stats = { readings: 0, heartbeats: 0, errors: 0 };

  client.on('connect', () => {
    log(`已连接 ${url}，订阅 ${READINGS_TOPIC} 与 ${HEARTBEAT_TOPIC}`);
    client.subscribe([READINGS_TOPIC, HEARTBEAT_TOPIC], { qos: 0 }, (error) => {
      if (error) log('订阅失败：', error.message);
    });
  });

  client.on('message', (topic, payload) => {
    try {
      const result = handleMessage(topic, payload, client.options.username || '');
      if (result.type === 'reading') {
        stats.readings += 1;
        log(`入库 ${result.code}: reading#${result.reading_id}${result.alerts ? ` 触发预警 ${result.alerts} 条` : ''}`);
      } else {
        stats.heartbeats += 1;
        log(`心跳 ${result.code}`);
      }
      if (typeof options.onMessage === 'function') options.onMessage(result, topic, payload);
    } catch (error) {
      stats.errors += 1;
      log(`丢弃报文（${topic}）：${error.message}`);
      if (typeof options.onError === 'function') options.onError(error, topic, payload);
    }
  });

  client.on('error', (error) => {
    log('连接错误：', error.message);
  });

  return { client, stats };
}

if (require.main === module) {
  const { client } = createBridge();
  const shutdown = () => {
    log('正在退出...');
    client.end(true, () => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { createBridge, handleMessage, codeFromTopic, READINGS_TOPIC, HEARTBEAT_TOPIC, TOPIC_PREFIX };
