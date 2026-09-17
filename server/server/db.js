const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = process.env.DB_PATH || path.join(dataDir, 'gushi.sqlite');
const db = new Database(dbPath);

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'farmer',
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  township TEXT DEFAULT '',
  address TEXT DEFAULT '',
  contact_name TEXT DEFAULT '',
  contact_phone TEXT DEFAULT '',
  area_mu REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  base_id INTEGER,
  mushroom_type TEXT NOT NULL,
  variety TEXT DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT '接种期',
  start_date TEXT NOT NULL,
  expected_harvest_date TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(base_id) REFERENCES bases(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  base_id INTEGER,
  device_name TEXT DEFAULT '',
  temperature REAL,
  humidity REAL,
  co2 REAL,
  light REAL,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(base_id) REFERENCES bases(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  base_id INTEGER,
  reading_id INTEGER,
  alert_type TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'medium',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  handled_at TEXT DEFAULT '',
  FOREIGN KEY(base_id) REFERENCES bases(id) ON DELETE SET NULL,
  FOREIGN KEY(reading_id) REFERENCES readings(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS trace_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  event_date TEXT NOT NULL,
  operator TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(batch_id) REFERENCES batches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expert_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  base_id INTEGER,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT '',
  answer TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  answered_at TEXT DEFAULT '',
  FOREIGN KEY(base_id) REFERENCES bases(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '',
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'kg',
  price REAL DEFAULT 0,
  available_date TEXT DEFAULT '',
  off_shelf_date TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'available',
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(batch_id) REFERENCES batches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS demands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'kg',
  price REAL DEFAULT 0,
  requirements TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  batch_id INTEGER,
  priority TEXT NOT NULL DEFAULT 'medium',
  due_date TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(batch_id) REFERENCES batches(id) ON DELETE SET NULL
);

/**
 * 订单：采购商针对某条供应信息下单，形成「下单 → 支付 → 发货 → 收货」的完整交易链路。
 * 与其它业务表不同，订单同时属于买卖双方（buyer_id / seller_id），不能按 user_id 单向隔离。
 */
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  product_icon TEXT DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'kg',
  price REAL DEFAULT 0,
  quantity REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  batch_id INTEGER,
  batch_code TEXT DEFAULT '',
  base_name TEXT DEFAULT '',
  seller_id INTEGER NOT NULL,
  seller_name TEXT DEFAULT '',
  buyer_id INTEGER NOT NULL,
  buyer_name TEXT DEFAULT '',
  buyer_contact TEXT DEFAULT '',
  address TEXT DEFAULT '',
  remark TEXT DEFAULT '',
  /** created=待付款 paid=待发货 shipped=待收货 received=已完成 cancelled=已取消 */
  status TEXT NOT NULL DEFAULT 'created',
  /** online=在线支付(演示) offline=货到付款 */
  pay_method TEXT NOT NULL DEFAULT 'online',
  pay_time TEXT DEFAULT '',
  ship_time TEXT DEFAULT '',
  receive_time TEXT DEFAULT '',
  cancel_time TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY(batch_id) REFERENCES batches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  base_id INTEGER,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  secret TEXT NOT NULL,
  model TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  temp_max REAL DEFAULT 26,
  humidity_min REAL DEFAULT 80,
  co2_max REAL DEFAULT 800,
  last_seen_at TEXT DEFAULT '',
  last_values TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(base_id) REFERENCES bases(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ingest_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER,
  user_id INTEGER,
  temperature REAL,
  humidity REAL,
  co2 REAL,
  light REAL,
  result TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_batches_base ON batches(base_id);
CREATE INDEX IF NOT EXISTS idx_readings_base_time ON readings(base_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status, created_at);
CREATE INDEX IF NOT EXISTS idx_trace_batch ON trace_events(batch_id, event_date);
CREATE INDEX IF NOT EXISTS idx_products_batch ON products(batch_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
`;

db.exec(schema);

/**
 * 轻量迁移：为业务表补列，兼容已有数据库文件。
 * 旧数据（user_id 为空）不会被删除，只是不会再出现在任何账号的数据里。
 */
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const productColumns = db.prepare('PRAGMA table_info(products)').all().map((column) => column.name);
if (!productColumns.includes('icon')) db.exec("ALTER TABLE products ADD COLUMN icon TEXT DEFAULT ''");

/** 供应信息上下架日期：旧库补列，兼容已有数据库文件 */
ensureColumn('products', 'off_shelf_date', "TEXT DEFAULT ''");

/**
 * 早期版本对所有带 status 的表统一兜底成 'active'，但供应信息是用 'available' 表示「可供应」，
 * 导致新建产品一保存就被判成「已下架」。这里把历史脏数据回填为 'available'。
 */
db.exec("UPDATE products SET status = 'available' WHERE status = 'active'");

/** 每个账号的数据通过 user_id 隔离，所有业务表都需要该字段 */
const businessTables = ['partners', 'bases', 'batches', 'readings', 'alerts', 'trace_events', 'expert_questions', 'products', 'demands', 'tasks', 'devices'];
for (const table of businessTables) {
  ensureColumn(table, 'user_id', 'INTEGER');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_user ON ${table}(user_id)`);
}

/** 环境数据来源：manual（手动补录）/ device（大棚硬件自动上报） */
ensureColumn('readings', 'device_id', 'INTEGER');
ensureColumn('readings', 'source', "TEXT DEFAULT 'manual'");

/** AI 问答：标记回答来源，便于区分 AI、规则知识库与人工专家 */
ensureColumn('expert_questions', 'answer_source', "TEXT DEFAULT ''");
ensureColumn('expert_questions', 'ai_model', "TEXT DEFAULT ''");
db.exec('CREATE INDEX IF NOT EXISTS idx_readings_device ON readings(device_id, recorded_at)');
db.exec('CREATE INDEX IF NOT EXISTS idx_ingest_logs_device ON ingest_logs(device_id, created_at)');

// 过期会话清理
db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());

module.exports = { db, dbPath };
