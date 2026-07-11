const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// DB_PATH bisa diarahkan ke folder volume persisten saat deploy (mis. Railway Volume di /data)
const dbPath = process.env.DB_PATH || path.join(__dirname, 'erp.sqlite');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const isNew = !fs.existsSync(dbPath);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = { db, isNew };
