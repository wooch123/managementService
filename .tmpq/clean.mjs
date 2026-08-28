import Database from 'better-sqlite3';
import fs from 'node:fs';
const db = new Database('data/app.db');
console.log('deleted samples', db.prepare('DELETE FROM tech_report_sample').run().changes,
  '| reports', db.prepare('DELETE FROM tech_report').run().changes);
db.close();
// 시험용으로 올린 그림도 치운다.
const dir = 'data/uploads/tech-report';
if (fs.existsSync(dir)) { fs.rmSync(dir, { recursive: true, force: true }); console.log('removed', dir); }
