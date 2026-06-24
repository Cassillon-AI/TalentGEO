# Talent GEO — MVP

AI-powered employer brand and job posting visibility audit tool, built by Cassillon AI. Talent GEO scores how well a company appears in AI-mediated candidate search across five dimensions, and delivers a prioritized action roadmap to fix what's broken.

---

## What It Does

Users enter their company domain, brand name, industry, and up to three job posting URLs. The tool fetches live data from the career site — including JSON-LD schema, robots.txt, sitemap.xml, and job posting content — then passes it through the Cassillon GEO Optimization Protocol powered by Claude. The result is a structured audit report with:

- **Section A:** GEO profile with per-platform signal status and dimension scores (D1–D5)
- **Section B:** Prioritized internal fix roadmap with effort/impact tags
- **Section C:** Cassillon service offerings mapped to the audit findings

---

## The Five Dimensions

| ID | Dimension | What It Checks |
|----|-----------|----------------|
| D1 | Schema Integrity | JSON-LD JobPosting markup, Google Rich Results validation |
| D2 | Career Site Hygiene | Crawler access, sitemap, site structure |
| D3 | Job Posting Content Structure | Content quality for AI parsing |
| D4 | Employer Brand Signal Strength | Presence across AI-indexed platforms |
| D5 | Distribution & Monitoring | Job board reach and tracking setup |

