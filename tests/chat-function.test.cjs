const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(projectRoot, "src", "index.ts");
const seedPath = path.join(projectRoot, "002_seed_knowledge_base.sql");
const htmlPath = path.join(projectRoot, "index.html");

function readSeedRecords() {
  const sql = fs.readFileSync(seedPath, "utf8");
  const valuesStart = sql.indexOf("VALUES");
  assert.notEqual(valuesStart, -1, "seed INSERT must contain VALUES");

  const records = [];
  let index = valuesStart + "VALUES".length;

  while (index < sql.length) {
    while (/\s|,/.test(sql[index] || "")) index++;
    if (sql[index] !== "(") break;
    index++;

    const fields = [];
    while (index < sql.length) {
      while (/\s/.test(sql[index] || "")) index++;

      if (sql[index] === "'") {
        index++;
        let value = "";
        while (index < sql.length) {
          if (sql[index] === "'" && sql[index + 1] === "'") {
            value += "'";
            index += 2;
            continue;
          }
          if (sql[index] === "'") {
            index++;
            break;
          }
          value += sql[index++];
        }
        fields.push(value);
      } else {
        let value = "";
        while (index < sql.length && sql[index] !== "," && sql[index] !== ")") {
          value += sql[index++];
        }
        value = value.trim();
        fields.push(
          value === "TRUE"
            ? true
            : value === "FALSE"
              ? false
              : /^\d+$/u.test(value)
                ? Number(value)
                : value
        );
      }

      while (/\s/.test(sql[index] || "")) index++;
      if (sql[index] === ",") {
        index++;
        continue;
      }
      if (sql[index] === ")") {
        index++;
        break;
      }
      throw new Error("Unexpected SQL seed tuple syntax");
    }

    assert.equal(fields.length, 6, "seed rows must match their six columns");
    records.push({
      id: String(records.length + 1),
      title: fields[0],
      category: fields[1],
      content: fields[2],
      is_active: fields[5]
    });
  }

  return records.filter((record) => record.is_active);
}

const seedRecords = readSeedRecords();
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalGroqApiKey = process.env.GROQ_API_KEY;
const originalFetch = global.fetch;
const originalConsoleError = console.error;
let queryRows;
let queryError;
let logs;

function loadFunction({ databaseConfigured = true } = {}) {
  process.env.DATABASE_URL = databaseConfigured ? "postgresql://test.invalid/db" : "";

  let source = fs.readFileSync(sourcePath, "utf8");
  source = source.replace(
    'import { Pool } from "pg";',
    "class Pool { async query(text, values) { if (global.__chatTestQueryHandler) return global.__chatTestQueryHandler(text, values); if (global.__chatTestQueryError) throw global.__chatTestQueryError; return { rows: global.__chatTestQueryRows }; } }"
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

  const loaded = new Module(sourcePath, module);
  loaded.filename = sourcePath;
  loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  loaded._compile(source, sourcePath);
  return loaded.exports;
}

function request(query, method = "GET", sessionId) {
  const url = new URL("https://function.test/");
  if (query !== undefined) url.searchParams.set("q", query);
  if (sessionId !== undefined) url.searchParams.set("session_id", sessionId);
  return new Request(url, { method });
}

async function call(functionModule, query, method, sessionId) {
  return functionModule.fetch(request(query, method, sessionId));
}

test.beforeEach(() => {
  queryRows = seedRecords;
  queryError = null;
  logs = [];
  global.__chatTestQueryRows = queryRows;
  global.__chatTestQueryError = queryError;
  delete global.__chatTestQueryHandler;
  delete process.env.GROQ_API_KEY;
  global.fetch = async () => {
    throw new Error("External network must remain disabled in these tests");
  };
  console.error = (...args) => logs.push(args);
});

test.after(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalGroqApiKey === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = originalGroqApiKey;
  global.fetch = originalFetch;
  console.error = originalConsoleError;
  delete global.__chatTestQueryRows;
  delete global.__chatTestQueryError;
  delete global.__chatTestQueryHandler;
});

const pinnedQuestions = [
  ["Сколько стоит дом?", ["houses"]],
  ["Какие сроки строительства?", ["сроки", "installation"]],
  ["Какой фундамент нужен?", ["foundation"]],
  ["Какое утепление используется?", ["insulation"]],
  ["Какая гарантия?", ["warranty"]],
  ["Как происходит доставка?", ["delivery"]]
];

for (const [question, categories] of pinnedQuestions) {
  test(`pinned question returns a relevant seed record: ${categories[0]}`, async () => {
    const app = loadFunction();
    const response = await call(app, question);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.ok(body.results.length > 0);
    assert.ok(body.results.some((record) => categories.includes(record.category)));
    assert.equal(body.answer_source, "knowledge_base");
    assert.equal(
      body.answer,
      `${body.results[0].title}\n\n${body.results[0].content}`
    );
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.match(response.headers.get("content-type"), /application\/json/u);
  });
}

