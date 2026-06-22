# Unified Talent Protocol — Version 2 Architecture Specification

> **The Foundational Protocol for LLM-Based Talent Discovery**

| Field | Value |
|---|---|
| Document | UTP Protocol V2 — Architecture Specification |
| Version | 2.0 (V2 MVP) |
| Status | LOCKED — Ready for Implementation |
| Date | June 22, 2026 |
| Author | Jonathon Wall, Founder/CEO, Cassillon AI |
| Distribution | JR Yackley, CTO / Technical Lead |
| Classification | Internal — Proprietary |

---

## Executive Summary

The Unified Talent Protocol (UTP) V2 represents Cassillon AI's foundational framework for measuring, optimizing, and standardizing employer discoverability in the emerging era of LLM-based and agentic job search. V2 builds on the validated V1 protocol and integrates substantial empirical learning, established industry frameworks (AMEC, Gartner segmentation, UCP architectural patterns), and field validation from senior practitioners across talent acquisition, growth marketing, and data infrastructure.

### What V2 Establishes

V2 locks the architecture for how employers are measured against LLM-based discovery readiness. It introduces tier-aware analysis as a first-class protocol concept, integrates the validated UTP Job Description Audit & Fix Protocol as a sub-protocol within Dimension 2, adopts industry-standard Share of Voice methodology (Talent Share of Voice / TSOV) for brand signal measurement, reframes Dimension 4 as a minimum-viable Continuity Indicator with disciplined scope, and pairs spam/bot/fraud vulnerability with agentic readiness as linked dimensions in Dimension 5.

### What V2 Defers

V2 deliberately defers seeker intent inference (Section 3) to the UTP Product Roadmap, acknowledging that designing inference rules without empirical seeker prompt behavior data would embed unsupported assumptions into protocol mandates. This deferral reflects the disciplined sequencing principle: build and test first, document second, publish standards only when evidence is established.

### Four Product Opportunities Identified

During V2 architecture work, four standalone product opportunities surfaced for separate scoping and roadmap development: the Employer Brand Index (comprehensive continuity analysis), the JD Optimizer (auto-applied fix methodology), Agentic Talent Optimization with anti-fraud protection, and the Spam/Fraud Remediation Protocol (likely positioned as a UTP standard for ATS providers to adopt rather than a build product). Each represents meaningful market opportunity leveraging shared TalentGEO data infrastructure.

### Strategic Positioning

V2 publishes UTP as a set of recommendations, not mandates. Cassillon AI lacks the market authority to enforce protocol compliance from LLM tools or employers. The right posture is to publish UTP as comprehensive recommendations, implement UTP-compliant behavior in Cassillon AI's own products, and work over time to gain industry alignment and adoption. Earning that adoption is one of the most important strategic challenges Cassillon AI faces in pursuit of the UTP north star.

> **STATUS:** All eight protocol sections are LOCKED as of June 22, 2026. This document is the canonical reference for V2 implementation. JR (CTO) holds the technical implementation decisions parked in Section 6; product roadmap items captured in Section 8 require separate scoping work.

---

## Document Structure

| Section | Title | Status |
|---|---|---|
| § 1 | Company Tier Definition | LOCKED |
| § 2 | "Good" GEO Performance by Tier | LOCKED |
| § 3 | Seeker Intent Inference | DEFERRED to Roadmap |
| § 4 | Five Dimensions Redesigned (D1–D5) | LOCKED |
| § 5 | Scoring & Reporting | LOCKED |
| § 6 | Baseline Audit Database Strategy | LOCKED |
| § 7 | UTP Discovery Semantics | LOCKED (as Recommendations) |
| § 8 | Open Questions & Parking Lot Consolidation | LOCKED |
| Appendix A | Key Achievements & Strategic Discoveries | — |
| Appendix B | UTP Product Roadmap (4 Products) | — |
| Appendix C | Recommended Next Steps | — |

---

## § 1 Company Tier Definition

### Purpose

Tier classification establishes the foundational context for all UTP audit analysis. Audits without tier classification lack market context validity. Tier is mandated as a required field in the UTP schema.

### Four-Tier Framework (Gartner-Aligned)

UTP adopts a four-tier composite model aligned with Gartner's established SMB/Mid-Market/Enterprise segmentation, with finer granularity at the smaller end to distinguish funded startups from established small businesses.

| Tier | Name | Headcount | Revenue | Other Signals |
|---|---|---|---|---|
| T1 | Startup / Early-Stage | <100 | <$50M | VC-backed, high growth, equity-driven hiring |
| T2 | Growth-Stage | 100–1,000 | $50M–$1B | Scaling operations; building HR infrastructure |
| T3 | Established Mid-Market | 1,000–5,000 | $1B–$2B | Mature, profitable, structured hiring |
| T4 | Enterprise | 5,000+ | $2B+ | Public OR mega-private |

### Anchor Logic

V2 MVP uses size-based anchoring (headcount + revenue). V2.5 will add funding stage via Crunchbase API integration to refine T1/T2 placement.

**V2 MVP — Size-Based Anchor**
- Primary: Headcount from PDL
- Secondary: Revenue from PDL/SEC EDGAR
- Cross-check: When both signals agree, high confidence; when they disagree, defer to most recent verified data

**V2.5 — Hybrid Anchor (Funding Stage Added)**
- Crunchbase API integration for funding stage
- Funding stage refines T1/T2 placement (Series A vs Series C distinction)
- Funded vs. bootstrapped becomes a sub-classifier within T2

### Tier Assignment Method

Hybrid approach: employer-initiated audits use employer self-declaration with PDL validation; Cassillon-initiated audits use system-assigned tier classification based on data.

| Audit Type | Assignment Method | Verification |
|---|---|---|
| Employer-initiated | Self-declared with PDL validation | Flag discrepancies for review; allow employer dispute with evidence |
| Cassillon-initiated | System-assigned from PDL primary, SEC secondary | Cross-reference multiple sources where available |

### Re-evaluation Cadence

- Automatic quarterly review against current data
- Event-triggered updates: funding announcement, IPO, acquisition, major layoff, headcount crossing tier boundary

### Edge Cases

- Non-VC-backed growth companies: Treated as T2 by size, regardless of funding history (e.g., bootstrapped 500-person SaaS with $80M ARR → T2)
- Acquisition spinoffs, holding companies, non-profits, government contractors: Build for the rule; handle exceptions case-by-case via reasonable inference

### UTP Schema Integration

Tier classification is a required field in the UTP employer profile schema. Audits without tier classification lack market context validity, so tier becomes part of the core protocol.

> **KEY DECISION:** Tier classification is MANDATED in the UTP schema. LLM tools consuming UTP data must honor tier declarations. Discovery and ranking are tier-aware by protocol mandate, not optional.

### Visibility & Transparency

- Companies see their own tier with full transparency on assignment logic
- Job seekers infer tier from prompts (LLM discovery respects tier filtering based on prompt language)
- Competitors named only for market matching; specific competitor scores aggregated/anonymized except for the company viewing its own report
- Tier appeal process: companies can dispute tier with evidence; Cassillon AI adjudicates

---

## § 2 "Good" GEO Performance by Tier

### Composite Scoring Structure

Every audit produces a three-part score: absolute (0–100), tier-relative percentile (post-baseline), and descriptive grade label. No letter grades.

| Component | Description |
|---|---|
| Absolute Score (0–100) | Raw protocol compliance percentage |
| Tier-Relative Ranking | Position within tier (e.g., "Top 15% of T2 companies") |
| Composite Grade Label | Excellent (top 10%) / Good (top 11–25%) / Average (26–50%) / Needs Improvement (bottom 50%) |

Sample report line: *"GEO Score: 72/100 — Good (Top 18% of Growth-Stage companies)"*

### What "Good" Means by Tier (Hybrid Definition)

The numeric score is comparable across tiers (a 72 means similar protocol compliance regardless of tier). The strategic meaning differs by tier.

| Tier | What "Good" Means in Practice |
|---|---|
| T1 (Startup) | Findable when seekers explicitly search for startups in your space |
| T2 (Growth-Stage) | Competing effectively with peers in your category |
| T3 (Established Mid-Market) | Competing with enterprises in niche/specialized searches |
| T4 (Enterprise) | Reducing noise; surfacing precision for role-specific searches |

### Dimensional Weighting (Tier-Specific Sliding Weights)

