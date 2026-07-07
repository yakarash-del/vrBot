import express from "express";
import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";
import selfsigned from "selfsigned";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HTTP_PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const HAS_CREDENTIALS = Boolean(
  process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN
);
const client = HAS_CREDENTIALS ? new Anthropic() : null;
if (!HAS_CREDENTIALS) {
  console.log("ANTHROPIC_API_KEY לא הוגדר - השרת פועל במצב הדגמה.");
}

// ---------- Budget guard: hard local spending cap ----------
const COST_LIMIT_ILS = parseFloat(process.env.COST_LIMIT_ILS || "10");
const USD_TO_ILS = parseFloat(process.env.USD_TO_ILS || "3.75");
// claude-opus-4-8 pricing, USD per 1M tokens
const PRICE = { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 };
const USAGE_FILE = path.join(__dirname, "usage.json");

let usage = { totalIls: 0, requests: 0 };
try {
  usage = { ...usage, ...JSON.parse(fs.readFileSync(USAGE_FILE, "utf8")) };
} catch { /* first run — no usage file yet */ }

function recordUsage(u) {
  const usd =
    (u.input_tokens * PRICE.input +
      u.output_tokens * PRICE.output +
      (u.cache_creation_input_tokens || 0) * PRICE.cacheWrite +
      (u.cache_read_input_tokens || 0) * PRICE.cacheRead) / 1e6;
  usage.totalIls += usd * USD_TO_ILS;
  usage.requests += 1;
  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
  console.log(
    `שימוש: ₪${usage.totalIls.toFixed(3)} מתוך ₪${COST_LIMIT_ILS} (${usage.requests} הודעות)`
  );
}

const budgetInfo = () => ({
  usedIls: Math.round(usage.totalIls * 100) / 100,
  limitIls: COST_LIMIT_ILS,
});

// ---------- Editable configuration (admin screen) ----------
const CONFIG_FILE = path.join(__dirname, "config.json");
const DEFAULT_CONFIG = {
  avatar: "male", // "male" | "female"
  name: "דוד כהן",
  greeting: "",   // empty = automatic greeting based on the name
  instructions:
    "אתה מנהל בכיר בחברה, יושב במשרדך ומקבל עובדים ואורחים לשיחה. האופי שלך: מקצועי, חם, ישיר וקשוב. אתה מייעץ בנושאי ניהול, קריירה, עבודת צוות, פרויקטים וחדשנות.",
  background: "",
};

let config = { ...DEFAULT_CONFIG };
try {
  config = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) };
} catch { /* first run — defaults */ }

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function buildSystem() {
  const persona =
    `שמך ${config.name} ואתה דמות וירטואלית בחדר תלת-ממדי, מדבר עם מבקר שיושב מולך.\n` +
    `התרחיש וההוראות שלך:\n${config.instructions}\n` +
    `כללים קבועים: ענה בעברית בלבד. ענה תשובות קצרות וממוקדות (2-4 משפטים) כי זו שיחה קולית. הישאר תמיד בדמות.`;
  const blocks = [{ type: "text", text: persona }];
  if (config.background?.trim()) {
    blocks.push({
      type: "text",
      text: `חומר רקע שעליך להכיר ולהתבסס עליו בתשובותיך:\n${config.background}`,
    });
  }
  // cache breakpoint on the last block caches the whole system prompt
  blocks[blocks.length - 1].cache_control = { type: "ephemeral" };
  return blocks;
}

// ---------- Admin API (optional password via ADMIN_PASSWORD env) ----------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
function adminAuth(req, res, next) {
  if (ADMIN_PASSWORD && req.headers["x-admin-password"] !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "סיסמת ניהול שגויה" });
  }
  next();
}

// public config — only what the 3D client needs (no scenario/background leak)
app.get("/api/config", (_req, res) => {
  res.json({ avatar: config.avatar, name: config.name, greeting: config.greeting });
});

app.get("/api/admin/config", adminAuth, (_req, res) => {
  res.json({ ...config, passwordProtected: Boolean(ADMIN_PASSWORD) });
});

