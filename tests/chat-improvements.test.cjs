"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const adminPage = require("../src/admin-page.cjs");

const sourcePath = path.resolve(__dirname, "..", "src", "index.ts");
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalGroqApiKey = process.env.GROQ_API_KEY;
const originalTelegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const originalTelegramChatId = process.env.TELEGRAM_CHAT_ID;
const originalAdminPassword = process.env.ADMIN_PASSWORD;
const originalAdminSessionSecret = process.env.ADMIN_SESSION_SECRET;
const originalFetch = global.fetch;
const originalConsoleError = console.error;
let state;
let logs;

function loadFunction(rows) {
  process.env.DATABASE_URL = "postgresql://test.invalid/db";
  let source = fs.readFileSync(sourcePath, "utf8");
  source = source.replace(
    'import { Pool } from "pg";',
    "class Pool { async query(text, values) { return global.__improvedChatQuery(text, values); } async connect() { return { query(text, values) { return global.__improvedChatQuery(text, values); }, release() {} }; } }"
  );
  source = source.replace(
    'import { attachDatabasePool } from "@neon/functions";',
    "function attachDatabasePool() {}"
  );
  source = source.replace(
    'import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";',
    "const { createHash, createHmac, randomBytes, timingSafeEqual } = require('node:crypto');"
  );
  source = source.replace(
    'import adminPage from "./admin-page.cjs";',
    'const adminPage = require("./admin-page.cjs");'
  );
  source = source.replace("export default {", "module.exports = {");
  source = Module.stripTypeScriptTypes(source, { mode: "strip" });
  global.__improvedChatQuery = (text, values = []) => {
    const sql = text.replace(/\s+/g, " ");
    if (sql.includes("INSERT INTO users")) return { rows: [{ id: values[0] }] };
    if (
      sql.includes("SELECT role, content FROM messages") &&
      sql.includes("WHERE conversation_id = (")
    ) {
      return { rows: state.messages.slice(-100).reverse() };
    }
    if (
      sql.includes("SELECT c.id") &&
      sql.includes("FROM conversations c") &&
      !sql.includes("COUNT(m.id)")
    ) {
      return { rows: state.messages.length ? [{ id: "conversation-id" }] : [] };
    }
    if (sql.includes("SELECT id FROM conversations")) {
      return { rows: [{ id: "conversation-id" }] };
    }
    if (sql.includes("INSERT INTO conversations")) {
      return { rows: [{ id: "conversation-id" }] };
    }
    if (sql.includes("INSERT INTO leads")) {
      if (state.failLeadSave) {
        state.failLeadSave = false;
        throw Object.assign(new Error("private lead database details"), { code: "08006" });
      }
      state.pendingLead = {
        id: `lead-${state.leads.length + 1}`,
        conversation_id: values[0],
        name: values[1],
        contact: values[2],
        question: values[3],
        status: "new",
        created_at: "2026-11-03T03:30:00.000Z"
      };
      state.events.push("lead_inserted");
      const savedLead = state.pendingLead;
      return { rows: [{ id: savedLead.id, created_at: savedLead.created_at, status: savedLead.status }] };
    }
    if (sql === "SELECT 1;") return { rows: [{ "?column?": 1 }] };
    if (sql.includes("FROM leads l") && sql.includes("ORDER BY l.created_at")) {
      return { rows: state.adminLeads ?? [] };
    }
    if (sql.includes("UPDATE leads SET status")) {
      return { rows: state.adminLeadUpdate ? [state.adminLeadUpdate] : [] };
    }
    if (sql.includes("FROM conversations c") && sql.includes("COUNT(m.id)")) {
      return { rows: state.adminConversations ?? [] };
    }
    if (sql.includes("FROM conversations WHERE id = $1::uuid")) {
      return { rows: state.adminConversation ? [state.adminConversation] : [] };
    }
    if (sql.includes("SELECT role, content, created_at FROM messages")) {
      return { rows: state.adminMessages ?? [] };
    }
    if (sql.includes("SELECT id, name, contact, question, status, created_at FROM leads")) {
      return { rows: state.adminConversationLead ? [state.adminConversationLead] : [] };
    }
    if (sql.includes("INSERT INTO knowledge_base")) {
      state.adminKnowledge = {
        id: "99999999-9999-4999-8999-999999999999",
        title: values[0],
        category: values[1],
        content: values[2],
        source: values[3],
        is_active: values[4],
        version: 1
      };
      return { rows: [state.adminKnowledge] };
    }
    if (sql.includes("UPDATE knowledge_base SET")) {
      return { rows: state.adminKnowledge ? [{ ...state.adminKnowledge, version: 2 }] : [] };
    }
    if (sql === "BEGIN") {
      state.events.push("begin");
      return { rows: [] };
    }
    if (sql === "COMMIT") {
      state.events.push("commit");
      if (state.failLeadCommit) {
        state.failLeadCommit = false;
        throw Object.assign(new Error("private commit failure"), { code: "08006" });
      }
      if (state.pendingLead) state.leads.push(state.pendingLead);
      state.events.push("lead_committed");
      return { rows: [] };
    }
    if (sql === "ROLLBACK") {
      state.pendingLead = null;
      state.events.push("rollback");
      return { rows: [] };
    }
    if (sql.includes("SELECT role, content FROM messages")) {
      return { rows: state.messages.slice(-10).reverse() };
    }
    if (sql.includes("INSERT INTO messages")) {
      if (state.failAssistantSave && sql.includes("'assistant'")) {
        state.failAssistantSave = false;
        throw Object.assign(new Error("private db details"), { code: "08006" });
      }
      state.messages.push({
        role: sql.includes("'assistant'") ? "assistant" : "user",
        content: values[1]
      });
      return { rows: [] };
    }
    if (sql.includes("UPDATE conversations")) return { rows: [] };
    if (sql.includes("FROM knowledge_base")) return { rows };
    throw new Error(`Unexpected SQL in test: ${text}`);
  };
  const loaded = new Module(sourcePath, module);
  loaded.filename = sourcePath;
  loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  loaded._compile(source, sourcePath);
  return loaded.exports;
}