Dimension weights and grade thresholds are tier-aware (T1–T4). See [Tier Classification](#tier-classification) below.

---

## Tier Classification

Every audit assigns a company tier using PDL (People Data Labs) firmographic data:

| Tier | Label | Headcount | Revenue |
|------|-------|-----------|---------|
| T1 | Startup | < 100 | < $50M |
| T2 | Growth | 100–999 | $50M–$1B |
| T3 | Mid-Market | 1,000–4,999 | $1B–$2B |
| T4 | Enterprise | 5,000+ | $2B+ |

**Assignment paths:**
- **System-assigned** — PDL is source of truth (headcount primary, revenue secondary)
- **Employer-declared** — user checks "Is this your company?" and selects a tier; PDL still runs for validation. Discrepancies are flagged and stored.

**Grade thresholds by tier:**

| Tier | Good | Excellent |
|------|------|-----------|
| T1 | 50+ | 65+ |
| T2 | 65+ | 80+ |
| T3 | 70+ | 85+ |
| T4 | 75+ | 90+ |

---

## Repo Structure

```
TalentGEO/
├── frontend/
│   └── index.html          # Single-page app (HTML/CSS/JS)
├── backend/
│   ├── server.js           # Express server + audit engine
│   ├── auditRepository.js  # Database persistence layer
│   ├── tierClassifier.js   # PDL-based tier assignment
│   ├── db.js               # Postgres connection pool
│   ├── schema.sql          # Full database schema (source of truth)
│   ├── package.json
│   └── Dockerfile          # Node.js container for Cloud Run
└── README.md
```

---

## Architecture

```
User Browser
    │
    ▼
Cloud Run (frontend)  ←─ frontend/index.html (static, served via nginx)
    │
    │  POST /audit
    ▼
Cloud Run (backend)  ←─ Secrets via Secret Manager
    │
    ├── Fetches live data: schema, robots.txt, sitemap, job pages
    ├── Calls PDL Company Enrich API (tier classification)
    │
    ▼
Anthropic API (Claude Sonnet)
    │
    ▼
Structured JSON report  ──▶  rendered in browser
    │
    ▼
Cloud SQL (Postgres 15)  ←─ audits, tier_classifications, companies
```

- **Frontend:** Static HTML/CSS/JS served from Cloud Run (`talentgeo-frontend`)
- **Backend:** Node.js/Express on Cloud Run (`talentgeo-backend`), scales to zero when idle
- **AI Engine:** Claude Sonnet via Anthropic API — not a chatbot, the scoring/analysis engine
- **Data Enrichment:** PDL Company Enrich API for firmographic tier classification
- **Database:** Cloud SQL (Postgres 15, `talentgeo-db`, `us-central1`)
- **Secrets:** API keys and DB password stored in GCP Secret Manager, injected at runtime

---

## Local Development

### Prerequisites

- Node.js 18+
- An Anthropic API key
- A PDL API key
- A Postgres database (local or Cloud SQL via proxy)

### Run the backend

```bash
cd backend
npm install
ANTHROPIC_API_KEY=sk-ant-your-key-here \
PDL_API_KEY=your-pdl-key-here \
DATABASE_URL=postgresql://talentgeo_app:PASSWORD@localhost:5432/talentgeo \
node server.js
```

The backend runs on `http://localhost:8080` by default.

### Run the frontend

Open `frontend/index.html` directly in a browser, or serve it with any static file server:

```bash
npx serve frontend
```

Make sure the `BACKEND_URL` constant near the bottom of `index.html` points to your local backend (`http://localhost:8080`) for local testing.

---

## Deployment (Google Cloud)

### Deploy the backend

```bash
cd backend
gcloud run deploy talentgeo-backend \
  --source . \
  --region us-central1 \
  --project basic-advantage-483301-b4 \
  --add-cloudsql-instances basic-advantage-483301-b4:us-central1:talentgeo-db \
  --set-secrets="ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,DB_PASSWORD=talentgeo-db-password:latest,PDL_API_KEY=PDL_API_KEY:latest" \
  --set-env-vars="CLOUD_SQL_CONNECTION_NAME=basic-advantage-483301-b4:us-central1:talentgeo-db,DB_USER=talentgeo_app,DB_NAME=talentgeo" \
  --allow-unauthenticated \
  --memory 512Mi \
  --timeout 120
```

### Deploy the frontend

```bash
cd frontend
gcloud run deploy talentgeo-frontend \
  --source . \
  --region us-central1 \
  --project basic-advantage-483301-b4 \
  --allow-unauthenticated
```

---

## Live URLs

| Service | URL |
|---------|-----|
| Frontend | `https://talentgeo-frontend-360027703478.us-central1.run.app` |
| Backend | `https://talentgeo-backend-360027703478.us-central1.run.app` |

---

## Environment Variables

| Variable | Where Set | Description |
|----------|-----------|-------------|
| `ANTHROPIC_API_KEY` | GCP Secret Manager | Claude API key |
| `PDL_API_KEY` | GCP Secret Manager | People Data Labs API key |
| `DB_PASSWORD` | GCP Secret Manager | Cloud SQL app user password |
| `CLOUD_SQL_CONNECTION_NAME` | Cloud Run env var | Cloud SQL instance connection string |
| `DB_USER` | Cloud Run env var | Postgres app user (`talentgeo_app`) |
| `DB_NAME` | Cloud Run env var | Postgres database name (`talentgeo`) |
| `PORT` | Cloud Run (auto) | HTTP port, defaults to 8080 |

---

## Database

Cloud SQL (Postgres 15) instance `talentgeo-db` in `us-central1`. Key tables:

| Table | Purpose |
|-------|---------|
| `companies` | One row per domain |
| `audits` | Full audit results including composite score and dimension scores |
| `tier_classifications` | Tier history per company with PDL signals and discrepancy flags |
| `tier_weights` | Dimension weight seeds by tier (T1–T4) |

Schema source of truth: `backend/schema.sql`.

---

## Status & Roadmap

This is an MVP. Core audit functionality is live. Planned next phases:

- [ ] Google Search Console API integration (D1/D2 real signals)
- [ ] PDF report export (Puppeteer on Cloud Run)
- [ ] Email delivery of report (SendGrid/Mailgun)
- [ ] User accounts and report history (Firebase Auth + Firestore)
- [ ] Tier gating / Stripe paywall
- [ ] Process Cards (auto-generated by Claude when Fix Cards are completed)
- [ ] Glassdoor / LinkedIn / Reddit signal fetching (D4)

---

## Built By

[Cassillon AI](https://cassillon.com) — Talent Acquisition Operations consulting and tooling.
