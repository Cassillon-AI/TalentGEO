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
Weights and grade thresholds are fully tier-aware (T1-T4). Weights live in TIER_WEIGHTS
in auditRepository.js; grade thresholds live in GRADE_THRESHOLDS in the same file.
Both mirror the tier_weights table seed in schema.sql.

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

---

## UTP V2 Architecture — Key Decisions (Full spec: UTP_V2_Architecture_Specification.md)

### Tier System
- T1 Startup (<100 employees / <$50M revenue), T2 Growth (100-1K / $50M-$1B), T3 Mid-Market (1K-5K / $1B-$2B), T4 Enterprise (5K+ / $2B+)
- Primary signal: headcount (PDL). Secondary: revenue. Default to T2 if neither available.
- Tier is MANDATED in UTP schema — all audits require tier classification.

### Five Dimensions (UTP V2 names differ slightly from CLAUDE.md above — V2 names are canonical)
| | Name | Core Question | Weights T1/T2/T3/T4 |
|--|--|--|--|
| D1 | Schema Integrity | Can LLMs mechanically read the content? | 15/15/15/15% |
| D2 | Content Readiness | Is content optimized for LLM understanding? | 15/20/20/25% |
| D3 | Brand Signal Assessment | What does the outside world say (TSOV)? | 10/15/20/20% |
| D4 | Continuity Indicator | Do owned/earned signals align (theme-level only)? | 20/15/15/10% |
| D5 | Distribution & Agentic Readiness | Discoverable AND defensible? | 40/35/30/30% |

D5 is heaviest across all tiers. If a company isn't found, nothing else matters.

### Catastrophic D1 Failure → Cap composite at 30
Triggers: robots.txt blocks ALL crawlers, no JobPosting schema anywhere, career site behind auth wall, JS-only with no SSR.

### D2 Sub-Protocol: JD Audit (6 sub-dimensions, scored 1-5 each, max 30)
1. Metadata Clarity  2. Structural Clarity  3. Specificity & Quantification
4. Role Clarity  5. Brand Voice & Authenticity  6. Candidate Self-Assessment
Score: 25-30 = Excellent; 13-24 = Improvement needed; <13 = Rewrite required

UTP Visible Metadata Block (required at top of every JD): Role Title, Role Level, Function, Stage, Location, Deal Size/Scope, Team Size Owned, Years Required, Compensation, Department.

UTP-Optimized JD Section Order: THE OPPORTUNITY → ROLE TYPE → WHAT YOU WILL OWN → REQUIRED SKILLS → STRONGLY PREFERRED → WHO YOU ARE → WHAT SUCCESS LOOKS LIKE

### D3 Brand Signal: TSOV Methodology
Talent Share of Voice = company's mention share within talent conversations vs. tier-relevant competitive set (5-15 peers). Authority-weighted. Reddit API is the only live D3 source in current code — needs upgrade to full TSOV.

### D4 Continuity Indicator — Scope Discipline
Theme-level alignment ONLY. NOT statement-level. Framing must be descriptive, not prosecutorial.
"Theme alignment is 45% on compensation; further analysis recommended" ✓
"Your compensation claims are contradicted by employee reviews" ✗
Time-weighting: <6mo = 100%, 6-12mo = 75%, 12-24mo = 50%, >24mo = excluded.

### D5 Critical Inversion
High agentic readiness + low spam defense scores LOWER than having neither.
Going agentic without defense is worse than staying offline.

### Scoring & Grades
"Good" thresholds (placeholder — empirically refined post-baseline):
T1: 50+ Good / 65+ Excellent | T2: 65+ / 80+ | T3: 70+ / 85+ | T4: 75+ / 90+

### Report Voice
- Use [Company Name], not "you/your"
- Measured, precise — no dramatic language
- Descriptive, not prosecutorial (especially D4)

### Four Planned Products (Separate from TalentGEO MVP)
1. Employer Brand Index (EBI) — comprehensive continuity analysis (D4 upsell)
2. JD Optimizer — auto-applies 7-step fix methodology (D2 upsell)
3. Agentic Talent Optimization + Anti-Fraud (D5 extension)
4. Spam/Fraud Remediation Protocol (likely UTP standard for ATS providers)

### Target Market
TalentGEO product/market fit = Fortune 6000. NOT the broader SMB distribution that Cassillon Group consulting serves.
