/**
 * MQTT 适配层端到端测试：
 * 起一个本地 broker（aedes）→ 适配层订阅 → 发布设备报文 → 校验数据库入库与自动预警。
 *
 * 运行：npm run test:mqtt
 */
const { loadEnvFile } = require('./env');

loadEnvFile();

const net = require('net');
const mqtt = require('mqtt');
const { db } = require('./db');
const { register } = require('./auth');
const deviceService = require('./devices');
const { createBridge, TOPIC_PREFIX } = require('./mqtt-bridge');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** aedes v0 是 CommonJS 工厂函数，v1 是 ESM（默认导出工厂 / 具名导出 Aedes 类），这里做兼容 */
function createBroker() {
  const module = require('aedes');
  if (typeof module === 'function') return module();
  if (module && typeof module.default === 'function') return module.default();
  if (module && module.Aedes) return new module.Aedes();
  throw new Error('无法创建 aedes broker，请检查 aedes 版本');
}

(async () => {
  const broker = createBroker();
  const server = net.createServer(broker.handle);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const url = `mqtt://127.0.0.1:${port}`;
  console.log(`测试 broker 已启动：${url}`);

  const suffix = Date.now();
  const session = register({ username: `mqtt_${suffix}`, password: 'mqtt123456', display_name: 'MQTT 测试', role: 'farmer' });
  const userId = session.user.id;
  const device = deviceService.createDevice(userId, { name: 'MQTT 测试网关', model: 'ESP32-C3' });
  console.log(`测试设备：${device.code}`);

  const received = [];
  const errors = [];
  const bridge = createBridge({
    url,
    onMessage: (result) => received.push(result),
    onError: (error) => errors.push(error.message)
  });

  const publisher = mqtt.connect(url, { clientId: `device-${suffix}` });
  await new Promise((resolve, reject) => {
    bridge.client.once('connect', resolve);
    bridge.client.once('error', reject);
  });
  await new Promise((resolve, reject) => {
    publisher.once('connect', resolve);
    publisher.once('error', reject);
  });
  console.log('适配层与设备均已连接 broker');

  try {
    // 1. 正常上报：超阈值数据应入库并生成 3 条预警
    publisher.publish(
      `${TOPIC_PREFIX}/devices/${device.code}/readings`,
      JSON.stringify({ secret: device.secret, temperature: 30.2, humidity: 68, co2: 980, light: 240 })
    );
    for (let i = 0; i < 40 && !received.some((item) => item.type === 'reading'); i += 1) await wait(50);
    const ingested = received.find((item) => item.type === 'reading');
    if (!ingested) throw new Error('适配层没有把 MQTT 报文写入数据库');
    if (ingested.alerts !== 3) throw new Error(`期望生成 3 条预警，实际 ${ingested.alerts}`);

    const reading = db.prepare('SELECT * FROM readings WHERE id = ?').get(ingested.reading_id);
    if (!reading || reading.source !== 'device' || reading.user_id !== userId) {
      throw new Error('入库记录的来源或归属不正确');
    }
    console.log(`入库成功：reading#${reading.id} 温度 ${reading.temperature}℃ 来源 ${reading.source} 预警 ${ingested.alerts} 条`);

    // 2. 心跳
    publisher.publish(`${TOPIC_PREFIX}/devices/${device.code}/heartbeat`, JSON.stringify({ secret: device.secret }));
    for (let i = 0; i < 40 && !received.some((item) => item.type === 'heartbeat'); i += 1) await wait(50);
    if (!received.some((item) => item.type === 'heartbeat')) throw new Error('心跳报文没有被处理');
    console.log('心跳处理成功，设备在线状态已刷新');

    // 3. 密钥错误：必须丢弃，不写入数据库
    const before = db.prepare('SELECT COUNT(*) AS count FROM readings WHERE user_id = ?').get(userId).count;
    publisher.publish(
      `${TOPIC_PREFIX}/devices/${device.code}/readings`,
      JSON.stringify({ secret: 'wrong-secret', temperature: 99, humidity: 10, co2: 9999 })
    );
    for (let i = 0; i < 40 && !errors.length; i += 1) await wait(50);
    const after = db.prepare('SELECT COUNT(*) AS count FROM readings WHERE user_id = ?').get(userId).count;
    if (!errors.length) throw new Error('密钥错误没有被拒绝');
    if (after !== before) throw new Error('密钥错误的数据被误写入数据库');
    console.log(`密钥错误已拒绝并丢弃：${errors[0]}`);

    // 4. 历史曲线聚合接口
    const series = deviceService.seriesForDevice(device.id, userId, 24, 12);
    if (!series.total_records || series.buckets.length !== 12) throw new Error('历史曲线聚合结果不正确');
    const hot = series.buckets.filter((bucket) => bucket.temperature).map((bucket) => bucket.temperature.max);
    console.log(`历史曲线：${series.total_records} 条记录 → ${series.buckets.length} 个时间桶，最高温 ${Math.max(...hot)}℃`);

    console.log('MQTT tests passed：订阅入库、自动预警、心跳、密钥校验、历史曲线聚合均通过');
  } finally {
    publisher.end(true);
    bridge.client.end(true);
    for (const table of ['alerts', 'readings', 'devices', 'ingest_logs', 'sessions']) {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    await new Promise((resolve) => broker.close(resolve));
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