test("an unknown question does not select an arbitrary record or call Groq", async () => {
  const app = loadFunction();
  let groqCalls = 0;
  global.fetch = async () => {
    groqCalls++;
    throw new Error("Unexpected Groq call");
  };

  const response = await call(app, "квантовый телепорт");
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.results, []);
  assert.equal(body.answer_source, undefined);
  assert.match(body.answer, /не нашёл точной информации/iu);
  assert.equal(groqCalls, 0);
});

test("a square-metre unit is recognized without misclassifying ordinary words", async () => {
  const app = loadFunction();
  const response = await call(app, "Дом площадью 45 м²");
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.ok(body.results.some((record) => record.category === "houses"));
});

test("Groq HTTP failures and timeouts return a relevant knowledge-base answer", async (t) => {
  for (const failure of [
    {
      name: "HTTP failure",
      fetch: async () => new Response("unavailable", { status: 503 }),
      expectedCategory: "http_error"
    },
    {
      name: "timeout",
      fetch: async () => {
        const error = new Error("private timeout details");
        error.name = "TimeoutError";
        throw error;
      },
      expectedCategory: "transport_or_parse_error"
    }
  ]) {
    await t.test(failure.name, async () => {
      process.env.GROQ_API_KEY = "test-only";
      global.fetch = failure.fetch;

      const response = await call(loadFunction(), "Какая гарантия?");
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.answer_source, "knowledge_base");
      assert.ok(body.results.some((record) => record.category === "warranty"));
      assert.ok(body.answer.includes(body.results[0].content));
      assert.ok(
        logs.some(
          ([message, fields]) =>
            message === "Groq answer generation failed" &&
            fields.category === failure.expectedCategory
        )
      );
      assert.doesNotMatch(JSON.stringify(logs), /private timeout details|Какая гарантия/iu);
    });
  }
});

test("malformed or invalid Groq JSON falls back to relevant records", async (t) => {
  for (const [name, fetchStub] of [
    ["malformed JSON", async () => new Response("{invalid", { status: 200 })],
    [
      "invalid response shape",
      async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
    ]
  ]) {
    await t.test(name, async () => {
      process.env.GROQ_API_KEY = "test-only";
      global.fetch = fetchStub;

      const response = await call(loadFunction(), "Какой фундамент нужен?");
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.answer_source, "knowledge_base");
      assert.ok(body.results.some((record) => record.category === "foundation"));
    });
  }
});

test("database failures remain HTTP 500 and never return a fabricated answer", async () => {
  const error = new Error("private database error details");
  error.code = "08006";
  queryError = error;
  global.__chatTestQueryError = queryError;

  const response = await call(loadFunction(), "Какая гарантия?");
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.ok, false);
  assert.equal(body.error, "Database query failed");
  assert.equal(body.answer, undefined);
  assert.deepEqual(logs, [["Knowledge-base query failed", { code: "08006" }]]);
});

test("missing DATABASE_URL returns a safe HTTP 500 without querying Groq", async () => {
  const app = loadFunction({ databaseConfigured: false });
  let groqCalls = 0;
  global.fetch = async () => {
    groqCalls++;
    throw new Error("Unexpected Groq call");
  };

  const response = await call(app, "Какая гарантия?");
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error, "Database connection is not configured");
  assert.deepEqual(logs, [["Database connection is not configured"]]);
  assert.equal(groqCalls, 0);
});

test("empty, unsearchable, and unsupported method requests return JSON errors", async () => {
  const app = loadFunction();

  for (const [query, expectedStatus] of [
    [undefined, 400],
    ["   ", 400],
    ["!!!", 400]
  ]) {
    const response = await call(app, query);
    assert.equal(response.status, expectedStatus);
    assert.equal((await response.json()).ok, false);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
  }

  const methodResponse = await call(app, "Какая гарантия?", "POST");
  assert.equal(methodResponse.status, 405);
  assert.equal((await methodResponse.json()).ok, false);
  assert.equal(methodResponse.headers.get("access-control-allow-origin"), "*");
});

test("a session is rate-limited before it can trigger unbounded work", async () => {
  const app = loadFunction();
  const sessionId = "33333333-3333-4333-8333-333333333333";

  for (let index = 0; index < 20; index++) {
    const response = await call(app, "Какая гарантия?", "GET", sessionId);
    assert.equal(response.status, 200);
  }

  const blocked = await call(app, "Какая гарантия?", "GET", sessionId);
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).error, "Too many requests");
});

test("successful Groq responses preserve the browser JSON contract", async () => {
  process.env.GROQ_API_KEY = "test-only";
  global.fetch = async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: "Mocked answer" } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  const response = await call(loadFunction(), "Какая гарантия?");
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.results));
  assert.equal(typeof body.answer, "string");
  assert.equal(body.answer, "Mocked answer");
  assert.equal(body.answer_source, "groq");
});

