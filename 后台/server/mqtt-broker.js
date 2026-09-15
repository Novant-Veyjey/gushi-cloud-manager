/**
 * 本地 MQTT broker（纯 JS，基于 aedes），用于没有真实 broker 时演示与联调。
 * 生产环境请使用 EMQX / Mosquitto 等正式 broker，并把 MQTT_URL 指向它。
 *
 * 启动：npm run mqtt:broker
 * 默认端口 1883（可用 MQTT_BROKER_PORT 修改）
 */
const { loadEnvFile } = require('./env');

loadEnvFile();

const net = require('net');

/** aedes v0 是 CommonJS 工厂函数，v1 是 ESM（默认导出工厂 / 具名导出 Aedes 类），这里做兼容 */
function createBroker() {
  let module;
  try {
    module = require('aedes');
  } catch (error) {
    console.error('未安装 aedes（仅用于本地演示 broker），请执行：npm install -D aedes');
    process.exit(1);
  }
  if (typeof module === 'function') return module();
  if (module && typeof module.default === 'function') return module.default();
  if (module && module.Aedes) return new module.Aedes();
  console.error('无法创建 aedes broker，请检查 aedes 版本');
  process.exit(1);
}

const port = Number(process.env.MQTT_BROKER_PORT || 1883);
const broker = createBroker();
const server = net.createServer(broker.handle);

broker.on('client', (client) => console.log(`[broker] 设备接入：${client.id}`));
broker.on('clientDisconnect', (client) => console.log(`[broker] 设备断开：${client.id}`));
broker.on('publish', (packet, client) => {
  if (client) console.log(`[broker] 收到报文：${packet.topic} <- ${client.id}`);
});

server.listen(port, () => {
  console.log(`本地 MQTT broker 已启动：mqtt://127.0.0.1:${port}`);
  console.log('另开一个终端执行 npm run mqtt 启动适配层，即可把报文写入数据库。');
});
