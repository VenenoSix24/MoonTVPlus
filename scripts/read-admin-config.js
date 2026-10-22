// 在 Next 进程之外（自定义服务器 / 脚本）读取后台配置。
//
// 为什么需要它：观影室的内置 Socket.IO 服务是在 server.js 启动时决定的，而
// 「启用观影室」这个开关现在存在后台配置（admin_config 表）里。server.js 是
// 纯 CommonJS，不能 require TS 的 src/lib/config，所以在这里用同一个
// better-sqlite3 直接读一行 JSON。
//
// 只支持 SQLite / D1 本地文件存储；其它存储（redis / postgres / cloudflare）
// 返回 null，调用方回退到环境变量。

const fs = require('fs');
const path = require('path');

function getSqliteDbPath() {
  return process.env.SQLITE_DB_PATH || path.join(process.cwd(), '.data', 'moontv.db');
}

function readAdminConfig() {
  const dbPath = getSqliteDbPath();
  if (!fs.existsSync(dbPath)) {
    return null;
  }

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch {
    // 依赖不可用（比如精简镜像里没装）——交给调用方回退
    return null;
  }

  let db;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const row = db.prepare('SELECT config FROM admin_config WHERE id = 1').get();
    if (!row || !row.config) return null;
    return JSON.parse(row.config);
  } catch (error) {
    console.warn('[Config] 读取后台配置失败:', error.message);
    return null;
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
  }
}

module.exports = { readAdminConfig, getSqliteDbPath };
