import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { auth } from "./routes/auth.js";
import { users } from "./routes/users.js";
import { rbac } from "./routes/rbac.js";
import { business } from "./routes/business.js";
import { errorHandler, HttpError } from "./utils/errors.js";
export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000" }),
);
app.use(express.json({ limit: "30kb" }));
app.use(
  "/api/auth/login",
  rateLimit({
    windowMs: 60_000,
    limit: 15,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
);
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", transport: req.secure ? "https" : "test" }),
);
app.use("/api/auth", auth);
app.use("/api/users", users);
app.use("/api/rbac", rbac);
app.use("/api", business);
app.use((req, res, next) => next(new HttpError(404, "Route not found")));
app.use(errorHandler);
