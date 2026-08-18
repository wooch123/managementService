import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { appDbPath } from './paths';

const dbFile = appDbPath();
const dataDir = path.dirname(dbFile);

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const journalMode = db.pragma('journal_mode', { simple: true });
const foreignKeys = db.pragma('foreign_keys', { simple: true });

console.log(`app.db initialized at ${dbFile}`);
console.log(`journal_mode=${journalMode} foreign_keys=${foreignKeys}`);

db.close();
