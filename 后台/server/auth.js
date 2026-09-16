const crypto = require('crypto');

const { db } = require('./db');
const jwt = require('./jwt');

/** 登录状态有效期：7 天 */
const TOKEN_TTL_SECONDS = 7 * 86400;

/** 全部角色，与需求文档第 3 节的用户角色对应 */
const ROLES = [
  { value: 'farmer', label: '菇农' },
  { value: 'base', label: '合作社/基地管理员' },
  { value: 'expert', label: '专家' },
  { value: 'buyer', label: '采购商' },
  { value: 'government', label: '政府/服务机构' },
  { value: 'admin', label: '平台管理员' }
];

/**
 * 自助注册固定为普通菇农：专家、采购商、基地管理员等角色由平台管理员在后台分配。
 * 之前允许注册时自选角色，导致任何人选“专家”注册后就拿到问题回复权限。
 */
const SELF_REGISTER_ROLE = 'farmer';
const SELF_REGISTER_ROLES = ROLES.filter((item) => item.value === SELF_REGISTER_ROLE);

/**
 * 注册身份选择：注册时可自选的身份，仅限「菇农 / 基地管理员 / 采购商」。
 * 「政府/服务机构」「专家」「平台管理员」不可自选，仍只能由平台管理员分配；
 * 未传 role 或传了不允许的角色时，一律落到普通菇农。
 */
const REGISTRATION_ROLE_VALUES = ['farmer', 'base', 'buyer'];

/**
 * 角色权限矩阵（RBAC）：
 *   'r'  只读
 *   'rw' 可读可写
 *   '*'  全部权限
 * 未列出的模块即无权限。后端是权限的唯一执行点，小程序端的隐藏只是体验优化。
 */
const PERMISSIONS = {
  admin: '*',
  base: {
    bases: 'rw', batches: 'rw', readings: 'rw', alerts: 'rw', 'trace-events': 'rw',
    questions: 'rw', products: 'rw', demands: 'rw', tasks: 'rw', partners: 'rw',
    devices: 'rw', dashboard: 'r', uploads: 'w', ai: 'r', users: 'r'
  },
  farmer: {
    bases: 'rw', batches: 'rw', readings: 'rw', alerts: 'rw', 'trace-events': 'rw',
    questions: 'rw', products: 'r', demands: 'r', tasks: 'rw', partners: 'r',
    devices: 'rw', dashboard: 'r', uploads: 'w', ai: 'r'
  },
  expert: {
    bases: 'r', batches: 'r', readings: 'r', alerts: 'r', 'trace-events': 'r',
    questions: 'rw', products: 'r', demands: 'r', tasks: 'r', partners: 'r',
    devices: 'r', dashboard: 'r', uploads: 'w', ai: 'r'
  },
  buyer: {
    bases: 'r', batches: 'r', 'trace-events': 'r', questions: 'rw',
    products: 'r', demands: 'rw', dashboard: 'r', uploads: 'w', ai: 'r'
  },
  government: {
    bases: 'r', batches: 'r', readings: 'r', alerts: 'r', 'trace-events': 'r',
    questions: 'r', products: 'r', demands: 'r', tasks: 'r', partners: 'r',
    devices: 'r', dashboard: 'r', ai: 'r'
  }
};

/**
 * 可以回答提问（专家回复）的角色：只有专家与平台管理员。
 *
 * 注意与 questions 模块的写权限区分开：菇农、基地管理员等角色需要写权限来“提问”，
 * 但不能代替专家“回复”。之前回答与提问共用 questions 的写权限，
 * 导致任何菇农登录后都能冒充专家答题。
 */
const QUESTION_ANSWER_ROLES = ['expert', 'admin'];

function canAnswerQuestion(role) {
  return QUESTION_ANSWER_ROLES.includes(role) || PERMISSIONS[role] === '*';
}

function roleValues() {
  return ROLES.map((item) => item.value);
}

function roleLabel(role) {
  return ROLES.find((item) => item.value === role)?.label || role;
}

/** 判断角色是否对某模块具备读/写权限 */
function can(role, moduleName, action = 'r') {
  const rules = PERMISSIONS[role];
  if (!rules) return false;
  if (rules === '*') return true;
  const level = rules[moduleName];
  if (!level) return false;
  return action === 'w' ? level === 'rw' : level === 'r' || level === 'rw';
}