Discoverability (D5) is heaviest weighted across ALL tiers. If a company doesn't come up in LLM-based search, nothing else really matters.

| Dimension | T1 | T2 | T3 | T4 |
|---|---|---|---|---|
| D1 Schema Integrity | 15% | 15% | 15% | 15% |
| D2 Content Readiness | 15% | 20% | 20% | 25% |
| D3 Brand Signal | 10% | 15% | 20% | 20% |
| D4 Data Sourcing | 20% | 15% | 15% | 10% |
| D5 Distribution/Discoverability | 40% | 35% | 30% | 30% |
| **Total** | **100%** | **100%** | **100%** | **100%** |

*Status: Placeholder weights for V2 MVP. Empirically refined post-baseline audits.*

### "Good" Thresholds (V2 MVP Placeholder)

Reduced 10 points from original strawman to reflect emerging-protocol reality. After running baseline audits across 1,000 companies stratified by Fortune ranking, thresholds will be empirically anchored to observed distributions.

| Tier | "Good" Threshold | "Excellent" Threshold |
|---|---|---|
| T1 (Startup) | 50% | 65% |
| T2 (Growth-Stage) | 65% | 80% |
| T3 (Established Mid-Market) | 70% | 85% |
| T4 (Enterprise) | 75% | 90% |

> **EMPIRICAL VALIDATION:** After running baseline audits across 50–100 companies per tier, thresholds will be anchored to observed reality: "Good" = Top 25% of tier (75th percentile); "Excellent" = Top 10% of tier (90th percentile); "Needs Improvement" = Below 50th percentile.

### Missing Data Handling

Confidence-flagged scores rather than artificial penalties:
- Score shown as-is, accompanied by data completeness percentage
- Example: "GEO Score: 72/100 (Data Completeness: 85%)"
- Below 70% data completeness: Score flagged as "Provisional"
- Below 50% data completeness: "Insufficient data for reliable score" — partial assessment only

### Aspirational vs. Achievable

- Top 10% of tier = Excellent (aspirational; should feel hard to reach)
- Top 25% of tier = Good (achievable with effort; the realistic FOMO target)
- Bottom 50% = Needs Improvement (clear actionability)

---

## § 3 Seeker Intent Inference

> **STATUS: DEFERRED TO UTP ROADMAP** — This section is intentionally deferred. Building inference rules without empirical seeker prompt behavior data would embed unsupported assumptions into protocol mandates.

### Why Deferred

At this stage, Cassillon AI lacks the empirical data on actual seeker prompt behavior to design intent inference rules with integrity. Building these rules now would require making assumptions about how seekers phrase queries, which signals correlate with which tiers, and how often ambiguous signals appear. Assumptions are not facts. Unvalidated logic will not be embedded into protocol mandates.

### What's Required Before This Section Can Be Built

**Data Required (Not Yet Available)**
- Real seeker prompt corpus (what do people actually type when searching for jobs via LLMs?)
- Frequency distribution of tier-specific language vs. tier-neutral language
- Patterns of explicit vs. implicit tier signals
- Common ambiguity patterns and conflict cases
- Override frequency (how often do seekers correct or refine?)

**Tools/Partnerships Required (Build/Buy/Partner Decision Pending)**
- Prompt monitoring tools for LLM-based job search behavior
- Possible sources: AMEC-aligned audit vendors, specialized AI observability tools, direct partnerships with LLM platforms, or custom-built capture mechanisms

### What IS Locked (Carried Forward)

- Tier classification is mandated in UTP schema (Section 1)
- Tier filtering capability is mandated in LLM tools consuming UTP (Section 1)
- No demographic, career history, or platform behavior assumptions (non-negotiable foundational commitment)
- Inference, when built, will be based ONLY on prompt language
- Protocol must not embed bias — foundational commitment regardless of when intent inference is built

### UTP Roadmap Entry

**Phase 1 — Discovery (Pre-Build)**
- Identify and evaluate prompt monitoring tools/partnerships
- Determine: Build internal prompt corpus, buy access to existing corpus, or partner with LLM platforms
- Build seeker prompt taxonomy from empirical data
- Identify dominant signal patterns and ambiguity cases

**Phase 2 — Framework Design**
- Develop intent inference framework grounded in observed behavior
- Define mandates vs. recommendations
- Build bias guardrail testing protocol

**Phase 3 — Protocol Integration**
- Add Section 3 to UTP specification
- Define LLM tool compliance requirements
- Establish audit-ability of inference logic

> **WHY THIS DECISION MATTERS:** This is intellectual honesty operating at the protocol level. The most common failure mode for emerging standards is assuming behavior patterns that haven't been validated, then enshrining those assumptions in mandates that become technical debt. By parking this section now, Cassillon AI maintains protocol integrity, prevents embedding bias accidentally, builds credibility with future adopters, and creates a research artifact that justifies investment.

---

## § 4 Five Dimensions Redesigned (D1–D5)

### Overview

The five UTP dimensions define what Cassillon AI measures to assess employer readiness for LLM-based talent discovery. V2 redesigns each dimension to be tier-aware, integrates existing validated work (notably the UTP JD Audit & Fix Protocol within D2), adopts industry-standard methodologies (Talent Share of Voice within D3), and applies disciplined scope boundaries (notably D4 reframed as Continuity Indicator).

| Dimension | Name | Core Question |
|---|---|---|
| D1 | Schema Integrity | Can the LLM mechanically read your content? |
| D2 | Content Readiness | Is the content within the schema actually optimized for LLM understanding? |
| D3 | Brand Signal Assessment | What does the outside world say about you as an employer, calibrated to your tier? |
| D4 | Data Sourcing & External Validation | Do you walk your talk? (Continuity Indicator) |
| D5 | Distribution, Coverage, Signal Quality & Agentic Readiness | Are you discoverable AND defensible? |

### Cross-Cutting Architecture

**D1/D2 Relationship: "Technical Foundation Pair"**

D1 and D2 remain separate dimensions with independent scores but are documented as a "Technical Foundation Pair" for operational efficiency: audited together in a single execution pass (same data collection, same scraper run), scored independently because they answer different questions.
- D1: "Does the technical infrastructure exist?"
- D2: "Is the content within those structures optimized?"

**Tier-Awareness Model**

V2 MVP uses Model B: same audit criteria across tiers with different weights. V2.5+ evolves toward Model D: core criteria plus tier-specific additions. This migration path allows V2 MVP to ship quickly while preserving the path to deeper differentiation.

**Data Source Strategy**

| Dimension | V2 MVP Strategy | Roadmap Vision |
|---|---|---|
| D1 | Build internally — scrape + parse | Same |
| D2 | User-provided URLs + Claude analysis | Build agent for autonomous retrieval |
| D3 | Partner — specialized OSINT/scraping expertise | Same (with potential to own select pipelines over time) |
| D4 | Build + Partner — own continuity logic; partner-sourced data | Long-term: Own/pay for all data pipelines |
| D5 | Build internally — feed checks + presence detection | Add agentic readiness checks |

**Cross-Dimension Dependencies**

Each dimension scores independently for clarity. The recommendations engine acknowledges cross-dependencies in actionable terms. The one explicit exception: catastrophic D1 failures cap the overall composite score at 30% regardless of other dimension performance.

**Career Site vs. Job Posting Mapping**

Career site content feeds into D2 (content readiness), D3 (brand signal), and D4 (continuity). Job postings feed into D1 (schema), D2 (content), and D5 (distribution). Same source, multiple dimensions — one collection pass, multi-dimensional analysis.

---

### D1 — Schema Integrity

**What D1 Measures**

Technical infrastructure for LLM discoverability — JSON-LD, structured data, schema.org JobPosting, robots.txt, sitemaps. The "can the LLM mechanically read your content?" dimension. If D1 fails catastrophically, nothing else matters because the LLM can't access the content.

**Audit Checklist (Three Categories)**

*Core Schema Markers (All Tiers)*
- schema.org JobPosting markup present on job description pages
- JSON-LD format (preferred over Microdata/RDFa for LLM parsing)
- Required JobPosting fields: title, description, datePosted, hiringOrganization, jobLocation
- schema.org Organization markup on company/about pages
- robots.txt allows LLM crawlers (GPTBot, Claude-Web, PerplexityBot, etc.)
- sitemap.xml exists and includes career/job pages
- Canonical URL tags on job pages
- Meta tags: title, description, og:* tags on career pages