function request(params = {}) {
  const url = new URL("https://function.test/");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url);
}

async function ask(app, query, sessionId, retry = false) {
  return app.fetch(
    request({
      q: query,
      session_id: sessionId,
      ...(retry ? { retry: "1" } : {})
    })
  );
}

function adminRequest(action, options = {}) {
  const headers = {
    Origin: "https://function.test",
    "X-Forwarded-For": options.ip ?? "198.51.100.40"
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.csrf) headers["X-CSRF-Token"] = options.csrf;
  return new Request(`https://function.test/?action=${action}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });
}

async function loginAdmin(app, ip = "198.51.100.41") {
  const response = await app.fetch(
    adminRequest("admin-login", {
      method: "POST",
      ip,
      body: { password: "test-admin-password-at-least-16" }
    })
  );
  const body = await response.json();
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0];
  return { response, body, cookie };
}

const warrantyRecord = {
  id: "warranty",
  title: "Гарантия на конструкцию",
  category: "warranty",
  content: "Условия гарантии указаны в утверждённом договоре.",
  source: "verified-company-data"
};
const pineRecord = {
  id: "pine",
  title: "Дом Сосна",
  category: "houses",
  content: "Площадь модели Сосна указана в проверенной спецификации.",
  source: "verified-company-data"
};
const pinePriceRecord = {
  id: "pine-price",
  title: "Цена дома Сосна",
  category: "price",
  content: "В проверенном прайс-листе указана цена модели Сосна.",
  source: "verified-company-data"
};

test.beforeEach(() => {
  state = {
    messages: [],
    leads: [],
    pendingLead: null,
    events: [],
    failAssistantSave: false,
    failLeadCommit: false,
    adminLeads: [],
    adminLeadUpdate: null,
    adminConversations: [],
    adminConversation: null,
    adminMessages: [],
    adminConversationLead: null,
    adminKnowledge: null
  };
  process.env.ADMIN_PASSWORD = "test-admin-password-at-least-16";
  process.env.ADMIN_SESSION_SECRET = "test-session-secret-with-more-than-32-bytes";
  process.env.GROQ_API_KEY = "test-only";
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  logs = [];
  console.error = (...args) => logs.push(args);
  global.fetch = async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: "Ответ по материалам." } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
});

test.after(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalGroqApiKey === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = originalGroqApiKey;
  if (originalTelegramBotToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = originalTelegramBotToken;
  if (originalTelegramChatId === undefined) delete process.env.TELEGRAM_CHAT_ID;
  else process.env.TELEGRAM_CHAT_ID = originalTelegramChatId;
  if (originalAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = originalAdminPassword;
  if (originalAdminSessionSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
  else process.env.ADMIN_SESSION_SECRET = originalAdminSessionSecret;
  global.fetch = originalFetch;
  console.error = originalConsoleError;
  delete global.__improvedChatQuery;
});

test("search tolerates common one-character typos without selecting unrelated records", async () => {
  const app = loadFunction([warrantyRecord, pineRecord]);
  const response = await ask(
    app,
    "какая гарантея",
    "44444444-4444-4444-8444-444444444444"
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.results.map((record) => record.id), ["warranty"]);

  state.messages = [];
  const unrelated = await ask(
    app,
    "квантовый телепорт",
    "55555555-5555-4555-8555-555555555555"
  );
  assert.deepEqual((await unrelated.json()).results, []);
});

test("follow-up questions search with the previous user topic", async () => {
  const app = loadFunction([pineRecord, pinePriceRecord]);
  const sessionId = "66666666-6666-4666-8666-666666666666";
  const firstResponse = await ask(app, "Расскажите о доме Сосна", sessionId);
  assert.equal(firstResponse.status, 200);

  let groqRequest;
  global.fetch = async (_url, options) => {
    groqRequest = JSON.parse(options.body);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "Ответ по материалам." } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };
  const followUpResponse = await ask(app, "А сколько?", sessionId);
  assert.equal(followUpResponse.status, 200);

  const followUpBody = await followUpResponse.json();
  assert.ok(groqRequest, JSON.stringify({ followUpBody, messages: state.messages }));
  assert.ok(
    groqRequest.messages.some(
      (message) =>
        message.role === "user" &&
        message.content.includes('"title":"Цена дома Сосна"')
    ),
    JSON.stringify({ groqRequest, messages: state.messages })
  );
});

test("demonstration knowledge is not returned as a factual answer", async () => {
  let groqCalls = 0;
  global.fetch = async () => {
    groqCalls++;
    throw new Error("Groq should not be called");
  };
  const app = loadFunction([
    { ...pineRecord, source: "demo_severmodul" }
  ]);
  const response = await ask(
    app,
    "Расскажите о доме Сосна",
    "77777777-7777-4777-8777-777777777777"
  );
  const body = await response.json();

  assert.equal(body.results.length, 0);
  assert.match(body.answer, /нет подтверждённых сведений/iu);
  assert.equal(groqCalls, 0);
});

test("greetings are handled without a knowledge-base lookup and saved to history", async () => {
  const app = loadFunction([]);
  const response = await ask(
    app,
    "Привет!",
    "88888888-8888-4888-8888-888888888888"
  );
  const body = await response.json();

  assert.equal(body.answer_source, "chat");
  assert.match(body.answer, /Здравствуйте/u);
  assert.equal(state.messages.length, 2);
  assert.equal(state.messages[0].role, "user");
  assert.equal(state.messages[1].role, "assistant");
});

test("history endpoint returns isolated session messages in chronological order", async () => {
  state.messages = [
    { role: "user", content: "Первый вопрос" },
    { role: "assistant", content: "Первый ответ" }
  ];
  const app = loadFunction([]);
  const response = await app.fetch(
    request({
      action: "history",
      session_id: "99999999-9999-4999-8999-999999999999"
    })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.messages, state.messages);
});

test("a lead is created only after an explicit valid submission and is linked to the session", async () => {
  const app = loadFunction([]);
  const sessionId = "abababab-abab-4bab-8bab-abababababab";
  const response = await app.fetch(
    new Request(`https://function.test/?action=lead&session_id=${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Анна",
        contact: "+7 999 123-45-67",
        question: "Хочу обсудить проект дома."
      })
    })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.match(body.message, /сохранена/u);
  assert.deepEqual(state.leads, [{
    id: "lead-1",
    conversation_id: "conversation-id",
    name: "Анна",
    contact: "+7 999 123-45-67",
    question: "Хочу обсудить проект дома.",
    status: "new",
    created_at: "2026-11-03T03:30:00.000Z"
  }]);

  await ask(app, "Какая гарантия?", sessionId);
  assert.equal(state.leads.length, 1, "chat messages must not create implicit leads");
});

