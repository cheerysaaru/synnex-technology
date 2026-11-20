// Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.mjs';

let server;
let base;
let dir;

async function call(method, url, body, token) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

async function start(opts = {}) {
  const app = await createApp({ dataDir: dir, staticDir: path.join(dir, 'nodist'), ...opts });
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, r));
  return { srv, url: `http://127.0.0.1:${srv.address().port}`, app };
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'synnex-'));
  // A record saved by the old server.mjs, to check the one-time import.
  fs.writeFileSync(path.join(dir, 'quotations.json'), JSON.stringify([{ id: 'old1', name: 'Old Shop', savedAt: '2026-01-01', data: { recipient1: 'Old Shop', recipient2: 'Kopay', recipient3: 'Jaffna', date: '05/01/2026', subject: 'CCTV', salutation: 'Sir', items: [{ id: 1, description: 'Camera', unit: 'Nos.', qty: '4', rate: '12000' }], discount: '1000', showDiscount: true, notes: ['Valid 30 days'] } }]));
  ({ srv: server, url: base } = await start());
});
after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('health reports storage', async () => {
  const r = await call('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.ok(['sqlite', 'json'].includes(r.body.storage));
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('legacy quotations.json is imported once', async () => {
  const r = await call('GET', '/api/documents?type=quotation');
  assert.equal(r.body.length, 1);
  const doc = (await call('GET', `/api/documents/${r.body[0].id}`)).body;
  assert.equal(doc.data.customer.name, 'Old Shop');
  assert.equal(doc.data.issueDate, '2026-01-05');
  assert.equal(doc.total, 47000); // 4 x 12000 - 1000
});

test('creating documents assigns sequential numbers per type and year', async () => {
  const a = await call('POST', '/api/documents', { type: 'invoice', data: { issueDate: '2026-11-19' } });
  const b = await call('POST', '/api/documents', { type: 'invoice', data: { issueDate: '2026-11-20' } });
  assert.equal(a.status, 201);
  assert.equal(a.body.number, 'SX-INV-2026-001');
  assert.equal(b.body.number, 'SX-INV-2026-002');
  assert.equal(a.body.data.dueDate, '2026-12-03'); // 14 days
});

test('totals: line discounts, percent discount, tax and payments', async () => {
  const data = {
    columns: { discount: true },
    items: [
      { kind: 'heading', description: 'Electrical' },
      { kind: 'item', description: 'Surge point', qty: 10, rate: 1000, discount: 500 },
      { kind: 'item', description: 'Incomplete row', qty: null, rate: 2000 },
    ],
    discount: { mode: 'percent', value: 10 },
    tax: { percent: 18 },
    paid: 1000,
  };
  const r = await call('POST', '/api/documents', { type: 'quotation', data });
  assert.deepEqual(r.body.data.totals, { subtotal: 9500, discount: 950, tax: 1539, total: 10089, paid: 1000, balance: 9089 });
});

test('update, status validation, search, delete', async () => {
  const { body: doc } = await call('POST', '/api/documents', { type: 'quotation', data: { customer: { name: 'Kopay Hospital' }, subject: 'Network points' } });
  const up = await call('PUT', `/api/documents/${doc.id}`, { data: { ...doc.data, subject: 'Network & surge points' }, status: 'sent' });
  assert.equal(up.body.status, 'sent');
  assert.equal((await call('PATCH', `/api/documents/${doc.id}`, { status: 'paid' })).status, 422);
  const found = await call('GET', '/api/documents?q=hospital');
  assert.equal(found.body.length, 1);
  assert.equal((await call('DELETE', `/api/documents/${doc.id}`)).status, 200);
  assert.equal((await call('GET', `/api/documents/${doc.id}`)).status, 404);
});

test('duplicate and convert quotation to invoice', async () => {
  const { body: q } = await call('POST', '/api/documents', { type: 'quotation', data: { customer: { name: 'ABC Stores' }, items: [{ kind: 'item', description: 'UPS', qty: 1, rate: 50000 }] }, status: 'sent' });
  const dup = await call('POST', `/api/documents/${q.id}/duplicate`);
  assert.notEqual(dup.body.number, q.number);
  assert.equal(dup.body.total, 50000);
  const inv = await call('POST', `/api/documents/${q.id}/convert`);
  assert.equal(inv.status, 201);
  assert.equal(inv.body.type, 'invoice');
  assert.equal(inv.body.source_id, q.id);
  assert.equal(inv.body.data.reference, `Quotation ${q.number}`);
  assert.equal((await call('GET', `/api/documents/${q.id}`)).body.status, 'accepted');
  assert.equal((await call('POST', `/api/documents/${inv.body.id}/convert`)).status, 422);
});

test('customers and catalog CRUD with validation', async () => {
  assert.equal((await call('POST', '/api/customers', { name: ' ' })).status, 422);
  const c = await call('POST', '/api/customers', { name: 'Jaffna College', line1: 'Vaddukoddai' });
  assert.equal(c.status, 201);
  const upd = await call('PUT', `/api/customers/${c.body.id}`, { phone: '0771234567' });
  assert.equal(upd.body.line1, 'Vaddukoddai');
  assert.equal(upd.body.phone, '0771234567');
  const item = await call('POST', '/api/catalog', { description: 'CAT6 network point', unit: 'Nos.', rate: '3200' });
  assert.equal(item.body.rate, 3200);
  assert.equal((await call('GET', '/api/catalog')).body.length, 1);
  assert.equal((await call('DELETE', `/api/customers/${c.body.id}`)).status, 200);
});

test('settings merge with defaults and set numbering', async () => {
  const r = await call('PUT', '/api/settings', { settings: { company: { phone: '021 000 0000' }, numbering: { quotationPrefix: 'Q' } }, counters: { 'quotation:2027': 41 } });
  assert.equal(r.body.settings.company.phone, '021 000 0000');
  assert.equal(r.body.settings.company.name, 'SYNNEX TECHNOLOGY');
  const q = await call('POST', '/api/documents', { type: 'quotation', data: { issueDate: '2027-02-01' } });
  assert.equal(q.body.number, 'Q-2027-042');
  assert.equal((await call('PUT', '/api/settings', { settings: { company: { logo: 'javascript:alert(1)' } } })).status, 422);
});

test('stats, backup and restore', async () => {
  const s = await call('GET', '/api/stats');
  assert.ok(s.body.quotations >= 1);
  const backup = (await call('GET', '/api/backup')).body;
  assert.equal(backup.app, 'synnex-quotations');
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'synnex2-'));
  const other = await createApp({ dataDir: dir2, staticDir: dir2 });
  const srv = http.createServer(other);
  await new Promise((r) => srv.listen(0, r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const res = await fetch(`${url}/api/restore`, { method: 'POST', body: JSON.stringify(backup) }).then((x) => x.json());
  assert.ok(res.restored >= backup.documents.length);
  const docs = await fetch(`${url}/api/documents`).then((x) => x.json());
  assert.equal(docs.length, backup.documents.length);
  srv.close();
  fs.rmSync(dir2, { recursive: true, force: true });
});

test('bad input is rejected cleanly', async () => {
  const r = await fetch(`${base}/api/documents`, { method: 'POST', body: '{not json' });
  assert.equal(r.status, 400);
  assert.equal((await call('POST', '/api/documents', { type: 'receipt' })).status, 422);
  assert.equal((await call('GET', '/api/nope')).status, 404);
});

test('optional PIN protects the API', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'synnex3-'));
  const { srv, url } = await (async () => {
    const app = await createApp({ dataDir: d, staticDir: d, accessPin: '2468' });
    const s = http.createServer(app);
    await new Promise((r) => s.listen(0, r));
    return { srv: s, url: `http://127.0.0.1:${s.address().port}` };
  })();
  assert.equal((await fetch(`${url}/api/documents`)).status, 401);
  assert.equal((await fetch(`${url}/api/health`)).status, 200);
  assert.equal((await fetch(`${url}/api/login`, { method: 'POST', body: JSON.stringify({ pin: '0000' }) })).status, 401);
  const { token } = await fetch(`${url}/api/login`, { method: 'POST', body: JSON.stringify({ pin: '2468' }) }).then((x) => x.json());
  assert.equal((await fetch(`${url}/api/documents`, { headers: { Authorization: `Bearer ${token}` } })).status, 200);
  srv.close();
  fs.rmSync(d, { recursive: true, force: true });
});
