import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import "./db.js"; // creates tables on first run
import { health } from "./routes/health.js";
import { messages } from "./routes/messages.js";
import { auth } from "./routes/auth.js";
import { state } from "./routes/state.js";
import { links } from "./routes/links.js";
import { assigned } from "./routes/assigned.js";
import { parent } from "./routes/parent.js";

const PORT = process.env.PORT || 8787;
const DEFAULT_DEV_ORIGIN = "http://localhost:8000";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || DEFAULT_DEV_ORIGIN;

if (!process.env.ALLOWED_ORIGIN) {
  console.warn(
    `[study-buddy-server] ALLOWED_ORIGIN is not set — defaulting to ${DEFAULT_DEV_ORIGIN}. ` +
    "Set it explicitly before hosting this anywhere reachable by others."
  );
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("[study-buddy-server] ANTHROPIC_API_KEY is not set — /api/messages will fail until it is.");
}
if (process.env.COOKIE_SECURE !== "true") {
  console.warn("[study-buddy-server] COOKIE_SECURE is not 'true' — session cookies are not marked Secure. Fine over http on localhost; set COOKIE_SECURE=true once this is served over https.");
}

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" })); // material.js caps uploaded images at 5MB, base64 inflates that ~33%

app.use("/api", health);
app.use("/api", messages);
app.use("/api", auth);
app.use("/api", state);
app.use("/api", links);
app.use("/api", assigned);
app.use("/api", parent);

app.listen(PORT, () => {
  console.log(`[study-buddy-server] listening on http://localhost:${PORT}`);
});