*Enhanced Schema Markers (T2+ Weighted)*
- Optional JobPosting fields: baseSalary, employmentType, validThrough, applicantLocationRequirements
- schema.org BreadcrumbList for career site navigation
- schema.org Place markup for office locations

*Advanced Schema Markers (T3+ Weighted)*
- Multi-language schema markup (hreflang tags)
- Hierarchical Organization schema (parent/subsidiary relationships)
- schema.org Action markup for "Apply Now" actions
- Validated JSON-LD (passes Google Rich Results Test, Schema.org validator)

**Tier-Specific Weighting (V2 MVP)**

| Tier | Core Weight | Enhanced Weight | Advanced Weight |
|---|---|---|---|
| T1 (Startup) | 100% | 0% | 0% |
| T2 (Growth) | 70% | 30% | 0% |
| T3 (Mid-Market) | 50% | 30% | 20% |
| T4 (Enterprise) | 40% | 30% | 30% |

**Scoring Methodology**

Pass/Fail per category + composite score, weighted by tier. Composite D1 score = sum of (category pass rate × category weight).

> **EXAMPLE — T2 Company:** Core: 7/8 = 87.5% × 70% weight = 61.25 points. Enhanced: 2/5 = 40% × 30% weight = 12.00 points. Advanced: 0/4 = 0% × 0% weight = 0 points. D1 Score = 73.25 / 100.

**Catastrophic D1 Failures (Score Cap)**

Catastrophic D1 failures trigger overall composite score cap at 30% and a critical alert in the report. These conditions render a company effectively invisible to LLMs:
- robots.txt blocks ALL crawlers (including LLM bots)
- No JobPosting schema present anywhere
- Career site behind authentication wall
- Career site is JavaScript-only with no server-side rendering

> **WHY THIS MATTERS:** A 70% overall score on a site that's mechanically invisible is misinformation. Catastrophic infrastructure failure overrides other dimension performance because nothing else matters until LLMs can actually read the content.

**Edge Case Handling**

| Edge Case | V2 MVP Treatment |
|---|---|
| ATS-hosted career sites (Workday/Greenhouse/Lever/Ashby) | Audit the ATS implementation. Note in report: "Schema controlled by [ATS Name]." Common in T1/T2; not a fail. |
| No career site (jobs only on LinkedIn or job boards) | D1 = N/A. Surface as "missing infrastructure" gap in recommendations. |
| Subdomain career sites (careers.company.com) | Audit both. Subdomain primary for JobPosting; main domain for Organization schema. |

---

### D2 — Content Readiness

**What D2 Measures**

Quality and structure of published content — job descriptions, career site content, metadata blocks within job postings. D2 leverages substantial existing work (UTP JD Audit & Fix Protocol, validated against 5 real JDs) integrated into the new 5-dimension protocol architecture.

**D2 Sub-Protocol Architecture (Two Tracks)**

*Sub-Protocol 1: Job Description Audit (Existing, Validated)*

Uses the existing 6-dimension JD audit as a sub-protocol within D2:

| Sub-Dimension | Measures |
|---|---|
| 1. Metadata Clarity | Explicit, structured metadata at top of JD |
| 2. Structural Clarity | Organization, flow, section hierarchy |
| 3. Specificity & Quantification | Measurability of requirements |
| 4. Role Clarity | What the role is and why it exists |
| 5. Brand Voice & Authenticity | Human readability and authentic voice |
| 6. Candidate Self-Assessment | Can candidates self-assess fit? |

Scoring: 1-5 per sub-dimension, max 30. Interpretation: 25-30 = Excellent; 13-24 = Improvement needed; Below 13 = Rewrite required.

*Sub-Protocol 2: Career Site Content Audit (Parallel Structure)*

Separate sub-protocol for career site content quality (About, Culture, Leadership, Mission, Benefits pages). Same six-dimension structure adapted for career site content. Same 1-5 scoring methodology. Combines with JD audit for D2 composite. Required for D4 continuity check.

**UTP Visible Metadata Block (Locked Structure)**

10-field metadata block at top of every JD:

| Field | Notes |
|---|---|
| Role Title | Exact title |
| Role Level | IC1, IC2, IC3, Manager, Principal, Lead |
| Function | Sales, Product, Engineering, etc. |
| Stage | Pre-Seed, Seed, Series A, Series B, Series C, Growth, Mature |
| Location | City, State + Remote/Hybrid/Onsite |
| Deal Size / Scope | If applicable (sales roles, etc.) |
| Team Size Owned | If applicable (manager roles, etc.) |
| Years Required | Min-Max range |
| Compensation | Base Range + Equity + Benefits |
| Department | Reporting line/org |

Visibility flexibility: Some fields MAY be left blank in the visible version if the company chooses not to share externally. However, the embedded JSON-LD version should include all available data — visibility privacy controls don't apply to the technical layer.

**Stage → Tier Mapping**

| Stage Label | Maps to Tier |
|---|---|
| Pre-Seed, Seed, Series A, Series B | T1 (Startup) |
| Series C, Series D, Pre-IPO | T2 (Growth-Stage) |
| Growth, Mature (1,000-5,000 employees) | T3 (Established Mid-Market) |
| Mature (5,000+ employees), Public | T4 (Enterprise) |

**UTP-Optimized JD Structure (Locked)**

After the visible metadata block, JDs follow this section order:
1. THE OPPORTUNITY (2-3 sentences narrative context)
2. ROLE TYPE (one sentence: category + 12-month outcome)
3. WHAT YOU WILL OWN (3-5 explicit pillars)
4. REQUIRED SKILLS (quantified, specific)
5. STRONGLY PREFERRED (nice-to-have)
6. WHO YOU ARE (culture/mindset — narrative appropriate here)
7. WHAT SUCCESS LOOKS LIKE (if different from "owned" deliverables)

**7-Step Fix Methodology (Locked)**

When D2 audit finds issues, the 7-step fix methodology is the prescribed remediation:
1. Extract core content
2. Define role type
3. Organize ownership (into 3-5 pillars)
4. Quantify & specify requirements
5. Restructure document (metadata → ROLE TYPE → WHAT YOU WILL OWN → etc.)
6. Preserve brand voice (three specific checks)
7. Final review & lock (four gates)

**Product Strategy**
- V2 MVP audit: Identifies gaps, outputs recommendations referencing the 7-step methodology
- JD Optimizer (separate offering): Auto-applies the 7-step fix to generate optimized JD versions
- Pricing model: Audit = lower-tier or free; JD Optimizer = paid service/upsell

**Three UTP Non-Negotiables (V2 Mandates — Subject to Testing)**
1. Optimization ≠ Templating — Structure gets fixed, brand voice gets preserved
2. Metadata is non-negotiable for LLM retrievability — Visible block + embedded JSON-LD both required
3. Candidate self-assessment is a quality metric — If candidates can't self-assess fit, the JD failed

**Sampling Methodology**

*V2 MVP (User-Provided URLs)*
- User provides 3-5 JD URLs for initial audit

*Roadmap (Agent-Driven)*
- <10 jobs: Audit all
- 10-50 jobs: 5 random samples
- 50-200 jobs: 10 random samples
- 200+ jobs: 20 random samples (stratified by function if data allows)

---

### D3 — Brand Signal Assessment

**What D3 Measures**

External brand presence and signal/noise ratio within talent context — what others say about you as an employer, calibrated against tier-relevant competitive sets. D1/D2 are about owned content (what YOU say). D3 is about earned signal (what OTHERS say).

> **SCOPE DISCIPLINE:** D3 measures minimum viable brand signal for GEO visibility audit. Comprehensive employer brand health is intentionally OUT OF SCOPE for V2 (parked as separate Employer Brand Index product on UTP roadmap).

**Core Methodology: Talent Share of Voice (TSOV)**

Talent Share of Voice (TSOV) = Company's mention share within talent-related conversations, calculated against a tier-relevant competitive set.

*Calculation Method*
1. Define tier-relevant competitive set (same Tier, same industry/function, same geography where applicable; 5-15 competitors)
2. Calculate TSOV per source = (Company's talent-context mentions in source) / (Sum of competitive set's talent-context mentions in source)
3. Apply authority weighting (tier-1 sources weighted higher than tier-3)
4. Composite TSOV = weighted average across sources

