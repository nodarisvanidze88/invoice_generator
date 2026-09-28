# Invoice Studio

Web version of `Invoice Generator SHJ033.xlsm`: product catalogue → selection → commercial invoice PDF + packing list PDF.

| Layer    | Stack                                                              |
|----------|--------------------------------------------------------------------|
| Backend  | FastAPI · SQLModel · SQLite · ReportLab (BIZ UDGothic font, OFL)   |
| Frontend | React 18 · Vite · TypeScript · Tailwind v4 · TanStack Query · Zustand |
| Deploy   | Single Docker image (FastAPI serves the built SPA)                 |

## Features

- Products: add / edit / delete / bulk delete, search & filters, Excel export
- Selection with quantities → **Create invoice** (auto-numbered `SHJ034`, `SHJ035`, …)
- Invoice editor: lines grouped by `Category [Tariff]` with subtotals, header/addressee details, live PDF preview
- Packing: boxes with L×W×H + gross weight, per-box contents, unpacked/over-packed tracking
- Invoice footer computed from boxes: number of pieces, gross weight, countries of origin
- Invoice history: reopen, edit, re-download, duplicate, delete
- Supplier CSV import (Japanese or English headers, UTF-8 / Shift-JIS), matched by JAN (also inside `A / B` multi-codes)
- Customers and company settings

On first start the database is seeded from `backend/app/seed/seed.json` (2 013 products, sender, customer, and invoice SHJ033 with 47 boxes). Regenerate it with `python scripts/extract_seed.py`.

## Local development

```powershell
# backend (http://127.0.0.1:8000)
cd backend
python -m venv .venv; .venv\Scripts\pip install -r requirements-dev.txt
.venv\Scripts\python -m uvicorn app.main:app --reload

# frontend (http://localhost:5173, proxies /api to :8000)
cd frontend
npm install
npm run dev

# tests
cd backend; .venv\Scripts\python -m pytest
```

Default demo password: `demo2026`.

## Configuration

| Variable              | Default                  | Notes                                   |
|-----------------------|--------------------------|-----------------------------------------|
| `APP_DEMO_PASSWORD`   | `demo2026`               | Shared password for testers             |
| `APP_SECRET_KEY`      | dev value                | **Set a long random value in production** |
| `APP_DATA_DIR`        | `backend/data` (`/data` in Docker) | SQLite location — mount a volume here |
| `APP_COOKIE_SECURE`   | `false` (`true` in Docker) | HTTPS-only session cookie             |
| `APP_SEED_ON_STARTUP` | `true`                   | Seeds only when the database is empty   |

## Deploy to Railway

1. Push this folder to a GitHub repository (the `.xlsm` and PDFs are git-ignored).
2. Railway → **New Project → Deploy from GitHub repo** — the `Dockerfile` is detected via `railway.json`.
3. Service → **Variables**: `APP_DEMO_PASSWORD`, `APP_SECRET_KEY` (e.g. `python -c "import secrets; print(secrets.token_urlsafe(32))"`).
4. Service → **Volumes → New volume**, mount path `/data` (keeps SQLite across redeploys).
5. Service → **Settings → Networking → Generate domain**. Share the URL + password with testers.

To reset the demo data: delete the volume contents (or the volume) and redeploy.
