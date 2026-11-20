# Synnex Technology — Quotations, Invoices & Letters

Create branded quotations, invoices and letters on site, export them as PDF at any time, and keep every document, customer and price on your own computer or server.

## Run it

You need **Node.js 22.5 or newer** (it includes the SQLite database). Check with `node -v`.

```bash
npm install
npm run build      # build the app once
npm start          # http://localhost:3001
```

Open http://localhost:3001 on this computer. Phones and tablets on the same Wi-Fi can use `http://<this-computer's-IP>:3001`.

**While developing:** `npm run dev` runs the API (port 3001) and the app with live reload (http://localhost:5173) together.

**Tests:** `npm test` runs the API tests.

## What it does

- **Quotations, invoices and letters** share one editor. Each part of the document is a card: edit it, hide it from the PDF, move it up or down, or add your own sections (for example Scope of work, Warranty, Delivery).
- **Export whenever you like.** Download or print the PDF at any stage. Empty fields, rows and sections are simply left out.
- **Live preview** of the exact PDF beside the editor, or under Preview on a phone.
- **Items table** with group headings, units, quantities, rates, optional per-line discount, and columns you can rename or hide.
- **Totals** with a discount (fixed amount or %), tax, payments received and balance due. Invoices can show the amount in words.
- **Automatic numbering** (SX-Q-2026-001, SX-INV-2026-001…) with your own prefixes. Set the next number in Settings.
- **Status tracking:** draft, sent, accepted, declined, expired / partial, paid, cancelled. Overdue invoices are flagged.
- **One click** to duplicate a document or turn a quotation into an invoice.
- **Customers** and **Items & rates** lists. Type a few letters in a row to fill in a saved item and its price.
- **Branding** in Settings: logo, company details, colours, signature, bank details, default terms, currency, tax, date format, page size.
- **Autosave**, with Ctrl+S to save straight away.
- **Backup and restore** as a single JSON file.

### PDF layout

Two layouts, chosen in **Settings → Document style**:

**Simple** (default): a centred letterhead (tagline, spaced company name, address, phone, email), the customer, a Date / Number line, a centred title, a full-grid table with numbered rows (No. · Description · U/M · Qty · Rate · Amount), the amount in words, and a plain totals list.

**Text size & bold**: inside each quotation, invoice or letter, open the "Text size & bold" card at the top of the editor (or press **Text size** in the top bar). Set the size (pt) and weight (Light, Regular, Semi-bold, Bold) of the company name, title, body text, customer name, labels, section headings, table header, table rows, totals, grand total and footer, and watch the preview. "Use for all documents" makes the current sizes the default.

**Word-style formatting**: in item descriptions, group headings, the description of work, work details, notes, custom sections, closing lines and the note beside the totals, select any words and use the toolbar that appears above the box: **Bold**, *Italic*, Underline, size (8–24 pt), colour (8 quick colours or any colour), or clear formatting. Ctrl+B / Ctrl+I / Ctrl+U work too. The PDF prints exactly what you see. Formatting is stored inside the text as `<r b i u c="#C00000" s="12">words</r>`; plain text is unchanged.

**Boxed**, a classic business form:

- Company details top-left (with your logo if uploaded); a large title and a boxed number/date grid top-right.
- Grey heading bars: CUSTOMER INFO with "Prepared by", DESCRIPTION OF WORK, and an ITEMIZED COSTS table with column rules.
- A totals block with SUBTOTAL, DISCOUNT/TAX and a shaded TOTAL QUOTE / TOTAL DUE, plus "Thank you for your business!" beside it.
- Terms text, a Customer acceptance signature / name / date row on quotations, and a centred contact line at the bottom.

Documents use the **Source Sans 3** typeface (light title, regular text, semi-bold headings), embedded in every PDF. Switch to IBM Plex Sans or Helvetica, and change the title and heading-bar colours, in **Settings → Document style**.

## Where data is stored

| Situation | Storage |
|---|---|
| `npm start` on Node 22.5+ | `data/synnex.db` (SQLite) |
| Older Node | `data/store.json` (same features) |
| App opened without the server (e.g. GitHub Pages) | This browser only. A yellow notice says so. Use **Settings → Download backup**. |

Copy the `data` folder to back up everything. Documents saved by the previous version, in the browser or in `data/quotations.json` and `data/invoices.json`, are imported automatically the first time.

## Options (environment variables)

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (default 3001) |
| `ACCESS_PIN` | Require a PIN to open the app, e.g. `ACCESS_PIN=2468 npm start` |
| `STORAGE=json` | Use the JSON file instead of SQLite |
| `BASE_PATH` | Serve from a sub-folder, e.g. `BASE_PATH=/quotation` for `synnex-technology.com/quotation/` |
| `DATA_DIR` | Folder for the database (default `./data`) |
| `CORS_ORIGIN`, `VITE_API_URL` | Only if the app and the server are on different domains |

On Windows PowerShell: `$env:ACCESS_PIN="2468"; npm start`

## Put it on your website (synnex-technology.com/quotation)

The app needs Node.js 20 or newer on the server (22.5+ uses SQLite; older
versions use the JSON file automatically). **Always set `ACCESS_PIN` online**,
or anyone who finds the page can read your quotations.

### cPanel hosting with "Setup Node.js App"
1. On your computer run `npm run build`.
2. Zip everything **except** `node_modules` and `data`, upload it to a new
   folder outside `public_html`, e.g. `~/quotation-app`, and extract it.
3. cPanel → **Setup Node.js App** → Create application:
   Node.js version 20+ · Application root `quotation-app` ·
   Application URL `synnex-technology.com/quotation` ·
   Application startup file `server.mjs`.
4. Add environment variables `BASE_PATH=/quotation` and `ACCESS_PIN=your PIN`.
5. Press **Run NPM Install**, then **Restart**. Open
   `https://synnex-technology.com/quotation/`.
6. To move your existing data: upload your `data` folder into `quotation-app`
   (or use Settings → Data → Download backup / Restore).

### VPS (Ubuntu, nginx)
```
git clone https://github.com/cheerysaaru/synnex-technology.git /opt/quotation
cd /opt/quotation && npm ci && npm run build
sudo npm i -g pm2
BASE_PATH=/quotation ACCESS_PIN=1234 PORT=3001 pm2 start server.mjs --name quotation && pm2 save
```
nginx, inside the `server { … }` block for synnex-technology.com:
```
location /quotation/ { proxy_pass http://127.0.0.1:3001; proxy_set_header Host $host; client_max_body_size 20m; }
```

### CyberPanel (OpenLiteSpeed)
1. Open a terminal (CyberPanel → **Terminal**, or SSH as root) and install Node 22:
   `curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs git`
   (AlmaLinux/Rocky: `curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - && dnf install -y nodejs git`)
2. Get the app, build it and keep it running:
   ```
   cd /home/synnex-technology.com
   git clone https://github.com/cheerysaaru/synnex-technology.git quotation-app
   cd quotation-app && npm ci && npm run build
   npm i -g pm2
   BASE_PATH=/quotation ACCESS_PIN=1234 PORT=3001 pm2 start server.mjs --name quotation
   pm2 save && pm2 startup
   ```
3. CyberPanel → Websites → List Websites → synnex-technology.com → **Manage** →
   **vHost Conf**, add at the end and save:
   ```
   extprocessor quotationapp {
     type                    proxy
     address                 127.0.0.1:3001
     maxConns                100
     initTimeout             60
     retryTimeout            0
     respBuffer              0
   }
   context /quotation/ {
     type                    proxy
     handler                 quotationapp
     addDefaultCharset       off
   }
   ```
4. Same page → **Rewrite Rules**, add `RewriteRule ^quotation$ /quotation/ [R=301,L]`, save.
5. Restart OpenLiteSpeed: `systemctl restart lsws`. Open `https://synnex-technology.com/quotation/`.
6. Updating later: `cd /home/synnex-technology.com/quotation-app && git pull && npm ci && npm run build && pm2 restart quotation`.

### Static only (no server)
Upload the contents of `dist/` to `public_html/quotation/`. It works, but
each browser keeps its own data (no shared database, no backup on the server).

## API

All routes are under `/api`:

- `GET /health`
- `GET|PUT /settings`
- `GET /stats`
- `GET|POST /documents`, `GET|PUT|PATCH|DELETE /documents/:id`
- `POST /documents/:id/duplicate`, `POST /documents/:id/convert`
- `GET|POST /customers`, `GET|PUT|DELETE /customers/:id`
- `GET|POST /catalog`, `GET|PUT|DELETE /catalog/:id`
- `GET /backup`, `POST /restore`, `POST /import`
- `POST /login` (only when `ACCESS_PIN` is set)

## Project layout

```
server/         API server (node:http + SQLite, JSON fallback)
shared/         default settings used by both server and app
src/pages/      Dashboard, document lists, editor, customers, items, settings
src/pdf/        the PDF layout
src/lib/        data layer (server or browser), totals, document defaults
test/           API tests
```