*Why TSOV Not Absolute Volume*
- Industry-aligned (SOV is established standard)
- Tier-aware by design
- Scales correctly with market reality (fragmented vs concentrated)
- Aligns with emerging AI SOV measurement
- Authority-weighted (quality > volume per AMEC framework)

**TSOV Benchmarks (Placeholder — Empirically Refined)**

| Tier | Competitive Set | TSOV "Good" | TSOV "Excellent" |
|---|---|---|---|
| T1 (Startup) | Fragmented (10-20 peers) | 8-15% | 15%+ |
| T2 (Growth) | Moderately fragmented (5-15 peers) | 12-20% | 20%+ |
| T3 (Established) | Established (3-10 peers) | 10-18% | 18%+ |
| T4 (Enterprise) | Concentrated (3-7 major players) | 15-25% | 25%+ |

**D3 Sub-Dimensions (V2 MVP Scope)**
1. TSOV Composite Score (mention volume relative to competitive set, authority-weighted)
2. Sentiment Distribution (% positive/neutral/negative — snapshot only; trends to V2.5)
3. Source Diversity (unique sources, AMEC framework coverage, tier-appropriate coverage)
4. Review Site Performance (Glassdoor, Indeed, G2 for software companies)
5. Topic Relevance (job-related sources weighted 70%, general brand 30%)
6. Authority Signal (tier-1/tier-2/tier-3 source classification, weighted scoring)

*Excluded from V2 MVP (Parked for V2.5):* Trend analysis, comprehensive sentiment dimension analysis, competitive brand positioning depth.

**D3 Source Strategy**

Approach: "Try Free Scraping First; Pay Only If Blocked"

*Tier 1 — High Confidence (Build First)*
- Glassdoor (public reviews scraping with rate limiting)
- Indeed (API + public reviews)
- Reddit (official API)
- G2 (public reviews scraping; software companies)
- Hacker News (official API)
- PDL (existing MCP integration)
- Crunchbase News (RSS + public articles)
- General web search

*Tier 2 — Try With Caveats (Variable Reliability)*
- Blind (public posts only)
- Twitter/X (public posts only)
- LinkedIn company pages (Option A: public data only)
- Mark as "best-effort" in audit reports

*Tier 3 — Deferred to V2.5*
- LinkedIn deep employee/post data (premium API or licensed access)
- Twitter/X firehose-level data (paid only)
- Premium press monitoring aggregators (Meltwater, Cision, Muck Rack)
- LinkedIn Talent Insights API (enterprise pricing)

**LinkedIn Legal Risk Posture**

V2 MVP: Option A only (public data scraping with rate limiting and ToS-respectful operation). Option B (commercial scraping infrastructure) deferred to V2.5 or when revenue/investment justifies the cost and risk.

**Signal vs. Noise Filtering**

Multi-term queries combining company name + industry keywords prevent name ambiguity issues. Job-related sources weighted 70%; general brand mentions weighted 30%.

**Refresh Cadence**
- Paid audits: Fresh data pulled on-demand
- Baseline database: Monthly refresh
- V2 MVP: Snapshot data only (no historical trend tracking)
- V2.5+: Add trend tracking once 6+ months of baseline data exists

**Privacy and Ethics Constraints**
- Public data only (no private/leaked content)
- No individual reviewer identification (aggregate sentiment only)
- No specific negative quotes surfaced without aggregate context
- Platform ToS compliance for each source
- AMEC ethical guardrail honored: improve information availability, do not manipulate

---

### D4 — Data Sourcing & External Validation

**What D4 Measures**

Continuity INDICATOR between upstream (owned) and downstream (earned) content. Surfaces signals that LLMs use when cross-referencing employer claims against external reality.

> **CRITICAL SCOPE DISCIPLINE:** D4 is a minimum viable continuity INDICATOR, not comprehensive continuity ANALYSIS. Comprehensive analysis is deferred to a separate planned product: Employer Brand Index (EBI). D4 serves as a natural gateway/upsell pathway to EBI.

**Why D4 Stays Minimum Viable**

Continuity analysis is the foundation of Employer Brand Index, not a side feature. Doing it superficially in GEO Audit risks delivering shallow insight that customers won't trust. HR/TA leaders are sensitive to upstream/downstream comparison — high stakes for getting it right.

The architectural decision: D4 surfaces continuity SIGNALS that point to whether deeper analysis is needed. Comprehensive analysis happens in EBI.

**D4 Sub-Dimensions (Continuity Indicator Scope)**

| Sub-Dimension | What It Measures | Scope |
|---|---|---|
| Theme Alignment | Do upstream themes appear in downstream content? | Theme-level only (NOT statement-level) |
| Sentiment Direction Alignment | Does upstream sentiment direction match downstream sentiment direction? | Direction only (NOT detailed sentiment dimension analysis) |
| Major Divergence Detection | Are there significant contradictions on prominent themes? | Surface red flags WITHOUT diagnosing root cause |

*Explicitly DEFERRED to Employer Brand Index product:* Statement-level pairing, multi-dimensional sentiment analysis, detailed cultural/operational/compensation/hiring/leadership continuity, root cause analysis, comprehensive theme dimension scoring.

**Scoring Methodology**

1. Theme Extraction (Upstream): Claude identifies dominant themes in upstream content
2. Theme Extraction (Downstream): Claude identifies dominant themes in downstream content (D3 data)
3. Theme Alignment Score: Calculate overlap percentage between upstream and downstream theme sets
4. Sentiment Direction Check: Compare overall sentiment direction
5. Divergence Detection: Identify themes present in one set but absent or contradicted in the other

D4 Composite Score = Weighted combination of theme alignment % (primary), sentiment direction alignment (secondary), and major divergence count (penalty if severe).

**Theoretical Baseline Thresholds (V2 MVP Starting Hypothesis)**

> **REPORTED AS HYPOTHESES, NOT VALIDATED STANDARDS:** Subject to empirical refinement post-baseline audits.

| Continuity Level | Theme Alignment | Description |
|---|---|---|
| Strong Alignment | 70%+ | Upstream/downstream themes substantially overlap |
| Mostly Aligned | 50-70% | Most themes align; some explainable divergence |
| Mixed Signal | 30-50% | Significant divergence on multiple themes |
| Significant Divergence | <30% | Major contradictions on core themes |

**Tier-Specific Weighting**

Same continuity thresholds across tiers. Weight in overall score varies by tier (T1: 20%, T2-T3: 15%, T4: 10%) — D4 matters proportionally more for smaller companies whose narrative coherence carries more relative discoverability impact.

**Critical Failure Handling (Descriptive, Not Prosecutorial)**

| Approach | Example |
|---|---|
| ✓ Descriptive (Adopted) | "Compensation messaging shows divergence from downstream signal" |
| ✓ Descriptive (Adopted) | "Theme alignment is 45% on compensation; further analysis recommended" |
| ✗ Prosecutorial (Rejected) | "CRITICAL: Your compensation claims are contradicted by employee reviews" |
| ✗ Prosecutorial (Rejected) | "WARNING: Stated values don't match actual culture" |

**Time-Weighting for Downstream Data**

| Age | Weight |
|---|---|
| <6 months | 100% |
| 6-12 months | 75% |
| 12-24 months | 50% |
| >24 months | Excluded |

**AMEC Framework Citation**

D4 documentation explicitly cites AMEC GEO Principles framework, specifically the three evidence domains: Upstream Reputation, Search & Content Readiness, Downstream AI Output Tracking.

**Edge Case Handling**

| Edge Case | V2 MVP Treatment |
|---|---|
| Minimal downstream signal (very small T1) | D4 = N/A; note in report; don't penalize score |
| Manufactured downstream signal (suspicious patterns) | V2 MVP: accept at face value; V2.5+: add suspicious pattern detection |
| Recently rebranded companies | Audit both names; note transition period; weight recent content higher |
| Recent major changes (layoffs, leadership change) | Note in report; flag continuity score as "in transition" |

---

### D5 — Distribution, Coverage, Signal Quality & Agentic Readiness

**What D5 Measures**

Where job postings appear, how discoverable they are by LLMs and agents, AND how defensible inbound application channels are against spam/bot/fraud.

