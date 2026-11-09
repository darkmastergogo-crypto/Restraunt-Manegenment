/* Drives LocalDB's SQLite path with Node's built-in SQLite, exactly as Tauri's plugin would. */
const { DatabaseSync } = require('node:sqlite');
module.exports = function runner(file = ':memory:') {
  const db = new DatabaseSync(file);
  return {
    db,
    async execute(sql, params = []) { const s = db.prepare(sql); return params.length ? s.run(...params) : s.run(); },
    async select(sql, params = []) { const s = db.prepare(sql); return params.length ? s.all(...params) : s.all(); }
  };
};
