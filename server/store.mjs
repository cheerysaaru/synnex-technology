/*
 * Storage layer. Uses Node's built-in SQLite (Node 22.5+) when available and
 * falls back to an atomic JSON file otherwise. Both expose the same API.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const COLLECTIONS = ['documents', 'customers', 'catalog'];

/* ------------------------------------------------------------------ SQLite */
async function openSqlite(file) {
  // Hide the "SQLite is experimental" notice on older Node versions.
  const emit = process.emitWarning;
  process.emitWarning = (w, ...rest) => (String(w).includes('SQLite') ? undefined : emit.call(process, w, ...rest));
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import('node:sqlite'));
  } finally {
    process.emitWarning = emit;
  }
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      number TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      customer_name TEXT,
      subject TEXT,
      issue_date TEXT,
      total REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      source_id TEXT,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS documents_type ON documents(type, updated_at);
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS catalog (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
  `);

  const docCols = ['type', 'number', 'status', 'customer_name', 'subject', 'issue_date', 'total', 'balance', 'source_id'];
  const toRow = (r) => (r ? { ...r, data: JSON.parse(r.data) } : null);

  return {
    kind: 'sqlite',
    list(col) {
      const order = col === 'documents' ? 'updated_at DESC' : 'name COLLATE NOCASE ASC';
      return db.prepare(`SELECT * FROM ${col} ORDER BY ${order}`).all().map(toRow);
    },
    get(col, id) {
      return toRow(db.prepare(`SELECT * FROM ${col} WHERE id = ?`).get(id));
    },
    put(col, row) {
      const cols = col === 'documents' ? docCols : ['name'];
      const all = ['id', ...cols, 'data', 'created_at', 'updated_at'];
      const sql = `INSERT INTO ${col} (${all.join(',')}) VALUES (${all.map(() => '?').join(',')})
        ON CONFLICT(id) DO UPDATE SET ${all.slice(1).filter((c) => c !== 'created_at').map((c) => `${c}=excluded.${c}`).join(',')}`;
      db.prepare(sql).run(...all.map((c) => (c === 'data' ? JSON.stringify(row.data) : row[c] ?? null)));
      return this.get(col, row.id);
    },
    remove(col, id) {
      return db.prepare(`DELETE FROM ${col} WHERE id = ?`).run(id).changes > 0;
    },
    getSettings() {
      const r = db.prepare(`SELECT value FROM settings WHERE key = 'app'`).get();
      return r ? JSON.parse(r.value) : null;
    },
    saveSettings(value) {
      db.prepare(`INSERT INTO settings (key, value) VALUES ('app', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(value));
    },
    nextCounter(key) {
      db.prepare(`INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1`).run(key);
      return db.prepare(`SELECT value FROM counters WHERE key = ?`).get(key).value;
    },
    setCounter(key, value) {
      db.prepare(`INSERT INTO counters (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
    },
    counters() {
      return Object.fromEntries(db.prepare(`SELECT key, value FROM counters`).all().map((r) => [r.key, r.value]));
    },
    transaction(fn) {
      db.exec('BEGIN');
      try {
        const out = fn();
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    close() {
      db.close();
    },
  };
}

/* ------------------------------------------------------------------ JSON */
function openJson(file) {
  let state = { documents: [], customers: [], catalog: [], settings: null, counters: {} };
  if (fs.existsSync(file)) {
    try {
      state = { ...state, ...JSON.parse(fs.readFileSync(file, 'utf-8')) };
    } catch {
      fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
    }
  }
  const flush = () => {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, file);
  };
  const clone = (x) => (x ? structuredClone(x) : null);
  return {
    kind: 'json',
    list(col) {
      const rows = [...state[col]];
      rows.sort(col === 'documents' ? (a, b) => b.updated_at.localeCompare(a.updated_at) : (a, b) => a.name.localeCompare(b.name));
      return rows.map(clone);
    },
    get(col, id) {
      return clone(state[col].find((r) => r.id === id));
    },
    put(col, row) {
      const i = state[col].findIndex((r) => r.id === row.id);
      if (i >= 0) state[col][i] = { ...row, created_at: state[col][i].created_at };
      else state[col].push(row);
      flush();
      return this.get(col, row.id);
    },
    remove(col, id) {
      const before = state[col].length;
      state[col] = state[col].filter((r) => r.id !== id);
      flush();
      return state[col].length < before;
    },
    getSettings: () => clone(state.settings),
    saveSettings(value) {
      state.settings = value;
      flush();
    },
    nextCounter(key) {
      state.counters[key] = (state.counters[key] || 0) + 1;
      flush();
      return state.counters[key];
    },
    setCounter(key, value) {
      state.counters[key] = value;
      flush();
    },
    counters: () => ({ ...state.counters }),
    transaction: (fn) => fn(),
    close() {},
  };
}

export async function openStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  if (process.env.STORAGE !== 'json') {
    try {
      return await openSqlite(path.join(dataDir, 'synnex.db'));
    } catch (e) {
      console.warn(`[store] SQLite unavailable (${e.message}). Using data/store.json instead. Node 22.5+ enables SQLite.`);
    }
  }
  return openJson(path.join(dataDir, 'store.json'));
}

export const newId = () => crypto.randomUUID();
export { COLLECTIONS };