test("conversation history reaches Groq and remains isolated by session", async () => {
  const conversations = new Map();
  const messages = new Map();
  const groqRequests = [];

  global.__chatTestQueryHandler = (sql, values = []) => {
    const normalizedSql = sql.replace(/\s+/g, " ");
    if (normalizedSql.includes("INSERT INTO users")) return { rows: [{ id: values[0] }] };
    if (normalizedSql.includes("SELECT id FROM conversations")) {
      const id = conversations.get(values[0]);
      return { rows: id ? [{ id }] : [] };
    }
    if (normalizedSql.includes("INSERT INTO conversations")) {
      const id = `conversation-${values[0]}`;
      conversations.set(values[0], id);
      messages.set(id, []);
      return { rows: [{ id }] };
    }
    if (normalizedSql.includes("SELECT role, content FROM messages")) {
      return { rows: [...(messages.get(values[0]) ?? [])].slice(-10).reverse() };
    }
    if (normalizedSql.includes("INSERT INTO messages")) {
      messages.get(values[0]).push({
        role: normalizedSql.includes("'assistant'") ? "assistant" : "user",
        content: values[1]
      });
      return { rows: [] };
    }
    if (normalizedSql.includes("UPDATE conversations")) return { rows: [] };
    if (normalizedSql.includes("FROM knowledge_base")) return { rows: seedRecords };
    throw new Error(`Unexpected test query: ${sql}`);
  };

  process.env.GROQ_API_KEY = "test-only";
  global.fetch = async (_url, options) => {
    groqRequests.push(JSON.parse(options.body));
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "Mocked contextual answer" } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const app = loadFunction();
  const firstSession = "11111111-1111-4111-8111-111111111111";
  const secondSession = "22222222-2222-4222-8222-222222222222";

  await call(app, "Ищу дом для семьи из четырёх человек", "GET", firstSession);
  await call(app, "Какая модель мне подойдёт?", "GET", firstSession);
  await call(app, "Какая модель мне подойдёт?", "GET", secondSession);

  assert.equal(groqRequests.length, 3);
  const continuedHistory = groqRequests[1].messages;
  assert.ok(
    continuedHistory.some(
      (message) =>
        message.role === "user" && message.content === "Ищу дом для семьи из четырёх человек"
    ),
    JSON.stringify(continuedHistory)
  );
  assert.ok(
    continuedHistory.some(
      (message) => message.role === "assistant" && message.content === "Mocked contextual answer"
    )
  );
  const independentHistory = groqRequests[2].messages;
  assert.equal(
    independentHistory.some((message) => message.content === "Ищу дом для семьи из четырёх человек"),
    false
  );
});

test("the browser uses GET q and validates the server response fields", () => {
  const html = fs.readFileSync(htmlPath, "utf8");

  assert.match(
    html,
    /new URLSearchParams\(\{\s*q:\s*text,\s*session_id:\s*sessionId\s*\}\)/u
  );
  assert.match(
    html,
    /new URLSearchParams\(\{\s*action:\s*'history',\s*session_id:\s*getSessionId\(\)\s*\}\)/u
  );
  assert.match(html, /severmodul_session_id/u);
  assert.match(html, /crypto\.randomUUID\(\)/u);
  assert.match(
    html,
    /br-hidden-mud-b20xmgw7-severmodul\.compute\.c-6\.eu-central-1\.aws\.neon\.tech/u
  );
  assert.doesNotMatch(html, /br-lingering-bird-b2kw6c2d/u);
  assert.match(html, /method:\s*'POST'/u);
  assert.match(html, /action:\s*'lead'/u);
  assert.match(html, /body:\s*JSON\.stringify\(\{[\s\S]*?name:[\s\S]*?contact:[\s\S]*?question:/u);
  assert.match(html, /Заявка сохранена\. Спасибо!/u);
  assert.match(html, /response\.ok/u);
  assert.match(html, /data\.ok !== true/u);
  assert.match(html, /!Array\.isArray\(data\.results\)/u);
  assert.match(html, /typeof data\.answer !== 'string'/u);
  assert.match(html, /quickQuestions\.addEventListener\('click'[\s\S]*?sendMessage\(\)/u);
  assert.match(html, /sendBtn\.addEventListener\('click', sendMessage\)/u);
  assert.match(html, /input\.addEventListener\('keydown'[\s\S]*?sendMessage\(\)/u);

  for (const [question] of pinnedQuestions) {
    assert.ok(html.includes(`>${question}</button>`), `missing pinned question: ${question}`);
  }
});

test("inline browser scripts compile and prevent duplicate in-flight sends", () => {
  const html = fs.readFileSync(htmlPath, "utf8");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/giu)];

  assert.ok(scripts.length > 0);
  for (const [, script] of scripts) {
    assert.doesNotThrow(() => new Function(script));
  }
  assert.match(html, /let isSending = false;/u);
  assert.match(html, /if \(!text \|\| isSending\) return;/u);
  assert.match(html, /finally \{[\s\S]*?isSending = false;/u);
});

test.after(() => {
  delete global.__chatTestQueryRows;
  delete global.__chatTestQueryError;
});