test("a saved lead is sent to Telegram with its persisted fields and no data is logged", async () => {
  const app = loadFunction([]);
  const sessionId = "abababab-abab-4bab-8bab-abababababab";
  const token = "test_bot_token_never_log";
  const chatId = "-1001234567890";
  process.env.TELEGRAM_BOT_TOKEN = token;
  process.env.TELEGRAM_CHAT_ID = chatId;
  const requests = [];
  global.fetch = async (url, options) => {
    state.events.push("telegram_requested");
    requests.push({ url: String(url), options, payload: JSON.parse(options.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const response = await app.fetch(
    new Request(`https://function.test/?action=lead&session_id=${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Synthetic Visitor",
        contact: "synthetic-contact@example.test",
        question: "Synthetic test question"
      })
    })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(state.events, [
    "begin",
    "lead_inserted",
    "commit",
    "lead_committed",
    "telegram_requested"
  ]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `https://api.telegram.org/bot${token}/sendMessage`);
  assert.equal(requests[0].options.method, "POST");
  assert.ok(requests[0].options.signal instanceof AbortSignal);
  assert.equal(requests[0].payload.chat_id, chatId);
  assert.match(requests[0].payload.text, /ID: lead-1/u);
  assert.match(requests[0].payload.text, /Статус: new/u);
  assert.match(requests[0].payload.text, /Дата и время:/u);
  assert.match(requests[0].payload.text, /Synthetic Visitor/u);
  assert.match(requests[0].payload.text, /synthetic-contact@example\.test/u);
  assert.match(requests[0].payload.text, /Synthetic test question/u);
  assert.deepEqual(logs, []);
});

test("a Telegram failure does not undo a saved lead or expose its contact or bot token in logs", async () => {
  const app = loadFunction([]);
  const sessionId = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd";
  const token = "test_bot_token_must_not_appear_in_logs";
  const contact = "sensitive-contact@example.test";
  process.env.TELEGRAM_BOT_TOKEN = token;
  process.env.TELEGRAM_CHAT_ID = "-1000000000000";
  global.fetch = async () => {
    throw new Error(`${token} ${contact} Telegram transport details`);
  };

  const response = await app.fetch(
    new Request(`https://function.test/?action=lead&session_id=${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Synthetic Visitor",
        contact,
        question: "Synthetic test question"
      })
    })
  );
  const body = await response.json();
  const serializedLogs = JSON.stringify(logs);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(state.leads.length, 1);
  assert.deepEqual(state.events, [
    "begin",
    "lead_inserted",
    "commit",
    "lead_committed"
  ]);
  assert.match(serializedLogs, /Lead Telegram notification failed/u);
  assert.match(serializedLogs, /transport_error/u);
  assert.doesNotMatch(serializedLogs, new RegExp(token, "u"));
  assert.doesNotMatch(serializedLogs, new RegExp(contact, "u"));
  assert.doesNotMatch(serializedLogs, /Synthetic Visitor|Synthetic test question/u);
});

test("missing Telegram token or chat ID leaves the committed lead saved and does not claim delivery", async (t) => {
  for (const missingVariable of ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]) {
    await t.test(`missing ${missingVariable}`, async () => {
      state = {
        messages: [],
        leads: [],
        pendingLead: null,
        events: [],
        failAssistantSave: false,
        failLeadCommit: false
      };
      logs = [];
      process.env.TELEGRAM_BOT_TOKEN = "test_bot_token";
      process.env.TELEGRAM_CHAT_ID = "-1001234567890";
      delete process.env[missingVariable];
      const app = loadFunction([]);
      let telegramCalls = 0;
      global.fetch = async () => {
        telegramCalls++;
        throw new Error("Telegram must not be called without complete configuration");
      };

      const response = await app.fetch(
        new Request(
          "https://function.test/?action=lead&session_id=dededede-dede-4ede-8ede-dededededede",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Synthetic Visitor",
              contact: "synthetic-contact@example.test",
              question: "Synthetic test question"
            })
          }
        )
      );
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.ok, true);
      assert.match(body.message, /Заявка сохранена/u);
      assert.doesNotMatch(body.message, /менеджер|передана/u);
      assert.equal(state.leads.length, 1);
      assert.equal(telegramCalls, 0);
      assert.deepEqual(state.events, [
        "begin",
        "lead_inserted",
        "commit",
        "lead_committed"
      ]);
      assert.deepEqual(logs, [[
        "Lead Telegram notification failed",
        { category: "missing_configuration" }
      ]]);
    });
  }
});

test("Telegram HTTP and API-level failures do not change the committed lead response", async (t) => {
  for (const scenario of [
    {
      name: "HTTP error",
      fetch: async () => new Response("private Telegram response", { status: 503 }),
      expectedLog: { category: "http_error" }
    },
    {
      name: "Telegram API rejection",
      fetch: async () =>
        new Response(JSON.stringify({ ok: false, description: "private rejection details" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }),
      expectedLog: { category: "rejected" }
    }
  ]) {
    await t.test(scenario.name, async () => {
      const app = loadFunction([]);
      process.env.TELEGRAM_BOT_TOKEN = "test_bot_token";
      process.env.TELEGRAM_CHAT_ID = "-1001234567890";
      let telegramCalls = 0;
      global.fetch = async () => {
        telegramCalls++;
        state.events.push("telegram_requested");
        return scenario.fetch();
      };

      const response = await app.fetch(
        new Request(
          "https://function.test/?action=lead&session_id=eaeaeaea-eaea-4aea-8aea-eaeaeaeaeaea",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Synthetic Visitor",
              contact: "synthetic-contact@example.test",
              question: "Synthetic test question"
            })
          }
        )
      );
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.ok, true);
      assert.match(body.message, /Заявка сохранена/u);
      assert.equal(state.leads.length, 1);
      assert.equal(telegramCalls, 1);
      assert.ok(
        state.events.indexOf("lead_committed") < state.events.indexOf("telegram_requested")
      );
      assert.deepEqual(logs, [[
        "Lead Telegram notification failed",
        scenario.expectedLog
      ]]);
      assert.doesNotMatch(JSON.stringify(logs), /Synthetic Visitor|synthetic-contact|private/u);
    });
  }
});

test("a failed PostgreSQL COMMIT never sends a Telegram notification", async () => {
  const app = loadFunction([]);
  const sessionId = "efefefef-efef-4fef-8fef-efefefefefef";
  state.failLeadCommit = true;
  process.env.TELEGRAM_BOT_TOKEN = "test_bot_token";
  process.env.TELEGRAM_CHAT_ID = "-1001234567890";
  let telegramCalls = 0;
  global.fetch = async () => {
    telegramCalls++;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const response = await app.fetch(
    new Request(`https://function.test/?action=lead&session_id=${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Synthetic Visitor",
        contact: "synthetic-contact@example.test",
        question: "Synthetic test question"
      })
    })
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.ok, false);
  assert.equal(state.leads.length, 0);
  assert.equal(telegramCalls, 0);
  assert.deepEqual(state.events, [
    "begin",
    "lead_inserted",
    "commit",
    "rollback"
  ]);
  assert.doesNotMatch(JSON.stringify(logs), /Synthetic Visitor|synthetic-contact|Synthetic test question/u);
});

test("the public client contains no Telegram token, chat ID or bot API endpoint", () => {
  const htmlPath = path.resolve(__dirname, "..", "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");

  assert.doesNotMatch(html, /TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID|api\.telegram\.org/u);
});

test("lead submission validates fields and supports the browser CORS preflight", async () => {
  const app = loadFunction([]);
  const sessionId = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd";
  const invalid = await app.fetch(
    new Request(`https://function.test/?action=lead&session_id=${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: " ", contact: "", question: "" })
    })
  );
  assert.equal(invalid.status, 400);
  assert.equal(state.leads.length, 0);

  const preflight = await app.fetch(
    new Request("https://function.test/?action=lead", {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.test",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type"
      }
    })
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
  assert.equal(preflight.headers.get("access-control-allow-headers"), "Content-Type");
});

test("lead database errors return a safe failure and do not claim success", async () => {
  const app = loadFunction([]);
  const sessionId = "dededede-dede-4ede-8ede-dededededede";
  state.failLeadSave = true;
  const response = await app.fetch(
    new Request(`https://function.test/?action=lead&session_id=${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Иван",
        contact: "ivan@example.test",
        question: "Нужна консультация."
      })
    })
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.ok, false);
  assert.equal(body.error, "Lead could not be saved");
  assert.equal(body.message, undefined);
  assert.equal(state.leads.length, 0);
});