/** scrypt 加盐哈希，数据库中不保存明文密码 */
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, salt, hash) {
  const candidate = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(String(hash), 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

/** 返回给前端的用户信息，绝不包含密码或微信标识 */
function sanitizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name || '',
    role: row.role,
    role_label: roleLabel(row.role),
    created_at: row.created_at
  };
}

/**
 * 签发 JWT，并把 jti 记录到 sessions 表。
 * 这样 token 本身是无状态的 JWT，但退出登录后可以立即失效。
 */
function issueToken(user) {
  const jti = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(jti, user.id, expiresAt);
  const token = jwt.sign({ sub: user.id, username: user.username, role: user.role, jti }, TOKEN_TTL_SECONDS);
  return { token, expires_at: expiresAt };
}

function tokenFromRequest(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

/** 解析并校验 token，返回 JWT 载荷（含 jti） */
function decodeRequestToken(req) {
  const token = tokenFromRequest(req);
  if (!token) return null;
  try {
    return jwt.verify(token);
  } catch (error) {
    return null;
  }
}

function resolveUser(req) {
  const payload = decodeRequestToken(req);
  if (!payload || !payload.jti) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(payload.jti);
  if (!session) return null;
  if (session.expires_at < new Date().toISOString()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(payload.jti);
    return null;
  }
  return db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) || null;
}

function destroySession(req) {
  const payload = decodeRequestToken(req);
  if (payload?.jti) db.prepare('DELETE FROM sessions WHERE token = ?').run(payload.jti);
}

/** 需要登录的接口统一挂这个中间件，未登录返回 401 */
function requireAuth(req, res, next) {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ code: 401, message: '请先登录账号', data: null });
  }
  req.user = sanitizeUser(user);
  next();
}

/** 角色权限校验中间件：requirePermission('bases', 'w') */
function requirePermission(moduleName, action = 'r') {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ code: 401, message: '请先登录账号', data: null });
    if (!can(req.user.role, moduleName, action)) {
      return res.status(403).json({
        code: 403,
        message: `当前角色（${req.user.role_label}）没有该操作权限`,
        data: { role: req.user.role, module: moduleName, action }
      });
    }
    next();
  };
}

/** 仅指定角色可访问，例如 requireRole('admin') */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ code: 401, message: '请先登录账号', data: null });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ code: 403, message: '只有平台管理员可以执行该操作', data: { role: req.user.role } });
    }
    next();
  };
}

function validateCredentials(username, password) {
  const name = String(username || '').trim();
  const secret = String(password || '');
  if (!/^[\w\u4e00-\u9fa5]{3,32}$/.test(name)) {
    throw new Error('账号需为 3-32 位字母、数字、下划线或中文');
  }
  if (secret.length < 6 || secret.length > 64) {
    throw new Error('密码长度需为 6-64 位');
  }
  return { name, secret };
}

/** 注册新账号，成功后直接返回 JWT */
function register(payload = {}) {
  const { name, secret } = validateCredentials(payload.username, payload.password);
  const displayName = String(payload.display_name || '').trim().slice(0, 32);
  // 注册身份可自选，但仅限 REGISTRATION_ROLE_VALUES 里的角色（专家与管理员不可自选）；
  // 传了其它值或没传时一律按普通菇农处理
  const requested = String(payload.role || '').trim();
  const role = REGISTRATION_ROLE_VALUES.includes(requested) ? requested : SELF_REGISTER_ROLE;

  if (db.prepare('SELECT id FROM users WHERE username = ?').get(name)) {
    const error = new Error('该账号已存在，请直接登录');
    error.status = 409;
    throw error;
  }

  // 密码唯一性：两个账号的密码不能一样。
  // scrypt 每次加盐不同、无法直接比对哈希，这里用已有账号各自的盐逐一验证新密码。
  const passwordTaken = db
    .prepare('SELECT password_salt, password_hash FROM users')
    .all()
    .some((row) => verifyPassword(secret, row.password_salt, row.password_hash));
  if (passwordTaken) {
    const error = new Error('该密码已被其他账号使用，请更换密码');
    error.status = 409;
    throw error;
  }

  const { hash, salt } = hashPassword(secret);
  const result = db
    .prepare('INSERT INTO users (username, display_name, role, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)')
    .run(name, displayName, role, hash, salt);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  return { user: sanitizeUser(user), ...issueToken(user) };
}

