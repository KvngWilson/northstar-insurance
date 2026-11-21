import "dotenv/config";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { app } from "./app.js";
if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32 ||
  /replace[_-]?with|REPLACE_WITH|change[_-]?me|example/i.test(
    process.env.JWT_SECRET,
  )
)
  throw new Error(
    "Configure a unique JWT_SECRET of at least 32 characters; do not use the example value",
  );
const key = fs.readFileSync(
  path.resolve(process.env.TLS_KEY || "certs/localhost-key.pem"),
);
const cert = fs.readFileSync(
  path.resolve(process.env.TLS_CERT || "certs/localhost.pem"),
);
https
  .createServer({ key, cert }, app)
  .listen(Number(process.env.PORT || 8443), () =>
    console.log(
      `HTTPS API listening on https://localhost:${process.env.PORT || 8443}`,
    ),
  );