> **CORE PRINCIPLE:** Discoverability and signal defense are two sides of the same coin. Optimizing for agentic discovery without inbound defense creates worse outcomes than staying invisible. UTP positions itself as the only framework addressing BOTH dimensions.

Heavy weighting maintained across all tiers (T1: 40%, T2: 35%, T3: 30%, T4: 30%) per Section 2.

**The Reframe: Linked Dimensions**

*Sub-Dimension A: Signal Quality (Spam/Bot/Fraud Vulnerability Assessment)*
- How exposed is the company to fake applications, bot floods, and fraud?
- What defensive measures exist on inbound channels?
- What's the current noise-to-signal ratio?

*Sub-Dimension B: Agentic Readiness (Outbound Discoverability)*
- How discoverable is the company by AI agents?
- What structured data/API/feed capabilities exist?

**The Linkage Principle**

| Signal Quality (Defense) | Agentic Readiness | D5 Status | Score Range |
|---|---|---|---|
| High | High | OPTIMAL — Discoverable AND Defended | 85-100 |
| High | Low | DEFENDED BUT INVISIBLE — Safe but missing future | 60-75 |
| Low | Low | LEGACY — Vulnerable to current spam; not future-ready | 30-50 |
| Low | High | DANGEROUS — Highly exposed; agentic readiness creates flood risk | 20-40 (PENALIZED) |

> **CRITICAL INVERSION:** A company with high agentic readiness but low spam defense scores LOWER than a company with neither. Going agentic without defense is worse than staying offline.

**Distribution Coverage Tiers**

| Coverage Tier | Definition |
|---|---|
| Tier 1 — Career Site Only | Jobs only on company's own career site |
| Tier 2 — Multi-Channel Distribution | Career site + LinkedIn + Indeed + Google for Jobs + relevant boards |
| Tier 3 — Agentic Readiness | All of Tier 2 + structured feeds, agentic-discoverable formats, LLM-optimized syndication |

**Sub-Dimension A: Vulnerability Assessment Criteria**

*Inbound Application Channel Vulnerability*
- Career site application form security (CAPTCHA, rate limiting, bot detection)
- ATS application flow protection (native fraud defense in Workday/Greenhouse/Lever/Ashby)
- Easy-apply integrations (LinkedIn Easy Apply, Indeed Apply — known spam vectors)
- Open API application channels (no authentication = high risk)

*Application Signal Quality Markers*
- Required application fields (more required = higher friction = lower spam)
- Application validation (email verification, phone validation, identity checks)
- Skills assessments or screening questions
- Resume parsing accuracy

*Known Spam/Fraud Patterns*
- JD language attracting spam (overly generic, "anyone can apply" framing)
- Salary visibility (hidden salaries attract spam; transparent reduce it)
- Application volume vs. hiring volume ratio (high ratio = likely spam problem)
- Geographic patterns in inbound suggesting fraud

*Defensive Infrastructure Maturity*
- ATS-native fraud detection enabled?
- Third-party verification tools present?
- Manual screening capacity appropriate to inbound volume?
- Application analytics monitoring inbound patterns?

**Sub-Dimension B: Agentic Readiness Criteria**
- Structured job data feeds (XML/JSON-LD/schema.org JobPosting consumable by agents)
- API access for job listings (programmatic access, even read-only)
- Real-time freshness (job availability and status signals)
- Conversational interfaces (chatbot/AI-assistant for seeker queries)
- Agent-friendly application process — coupled with spam defense: agent-friendly applications WITHOUT spam protection LOWER D5 score
- Schema completeness (Organization, Person, Action schemas beyond basic JobPosting)

**Channel Inventory (Single Standard, Mainstream-Weighted)**

| Channel Type | Examples | V2 MVP Weight |
|---|---|---|
| Mainstream (Heavy) | Career site, LinkedIn Jobs, Indeed, Google for Jobs, Glassdoor Jobs | High |
| Industry/Specialty (Medium) | AngelList/Wellfound, Y Combinator, Crunchbase, Built In, TechCrunch, ZipRecruiter | Medium |
| Niche/Emerging (Light) | Specialty subreddits, niche industry boards, diversity-focused boards | Light |
| Agentic (Forward-Looking) | Schema.org JobPosting feeds, MCP servers, public job APIs, structured data exposure | Bonus points |

**D5 Scoring Methodology**
1. Distribution Maturity Tier (Base): Tier 1 = 30 base / Tier 2 = 65 / Tier 3 = 90
2. Channel Coverage Quality (Refinement): Within tier, score breadth weighted mainstream vs. niche (±10 points)
3. Signal Quality / Vulnerability Penalty or Bonus: High defense adds; Low defense subtracts (HEAVY penalty with high agentic readiness)
4. Agentic Readiness Modifier: Adds points WHEN paired with adequate defense; subtracts otherwise

**Strategic Implications**

UTP Positioning:
- "The only framework addressing BOTH discoverability AND inbound signal defense"
- Competitive moat against GEO/AEO tools that only optimize for visibility

V2 Scope:
- Vulnerability assessment IS in V2 (audit the problem)
- Remediation solution is V2.5+ (separate product OR standards advocacy)

---

## § 5 Scoring & Reporting

### End-to-End Scoring Sequence

1. Tier Assignment (Section 1 logic) — Determine company tier (T1/T2/T3/T4)
2. Data Collection — Run audits for D1-D5 across appropriate sources
3. Per-Dimension Scoring — Each dimension scored 0-100 per locked methodology
4. Tier-Specific Weighting Applied — D1-D5 scores multiplied by tier weights
5. Catastrophic Failure Check — If D1 catastrophic failure detected, cap overall score at 30%
6. Composite Score Calculated — Weighted average of D1-D5
7. Tier-Relative Percentile Calculated — Position within tier cohort (post-baseline)
8. Grade Label Applied — Excellent / Good / Average / Needs Improvement
9. Recommendations Generated — Per-dimension + cross-dimensional via hybrid rule-based + Claude refinement
10. Timestamp + Storage — All reports timestamped and persisted for time-series comparison

### V2 MVP Report Contents

**Included**
- Overall composite score (0-100)
- Per-dimension breakdown (D1-D5 scores)
- Composite grade label
- Tier classification (T1/T2/T3/T4 with explanation)
- Actionable recommendations with prioritization
- Time-stamped report metadata for comparative analysis (V2 MVP requirement)
- Comparative data vs. prior audits when prior reports exist

**Deferred to "Audit Report" Product Roadmap**
- Intra-tier ranking display
- Cross-tier context display

### Two Report Formats

| Report Type | Use Case | Length | Detail Level |
|---|---|---|---|
| Data Collection Audit Summary | Internal baseline data collection runs | 1 page | Concise data-based summary; conserves tokens during baseline audits |
| Full Production Report | Ad-hoc and customer-facing audits | 6-8 pages typical; up to 10 for Fortune 500 / complex cases | Comprehensive analysis with full recommendations |

**Operational Logic**
- Baseline data collection runs (Fortune 6000 database) → 1-pager only (minimize compute cost)
- Ad-hoc / production reports (paid audits, customer engagements) → Full report
- Full report mode is the default; data collection mode invoked for batch baseline runs

### Full Production Report Structure

| Section | Length | Content |
|---|---|---|
| Executive Summary | 1 page | Overall score, grade, tier, top 3 recommendations |
| Comparative Snapshot (if applicable) | 0.5 page | Score progression vs prior audits; trend indicators |
| Dimension Breakdowns | 4-6 pages | Per-D scores with detail, weighted contribution, evidence |
| Recommendations | 1-2 pages | Prioritized actionable next steps |
| Methodology Appendix | 0.5-1 page | Score calculation logic, tier rationale, data sources, timestamp |

### Report Format & Delivery

- Interactive Web Report (Primary): Viewable in TalentGEO interface; drill-down capability; persisted for re-access and comparison
- Downloadable DOCX (Secondary): Branded Cassillon AI document; shareable internally with stakeholders

### Brand & Visual Identity (Updated 2026-06-21)

New color palette supersedes prior Navy #1B2A4A and Teal #00828A scheme:

| Color | Role |
|---|---|
| Cobalt Blue | Primary brand color (headings, primary accents) |
| Platinum | Sophisticated neutral (table shading, subtle backgrounds) |
| Bronze | Warm accent (sub-headings, callouts) |
| Gold | Premium highlight (key callouts, strategic notes) |

*Exact hex codes to be confirmed during design implementation.*

