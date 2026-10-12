# SeverModul

SeverModul is a Russian-language demo website for a modular-home company. It includes a static chat interface and a Neon Function that searches a PostgreSQL knowledge base and can generate an answer with Groq.

## Project structure

- `index.html` — static website and browser-side chat interface.
- `src/index.ts` — Neon Function request handler, knowledge-base search, and answer generation.
- `001_initial_schema.sql` — PostgreSQL schema, indexes, and timestamp triggers.
- `002_seed_knowledge_base.sql` — example knowledge-base records.
- `server/db.js` — local PostgreSQL connection helper.
- `server/check-db.js` — local database connectivity check.
- `db-check.ts` — database inspection helper.
- `favicon.svg` — site icon.
- `package.json` and `package-lock.json` — Node.js dependencies and scripts.

## Technologies

- HTML, CSS, and browser JavaScript for the static site.
- TypeScript and the Neon Functions runtime for the chat function.
- PostgreSQL, accessed through the `pg` Node.js package.
- Groq API for generated answers based on matching knowledge-base records.
- Netlify for manual publication of the static website.

## Environment configuration

The chat function uses `DATABASE_URL` and `GROQ_API_KEY` from its server-side environment. Do not put their values in browser code, commit them, or include them in issue reports.

For local database utilities, configure `DATABASE_URL` in an ignored local `.env` file or in the process environment. `.env.example` is a placeholder template and must not contain real credentials.

## Local database check

Install the dependencies with `npm install`, configure the local database connection, then run:

```powershell
npm run check:db
```

This checks database connectivity; it does not build or deploy the Neon Function.

## Knowledge base

The function reads active records from the `knowledge_base` table. The SQL schema and example seed data are provided in the root directory. The seed content is demonstration material and should be verified before being used as real company information.

## Publication

The static website is published manually through Netlify. The Neon Function is deployed separately. Never upload `.env`, `node_modules`, local credentials, or local tooling configuration as website assets.
