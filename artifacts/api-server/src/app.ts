import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import { clerkMiddleware } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(clerkMiddleware());

app.set("trust proxy", 1);

const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const uploadLimiter = rateLimit({
  windowMs: 5 * 60_000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many upload requests, please wait a few minutes." },
});

const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many write requests, please slow down." },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many registration attempts. Please try again later." },
});

app.use("/api", globalLimiter);
app.use("/api/uploads", uploadLimiter);
app.use("/api/auth/register", registerLimiter);
app.use("/api/loans", (req, res, next) => {
  if (req.method === "GET") return next();
  return writeLimiter(req, res, next);
});
app.use("/api/members", (req, res, next) => {
  if (req.method === "GET") return next();
  return writeLimiter(req, res, next);
});

app.use("/api", router);

const isDev = process.env.NODE_ENV !== "production";

if (isDev) {
  const vitePort = process.env.VITE_PORT || "5173";
  app.use(
    "/",
    createProxyMiddleware({
      target: `http://localhost:${vitePort}`,
      changeOrigin: true,
      ws: true,
      on: {
        error: (_err, _req, res) => {
          if (res && "status" in res) {
            (res as express.Response).status(502).send("Frontend dev server not ready yet.");
          }
        },
      },
    }) as express.RequestHandler,
  );
} else {
  const frontendDist = path.resolve(__dirname, "../../cooperative/dist/public");
  if (existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get("/*splat", (_req, res) => {
      res.sendFile(path.resolve(frontendDist, "index.html"));
    });
  }
}

export default app;
