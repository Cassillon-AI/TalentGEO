# TalentGEO — Project Context for Claude Code

## Project Overview
TalentGEO is an AI-powered GEO audit tool for employer brand and job posting visibility.
Built by Cassillon AI. Stack: Node.js/Express backend on GCP Cloud Run, static
HTML/CSS/JS frontend, Firebase Hosting, Anthropic Claude API as the audit engine.

## Build & Run Commands
# Backend (local dev)
cd backend && npm install
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY node server.js
# Backend runs on http://localhost:8080

# Frontend (local dev)
cd frontend && npx serve .
# Set BACKEND_URL in index.html to http://localhost:8080 for local testing

# Deploy backend to Cloud Run
cd backend && gcloud run deploy talentgeo-backend --source . --region us-central1
  --platform managed --allow-unauthenticated
  --set-secrets='ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest'
  --memory 512Mi --timeout 120

## Architecture
frontend/index.html   — Single-page app. POST /audit to backend.
backend/server.js     — Express server. Main audit engine. Claude API calls here.
backend/Dockerfile    — Node.js container for Cloud Run.
Firestore             — User data, audit results, benchmark dataset (when built).
Secret Manager        — ANTHROPIC_API_KEY stored here, injected at runtime.

## Key Files
backend/server.js     — The audit engine. All five dimension checks live here.
frontend/index.html   — Single file frontend. All JS inline.
BACKEND_URL           — Constant near bottom of index.html. Update for prod vs local.

## Current Model
claude-sonnet-4-6 — Do not change without Jonathon confirming cost impact.

## Five Audit Dimensions
D1 — Schema Integrity: JobPosting JSON-LD schema checks
D2 — Career Site Hygiene: robots.txt, sitemap, crawlability
D3 — Job Posting Content: LLM-optimized content structure
D4 — Employer Brand Signals: Glassdoor, LinkedIn, Reddit presence
D5 — Distribution Coverage: Google for Jobs, job board reach, prompt monitoring

## Scoring
Composite 0-100 score. Tiers: Critical (0-25), Developing (26-50),
Established (51-75), Leading (76-100).
Dimension weights: D1 25%, D2 20%, D3 20%, D4 20%, D5 15%.

## Conventions
- Never break the audit engine without a fallback — Jonathon demos this to clients.
- All Claude prompts use claude-sonnet-4-6 with max_tokens: 4000.
- Firestore collections: users, audits, benchmarks (pending).
- Admin routes prefixed /admin — protect with middleware before exposing.
- Environment: GCP Project ID = [YOUR_PROJECT_ID]

## What NOT to Touch
- The five-dimension audit prompt structure — changes need Jonathon review.
- Secret Manager config — API key rotation goes through Jonathon.
- Billing-related Cloud Run settings without confirming cost impact.
