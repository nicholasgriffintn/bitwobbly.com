# App Worker (UI + API via Workers Assets)

This worker:
- serves `./dist` as static assets using **Workers Static Assets**
- exposes `/api/*` endpoints (worker-first routing)
- provides public status JSON under `/api/public/*`

## Local dev
```bash
pnpm dev
```

## Migrations
Local:
```bash
pnpm db:migrate:local
```

Remote:
```bash
pnpm db:migrate:remote
```
