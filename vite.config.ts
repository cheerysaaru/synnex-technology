import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve("data");
const QUOTATIONS_FILE = path.join(DATA_DIR, "quotations.json");
const INVOICES_FILE = path.join(DATA_DIR, "invoices.json");

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(QUOTATIONS_FILE)) fs.writeFileSync(QUOTATIONS_FILE, "[]", "utf-8");
  if (!fs.existsSync(INVOICES_FILE)) fs.writeFileSync(INVOICES_FILE, "[]", "utf-8");
}

function readJSON(filePath: string) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return [];
  }
}

function writeJSON(filePath: string, data: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function parseBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: string) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function apiPlugin() {
  return {
    name: "api-routes",
    configureServer(server: any) {
      ensureDataFiles();

      server.middlewares.use("/api", async (req: any, res: any, next: any) => {
        const url = req.url;
        const method = req.method;

        // GET /api/quotations
        if (url === "/quotations" && method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(readJSON(QUOTATIONS_FILE)));
          return;
        }

        // POST /api/quotations
        if (url === "/quotations" && method === "POST") {
          try {
            const body = await parseBody(req);
            const list = readJSON(QUOTATIONS_FILE);
            const idx = list.findIndex((x: any) => x.id === body.id);
            if (idx >= 0) list[idx] = body;
            else list.unshift(body);
            writeJSON(QUOTATIONS_FILE, list);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
          }
          return;
        }

        // DELETE /api/quotations/:id
        const qDelMatch = url?.match(/^\/quotations\/(.+)$/);
        if (qDelMatch && method === "DELETE") {
          const id = qDelMatch[1];
          const list = readJSON(QUOTATIONS_FILE).filter((x: any) => x.id !== id);
          writeJSON(QUOTATIONS_FILE, list);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        // GET /api/invoices
        if (url === "/invoices" && method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(readJSON(INVOICES_FILE)));
          return;
        }

        // POST /api/invoices
        if (url === "/invoices" && method === "POST") {
          try {
            const body = await parseBody(req);
            const list = readJSON(INVOICES_FILE);
            const idx = list.findIndex((x: any) => x.id === body.id);
            if (idx >= 0) list[idx] = body;
            else list.unshift(body);
            writeJSON(INVOICES_FILE, list);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
          }
          return;
        }

        // DELETE /api/invoices/:id
        const iDelMatch = url?.match(/^\/invoices\/(.+)$/);
        if (iDelMatch && method === "DELETE") {
          const id = iDelMatch[1];
          const list = readJSON(INVOICES_FILE).filter((x: any) => x.id !== id);
          writeJSON(INVOICES_FILE, list);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), apiPlugin()],
  server: {
    host: "0.0.0.0",
  },
});
