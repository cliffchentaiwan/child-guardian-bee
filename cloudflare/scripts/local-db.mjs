import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// SQLite adapter for local verification only; deployed code uses the native D1 binding.
export function localDatabase(path = ':memory:') {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys=ON');
  const exists = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name='sources'").get();
  if (!exists) sqlite.exec(readFileSync(new URL('../migrations/0001_directory.sql', import.meta.url), 'utf8'));
  const db = {
    sqlite,
    prepare(sql) {
      const make = values => ({
        bind: (...args) => make(args),
        async first() { return sqlite.prepare(sql).get(...values) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...values), success: true }; },
        async run() { const result = sqlite.prepare(sql).run(...values); return { success: true, meta: { changes: result.changes } }; },
      });
      return make([]);
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return db;
}