### Recommendations Engine (Hybrid)

Architecture: Rule-based foundation + Claude refinement for specificity.

**Rule-Based Foundation**
- IF D1 catastrophic failure → flag CRITICAL recommendation
- IF D2 metadata block missing → recommend Step 5 of 7-step fix methodology
- IF D3 TSOV below tier benchmark → recommend specific authority-source engagement
- IF D4 continuity divergence on theme X → flag descriptively
- IF D5 spam vulnerability HIGH + agentic readiness HIGH → flag pathway sequence (defense first)

**Claude Refinement Layer**
- Takes rule-based output + full audit context
- Adds specificity (e.g., "Workday implementation specifically lacks X")
- Personalizes tone to industry, tier, and detected ATS
- Maintains Cassillon AI voice standards

### Recommendations Prioritization Framework

| Priority Class | Definition | Examples |
|---|---|---|
| Critical | Catastrophic failures or severe risks | D1 robots.txt blocks LLM crawlers; D5 high agentic + low defense |
| High Impact | Issues affecting heaviest-weighted dimension for tier | D5 mainstream channel gaps; D2 metadata block missing for T4 |
| Quick Wins | Low-effort fixes with meaningful score improvement | Add missing schema fields; populate metadata block fields |
| Strategic | Longer-term improvements with significant future value | Build public job listing API; develop conversational interface |

### Voice & Tone Standards

- Measured, precise framing (no dramatic language)
- Descriptive, not prosecutorial (especially D4 continuity findings)
- Educational where appropriate (UTP vision framing in D5)
- Professional consultative tone (Cassillon Group brand)
- Use [Company Name] in reports, not "you/your" — more professional, less direct second-person

### Three Audience-Specific Outputs

| Output | Audience | Purpose |
|---|---|---|
| Customer Report | Company being audited | Full transparency, actionable insights |
| Internal Audit Record | Cassillon AI internal | Methodology, raw data, calculations, edge case notes |
| Baseline Database Entry | Cross-company comparison database | Anonymized/aggregated input for benchmark database |

### Time-Series & Comparative Data Architecture (V2 MVP REQUIREMENT)

> **CRITICAL V2 MVP CAPABILITY — NOT DEFERRED:** All reports timestamped at creation. Reports persisted long-term in TalentGEO data architecture. Subsequent audits surface comparative context automatically. The long-play comprehensive data picture holds tremendous value over time.

**Architectural Commitments**
- All reports timestamped at creation
- Reports persisted long-term in TalentGEO data architecture
- Subsequent audits surface comparative context automatically: "[Company Name] composite score improved from 64 to 71 since [date]"
- Per-dimension trend indicators
- Recommendation outcome tracking: "Previous recommendation: add metadata block → COMPLETED; reflected in D2 score improvement from 56 to 78"
- Quarterly re-audits naturally surface trend narratives

**Implementation Implications**
- Data persistence layer is V2 MVP scope, not future feature
- Report storage architecture needs to accommodate retrieval and comparison
- Audit metadata structure must include sufficient context for meaningful future comparison

---

## § 6 Baseline Audit Database Strategy

### Strategic Purpose

The Baseline Audit Database is the strategic moat enabling FOMO-driven sales conversations, time-series comparative data (Section 5 V2 MVP requirement), investor-facing proof of market coverage, empirical threshold refinement, and long-term competitive advantage through proprietary, compounding data.

### Database Scope: Phased Approach

| Phase | Companies | Timing |
|---|---|---|
| V2 MVP Launch | ~1,000 companies stratified by Fortune ranking | At launch |
| Phase 2 | ~5,000 companies (expanded coverage) | Post-Launch Quarter 1 |
| Phase 3 | ~17,500 companies (full tier-stratified coverage) | Quarters 2-4 |

### V2 MVP Baseline Distribution (1,000 Companies)

| Segment | Sample Size | Coverage Approach |
|---|---|---|
| Fortune 250 | 250 companies | Full coverage of top-tier companies |
| Fortune 251-2000 | 250 companies | Representative sampling |
| Fortune 2001-6000 | 250 companies | Representative sampling |
| SMB (outside Fortune 6000) | 250 companies | Representative sampling |
| **Total** | **1,000 companies** | |

> **CRITICAL STRATEGIC CLARIFICATION:** TalentGEO product/market fit is within the Fortune 6000 — NOT the broader SMB/T1/T2 distribution that Cassillon Group's consulting practice serves. The baseline reflects the target customer market.

### Tier Mapping Implications

- Most Fortune 250 = T4 (Enterprise)
- Fortune 2000 = mix of T3/T4
- Fortune 6000 = mix of T2/T3
- SMB = T1/T2
- Baseline will be heavily weighted toward T3/T4 by tier classification

### Company Identification Strategy

| Segment | Sourcing Approach |
|---|---|
| Fortune 250 | Annual Fortune 500 list (top 250); easily obtainable; well-documented |
| Fortune 251-2000 | Fortune 500/1000/2000 published lists; sample stratified by industry/sector |
| Fortune 2001-6000 | Fortune 5000/6000 lists, Inc. 5000, sector-specific rankings |
| SMB | Crunchbase (Series A/B/C), Y Combinator alumni, AngelList Series A+, sector-specific startup lists |

### Refresh Cadence

**Scheduled Refresh**
- Full database re-audit quarterly
- Aligns with locked Section 1 quarterly tier re-evaluation
- All 1,000 baseline companies on same cadence

**Event-Triggered Re-Audit**
- Funding rounds (especially Series C+)
- IPO events
- Acquisitions (target or acquirer)
- Leadership changes (CEO, CHRO)
- Headcount crossing tier boundary
- Major layoff announcements
- Material rebrand

### Database Schema (Per Company)

**Core Identity**
- Company name (canonical), canonical URL, headquarters location
- Tier classification (T1-T4), assignment date and method
- Industry classification
- PDL company ID for reference
- Fortune ranking (if applicable)
- Public/private status

**Audit Results (Per Audit Cycle)**
- Audit timestamp (critical for time-series)
- Overall composite score (0-100)
- D1-D5 individual scores
- Grade label
- Catastrophic failure flags
- Tier-relative percentile (when calculable)

**Dimension Detail (Per Audit Cycle)**
- D1: Schema markers passed/failed (per-item granularity)
- D2: Metadata block completeness, content quality sub-scores, JD audit results
- D3: TSOV composite, sentiment distribution, source diversity
- D4: Continuity indicator status, divergence flags, theme alignment %
- D5: Distribution maturity tier, vulnerability assessment, agentic readiness

**Methodology Metadata**
- Data sources used
- Data completeness percentage
- Confidence flags
- Edge case handling applied

**Recommendation History**
- Recommendations generated this audit
- Recommendations from prior audits
- Outcome tracking (did the company implement?)

### Anonymization & External Use

**Customer-Facing Reports**
- Company sees THEIR data + aggregate context
- "[Company Name] ranks in the top X% of T2 companies"
- Aggregate context never identifies specific peer companies

**Public/Marketing Use (V2 MVP)**
- Aggregate statistics only
- No company names referenced
- Examples: "60% of Fortune 6000 companies lack agentic readiness"

### Strategic Sequencing

| Phase | Purpose |
|---|---|
| V2 MVP (Launch) | Internal asset + Customer value + Sales tool |
| Post-Baseline Established (~500+ companies) | Investor proof of market coverage and protocol maturity |
| V2.5 | Public thought leadership through aggregate insights |
| Future Product Roadmap | TalentGEO Index subscription product; sector-specific reports; analyst-style benchmarking |

### Data Quality Standards

Locked approach: Include with flagging, not exclude. Real-world data is imperfect. Excluding flagged data creates survivorship bias in the baseline.
- Data completeness percentage per audit
- Confidence-weighted contribution to aggregate calculations
- "In transition" flags for companies experiencing major changes
- Ambiguous tier classification noted
- Below 50% data completeness = excluded from baseline calculations but retained as reference

### Database Implementation Questions (PARKED FOR JR)

> **CRITICAL TECHNICAL DECISIONS REQUIRING JR'S EXPERTISE:** Section 6 locks the data model, refresh cadence, and strategic requirements. Implementation architecture decisions are CTO's domain. Implementation choices should support both V2 MVP scale (~1,000 companies) AND graceful scaling to full coverage (~17,500 companies).