app.post("/api/admin/config", adminAuth, (req, res) => {
  const { avatar, name, greeting, instructions, background } = req.body || {};
  if (avatar !== undefined) {
    if (avatar !== "male" && avatar !== "female") {
      return res.status(400).json({ error: "avatar חייב להיות male או female" });
    }
    config.avatar = avatar;
  }
  if (name !== undefined) config.name = String(name).slice(0, 60) || DEFAULT_CONFIG.name;
  if (greeting !== undefined) config.greeting = String(greeting).slice(0, 300);
  if (instructions !== undefined) {
    config.instructions = String(instructions).slice(0, 4000) || DEFAULT_CONFIG.instructions;
  }
  if (background !== undefined) config.background = String(background).slice(0, 200000);
  saveConfig();
  res.json({ ok: true, config });
});

// Canned responses used when no API credentials are available (demo mode)
const DEMO_RESPONSES = [
  "שלום! אני דוד, המנהל הווירטואלי. כרגע אני במצב הדגמה (ללא חיבור ל-API), אבל אשמח לשוחח!",
  "שאלה מצוינת. במצב הדגמה אני עונה תשובות קבועות - הגדירו מפתח ANTHROPIC_API_KEY כדי לקבל תשובות אמיתיות.",
  "אני מקשיב. כדי לקבל תשובות חכמות באמת, הפעילו את השרת עם מפתח API של Anthropic.",
];
let demoIndex = 0;

// quick budget check: http://localhost:3000/api/usage
app.get("/api/usage", (_req, res) => {
  res.json({ ...budgetInfo(), requests: usage.requests, connected: HAS_CREDENTIALS });
});

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  // Keep only the fields the API expects, cap history length
  const history = messages
    .slice(-20)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content }));

  if (!HAS_CREDENTIALS) {
    const reply = DEMO_RESPONSES[demoIndex++ % DEMO_RESPONSES.length];
    return res.json({ reply, demo: true });
  }

  // hard stop when the local budget is exhausted
  if (usage.totalIls >= COST_LIMIT_ILS) {
    return res.json({
      reply: `הגענו למגבלת התקציב שהוגדרה (₪${COST_LIMIT_ILS}). כדי להמשיך לשוחח, הגדילו את COST_LIMIT_ILS או אפסו את הקובץ usage.json.`,
      demo: true,
      budget: budgetInfo(),
    });
  }

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system: buildSystem(),
      messages: history,
    });

    recordUsage(response.usage);

    let reply = "";
    for (const block of response.content) {
      if (block.type === "text") reply += block.text;
    }
    res.json({ reply, demo: false, budget: budgetInfo() });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      const reply = DEMO_RESPONSES[demoIndex++ % DEMO_RESPONSES.length];
      return res.json({ reply, demo: true });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: "יותר מדי בקשות, נסו שוב בעוד רגע." });
    }
    if (error instanceof Anthropic.APIConnectionError) {
      const reply = DEMO_RESPONSES[demoIndex++ % DEMO_RESPONSES.length];
      return res.json({ reply, demo: true });
    }
    console.error("Chat error:", error);
    res.status(500).json({ error: "שגיאה בשרת, נסו שוב." });
  }
});

http.createServer(app).listen(HTTP_PORT, () => {
  console.log(`HTTP  server: http://localhost:${HTTP_PORT}`);
});

// WebXR requires a secure context. localhost is exempt, but the Quest browser
// reaches this machine over the LAN, so serve HTTPS with a self-signed cert too.
const pems = selfsigned.generate([{ name: "commonName", value: "localhost" }], {
  days: 365,
  keySize: 2048,
});
https
  .createServer({ key: pems.private, cert: pems.cert }, app)
  .listen(HTTPS_PORT, "0.0.0.0", () => {
    console.log(`HTTPS server: https://<כתובת-המחשב-ברשת>:${HTTPS_PORT}  (למשקפי Quest)`);
  });
