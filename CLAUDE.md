# TalentGEO — Project Context for Claude Code

## Project Overview
TalentGEO is an AI-powered GEO audit tool for employer brand and job posting visibility.
Built by Cassillon AI. Stack: Node.js/Express backend on GCP Cloud Run, static
HTML/CSS/JS frontend, Firebase Hosting, Anthropic Claude API as the audit engine.
Database: Cloud SQL (Postgres 15) on GCP, connected via Cloud SQL Auth Proxy.

## Build & Run Commands
# Backend (local dev)
cd backend && npm install
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY DATABASE_URL=postgresql://talentgeo_app:PASSWORD@localhost:5432/talentgeo node server.js
# Backend runs on http://localhost:8080

# Frontend (local dev)
cd frontend && npx serve .
# Set BACKEND_URL in index.html to http://localhost:8080 for local testing

# Deploy backend to Cloud Run (run from D:\Claude Work\TalentGEO\backend)
gcloud run deploy talentgeo-backend --source . --region us-central1 --project basic-advantage-483301-b4 --add-cloudsql-instances basic-advantage-483301-b4:us-central1:talentgeo-db --set-secrets="ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,DB_PASSWORD=talentgeo-db-password:latest" --set-env-vars="CLOUD_SQL_CONNECTION_NAME=basic-advantage-483301-b4:us-central1:talentgeo-db,DB_USER=talentgeo_app,DB_NAME=talentgeo" --allow-unauthenticated --memory 512Mi --timeout 120

## Architecture
frontend/index.html   — Single-page app. POST /audit to backend.
backend/server.js     — Express server. Main audit engine. Claude API calls here.
backend/db.js         — Postgres connection pool. Import with require('./db').
backend/schema.sql    — Full database schema. Source of truth for table structure.
backend/Dockerfile    — Node.js container for Cloud Run. Add new .js files here with COPY.
Secret Manager        — ANTHROPIC_API_KEY, talentgeo-db-password, talentgeo-db-url stored here.

## Database
Cloud SQL instance:   talentgeo-db (Postgres 15, us-central1, db-f1-micro)
Database name:        talentgeo
App user:             talentgeo_app
Connection:           Cloud SQL Auth Proxy via Unix socket (Cloud Run) or DATABASE_URL (local)
Health check:         GET /health — returns db connected status and timestamp
Schema:               backend/schema.sql — 13 tables, 1 view, 1 trigger

IMPORTANT: When adding new .js files to the backend, add a COPY line to the Dockerfile
or the file will not be included in the container and the deploy will fail.

## Key Files
backend/server.js     — The audit engine. All five dimension checks live here.
backend/db.js         — Database connection pool. Use db.query() for all DB calls.
backend/schema.sql    — Postgres schema. Run this to recreate the database from scratch.
frontend/index.html   — Single file frontend. All JS inline.
BACKEND_URL           — Constant near bottom of index.html. Update for prod vs local.

## Current Model
claude-sonnet-4-6 — Do not change without Jonathon confirming cost impact.

## Five Audit Dimensions (UTP V2 spec — see UTP_V2_Architecture_Specification.md)
D1 — Schema Integrity: JobPosting JSON-LD schema checks
D2 — Content Readiness: JD sub-protocol + career site audit
D3 — Brand Signal Assessment: TSOV methodology (Reddit-only in current code — needs upgrade)
D4 — Continuity Indicator: Theme alignment between owned and earned content
D5 — Distribution + Agentic Readiness: Channel coverage + spam/fraud defense linkage

## Scoring
Composite 0-100 score. Grades: Excellent / Good / Average / Needs Improvement.
Weights are tier-aware (T1-T4) and stored in tier_weights table — NOT flat.
Current code still uses flat weights: D1 25%, D2 20%, D3 20%, D4 20%, D5 15%.
Tier-aware weighting is a V2 implementation gap — see UTP_V2_Architecture_Specification.md.

## Conventions
- Never break the audit engine without a fallback — Jonathon demos this to clients.
- All Claude prompts use claude-sonnet-4-6 with max_tokens: 4000.
- Admin routes prefixed /admin — protect with middleware before exposing.
- Environment: GCP Project ID = basic-advantage-483301-b4
- Cloud Build service account: 360027703478-compute@developer.gserviceaccount.com
- Container images: gcr.io/basic-advantage-483301-b4/talentgeo-backend and talentgeo-frontend

## What NOT to Touch
- The five-dimension audit prompt structure — changes need Jonathon review.
- Secret Manager config — API key rotation goes through Jonathon.
- Billing-related Cloud Run settings without confirming cost impact.
- Cloud SQL instance settings — db-f1-micro is intentional for MVP cost control.
