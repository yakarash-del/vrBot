import { spawn } from "child_process";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import http from "http";
import https from "https";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
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
    `כללים קבועים: ענה באותה שפה שבה המבקר פונה אליך - עברית, אנגלית או ערבית (ברירת המחדל עברית). ` +
    `ענה תשובות קצרות וממוקדות (2-4 משפטים) כי זו שיחה קולית. הישאר תמיד בדמות.`;
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

// ---------- Text-to-speech (Edge neural voices — works on Quest too) ----------
// Voice per language (detected from the reply text) and avatar gender.
const TTS_VOICES = {
  he: { male: "he-IL-AvriNeural", female: "he-IL-HilaNeural" },
  ar: { male: "ar-SA-HamedNeural", female: "ar-SA-ZariyahNeural" },
  en: { male: "en-US-GuyNeural", female: "en-US-JennyNeural" },
};

function detectLanguage(text) {
  if (/[֐-׿]/.test(text)) return "he";
  if (/[؀-ۿ]/.test(text)) return "ar";
  return "en";
}

app.post("/api/tts", async (req, res) => {
  const text = String(req.body?.text || "").slice(0, 1500);
  if (!text.trim()) return res.status(400).json({ error: "text is required" });

  const lang = detectLanguage(text);
  const gender = config.avatar === "female" ? "female" : "male";
  const voice = TTS_VOICES[lang][gender];

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = await tts.toStream(text);
    res.setHeader("Content-Type", "audio/mpeg");
    audioStream.pipe(res);
    audioStream.on("error", () => res.end());
  } catch (error) {
    console.error("TTS error:", error.message);
    res.status(502).json({ error: "יצירת הקול נכשלה" });
  }
});

// ---------- Speech-to-text (Whisper sidecar — free-speech input on Quest) ----------
// Tries several Python launchers: on Windows, plain "python" is sometimes the
// Microsoft Store stub (exits immediately) or a different install without
// faster-whisper — "py" then reaches the real launcher.
const PYTHON_CANDIDATES = process.env.PYTHON
  ? [process.env.PYTHON]
  : ["python", "py", "python3"];

let sttProc = null;       // live, ready worker process
let sttStarting = null;   // in-flight startup promise
let sttResolvers = [];
let sttQueue = Promise.resolve();

function attachStdoutParser(proc) {
  let buffer = "";
  proc.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.ready) { proc.emit("stt-ready"); continue; }
      const resolver = sttResolvers.shift();
      if (resolver) resolver(msg);
    }
  });
}

function trySpawnWorker(cmd) {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(cmd, [path.join(__dirname, "stt_worker.py")], {
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      return reject(new Error(`${cmd}: ${e.message}`));
    }
    let stderrTail = "";
    let settled = false;
    proc.stderr.on("data", (c) => {
      stderrTail = (stderrTail + c.toString()).slice(-2000);
    });
    attachStdoutParser(proc);
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill();
        reject(new Error(`${cmd}: המנוע לא נטען תוך 3 דקות`));
      }
    }, 180000);
    proc.once("stt-ready", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(proc);
    });
    proc.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`${cmd}: ${e.message}`));
    });
    proc.on("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        const hint = stderrTail.trim().split("\n").slice(-3).join(" | ");
        reject(new Error(`${cmd} הסתיים מיד (קוד ${code})${hint ? ": " + hint : ""}`));
      } else {
        console.error(`מנוע התמלול קרס (קוד ${code}). פלט:\n${stderrTail}`);
        sttProc = null;
        for (const r of sttResolvers.splice(0)) r({ error: "מנוע התמלול קרס" });
      }
    });
  });
}

async function getSttWorker() {
  if (sttProc) return sttProc;
  if (!sttStarting) {
    sttStarting = (async () => {
      console.log("מפעיל מנוע תמלול (Whisper)...");
      const errors = [];
      for (const cmd of PYTHON_CANDIDATES) {
        try {
          const proc = await trySpawnWorker(cmd);
          console.log(`מנוע התמלול מוכן (${cmd})`);
          sttProc = proc;
          return proc;
        } catch (e) {
          errors.push(e.message);
          console.error("ניסיון הפעלת תמלול נכשל:", e.message);
        }
      }
      throw new Error(
        "לא נמצא Python עם faster-whisper. התקינו במחשב השרת: python -m pip install faster-whisper  (פירוט: " +
          errors.join(" ; ") + ")"
      );
    })().finally(() => { sttStarting = null; });
  }
  return sttStarting;
}

// Cloud transcription via Groq (free tier) — the right choice for hosted
// deployments like Render, where local Whisper can't run. Set GROQ_API_KEY.
async function groqTranscribe(audioBuffer) {
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: "audio/webm" }), "audio.webm");
  form.append("model", "whisper-large-v3");
  form.append("response_format", "json");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return { text: data.text || "", language: data.language };
}

app.post(
  "/api/stt",
  express.raw({ type: ["audio/*", "application/octet-stream"], limit: "20mb" }),
  async (req, res) => {
    if (!req.body?.length) return res.status(400).json({ error: "no audio" });

    // preferred path when a Groq key is configured (hosted deployments)
    if (process.env.GROQ_API_KEY) {
      try {
        const result = await groqTranscribe(req.body);
        return res.json(result);
      } catch (e) {
        console.error("Groq STT error:", e.message);
        return res.status(502).json({ error: "התמלול בענן נכשל: " + e.message });
      }
    }

    let worker;
    try {
      worker = await getSttWorker();
    } catch (e) {
      return res.status(503).json({ error: "תמלול לא זמין: " + e.message });
    }

    const tmpFile = path.join(
      os.tmpdir(),
      `stt-${crypto.randomBytes(6).toString("hex")}.webm`
    );
    fs.writeFileSync(tmpFile, req.body);

    // serialize requests — the worker answers strictly in order
    sttQueue = sttQueue.then(async () => {
      try {
        const result = await new Promise((resolve) => {
          sttResolvers.push(resolve);
          worker.stdin.write(tmpFile + "\n");
        });
        if (result.error) {
          res.status(500).json({ error: "התמלול נכשל: " + result.error });
        } else {
          res.json({ text: result.text, language: result.language });
        }
      } catch (e) {
        res.status(503).json({ error: "מנוע התמלול לא זמין: " + e.message });
      } finally {
        fs.unlink(tmpFile, () => {});
      }
    });
    await sttQueue;
  }
);

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
