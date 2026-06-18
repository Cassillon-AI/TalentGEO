Dimension Functionality Explained
TalentGEO · Cassillon AI
Last updated: 2026-06-17
================================================================================

This document explains what each of the five audit dimensions actually does in
the code, in plain English. It is a living document — update it whenever the
logic for a dimension changes in backend/server.js or the scoring weights change
in the Claude prompt.

Composite score weights: D1 25% · D2 20% · D3 20% · D4 20% · D5 15%
Score tiers: Critical (0–25) · Developing (26–50) · Established (51–75) · Leading (76–100)


────────────────────────────────────────────────────────────────────────────────
D1 — Schema Integrity                                                  Weight: 25%
────────────────────────────────────────────────────────────────────────────────

WHAT IT IS
Checks whether each job posting page has properly implemented Schema.org
JobPosting structured data (JSON-LD). This is the machine-readable metadata
that tells Google for Jobs, AI crawlers, and LLMs what a job posting is about.

WHAT THE CODE DOES
1. Fetches the HTML of each job posting URL the user provided.
2. Finds every <script type="application/ld+json"> block in the page.
3. Looks for a block with "@type": "JobPosting" — including inside @graph arrays.
4. If found, checks for 5 required fields and 8 recommended fields:

   Required (10 pts each, max 50 pts):
     - title
     - description
     - datePosted
     - hiringOrganization
     - jobLocation

   Recommended (6.25 pts each, max 50 pts):
     - baseSalary
     - employmentType
     - validThrough
     - jobLocationType
     - applicantLocationRequirements
     - identifier
     - jobBenefits
     - experienceRequirements

5. The raw score is the sum of points for present fields (max 100).

