import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const QUOTATIONS_FILE = path.join(DATA_DIR, "quotations.json");
const INVOICES_FILE = path.join(DATA_DIR, "invoices.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(QUOTATIONS_FILE)) fs.writeFileSync(QUOTATIONS_FILE, "[]", "utf-8");
if (!fs.existsSync(INVOICES_FILE)) fs.writeFileSync(INVOICES_FILE, "[]", "utf-8");

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return [];
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function sendJSON(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

const STATIC_DIR = path.join(__dirname, "dist");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;
  const pathname = url.pathname;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // API routes
  if (pathname === "/api/quotations" && method === "GET") {
    return sendJSON(res, 200, readJSON(QUOTATIONS_FILE));
  }
  if (pathname === "/api/quotations" && method === "POST") {
    try {
      const body = await parseBody(req);
      const list = readJSON(QUOTATIONS_FILE);
      const idx = list.findIndex((x) => x.id === body.id);
      if (idx >= 0) {
        list[idx] = body;
      } else {
        list.unshift(body);
      }
      writeJSON(QUOTATIONS_FILE, list);
      return sendJSON(res, 200, { ok: true });
    } catch {
      return sendJSON(res, 400, { error: "Invalid JSON" });
    }
  }
  if (pathname.startsWith("/api/quotations/") && method === "DELETE") {
    const id = pathname.slice("/api/quotations/".length);
    const list = readJSON(QUOTATIONS_FILE).filter((x) => x.id !== id);
    writeJSON(QUOTATIONS_FILE, list);
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === "/api/invoices" && method === "GET") {
    return sendJSON(res, 200, readJSON(INVOICES_FILE));
  }
  if (pathname === "/api/invoices" && method === "POST") {
    try {
      const body = await parseBody(req);
      const list = readJSON(INVOICES_FILE);
      const idx = list.findIndex((x) => x.id === body.id);
      if (idx >= 0) {
        list[idx] = body;
      } else {
        list.unshift(body);
      }
      writeJSON(INVOICES_FILE, list);
      return sendJSON(res, 200, { ok: true });
    } catch {
      return sendJSON(res, 400, { error: "Invalid JSON" });
    }
  }
  if (pathname.startsWith("/api/invoices/") && method === "DELETE") {
    const id = pathname.slice("/api/invoices/".length);
    const list = readJSON(INVOICES_FILE).filter((x) => x.id !== id);
    writeJSON(INVOICES_FILE, list);
    return sendJSON(res, 200, { ok: true });
  }

  // Serve static files
  const filePath = pathname === "/" ? "/index.html" : pathname;
  const fullPath = path.join(STATIC_DIR, filePath);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const extMap = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
    const ext = path.extname(fullPath);
    res.writeHead(200, { "Content-Type": extMap[ext] || "application/octet-stream" });
    fs.createReadStream(fullPath).pipe(res);
    return;
  }

  // SPA fallback
  const fallback = path.join(STATIC_DIR, "index.html");
  if (fs.existsSync(fallback)) {
    res.writeHead(200, { "Content-Type": "text/html" });
    fs.createReadStream(fallback).pipe(res);
    return;
  }

  sendJSON(res, 404, { error: "Not found" });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
