Dimension Functionality Explained
TalentGEO · Cassillon AI
Last updated: 2026-06-24
================================================================================

This document explains what each of the five audit dimensions actually does in
the code, in plain English. It is a living document — update it whenever the
logic for a dimension changes in backend/server.js.

Full protocol specification: UTP_V2_Architecture_Specification.md

Dimension weights are TIER-AWARE (T1/T2/T3/T4):
  D1 Schema Integrity:             15% / 15% / 15% / 15%
  D2 Content Readiness:            15% / 20% / 20% / 25%
  D3 Brand Signal Assessment:      10% / 15% / 20% / 20%
  D4 Continuity Indicator:         20% / 15% / 15% / 10%
  D5 Distribution & Agentic Readiness: 40% / 35% / 30% / 30%

Grade thresholds (placeholder — empirically refined post-baseline):
  T1: Good 50+, Excellent 65+
  T2: Good 65+, Excellent 80+
  T3: Good 70+, Excellent 85+
  T4: Good 75+, Excellent 90+

Catastrophic D1 failure (robots.txt blocks all crawlers, no JobPosting schema,
auth wall, JS-only with no SSR) caps the composite score at 30 regardless of
other dimension performance.


────────────────────────────────────────────────────────────────────────────────
D1 — Schema Integrity                               Weight: 15% across all tiers
────────────────────────────────────────────────────────────────────────────────

WHAT IT IS
Can the LLM mechanically read the content? Covers JSON-LD structured data,
crawler access (robots.txt), and sitemap configuration. If D1 fails
catastrophically, nothing else matters — the LLM can't access the content.

WHAT THE CODE DOES

Schema audit (per job URL provided):
1. Fetches HTML of each job posting URL.
2. Finds every <script type="application/ld+json"> block.
3. Looks for a block with "@type": "JobPosting" (including inside @graph).
4. Checks for 5 required fields (10 pts each, max 50):
     title, description, datePosted, hiringOrganization, jobLocation
5. Checks for 8 recommended fields (6.25 pts each, max 50):
     baseSalary, employmentType, validThrough, jobLocationType,
     applicantLocationRequirements, identifier, jobBenefits, experienceRequirements