test("retry after a failed assistant save does not duplicate the user message", async () => {
  const app = loadFunction([warrantyRecord]);
  const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  state.failAssistantSave = true;

  const first = await ask(app, "Какая гарантия?", sessionId);
  assert.equal(first.status, 500);
  assert.equal(state.messages.filter((message) => message.role === "user").length, 1);

  const retry = await ask(app, "Какая гарантия?", sessionId, true);
  assert.equal(retry.status, 200);
  assert.equal(state.messages.filter((message) => message.role === "user").length, 1);
  assert.equal(state.messages.at(-1).role, "assistant");
});

test("admin panel is same-origin, no-store, and protected by a strict CSP", async () => {
  const app = loadFunction([]);
  const response = await app.fetch(request({ action: "admin" }));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/u);
  assert.match(response.headers.get("content-security-policy"), /nonce-/u);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(html, /type="password"/u);
  assert.doesNotMatch(html, /TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID|api\.telegram\.org/u);
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/u)?.[1];
  assert.ok(script, "admin page must contain its nonce-protected script");
  assert.doesNotThrow(() => new vm.Script(script));
  assert.match(adminPage, /params\.set\('action'/u);
  assert.match(adminPage, /new URLSearchParams\(action\.slice\(separator \+ 1\)\)/u);
  assert.doesNotMatch(adminPage, /encodeURIComponent\(action\)/u);
});