IF GOOGLE SEARCH CONSOLE IS CONNECTED
Real impression and click data for job pages (last 90 days) is pulled from the
GSC Search Analytics API and sent to Claude as additional context. Claude uses
this to add specific numbers to D1 findings (e.g. "0 impressions in 90 days
suggests Google for Jobs is not indexing these pages").

HOW CLAUDE USES IT
Claude receives the structured schema audit results and any GSC data, then
writes the final D1 score and three specific findings. Claude can adjust the
score slightly based on overall context but must reference real data.

WHEN TO UPDATE THIS DOCUMENT
- The required or recommended field lists change
- The per-field point values change
- GSC data is added to or removed from D1 context


────────────────────────────────────────────────────────────────────────────────
D2 — Career Site Hygiene                                               Weight: 20%
────────────────────────────────────────────────────────────────────────────────

WHAT IT IS
Checks whether the career site is technically accessible to AI crawlers and
search engines. A site can have perfect schema and still be invisible if its
robots.txt or sitemap is misconfigured.

WHAT THE CODE DOES
1. Fetches /robots.txt from the root domain and checks:
   - Does any rule block all crawlers (Disallow: /)?
   - Does any rule block /jobs, /careers, or /apply paths specifically?
   - Is there a Sitemap: directive pointing to the sitemap?
   (Only rules applying to * or Googlebot are flagged.)

2. Fetches /sitemap.xml and checks:
   - Does the sitemap exist and parse correctly?
   - Does it contain URLs with job-related paths (/jobs, /careers, /job/, /position)?
   - Does it include <lastmod> dates (so search engines know when content changed)?

3. Both results are passed as structured data to Claude.

IF GOOGLE SEARCH CONSOLE IS CONNECTED
The same GSC impression/click data used for D1 is also available for D2. Claude
uses it to assess whether indexed job page counts match what the sitemap
suggests should be indexed.

HOW CLAUDE USES IT
Claude receives the robots.txt and sitemap audit results plus any GSC coverage
data, then writes the D2 score and findings. Specific issues (e.g. "robots.txt
blocks /careers") are flagged by the code; Claude synthesises them into findings.

WHEN TO UPDATE THIS DOCUMENT
- The paths checked in robots.txt change (/apply, /positions, etc.)
- Sitemap checks are added (e.g. checking for image sitemaps)
- GSC coverage data is added to or removed from D2 context


────────────────────────────────────────────────────────────────────────────────
D3 — Job Posting Content                                               Weight: 20%
────────────────────────────────────────────────────────────────────────────────

WHAT IT IS
Checks whether the written content of job postings is structured in a way that
LLMs and AI search engines can understand and cite. This is about the human-
readable text, not the schema metadata.

WHAT THE CODE DOES
The code strips all HTML tags from the fetched job page and scores the visible
text against 8 signals. Each signal has a fixed weight (shown below):

   Signal                        Weight   What triggers it
   ─────────────────────────────────────────────────────────────────────
   Compensation transparency      30 pts  Mentions a dollar amount OR keywords
                                          like "salary", "pay range", "OTE"
   Location clarity               15 pts  Mentions "remote", "hybrid", "on-site",
                                          or a recognisable US city+state
   Employment type                10 pts  Mentions "full-time", "contract",
                                          "1099", "W-2", etc.
   Word count quality             10 pts  Scales from 150 to 400 words (ideal);
                                          above 900 words gets a 50% penalty
   Answer-first structure         10 pts  First 30% of text contains a role
                                          overview, summary, or "what you'll do"
   Requirements vs. responsibilities 10 pts  Page has BOTH a responsibilities
                                          section AND a requirements section
   Benefits signals                8 pts  Mentions benefits, 401k, PTO, equity,
                                          parental leave, etc.
   Readability                     7 pts  Has bullet/line structure (>5 line
                                          breaks) AND fewer than 3 corporate
                                          jargon words (rockstar, ninja, etc.)
   ─────────────────────────────────────────────────────────────────────
   Maximum possible               100 pts

Each URL provided by the user is scored independently. The D3 dimension score
is the average across all scored URLs.

HOW CLAUDE USES IT
The code sends Claude the per-URL scores, word counts, and lists of passing and
failing signals. Claude is instructed to use the code-computed average as the
D3 score and reference specific signal failures in its findings.

WHEN TO UPDATE THIS DOCUMENT
- Any signal weight in D3_CONFIG.weights changes
- A new signal is added or an existing one is removed
- The word count thresholds change
- The jargon keyword list changes


────────────────────────────────────────────────────────────────────────────────
D4 — Employer Brand Signals                                            Weight: 20%
────────────────────────────────────────────────────────────────────────────────

WHAT IT IS
Checks how the employer is talked about publicly — specifically on Reddit —
as a signal of candidate sentiment and brand authority. A company that candidates
actively discuss (positively) is more likely to be cited by LLMs.

WHAT THE CODE DOES
1. Searches Reddit's public RSS feeds (no API key required) for the brand name:
   - Broad search: brand name, sorted by relevance, last 12 months, up to 25 posts
   - Targeted search: brand name + "employer", up to 15 additional posts
   - Deduplicates results by URL

2. For each post title, keyword matching classifies sentiment:
   - Positive keywords: great, excellent, recommend, transparent, supportive, etc.
   - Negative keywords: avoid, toxic, ghosted, layoffs, underpaid, red flag, etc.
   - A post matching both is classified as "mixed"

3. Posts are prioritised if they mention the brand by name OR appear in
   candidate-focused subreddits (cscareerquestions, recruitinghell, jobs,
   careerguidance, jobsearchhacks, ExperiencedDevs, datascience, engineering).

4. A suggested D4 score is computed from three components:
   - Sentiment ratio score (0–60 pts): baseline 30, +ve ratio adds up, -ve ratio subtracts
   - Volume score (0–20 pts): 5+ mentions = 10, 10+ = 15, 20+ = 20
   - Candidate subreddit presence (0–20 pts): 20 if found in those subreddits, else 5
   Maximum possible: 100. If no mentions found: suggested score is 45 (neutral baseline).

HOW CLAUDE USES IT
Claude receives the full sentiment breakdown, top post titles, subreddit list, and
the suggested score. Claude may adjust the score up or down based on brand size,
industry context, or post recency, and must reference specific post titles or
subreddits in the D4 findings.

WHEN TO UPDATE THIS DOCUMENT
- The subreddit list changes
- Positive or negative keyword lists change
- The scoring formula (sentiment/volume/subreddit weights) changes
- Reddit is replaced or supplemented by another data source


────────────────────────────────────────────────────────────────────────────────
D5 — Distribution Coverage                                             Weight: 15%
────────────────────────────────────────────────────────────────────────────────

WHAT IT IS
Checks how broadly the employer's jobs are distributed across the major job
platforms and AI discovery surfaces. Having great job postings means nothing if
they only live on one platform.

WHAT THE CODE DOES
D5 is the most Claude-driven dimension. The code does not independently fetch
platform data. Instead:

1. If the user selected ATS platform(s) during the audit (e.g. Greenhouse,
   Workday, Lever), those platform names are passed to Claude with a specific
   instruction to give tailored, ATS-specific advice covering:
   - Schema or structured data requirements for that ATS
   - Feed configuration settings that affect Google for Jobs eligibility
   - Known indexing quirks or limitations
   - Posting visibility or template settings candidates and crawlers commonly miss

2. If no ATS is selected, Claude is instructed to provide general distribution
   coverage advice.

3. Claude also assesses the signals array (Google for Jobs, LinkedIn, Glassdoor,
   Indeed, Schema.org, Bing) based on the overall audit context.

HOW CLAUDE USES IT
Claude writes the D5 score and findings almost entirely from its own knowledge
of the selected ATS platforms and general distribution best practices. The score
here is more advisory than data-driven.

WHEN TO UPDATE THIS DOCUMENT
- Real platform data fetching is added (e.g. checking if jobs appear in Google
  for Jobs via the Indexing API)
- The ATS platform list in the UI changes
- The instructions passed to Claude for D5 change significantly