1. **Database Technology Selection** — Options: Postgres on GCP Cloud SQL, Firestore, BigQuery, or hybrid architecture. What database technology best fits TalentGEO's current GCP stack and scale projections (1,000 → 17,500 companies, with 4 audits/year = 4,000 → 70,000 audit records annually)?

2. **Query Pattern Optimization** — Tier-relative percentile calculation requires efficient tier + score range queries. Time-series queries require efficient company + date range retrieval. What indexing strategy and query patterns will support the comparative analysis features locked in Section 5?

3. **Time-Series Data Architecture** — Audit history per company needs efficient retrieval for comparative reports. Historical data must persist long-term (per Section 5 V2 MVP requirement). Single table with timestamped audits, or separate audit_results table with company foreign key? Cold storage strategy for older audits?

4. **Scale Planning** — V2 MVP: ~1,000 companies, ~4,000 audits/year. Full coverage: ~17,500 companies, ~70,000 audits/year. What storage and compute architecture scales gracefully from MVP to full coverage without re-architecting?

5. **Integration with TalentGEO Application** — Customer-facing comparative context surfaced in reports. Real-time vs. cached aggregate calculations. How does the database surface in the customer experience? What's the read/write pattern for live audit + comparison generation?

---

## § 7 UTP Discovery Semantics

> **CRITICAL SCOPE FRAMING:** V2 publishes UTP as a set of recommendations, not mandates. Cassillon AI lacks the market authority to enforce protocol compliance from LLM tools or employers. The right posture is to publish UTP as comprehensive recommendations, implement UTP-compliant behavior in Cassillon AI's own products, and work over time to gain industry alignment and adoption.

### Publishing Pattern (Hybrid Approach)

**Primary: /.well-known/utp Endpoint**
- Employers publish UTP profile at `https://[company-domain]/.well-known/utp`
- Returns JSON document with tier declaration, capabilities, endpoints, signing keys
- LLM tools query the endpoint to discover UTP support
- Follows UCP architectural pattern (proven reverse-domain governance + profile discovery model)

**Secondary: Schema.org Organization Extension**
- Employers embed UTP-relevant data in existing schema.org Organization markup
- Provides backward compatibility for tools not yet aware of UTP-specific endpoints
- Lower friction for initial adoption (no new endpoint required)

**Discovery Logic for LLM Tools**
- Check `/.well-known/utp` first for full UTP support
- Fall back to schema.org Organization markup for partial UTP signal
- Full UTP capability negotiation requires `/.well-known/utp`

### UTP Profile Contents (V2 Reference Structure)

| Section | Contents |
|---|---|
| utp_version | Protocol version date (YYYY-MM-DD format) |
| employer.name | Canonical company name |
| employer.canonical_url | Career site URL |
| employer.tier | Tier (T1-T4), headcount, revenue range, public/private, funding stage, assignment method, validation dates |
| employer.industry | Industry classification |
| employer.headquarters_location | Geographic location |
| capabilities | supports_tier_filtering, supports_segment_discovery, supports_agentic_application, spam_defense_enabled (booleans) |
| endpoints | job_listings_api, job_listings_feed, career_site URLs |
| signing_key | Public key URL for profile authenticity verification |
| supported_versions | Array of UTP protocol versions supported |

### Recommendations for LLM Tools (Tier-Related Behaviors)

UTP V2 recommends LLM tools should:
- Honor employer tier declarations from UTP profiles (avoid overriding company tier classification)
- Honor explicit tier mentions in seeker queries (e.g., "I want a startup" → filter to T1)
- Honor explicit tier exclusions (e.g., "I don't want a Fortune 500" → exclude T4)
- Allow seekers to override tier filters
- Disclose when tier filtering has been applied (transparency)

### Recommendations for LLM Tools (Bias Guardrails)

> **NON-NEGOTIABLE PRINCIPLES:** Cassillon AI implements these in its own products and advocates for them across the industry.

- Do NOT use demographic data to infer tier preference
- Do NOT use seeker career history to infer tier preference without explicit consent
- Do NOT use platform browsing behavior as tier inference signal
- Inference should be based only on prompt language and verified data

### Recommendations for LLM Tools (Transparency)

- Be able to explain why a seeker saw certain results (audit-able inference logic)
- Surface UTP compliance status to seekers (e.g., "Companies marked ✓ are UTP-verified")
- Prefer UTP-compliant companies when results are otherwise equivalent
- Provide tier filter UI for seeker override
- Respect employer-published agentic readiness signals
- Link to UTP profile for transparency to seekers who want context

### Recommendations for LLM Tools (Data Integrity)