test("admin login rejects invalid credentials and issues an HttpOnly Secure session", async () => {
  const app = loadFunction([]);
  const rejected = await app.fetch(adminRequest("admin-login", {
    method: "POST",
    ip: "198.51.100.42",
    body: { password: "incorrect" }
  }));
  assert.equal(rejected.status, 401);
  assert.equal(rejected.headers.get("set-cookie"), null);

  const { response, body, cookie } = await loginAdmin(app);
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/u);
  assert.match(response.headers.get("set-cookie"), /Secure/u);
  assert.match(response.headers.get("set-cookie"), /SameSite=Strict/u);
  assert.ok(cookie.startsWith("severmodul_admin_session="));
  assert.match(body.csrf, /^[A-Za-z0-9_-]{43}$/u);
});

test("admin API denies unauthenticated reads and writes", async () => {
  const app = loadFunction([]);
  const read = await app.fetch(request({ action: "admin-leads" }));
  const write = await app.fetch(adminRequest("admin-lead-status", {
    method: "PATCH",
    body: { id: "11111111-1111-4111-8111-111111111111", status: "completed" }
  }));
  assert.equal(read.status, 401);
  assert.equal(write.status, 401);
  assert.equal(state.adminLeads.length, 0);
});

test("admin endpoints reject cross-origin requests and missing CSRF tokens", async () => {
  const app = loadFunction([]);
  const { cookie, body } = await loginAdmin(app);
  const crossOrigin = await app.fetch(new Request("https://function.test/?action=admin-lead-status", {
    method: "PATCH",
    headers: {
      Origin: "https://attacker.example",
      Cookie: cookie,
      "X-CSRF-Token": body.csrf,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", status: "completed" })
  }));
  const noCsrf = await app.fetch(adminRequest("admin-lead-status", {
    method: "PATCH",
    cookie,
    body: { id: "11111111-1111-4111-8111-111111111111", status: "completed" }
  }));
  assert.equal(crossOrigin.status, 403);
  assert.equal(noCsrf.status, 403);
});

test("admin leads can be listed and their statuses changed only with CSRF", async () => {
  const app = loadFunction([]);
  const lead = {
    id: "11111111-1111-4111-8111-111111111111",
    conversation_id: "22222222-2222-4222-8222-222222222222",
    name: "Synthetic Visitor",
    contact: "synthetic@example.test",
    question: "Synthetic admin test",
    status: "new",
    created_at: "2026-11-05T10:00:00.000Z"
  };
  state.adminLeads = [lead];
  state.adminLeadUpdate = { id: lead.id, status: "completed", updated_at: lead.created_at };
  const appLogin = await loginAdmin(app);
  const list = await app.fetch(adminRequest("admin-leads&q=Synthetic", {
    cookie: appLogin.cookie
  }));
  assert.equal(list.status, 200);
  assert.equal((await list.json()).leads[0].id, lead.id);

  const update = await app.fetch(adminRequest("admin-lead-status", {
    method: "PATCH",
    cookie: appLogin.cookie,
    csrf: appLogin.body.csrf,
    body: { id: lead.id, status: "completed" }
  }));
  assert.equal(update.status, 200);
  assert.equal((await update.json()).lead.status, "completed");
});

test("admin can view a conversation and its linked lead", async () => {
  const app = loadFunction([]);
  state.adminConversation = {
    id: "22222222-2222-4222-8222-222222222222",
    status: "open",
    created_at: "2026-11-05T10:00:00.000Z"
  };
  state.adminMessages = [{ role: "user", content: "Synthetic chat", created_at: "2026-11-05T10:01:00.000Z" }];
  state.adminConversationLead = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Synthetic Visitor",
    contact: "synthetic@example.test",
    question: "Synthetic request",
    status: "new"
  };
  const login = await loginAdmin(app);
  const response = await app.fetch(adminRequest(
    `admin-conversation&id=${state.adminConversation.id}`,
    { cookie: login.cookie }
  ));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.messages.length, 1);
  assert.equal(body.lead.id, state.adminConversationLead.id);
});

