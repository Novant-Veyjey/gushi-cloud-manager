const fs = require('fs');
const path = require('path');

const { db, dbPath } = require('./db');

/**
 * 数据备份：把 SQLite 数据库和上传的图片目录复制到 server/data/backups/。
 * 数据库使用 better-sqlite3 的 backup()，WAL 模式下也能安全备份。
 *
 * 用法：npm run backup
 */
const backupDir = path.join(__dirname, 'data', 'backups');
fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dbTarget = path.join(backupDir, `gushi-${stamp}.sqlite`);

(async () => {
  await db.backup(dbTarget);
  console.log(`数据库已备份：${dbTarget}`);

  const uploads = path.join(__dirname, '..', 'public', 'uploads');
  if (fs.existsSync(uploads)) {
    const uploadTarget = path.join(backupDir, `uploads-${stamp}`);
    fs.cpSync(uploads, uploadTarget, { recursive: true });
    console.log(`图片目录已备份：${uploadTarget}`);
  }

  console.log(`原始数据库位置：${dbPath}`);
})().catch((error) => {
  console.error('备份失败：', error);
  process.exit(1);
});
