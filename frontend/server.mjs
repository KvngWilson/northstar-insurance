// Full-stack development and production TLS server for Next.js.
// Uses the same localhost development certificate as the Express API.
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";

const dir = path.dirname(fileURLToPath(import.meta.url));
const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);
const keyPath = path.resolve(
  dir,
  process.env.TLS_KEY || "../backend/certs/localhost-key.pem",
);
const certPath = path.resolve(
  dir,
  process.env.TLS_CERT || "../backend/certs/localhost.pem",
);
const application = next({ dev, dir });
await application.prepare();
const handle = application.getRequestHandler();
https
  .createServer(
    { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
    (req, res) => handle(req, res),
  )
  .listen(port, "0.0.0.0", () =>
    console.log(`HTTPS frontend listening at https://localhost:${port}`),
  );