/** 账号密码登录 */
function login(payload = {}) {
  const name = String(payload.username || '').trim();
  const secret = String(payload.password || '');
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(name);
  if (!row) {
    // 账号不存在与密码错误分开提示，方便用户判断该去注册还是重试密码
    const error = new Error('该账号尚未注册，请先注册新账号');
    error.status = 401;
    throw error;
  }
  if (!verifyPassword(secret, row.password_salt, row.password_hash)) {
    const error = new Error('密码错误，请重新输入');
    error.status = 401;
    throw error;
  }
  return { user: sanitizeUser(row), ...issueToken(row) };
}

/**
 * 微信小程序一键登录：用 wx.login 拿到的 code 换取 openid，
 * 首次登录自动创建账号，之后每次登录复用同一个账号。
 * 需要在后台配置 WX_APPID 与 WX_SECRET（见 .env.example）。
 */
async function wechatLogin(code) {
  const appid = process.env.WX_APPID;
  const secret = process.env.WX_SECRET;
  if (!appid || !secret) {
    const error = new Error('后台未配置微信小程序 AppID/Secret，请先用账号密码登录');
    error.status = 501;
    throw error;
  }
  if (!code) {
    const error = new Error('缺少微信登录凭证 code');
    error.status = 400;
    throw error;
  }

  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(
    secret
  )}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const response = await fetch(url);
  const payload = await response.json();
  if (!payload || payload.errcode || !payload.openid) {
    const error = new Error(`微信登录失败：${(payload && payload.errmsg) || '未知错误'}`);
    error.status = 400;
    throw error;
  }

  let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(payload.openid);
  if (!user) {
    const baseUsername = `wx_${String(payload.openid).slice(-10)}`;
    let username = baseUsername;
    let index = 1;
    while (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
      username = `${baseUsername}_${index++}`;
    }
    const { hash, salt } = hashPassword(crypto.randomBytes(18).toString('hex'));
    const result = db
      .prepare('INSERT INTO users (username, display_name, role, password_hash, password_salt, openid) VALUES (?, ?, ?, ?, ?, ?)')
      .run(username, '微信用户', 'farmer', hash, salt, payload.openid);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  }

  return { user: sanitizeUser(user), ...issueToken(user) };
}

/** 平台管理员：查看全部账号及其数据量 */
function listUsers() {
  const rows = db.prepare('SELECT * FROM users ORDER BY id ASC').all();
  return rows.map((row) => {
    const counts = {};
    for (const table of ['bases', 'batches', 'readings', 'products', 'demands']) {
      counts[table] = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id = ?`).get(row.id).count;
    }
    return { ...sanitizeUser(row), openid_bound: Boolean(row.openid), ...counts };
  });
}

/** 平台管理员：调整账号角色 */
function updateUserRole(id, role) {
  if (!roleValues().includes(role)) {
    const error = new Error('角色不合法');
    error.status = 400;
    throw error;
  }
  const result = db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, new Date().toISOString(), Number(id));
  if (!result.changes) {
    const error = new Error('账号不存在');
    error.status = 404;
    throw error;
  }
  return sanitizeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id)));
}

/**
 * 平台管理员：按「目标账号 + 目标账号密码」给指定账号分配职务。
 * 管理员在分配时输入对方的账号与密码做身份核验，避免把职务分给输错的同名账号。
 */
function assignRoleByCredentials(payload = {}) {
  const name = String(payload.username || '').trim();
  const secret = String(payload.password || '');
  const role = String(payload.role || '').trim();
  if (!roleValues().includes(role)) {
    const error = new Error('角色不合法');
    error.status = 400;
    throw error;
  }
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(name);
  if (!row) {
    const error = new Error('该账号尚未注册，无法分配职务');
    error.status = 404;
    throw error;
  }
  if (!verifyPassword(secret, row.password_salt, row.password_hash)) {
    const error = new Error('该账号的密码不正确，请核对后再分配');
    error.status = 401;
    throw error;
  }
  return updateUserRole(row.id, role);
}

module.exports = {
  TOKEN_TTL_SECONDS,
  ROLES,
  SELF_REGISTER_ROLES,
  PERMISSIONS,
  can,
  canAnswerQuestion,
  roleLabel,
  hashPassword,
  verifyPassword,
  sanitizeUser,
  issueToken,
  destroySession,
  requireAuth,
  requirePermission,
  requireRole,
  tokenFromRequest,
  resolveUser,
  register,
  login,
  wechatLogin,
  listUsers,
  updateUserRole,
  assignRoleByCredentials
};