test("admin can create and edit knowledge records without delete support", async () => {
  const app = loadFunction([]);
  const login = await loginAdmin(app);
  const created = await app.fetch(adminRequest("admin-knowledge-create", {
    method: "POST",
    cookie: login.cookie,
    csrf: login.body.csrf,
    body: {
      title: "Synthetic test record",
      category: "test",
      content: "Synthetic content only.",
      source: "admin-test",
      is_active: false
    }
  }));
  assert.equal(created.status, 201);
  const record = (await created.json()).record;
  assert.equal(record.is_active, false);

  const updated = await app.fetch(adminRequest("admin-knowledge-update", {
    method: "PATCH",
    cookie: login.cookie,
    csrf: login.body.csrf,
    body: { id: record.id, is_active: true, title: "Updated synthetic test record" }
  }));
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).record.version, 2);
});

test("admin integration checks report statuses without sending Telegram messages", async () => {
  const app = loadFunction([]);
  process.env.TELEGRAM_BOT_TOKEN = "test_bot_token";
  process.env.TELEGRAM_CHAT_ID = "-1001234567890";
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes("api.telegram.org")) {
      return new Response(JSON.stringify({ ok: true, result: { username: "test_bot" } }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: [{ id: "test-model" }] }), { status: 200 });
  };
  const login = await loginAdmin(app);
  const response = await app.fetch(adminRequest("admin-health", { cookie: login.cookie }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.services, { neon: "ok", groq: "ok", telegram: "ok" });
  assert.equal(urls.some((url) => url.endsWith("/getMe")), true);
  assert.equal(urls.some((url) => url.includes("/sendMessage")), false);
  assert.doesNotMatch(JSON.stringify(body), /test_bot_token|-1001234567890/u);
});

test("admin login is rate limited and fails closed without server configuration", async () => {
  const app = loadFunction([]);
  for (let attempt = 0; attempt < 5; attempt++) {
    await app.fetch(adminRequest("admin-login", {
      method: "POST",
      ip: "198.51.100.99",
      body: { password: "wrong" }
    }));
  }
  const limited = await app.fetch(adminRequest("admin-login", {
    method: "POST",
    ip: "198.51.100.99",
    body: { password: "wrong" }
  }));
  assert.equal(limited.status, 429);

  process.env.ADMIN_PASSWORD = "too-short";
  const weakPasswordConfiguration = await app.fetch(adminRequest("admin-login", {
    method: "POST",
    ip: "198.51.100.101",
    body: { password: "too-short" }
  }));
  assert.equal(weakPasswordConfiguration.status, 503);

  delete process.env.ADMIN_PASSWORD;
  const unconfigured = await app.fetch(adminRequest("admin-login", {
    method: "POST",
    ip: "198.51.100.100",
    body: { password: "test-admin-password-at-least-16" }
  }));
  assert.equal(unconfigured.status, 503);
});
