/*
 * Synnex Technology — quotation & invoice API.
 * Plain node:http, no framework. createApp() returns a request handler so the
 * same code runs the server (index.mjs) and the tests (test/api.test.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createUpdater } from './updater.mjs';
import { openStore, newId } from './store.mjs';
import { computeTotals } from './calc.mjs';
import { legacyToDocument } from './legacy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'defaults.json'), 'utf-8'));

export const TYPES = ['quotation', 'invoice', 'letter'];
export const STATUSES = {
  quotation: ['draft', 'sent', 'accepted', 'declined', 'expired'],
  invoice: ['draft', 'sent', 'partial', 'paid', 'cancelled'],
  letter: ['draft', 'sent'],
};
const MAX_BODY = 6 * 1024 * 1024; // logos are stored as data URLs

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function deepMerge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(base[k]) ? deepMerge(base[k], v) : v;
  return out;
}
/* Formatted text (<r ...>words</r>) without the formatting, for lists and search. */
const plain = (v) => !/<r[\s>]/.test(String(v || '')) ? String(v || '') : String(v).replace(/<r(?:\s[^>]*)?>|<\/r>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const created = (body) => ({ __created: true, body });
const str = (v, max = 500) => (v == null ? '' : String(v).slice(0, max));
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
};

export async function createApp({ dataDir = process.env.DATA_DIR || path.join(ROOT, 'data'), staticDir = path.join(ROOT, 'dist'), accessPin = process.env.ACCESS_PIN || '', corsOrigin = process.env.CORS_ORIGIN || '', basePath = process.env.BASE_PATH || '' } = {}) {
  /* Served under a sub-folder, e.g. BASE_PATH=/quotation for
     synnex-technology.com/quotation/. Requests may arrive with or without it. */
  const base = ('/' + basePath.replace(/^\/+|\/+$/g, '')).replace(/^\/$/, '');
  const store = await openStore(dataDir);

  /* ----------------------------------------------------------- settings */
  const getSettings = () => deepMerge(DEFAULTS, store.getSettings() || {});
  const updater = createUpdater(ROOT, { accessPin });

  /* ----------------------------------------------------------- auth (optional PIN) */
  const secretFile = path.join(dataDir, '.secret');
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'));
  const secret = fs.readFileSync(secretFile, 'utf-8').trim();
  const sign = (exp) => `${exp}.${crypto.createHmac('sha256', secret).update(String(exp)).digest('hex')}`;
  const verify = (token) => {
    const [exp, mac] = String(token || '').split('.');
    if (!exp || !mac || Number(exp) < Date.now()) return false;
    const good = sign(exp).split('.')[1];
    return mac.length === good.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good));
  };
  const attempts = new Map();

  /* ----------------------------------------------------------- numbering */
  function nextNumber(type, issueDate) {
    const s = getSettings().numbering;
    const year = String(issueDate || today()).slice(0, 4);
    const key = s.includeYear ? `${type}:${year}` : type;
    const n = store.nextCounter(key);
    const prefix = s[`${type}Prefix`] || type.slice(0, 3).toUpperCase();
    const padded = String(n).padStart(Number(s.padding) || 3, '0');
    return s.includeYear ? `${prefix}-${year}-${padded}` : `${prefix}-${padded}`;
  }

  /* ----------------------------------------------------------- documents */
  function summary(row) {
    const { data, ...rest } = row;
    return { ...rest, dueDate: data.dueDate || null, customer: data.customer?.name || '' };
  }

  function sanitiseDoc(type, data) {
    if (!isObj(data)) throw new HttpError(422, 'Document data must be an object.');
    const json = JSON.stringify(data);
    if (json.length > 2_000_000) throw new HttpError(413, 'Document is too large.');
    if (data.items && !Array.isArray(data.items)) throw new HttpError(422, 'items must be a list.');
    if ((data.items || []).length > 500) throw new HttpError(422, 'A document can have at most 500 rows.');
    return { ...data, type };
  }

  function saveDocument(existing, type, data, status) {
    const clean = sanitiseDoc(type, data);
    const totals = computeTotals(clean);
    const st = status || existing?.status || 'draft';
    if (!STATUSES[type].includes(st)) throw new HttpError(422, `Status must be one of: ${STATUSES[type].join(', ')}.`);
    const row = {
      id: existing?.id || newId(),
      type,
      number: str(clean.number, 60),
      status: st,
      customer_name: str(clean.customer?.name, 200),
      subject: str(plain(clean.subject), 300),
      issue_date: str(clean.issueDate, 10),
      total: totals.total,
      balance: totals.balance,
      source_id: existing?.source_id || clean.sourceId || null,
      data: { ...clean, totals },
      created_at: existing?.created_at || now(),
      updated_at: now(),
    };
    return store.put('documents', row);
  }

  function createDocument(type, data = {}, status) {
    if (!TYPES.includes(type)) throw new HttpError(422, `type must be one of: ${TYPES.join(', ')}.`);
    const s = getSettings();
    const issueDate = data.issueDate || today();
    const draft = { issueDate, ...data };
    if (!draft.number) draft.number = nextNumber(type, issueDate);
    if (draft.dueDate === undefined && type !== 'letter') {
      draft.dueDate = addDays(issueDate, type === 'quotation' ? s.defaults.quotationValidDays : s.defaults.invoiceDueDays);
    }
    return store.transaction(() => saveDocument(null, type, draft, status));
  }

  function requireDoc(id) {
    const doc = store.get('documents', id);
    if (!doc) throw new HttpError(404, 'Document not found.');
    return doc;
  }

  /* ----------------------------------------------------------- simple collections */
  const COLLECTION_RULES = {
    customers: (b) => {
      const name = str(b.name, 200).trim();
      if (!name) throw new HttpError(422, 'Customer name is required.', { name: 'Enter a name.' });
      return { name, data: { name, attention: str(b.attention, 200), line1: str(b.line1, 200), line2: str(b.line2, 200), line3: str(b.line3, 200), phone: str(b.phone, 60), email: str(b.email, 160), notes: str(b.notes, 2000) } };
    },
    catalog: (b) => {
      const name = str(b.description, 1000).trim();
      if (!name) throw new HttpError(422, 'Item description is required.', { description: 'Enter a description.' });
      const rate = parseFloat(b.rate);
      return { name, data: { description: name, unit: str(b.unit, 30), rate: Number.isFinite(rate) ? rate : null, category: str(b.category, 80) } };
    },
  };

  function collectionRoute(col, method, id, body) {
    if (method === 'GET' && !id) return store.list(col).map((r) => ({ id: r.id, ...r.data, created_at: r.created_at, updated_at: r.updated_at }));
    if (method === 'POST' && !id) {
      const v = COLLECTION_RULES[col](body);
      const row = store.put(col, { id: newId(), ...v, created_at: now(), updated_at: now() });
      return created({ id: row.id, ...row.data });
    }
    if (!id) throw new HttpError(405, 'Method not allowed.');
    const existing = store.get(col, id);
    if (!existing) throw new HttpError(404, 'Not found.');
    if (method === 'GET') return { id, ...existing.data };
    if (method === 'PUT') {
      const v = COLLECTION_RULES[col]({ ...existing.data, ...body });
      const row = store.put(col, { ...existing, ...v, updated_at: now() });
      return { id: row.id, ...row.data };
    }
    if (method === 'DELETE') {
      store.remove(col, id);
      return { ok: true };
    }
    throw new HttpError(405, 'Method not allowed.');
  }

  /* ----------------------------------------------------------- legacy import */
  function importLegacy(body) {
    let imported = 0;
    for (const type of ['quotation', 'invoice']) {
      for (const saved of body[`${type}s`] || []) {
        const doc = legacyToDocument(type, saved);
        createDocument(type, doc);
        imported++;
      }
    }
    return imported;
  }
  // One-time import of data saved by the old server.mjs.
  const legacyFlag = path.join(dataDir, '.legacy-imported');
  if (!fs.existsSync(legacyFlag)) {
    const read = (f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'));
      } catch {
        return [];
      }
    };
    const n = importLegacy({ quotations: read('quotations.json'), invoices: read('invoices.json') });
    if (n) console.log(`[import] Imported ${n} documents saved by the previous version.`);
    fs.writeFileSync(legacyFlag, now());
  }

  /* ----------------------------------------------------------- stats */
  function monthlySeries(docs, months = 6) {
    const out = [];
    const d = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const m = new Date(Date.UTC(d.getFullYear(), d.getMonth() - i, 1)).toISOString().slice(0, 7);
      const inMonth = docs.filter((x) => (x.issue_date || '').startsWith(m));
      out.push({
        month: m,
        quoted: inMonth.filter((x) => x.type === 'quotation').reduce((t, x) => t + x.total, 0),
        invoiced: inMonth.filter((x) => x.type === 'invoice' && x.status !== 'cancelled').reduce((t, x) => t + x.total, 0),
      });
    }
    return out;
  }
  function stats() {
    const docs = store.list('documents');
    const month = today().slice(0, 7);
    const by = (type) => docs.filter((d) => d.type === type);
    const q = by('quotation');
    const inv = by('invoice');
    const openInv = inv.filter((d) => ['sent', 'partial'].includes(d.status));
    return {
      quotations: q.length,
      quotationsThisMonth: q.filter((d) => (d.issue_date || '').startsWith(month)).length,
      quotedThisMonth: q.filter((d) => (d.issue_date || '').startsWith(month)).reduce((s, d) => s + d.total, 0),
      openQuotations: q.filter((d) => d.status === 'sent').length,
      acceptedQuotations: q.filter((d) => d.status === 'accepted').length,
      invoices: inv.length,
      invoicedThisMonth: inv.filter((d) => (d.issue_date || '').startsWith(month) && d.status !== 'cancelled').reduce((s, d) => s + d.total, 0),
      outstanding: openInv.reduce((s, d) => s + d.balance, 0),
      overdue: openInv.filter((d) => d.data.dueDate && d.data.dueDate < today()).length,
      paidThisMonth: inv.filter((d) => d.status === 'paid' && d.updated_at.startsWith(month)).reduce((s, d) => s + d.total, 0),
      customers: store.list('customers').length,
      recent: docs.slice(0, 8).map(summary),
      monthly: monthlySeries(docs),
      awaiting: q.filter((d) => d.status === 'sent').slice(0, 5).map(summary),
      overdueList: openInv.filter((d) => d.data.dueDate && d.data.dueDate < today()).slice(0, 5).map(summary),
    };
  }

  /* ----------------------------------------------------------- routing */
  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) throw new HttpError(413, 'Request is too large.');
      chunks.push(c);
    }
    if (!size) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    } catch {
      throw new HttpError(400, 'Request body is not valid JSON.');
    }
  }

  async function api(req, res, url) {
    const method = req.method;
    const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const [resource, id, action] = parts;
    const body = ['POST', 'PUT', 'PATCH'].includes(method) ? await readBody(req) : {};

    if (resource === 'health') return { ok: true, storage: store.kind, auth: Boolean(accessPin), version: 2 };

    if (resource === 'login' && method === 'POST') {
      if (!accessPin) return { token: null };
      const ip = req.socket.remoteAddress || 'x';
      const a = attempts.get(ip) || { n: 0, t: Date.now() };
      if (Date.now() - a.t > 60_000) Object.assign(a, { n: 0, t: Date.now() });
      if (++a.n > 8) throw new HttpError(429, 'Too many attempts. Wait a minute and try again.');
      attempts.set(ip, a);
      const pin = String(body.pin || '');
      const ok = pin.length === accessPin.length && crypto.timingSafeEqual(Buffer.from(pin), Buffer.from(accessPin));
      if (!ok) throw new HttpError(401, 'Incorrect PIN.');
      return { token: sign(Date.now() + 30 * 24 * 3600 * 1000) };
    }

    if (accessPin) {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!verify(token)) throw new HttpError(401, 'Sign in with your PIN.');
    }

    switch (resource) {
      case 'update':
        // Settings → App updates. GET ?check=1 also asks GitHub for news.
        if (method === 'GET') return updater.status({ fetch: url.searchParams.get('check') === '1' });
        if (method === 'POST') {
          await updater.run();
          return { started: true };
        }
        break;
      case 'settings':
        if (method === 'GET') return { settings: getSettings(), counters: store.counters() };
        if (method === 'PUT') {
          if (!isObj(body.settings)) throw new HttpError(422, 'settings must be an object.');
          if (body.settings.company?.logo && !/^data:image\/(png|jpe?g);base64,/.test(body.settings.company.logo)) {
            throw new HttpError(422, 'Logo must be a PNG or JPG image.');
          }
          store.saveSettings(deepMerge(store.getSettings() || {}, body.settings));
          if (isObj(body.counters)) {
            for (const [k, v] of Object.entries(body.counters)) if (Number.isInteger(v) && v >= 0) store.setCounter(k, v);
          }
          return { settings: getSettings(), counters: store.counters() };
        }
        break;

      case 'stats':
        return stats();

      case 'documents': {
        if (!id && method === 'GET') {
          const type = url.searchParams.get('type');
          const status = url.searchParams.get('status');
          const q = (url.searchParams.get('q') || '').toLowerCase();
          return store
            .list('documents')
            .filter((d) => (!type || d.type === type) && (!status || d.status === status))
            .filter((d) => !q || [d.number, d.customer_name, d.subject].some((v) => (v || '').toLowerCase().includes(q)))
            .map(summary);
        }
        if (!id && method === 'POST') return created(createDocument(body.type, body.data || {}, body.status));
        const doc = requireDoc(id);
        if (!action) {
          if (method === 'GET') return doc;
          if (method === 'PUT') return saveDocument(doc, doc.type, body.data || doc.data, body.status);
          if (method === 'PATCH') {
            if (body.status && !STATUSES[doc.type].includes(body.status)) throw new HttpError(422, 'Invalid status.');
            return saveDocument(doc, doc.type, doc.data, body.status);
          }
          if (method === 'DELETE') {
            store.remove('documents', id);
            return { ok: true };
          }
        }
        if (action === 'duplicate' && method === 'POST') {
          const { number: _n, totals: _t, ...data } = doc.data;
          return created(createDocument(doc.type, { ...data, issueDate: today(), dueDate: undefined }));
        }
        if (action === 'convert' && method === 'POST') {
          if (doc.type !== 'quotation') throw new HttpError(422, 'Only quotations can be converted to invoices.');
          const s = getSettings();
          const { number: _n, totals: _t, sections: _s, salutation: _sa, intro: _i, notes: _no, notesTitle: _nt, ...data } = doc.data;
          const invoice = createDocument('invoice', {
            ...data,
            issueDate: today(),
            dueDate: undefined,
            reference: doc.data.number ? `Quotation ${doc.data.number}` : '',
            notes: s.defaults.invoiceTerms,
            sourceId: doc.id,
          });
          if (['draft', 'sent'].includes(doc.status)) saveDocument(doc, doc.type, doc.data, 'accepted');
          return created(invoice);
        }
        break;
      }

      case 'customers':
      case 'catalog': {
        const out = collectionRoute(resource, method, id, body);
        return out;
      }

      case 'import':
        if (method === 'POST') return { imported: importLegacy(body) };
        break;

      case 'backup':
        if (method === 'GET') {
          return { app: 'synnex-quotations', version: 2, exportedAt: now(), settings: store.getSettings(), counters: store.counters(), documents: store.list('documents'), customers: store.list('customers'), catalog: store.list('catalog') };
        }
        break;

      case 'restore':
        if (method === 'POST') {
          if (body.app !== 'synnex-quotations') throw new HttpError(422, 'This is not a Synnex backup file.');
          let n = 0;
          store.transaction(() => {
            if (body.settings) store.saveSettings(body.settings);
            for (const [k, v] of Object.entries(body.counters || {})) store.setCounter(k, Math.max(v, store.counters()[k] || 0));
            for (const col of ['documents', 'customers', 'catalog']) {
              for (const row of body[col] || []) {
                if (row?.id && row?.data) {
                  store.put(col, row);
                  n++;
                }
              }
            }
          });
          return { restored: n };
        }
        break;
      default:
        throw new HttpError(404, 'Unknown API route.');
    }
    throw new HttpError(405, 'Method not allowed.');
  }

  const TYPES_MAP = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.wasm': 'application/wasm', '.map': 'application/json', '.webp': 'image/webp', '.txt': 'text/plain', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };

  function serveStatic(req, res, url) {
    if (!fs.existsSync(staticDir)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Frontend not built yet. Run "npm run build", or use "npm run dev" during development.');
    }
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    let file = path.resolve(staticDir, rel || 'index.html');
    if (!file.startsWith(path.resolve(staticDir)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(staticDir, 'index.html');
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': TYPES_MAP[ext] || 'application/octet-stream',
      'Cache-Control': rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  }

  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (base) {
      // "/quotation" → "/quotation/" so the page's relative links resolve.
      if (url.pathname === base) {
        res.writeHead(301, { Location: base + '/' + url.search });
        return res.end();
      }
      if (url.pathname.startsWith(base + '/')) url.pathname = url.pathname.slice(base.length);
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    if (!url.pathname.startsWith('/api')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        return res.end();
      }
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      return serveStatic(req, res, url);
    }
    try {
      let out = await api(req, res, url);
      let status = 200;
      if (out && out.__created) {
        status = 201;
        out = out.body;
      }
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(out));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: status === 500 ? 'Something went wrong on the server.' : e.message, details: e.details }));
    }
  };

  handler.store = store;
  return handler;
}
