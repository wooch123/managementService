import Database from 'better-sqlite3';
const db = new Database('prisma/meta.db');
const dep = db.prepare("SELECT activeRevisionId FROM Deployment WHERE id='singleton'").get();
const info = db.prepare('DELETE FROM Revision WHERE id != ?').run(dep.activeRevisionId);
console.log('deleted', info.changes, '→', db.prepare('SELECT revisionNo FROM Revision').all());
db.close();