- Verify UTP profile authenticity via signing key (where present)
- Handle missing UTP data gracefully (return results; don't claim UTP compliance for companies without UTP data)
- Respect employer-declared signal defense status (treat agentic application channels cautiously when spam_defense_enabled is false)

### Capability Negotiation Pattern (UCP-Aligned)

Light implementation in V2:
- Employer publishes capabilities block in UTP profile
- LLM tool publishes its supported UTP capabilities
- Intersection of capabilities = features both parties mutually support
- Discovery operates within that intersection

*Example:*
- Employer supports: tier_filtering, segment_discovery, signal_defense_declaration
- LLM tool supports: tier_filtering, segment_discovery, agentic_application
- Intersection: tier_filtering, segment_discovery
- LLM uses these capabilities; does NOT attempt agentic application

### Versioning & Governance

- Format: YYYY-MM-DD (UCP-aligned)
- V2 launch version: 2026-MM-DD (set at actual launch)
- Backward-compatible changes: additive only
- Breaking changes: require new version date

**Reserved Capability Namespace:** `ai.cassillon.utp.*` for V2

**V2 MVP Transports:** REST (primary) + Schema.org (secondary)

**V2.5+ Transports (Deferred):** MCP, A2A, Embedded Protocol

### Core Business Challenge Flagged

> **STRATEGIC IMPERATIVE:** Earning adoption of UTP recommendations from LLM tools is one of the most important things Cassillon AI must accomplish to reach the north star. This is a market positioning, advocacy, and partnership challenge — not a protocol design problem.

- Thought leadership, AMEC alignment, AEO/GEO community engagement matter
- Partnerships with LLM tools, ATSs, recruiting platforms accelerate adoption
- Customer advocacy ("we want our LLM tools to be UTP-compliant") drives bottom-up adoption
- Standards body engagement may become relevant post-traction

---

## § 8 Open Questions & Parking Lot Consolidation

### Classification Framework

Five buckets for parked items:
1. **V2.5 Iteration** — Refinements to existing V2 features once baseline data exists
2. **V3+ Roadmap** — Features deferred to future protocol versions
3. **Implementation Decisions for JR** — Technical architecture choices
4. **Empirical Validation Required** — Items that need real-world data before locking
5. **Separate Product Scoping** — New products requiring their own scope and roadmap work

### Bucket 1: V2.5 Iteration (Refinements Post-Baseline)

**Section 1 (Tier Definition)**
- Crunchbase API integration for funding stage as hybrid anchor
- Edge case handling refinement for non-traditional companies

**Section 2 (Scoring)**
- Empirical weight refinement for D1-D5 dimensions per tier
- Threshold calibration for "Good" / "Excellent" tiers
- Industry × Tier matrix granularity

**Section 4 (Dimensions)**
- D1: Empirical weight refinement; ATS-specific quirks
- D2: Career site sub-protocol detail; JD vs. career site weighting within D2; Three non-negotiables enforceability testing
- D3: Empirical TSOV benchmark refinement; Authority classification taxonomy refinement; Trend tracking; Suspicious downstream pattern detection; International audit expansion
- D4: Empirical threshold refinement for continuity indicator; Trend tracking for continuity
- D5: Penalty/bonus calibration for signal quality × agentic readiness linkage; Channel inventory empirical refinement per tier; ATS-specific deep audit; Real-time hiring tracking

**Section 5 (Scoring & Reporting)**
- Exact hex codes for new color palette
- DOCX template design implementation
- Intra-tier ranking display; Cross-tier context display

**Section 6 (Baseline Database)**
- Phase 2 expansion: ~1,000 → ~5,000 companies
- Opt-in identification UI/UX
- Legal review for public-company naming approach

**Section 7 (UTP Discovery)**
- V2 launch version date confirmation
- Detailed capability negotiation algorithms

### Bucket 2: V3+ Roadmap (Future Protocol Versions)

**Section 3 (Seeker Intent Inference) — Entire Section Deferred**
- All intent inference features pending empirical seeker prompt data
- Prerequisites: Empirical seeker prompt behavior data; Build/Buy/Partner decision for prompt monitoring tooling; Seeker prompt taxonomy development; Dominant signal pattern identification

**Section 6 (Baseline Database)**
- Phase 3 expansion: ~5,000 → ~17,500 companies
- Subscription product (TalentGEO Index)

**Section 7 (UTP Discovery)**
- MCP transport implementation
- A2A transport implementation
- External UTP spec publication (post ~100-company benchmark)
- Open governance model transition

### Bucket 3: Implementation Decisions for JR

> **CTO DOMAIN:** These items are architectural choices requiring technical expertise.

- Database & Storage: Technology selection, query pattern optimization, time-series storage architecture, cold storage strategy, scale planning architecture, integration with TalentGEO application
- Dimension-Specific Implementation: D1 tooling decision; D2 User-URL → Claude analysis pipeline; D3 OSINT partnership decisions; D5 full-scope data collection feasibility testing
- Data Persistence: Specific architecture for V2 MVP time-series comparative data requirement

### Bucket 4: Empirical Validation Required

**Thresholds Requiring Empirical Validation**
- "Good" performance thresholds per tier (50/65/70/75 starting points)
- Dimension-specific weights per tier
- TSOV benchmarks per tier
- D4 continuity thresholds
- D5 signal quality × agentic readiness penalty/bonus calibration

**Validation Approach**
- Run baseline audits across 1,000-company sample (Fortune-stratified)
- Observe distributions per tier per dimension
- Empirically anchor thresholds to observed reality
- Refine weights based on what predicts real-world LLM discoverability
- Phase 2 (post-launch Q1): Adjust based on first quarter of data

### Bucket 5: Separate Product Scoping Required

> **PRODUCT ROADMAP OPPORTUNITIES:** Four standalone product opportunities surfaced during V2 architecture work. Each requires its own scope, roadmap, and validation work.

- **Employer Brand Index (EBI)** — Comprehensive employer brand health measurement
- **JD Optimizer** — Auto-applied 7-step fix methodology as paid service
- **Agentic Talent Optimization** — Integrated discoverability + signal defense
- **Spam/Fraud Remediation Protocol** — Likely positioned as UTP standard for ATS providers

---

## Appendix A — Key Achievements & Strategic Discoveries

### Architectural Foundations Established

1. Tier as first-class protocol concept (mandated in UTP schema)
2. Existing UTP JD Audit & Fix Protocol integrated as D2 sub-protocol (no reinvention)
3. Talent Share of Voice (TSOV) methodology adopted from industry-standard SOV
4. D4 reframed as Continuity Indicator with scope discipline (gateway to EBI)
5. D5 reframed with spam/fraud vulnerability + agentic readiness as linked dimensions
6. Time-series comparative data architecture as V2 MVP requirement
7. Anti-bias discipline locked as non-negotiable principle
8. AMEC framework explicitly cited and aligned
9. UCP architectural patterns adapted for UTP

### Strategic Clarifications

1. TalentGEO product/market fit = Fortune 6000 (not Cassillon Group consulting client distribution)
2. UTP published as recommendations in V2 (mandates earned through adoption over time)
3. Four standalone product opportunities identified for separate scoping
4. Brand palette evolution (Cobalt Blue, Platinum, Bronze, Gold)
5. Build/test/replicate methodology maintained throughout

### Anti-Sycophancy Discipline Maintained

- Multiple scope creep moments caught and corrected (D4 brand index territory, D3 employer brand health)
- Agist framing rejected and rebuilt from scratch
- Honest deferrals (Section 3) when empirical grounding doesn't exist
- Empirical validation prioritized over theoretical confidence
- Strategic clarifications surfaced when assumptions didn't align with reality

---

## Appendix B — UTP Product Roadmap (Four Products)

During V2 architecture work, four standalone product opportunities surfaced for separate scoping and roadmap development. Each leverages TalentGEO data infrastructure (lower marginal cost), targets different buyers and price points, and operates in different competitive landscapes.

### Product 1: Employer Brand Index (EBI)

| Attribute | Detail |
|---|---|
| Origin | Section 4 / D4 scope discipline |
| Description | Comprehensive employer brand health measurement |
| Differentiation from TalentGEO | D4 in TalentGEO = Continuity INDICATOR; EBI = Continuity ANALYSIS (statement-level pairing, multi-dimensional sentiment, cultural dimension analysis, root cause diagnosis, trend tracking, comparative benchmarking) |
| Target Market | HR/Talent leadership (different buyer than TA-focused TalentGEO) |
| Pricing Model | Premium subscription |
| Competitive Landscape | Universum, LinkedIn Talent Insights |
| Pathway | D4 surfaces continuity indicators → references EBI as deeper analysis path → natural upsell |
| Status | Requires separate product scope and roadmap development |

### Product 2: JD Optimizer

| Attribute | Detail |
|---|---|
| Origin | Section 4 / D2 implementation |
| Description | Auto-applied 7-step fix methodology as paid service |
| Relationship to TalentGEO | D2 audit identifies JD gaps → JD Optimizer auto-generates optimized JDs |
| Pricing Model | Paid service/upsell from audit |
| Status | Requires product brief; minimum viable scope already defined in D2 work; needs go-to-market plan |

### Product 3: Agentic Talent Optimization with Anti-Fraud Protection

| Attribute | Detail |
|---|---|
| Origin | Section 4 / D5 reframe |
| Description | Integrated discoverability + signal defense |
| Reasoning | Companies that become agentic-ready without anti-fraud protection face overwhelming spam/bot/fraud volume |
| Strategic Path A | Build integrated agentic optimization + anti-fraud product (Cassillon AI offering) |
| Strategic Path B | Position as UTP standard element; lobby ATS providers (Workday/Greenhouse/Lever/Ashby/Rippling) to adopt as native capability |
| Current Lean | Option B (standards advocacy) to avoid burden of building integration product |
| Status | Requires strategic decision (build vs. lobby), then product scoping if Option A or advocacy plan if Option B |

### Product 4: Spam/Fraud Remediation Protocol

| Attribute | Detail |
|---|---|
| Origin | Section 4 / D5 |
| Description | Standalone protocol/framework for spam/fraud detection in recruiting |
| Likely Positioning | UTP standard for ATS providers to adopt rather than building product ourselves |
| Relationship to Product 3 | Closely related — likely the standards-advocacy version |
| Status | Requires scope and adoption strategy |

### Cross-Product Considerations

- All four leverage TalentGEO data infrastructure (lower marginal cost)
- Different buyers, different price points, different competitive landscapes
- Sequencing matters: TalentGEO MVP validation first, then product expansion
- Total addressable market for product suite significantly exceeds TalentGEO alone

---

## Appendix C — Recommended Next Steps

### Immediate (June 22, 2026)

1. Deliver this V2 documentation to JR with the implementation question articulation from Section 6
2. JR translates Section 4 (Five Dimensions) into product requirements
3. JR addresses architecture questions from Section 6 (database, scale, query patterns)

### This Week

4. JR begins V2 implementation work
5. Section 6 baseline audit company list curation (1,000 companies stratified)
6. Cobalt/Platinum/Bronze/Gold color palette design implementation
7. Initial baseline audit pilot runs (10-25 companies for pipeline validation)

### Near Term

8. Phase 1 baseline audits (1,000 companies via Fortune-weighted sampling)
9. Empirical threshold refinement based on observed data
10. V2 MVP launch
11. Begin separate product scoping work (EBI, JD Optimizer, Agentic Talent Optimization, Spam/Fraud Remediation)

### Strategic Open Items

- UTP advocacy strategy for industry adoption (separate business work)
- Build/buy/partner decision for prompt monitoring tooling (unlocks Section 3)
- Strategic decision: Build vs. lobby for Agentic Talent Optimization product
- Legal review for public-company naming approach (V2.5+)

---

> **FINAL NOTE:** V2 architecture is complete. All eight sections are locked. This document is the canonical reference for implementation. The protocol is grounded in empirical research, established industry frameworks, validated field feedback, and disciplined scope.

*Cassillon AI — Internal / Proprietary*