Crawler access audit (fed into D1 alongside schema):
- robots.txt: checks for Disallow: / (blocks all), blocked job paths, sitemap directive
- sitemap.xml: checks existence, job URL coverage, <lastmod> freshness dates
Note: robots.txt and sitemap data were previously scored as D2 ("Career Site
Hygiene"). Per UTP V2 spec they belong in D1 — moved in June 2026.

IF GOOGLE SEARCH CONSOLE IS CONNECTED
Real impression/click data (last 90 days) for job pages is added to D1 context.
Claude uses this to add specific numbers (e.g. "0 impressions suggests Google
for Jobs is not indexing these pages").

HOW CLAUDE USES IT
Claude receives schema audit results, robots.txt/sitemap audit, and GSC data,
then writes the final D1 score and findings. Claude may adjust the score slightly
based on overall context but must reference real data.

WHEN TO UPDATE THIS DOCUMENT
- Required or recommended field lists change
- robots.txt or sitemap check paths change
- GSC data is added/removed from D1 context
- Catastrophic failure conditions change


────────────────────────────────────────────────────────────────────────────────
D2 — Content Readiness                              Weight: 15% T1 / 20% T2–T3 / 25% T4
────────────────────────────────────────────────────────────────────────────────

WHAT IT IS
Is the content within job postings optimized for LLM understanding? D2 implements
the UTP JD Audit & Fix Sub-Protocol — a 6-dimension evaluation of job description
quality scored at the content level, not the schema/technical level.

Core question: "If an LLM can read this JD, will it understand and cite it well?"

WHAT THE CODE DOES (scoreD2JDContent function)

Scores each job URL against 6 sub-dimensions, each rated 1–5. Max total = 30.
Normalized to 0–100 for the composite. Average across all provided URLs = D2 score.

Score interpretation: 25–30 Excellent · 13–24 Improvement needed · <13 Rewrite required

Sub-dimension 1: Metadata Clarity (1–5)
  Detects presence of the 10 UTP Visible Metadata Block fields:
  Role Title, Role Level, Function, Stage, Location, Deal Size/Scope,
  Team Size Owned, Years Required, Compensation, Department
  Scoring: 9–10 fields = 5, 7–8 = 4, 5–6 = 3, 3–4 = 2, <3 = 1

Sub-dimension 2: Structural Clarity (1–5)
  Detects UTP-optimized section order (7 canonical sections):
  THE OPPORTUNITY, ROLE TYPE, WHAT YOU WILL OWN, REQUIRED SKILLS,
  STRONGLY PREFERRED, WHO YOU ARE, WHAT SUCCESS LOOKS LIKE
  Also checks for basic structural markers (headers, bullet points).
  Scoring: 6–7 sections = 5, 4–5 = 4, 2–3 = 3, 1 = 2, none = 1

Sub-dimension 3: Specificity & Quantification (1–5)
  Detects: years with numbers, specific technologies, measurable outcomes,
  specific credentials/degrees, dollar figures, team/scope numbers.
  Scoring: 5–6 signals = 5, 4 = 4, 2–3 = 3, 1 = 2, 0 = 1

Sub-dimension 4: Role Clarity (1–5)
  Detects: role overview in first third of content, why role exists,
  outcome/impact language, job category (IC vs manager), reporting line.
  Scoring: 4–5 signals = 5, 3 = 4, 2 = 3, 1 = 2, 0 = 1

Sub-dimension 5: Brand Voice & Authenticity (1–5)
  Detects: low jargon count (<3), minimal generic phrases (<2), human narrative,
  specific culture signals, appropriate word count (200–800 words).
  Scoring: 4–5 signals = 5, 3 = 4, 2 = 3, 1 = 2, 0 = 1

Sub-dimension 6: Candidate Self-Assessment (1–5)
  Detects: required vs. preferred sections present, "you are" framing,
  fit indicators, transparent expectations, self-select language.
  Scoring: 4–5 signals = 5, 3 = 4, 2 = 3, 1 = 2, 0 = 1

HOW CLAUDE USES IT
Claude receives per-URL sub-dimension scores with specific missing fields and
sections named. The code-computed average normalized score is the D2 score.
When totalScore < 25, Claude references the UTP 7-step fix methodology in
recommendations. Findings call out specific missing metadata fields and sections
by name (not generic advice).

UTP 7-STEP FIX METHODOLOGY (referenced in recommendations when D2 < 25)
1. Extract core content
2. Define role type
3. Organize ownership (into 3–5 pillars)
4. Quantify & specify requirements
5. Restructure document (metadata → ROLE TYPE → WHAT YOU WILL OWN → etc.)
6. Preserve brand voice (three specific checks)
7. Final review & lock (four gates)

PRODUCT NOTE
The JD Optimizer (separate product on roadmap) auto-applies this 7-step fix.
D2 audit = identifies gaps and references the methodology. JD Optimizer = delivers
the rewritten JD as a paid service.

WHEN TO UPDATE THIS DOCUMENT
- UTP_METADATA_FIELDS or UTP_SECTIONS arrays change in server.js
- Sub-dimension scoring thresholds change
- New signals are added to any sub-dimension
- 7-step fix methodology changes


────────────────────────────────────────────────────────────────────────────────
D3 — Brand Signal Assessment                        Weight: 10% T1 / 15% T2 / 20% T3–T4
────────────────────────────────────────────────────────────────────────────────

WHAT IT IS
What does the outside world say about this company as an employer, calibrated
to their tier? D1/D2 are about owned content (what YOU say). D3 is about earned
signal (what OTHERS say).

Full methodology per V2 spec: Talent Share of Voice (TSOV) — company mention
share in talent-context conversations vs. a tier-relevant competitive set.
TSOV is a V2.5 upgrade. Current V2 MVP data source: Reddit.

WHAT THE CODE DOES
1. Searches Reddit public RSS feeds for the brand name (broad + employer-targeted).
2. Deduplicates results by URL.
3. Keyword-classifies each post title as positive / negative / neutral / mixed.
4. Prioritizes posts from candidate-focused subreddits
   (cscareerquestions, recruitinghell, jobs, careerguidance, etc.).
5. Computes a suggested D3 score (0–100) from:
   - Sentiment ratio score (0–60 pts): baseline 30, +ve ratio adds, -ve subtracts
   - Volume score (0–20 pts): 5+ mentions = 10, 10+ = 15, 20+ = 20
   - Candidate subreddit presence (0–20 pts): 20 if present, else 5
   No mentions found: suggested score = 45 (neutral baseline).

HOW CLAUDE USES IT
Claude receives sentiment breakdown, top post titles, subreddit list, and the
suggested score. Claude may adjust based on brand size, industry, post recency.
Findings must reference specific post titles or subreddits.

WHEN TO UPDATE THIS DOCUMENT
- Subreddit list changes
- Positive/negative keyword lists change
- Scoring formula changes
- Reddit is replaced or supplemented by another data source
- TSOV methodology is implemented (V2.5)


────────────────────────────────────────────────────────────────────────────────
D4 — Continuity Indicator                           Weight: 20% T1 / 15% T2–T3 / 10% T4
────────────────────────────────────────────────────────────────────────────────

WHAT IT IS
Do owned signals (career site, JDs) and earned signals (Reddit, reviews) align
at the theme level? D4 surfaces continuity signals that LLMs use when
cross-referencing employer claims against external reality.

SCOPE DISCIPLINE: D4 is a MINIMUM VIABLE continuity indicator — theme-level
alignment only. Statement-level pairing and comprehensive sentiment analysis
belong in the Employer Brand Index (separate planned product).

WHAT THE CODE DOES
D4 uses the same Reddit data collected for D3, compared against career site
content and JD language to detect theme-level continuity signals.

Claude performs:
1. Theme extraction from owned content (JD + career site text)
2. Theme extraction from earned signal (Reddit posts)
3. Theme alignment: overlap between owned and earned themes
4. Sentiment direction check: does overall direction match?
5. Major divergence detection: themes present in one set but absent/contradicted in other

HOW CLAUDE USES IT
Claude writes D4 score and findings using a DESCRIPTIVE, NOT PROSECUTORIAL tone:
  ✓ "Compensation messaging shows divergence from downstream signal"
  ✗ "Your compensation claims are contradicted by employee reviews"

When no Reddit data is available, Claude scores D4 based on inferred continuity
from the career site content alone.

Time-weighting applied to downstream data:
  <6 months: 100% weight · 6–12 months: 75% · 12–24 months: 50% · >24 months: excluded

WHEN TO UPDATE THIS DOCUMENT
- D4 scoring logic in the Claude prompt changes
- A new downstream data source is added
- Continuity thresholds are empirically refined post-baseline


────────────────────────────────────────────────────────────────────────────────
D5 — Distribution & Agentic Readiness              Weight: 40% T1 / 35% T2 / 30% T3–T4
────────────────────────────────────────────────────────────────────────────────

WHAT IT IS
Where do job postings appear, how discoverable are they by LLMs and agents, AND
how defensible are inbound application channels against spam/bot/fraud?

CRITICAL INVERSION: High agentic readiness + low spam defense scores LOWER than
having neither. Going agentic without defense is worse than staying offline.

D5 is the heaviest-weighted dimension across all tiers. If a company isn't found,
nothing else really matters.

WHAT THE CODE DOES
D5 is the most Claude-driven dimension. The code does not independently fetch
platform presence data. Instead:

1. If the user selected ATS platform(s) (Greenhouse, Workday, Lever, etc.),
   those names are passed to Claude with instructions to provide ATS-specific
   optimization advice covering:
   - Schema/structured data requirements for that ATS
   - Feed configuration affecting Google for Jobs eligibility
   - Known indexing quirks or limitations
   - Posting visibility/template settings commonly missed
2. If no ATS selected: Claude provides general distribution coverage advice.
3. Claude assesses platform signals (Google for Jobs, LinkedIn, Glassdoor,
   Indeed, Schema.org, Bing) based on overall audit context.

Sub-Dimension A: Signal Quality (Spam/Bot/Fraud Vulnerability)
Sub-Dimension B: Agentic Readiness (Outbound Discoverability)

The linkage penalty: agentic readiness without spam defense → heavy score penalty.

HOW CLAUDE USES IT
Claude writes the D5 score and findings almost entirely from ATS knowledge and
distribution best practices. Score is more advisory than data-driven in V2 MVP.

WHEN TO UPDATE THIS DOCUMENT
- Real platform data fetching is added (Google Indexing API, etc.)
- ATS platform list in the UI changes
- D5 instructions to Claude change significantly
- Agentic readiness checks are added (V2.5)
