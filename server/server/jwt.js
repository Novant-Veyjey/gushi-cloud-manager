const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * 极简 JWT 实现（HS256），不引入第三方依赖。
 * 载荷包含 sub（账号 id）、username、role、jti（会话编号）和过期时间。
 * jti 会记录在 sessions 表里，因此退出登录后 token 立即失效。
 */

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64url(input) {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function base64urlHmac(data) {
  return crypto.createHmac('sha256', getSecret()).update(data).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** 密钥优先取环境变量，否则在 server/data/jwt.secret 持久化，保证重启后已签发的 token 仍有效 */
let cachedSecret = null;
function getSecret() {
  if (cachedSecret) return cachedSecret;
  if (process.env.JWT_SECRET) {
    cachedSecret = process.env.JWT_SECRET;
    return cachedSecret;
  }
  const dataDir = path.join(__dirname, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const secretFile = path.join(dataDir, 'jwt.secret');
  if (fs.existsSync(secretFile)) {
    cachedSecret = fs.readFileSync(secretFile, 'utf8').trim();
  } else {
    cachedSecret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(secretFile, cachedSecret);
  }
  return cachedSecret;
}

const DEFAULT_TTL_SECONDS = 7 * 86400;

function sign(payload, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const data = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(body))}`;
  return `${data}.${base64urlHmac(data)}`;
}

function verify(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('token 格式不正确');
  const [header, payload, signature] = parts;
  const expected = base64urlHmac(`${header}.${payload}`);
  const given = Buffer.from(signature);
  const mine = Buffer.from(expected);
  if (given.length !== mine.length || !crypto.timingSafeEqual(given, mine)) {
    throw new Error('token 签名校验失败');
  }
  const body = JSON.parse(fromBase64url(payload).toString('utf8'));
  if (body.exp && body.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('token 已过期，请重新登录');
  }
  return body;
}

module.exports = { sign, verify, DEFAULT_TTL_SECONDS };
