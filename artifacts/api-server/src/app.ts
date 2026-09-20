import express, { type Express } from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import path from "node:path";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Railway runs one public process. Serve the Vite production build from the
// API process when it exists, while leaving all /api routes to Express.
const clientBuild = path.resolve(process.cwd(), "artifacts/quest-road/dist/public");
if (existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
  app.get("/{*path}", (req, res, next) => {
    if (req.path === "/api" || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(clientBuild, "index.html"));
  });
}

export default app;
