const fs = require('fs');
const path = require('path');

/**
 * 极简 .env 加载器（零依赖，兼容任意 Node 版本）。
 * 只在进程启动时读一次，已存在的环境变量优先，不会被 .env 覆盖。
 * 这样 `npm start` 也能读到 AI / 微信等配置，不必强制使用 --env-file。
 */
function loadEnvFile(file = path.join(__dirname, '..', '.env')) {
  if (!fs.existsSync(file)) return false;
  const content = fs.readFileSync(file, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
    }
  }
  return true;
}

module.exports = { loadEnvFile };
