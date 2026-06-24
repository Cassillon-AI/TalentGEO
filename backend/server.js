const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const db = require('./db');
const { upsertCompany, saveAudit } = require('./auditRepository');
const { classifyTier } = require('./tierClassifier');

const app = express();
const PORT = process.env.PORT || 8080;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://talentgeo-frontend-360027703478.us-central1.run.app';

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Talent GEO Audit API v5' });
});

app.get('/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW() AS time');
    res.json({ status: 'ok', db: 'connected', time: result.rows[0].time });
  } catch (err) {
    console.error('Health check DB error:', err.message);
    res.status(503).json({ status: 'error', db: 'unavailable', error: err.message });
  }
});


// ─── D4: REDDIT RSS FETCHER ───────────────────────────────────────────────────
// Uses Reddit's public RSS feeds — no credentials, no API approval required.
// Reddit explicitly supports RSS as a no-auth access method.
// We get post titles, subreddit, date, and URL — sufficient for sentiment scoring.

const D4_SUBREDDITS = [
  'cscareerquestions',
  'recruitinghell',
  'jobs',
  'careerguidance',
  'jobsearchhacks',
  'ExperiencedDevs',
  'datascience',
  'engineering'
];

function parseRedditRSS(xml) {
  // Extract <entry> blocks (Atom format Reddit uses)
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];

    // Title — strip CDATA if present
    const titleMatch = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';

    // Link href
    const linkMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
    const url = linkMatch ? linkMatch[1] : '';

    // Subreddit — extract from URL path (/r/subredditname/)
    const subredditMatch = url.match(/reddit\.com\/r\/([^/]+)/i);
    const subreddit = subredditMatch ? subredditMatch[1] : '';

    // Date
    const dateMatch = block.match(/<updated>([\s\S]*?)<\/updated>/i);
    const created = dateMatch ? dateMatch[1].trim().split('T')[0] : null;

    if (title) entries.push({ title, url, subreddit, created });
  }
  return entries;
}

async function fetchRedditSignals(brand) {
  const results = {
    success: false,
    totalMentions: 0,
    posts: [],
    subredditsFound: [],
    sentimentBreakdown: { positive: 0, negative: 0, neutral: 0 },
    topSignals: [],
    error: null
  };

  const RSS_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; TalentGEO/1.0)',
    'Accept': 'application/rss+xml, application/atom+xml, text/xml, */*'
  };

  try {
    // RSS Feed 1: broad Reddit search
    const broadUrl = `https://www.reddit.com/search.rss?q=${encodeURIComponent(brand)}&sort=relevance&t=year&limit=25`;
    const broadRes = await fetch(broadUrl, { headers: RSS_HEADERS, timeout: 10000 });

    if (!broadRes.ok) {
      results.error = `Reddit RSS returned ${broadRes.status}`;
      return results;
    }

    const broadXml = await broadRes.text();
    const broadEntries = parseRedditRSS(broadXml);

    // RSS Feed 2: brand + employer/company search for candidate context
    let targetedEntries = [];
    try {
      const targetedUrl = `https://www.reddit.com/search.rss?q=${encodeURIComponent(brand + ' employer')}&sort=relevance&t=year&limit=15`;
      const targetedRes = await fetch(targetedUrl, { headers: RSS_HEADERS, timeout: 8000 });
      if (targetedRes.ok) {
        const targetedXml = await targetedRes.text();
        targetedEntries = parseRedditRSS(targetedXml);
      }
    } catch (e) {
      // Non-fatal — broad results are sufficient
    }

    // Deduplicate by URL
    const seen = new Set();
    const allEntries = [...broadEntries, ...targetedEntries].filter(e => {
      if (!e.url || seen.has(e.url)) return false;
      seen.add(e.url);
      return true;
    });

    if (allEntries.length === 0) {
      results.success = true;
      results.totalMentions = 0;
      results.note = 'No Reddit mentions found — brand may be too new, niche, or not discussed publicly.';
      return results;
    }

    // Sentiment keyword detection on title text
    const positiveKeywords = /\b(great|excellent|amazing|love|fantastic|awesome|recommend|best|positive|impressed|helpful|transparent|fair|good culture|good pay|benefits|growth|collaborative|innovative|supportive|exciting|opportunity|strong|solid|reputable|trusted)\b/i;
    const negativeKeywords = /\b(avoid|terrible|awful|worst|toxic|nightmare|scam|run away|layoffs|underpaid|overworked|micromanage|poor management|bad culture|no work.?life|burnout|red flag|ghost|ghosted|recruiter issues|bait and switch|misleading|shady|hostile|chaotic|disorganized|low pay|underpay)\b/i;

    const processedEntries = allEntries.map(e => {
      const text = e.title.toLowerCase();
      const isPositive = positiveKeywords.test(text);
      const isNegative = negativeKeywords.test(text);

      let sentiment = 'neutral';
      if (isPositive && !isNegative) sentiment = 'positive';
      else if (isNegative && !isPositive) sentiment = 'negative';
      else if (isNegative && isPositive) sentiment = 'mixed';

      return { ...e, title: e.title.substring(0, 120), sentiment };
    });

    // Prioritize posts that mention the brand by name or are from candidate subreddits
    const brandLower = brand.toLowerCase();
    const relevantEntries = processedEntries.filter(e =>
      e.title.toLowerCase().includes(brandLower) ||
      D4_SUBREDDITS.includes((e.subreddit || '').toLowerCase())
    );

    const finalEntries = relevantEntries.length >= 3 ? relevantEntries : processedEntries.slice(0, 20);

    // Tally sentiment
    finalEntries.forEach(e => {
      if (e.sentiment === 'positive') results.sentimentBreakdown.positive++;
      else if (e.sentiment === 'negative') results.sentimentBreakdown.negative++;
      else results.sentimentBreakdown.neutral++;
    });

    results.subredditsFound = [...new Set(finalEntries.map(e => e.subreddit).filter(Boolean))];
    results.posts = finalEntries.slice(0, 8); // top 8 for Claude prompt
    results.totalMentions = finalEntries.length;
    results.success = true;

    // Build signal summaries for Claude
    const negPosts = finalEntries.filter(e => e.sentiment === 'negative');
    const posPosts = finalEntries.filter(e => e.sentiment === 'positive');

    if (negPosts.length > 0) results.topSignals.push({ type: 'negative', count: negPosts.length, topPost: negPosts[0].title });
    if (posPosts.length > 0) results.topSignals.push({ type: 'positive', count: posPosts.length, topPost: posPosts[0].title });

    const candidateSubreddits = finalEntries
      .filter(e => D4_SUBREDDITS.includes((e.subreddit || '').toLowerCase()))
      .map(e => e.subreddit);
    if (candidateSubreddits.length > 0) {
      results.topSignals.push({ type: 'candidate_subreddit_presence', subreddits: [...new Set(candidateSubreddits)] });
    }

  } catch (e) {
    results.error = e.message;
    results.success = false;
  }

  return results;
}

// ─── D4: SENTIMENT SCORING ────────────────────────────────────────────────────
// Produces a 0–100 score from Reddit signal data.
// This score is passed to Claude as a suggested D4 score — Claude can adjust
// based on the full context (brand size, industry, post quality, etc.)

function calculateDataCompleteness(opts) {
  // Each data source is one slot. Completeness = filled slots / total slots × 100.
  // Job URLs each count as one slot; if none provided they are excluded from total.
  const { robotsFound, sitemapFound, careerSiteSuccess, redditSuccess, jobResults } = opts;

  const slots = [
    { name: 'robots.txt',   filled: robotsFound },
    { name: 'sitemap.xml',  filled: sitemapFound },
    { name: 'career site',  filled: careerSiteSuccess },
    { name: 'reddit',       filled: redditSuccess },
    ...jobResults.map((r, i) => ({ name: `job-url-${i + 1}`, filled: r.success })),
  ];

  const total = slots.length;
  const filled = slots.filter(s => s.filled).length;
  const pct = Math.round((filled / total) * 100);
  const scoreStatus = pct < 70 ? 'provisional' : 'final';

  return { pct, scoreStatus, filled, total };
}

function scoreD4Sentiment(redditData) {
  // If Reddit fetch failed entirely, return null so Claude scores D4 as inferred
  if (!redditData || !redditData.success) return null;

  // No mentions found — neutral baseline, not penalized heavily
  // (small companies may simply not be discussed)
  if (redditData.totalMentions === 0) {
    return {
      suggestedScore: 45,
      basis: 'no_mentions',
      note: 'No Reddit mentions found. Brand may be small/niche. Neutral baseline applied.'
    };
  }

  const { positive, negative, neutral } = redditData.sentimentBreakdown;
  const total = positive + negative + neutral;

  // Sentiment ratio score (0–60 points)
  const positiveRatio = positive / total;
  const negativeRatio = negative / total;
  const sentimentScore = Math.round((positiveRatio * 60) - (negativeRatio * 40));
  const clampedSentiment = Math.max(0, Math.min(60, sentimentScore + 30)); // baseline 30

  // Volume score (0–20 points) — more mentions = more brand authority signal
  let volumeScore = 0;
  if (redditData.totalMentions >= 20) volumeScore = 20;
  else if (redditData.totalMentions >= 10) volumeScore = 15;
  else if (redditData.totalMentions >= 5) volumeScore = 10;
  else volumeScore = 5;

  // Candidate subreddit presence (0–20 points)
  const inCandidateSubreddits = redditData.topSignals.some(s => s.type === 'candidate_subreddit_presence');
  const candidatePresenceScore = inCandidateSubreddits ? 20 : 5;

  const total_score = Math.min(100, Math.round(clampedSentiment + volumeScore + candidatePresenceScore));

  return {
    suggestedScore: total_score,
    basis: 'reddit_signals',
    sentimentRatio: { positive: positiveRatio.toFixed(2), negative: negativeRatio.toFixed(2) },
    volumeScore,
    candidatePresenceScore
  };
}

// ─── DATA FETCHING UTILITIES ──────────────────────────────────────────────────

async function fetchHTML(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TalentGEO-Audit/1.0; +https://cassillon.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 10000
    });
    if (!res.ok) return { success: false, status: res.status, html: null };
    const html = await res.text();
    return { success: true, status: res.status, html };
  } catch (e) {
    return { success: false, error: e.message, html: null };
  }
}

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TalentGEO-Audit/1.0)' },
      timeout: 8000
    });
    if (!res.ok) return { success: false, status: res.status, text: null };
    const text = await res.text();
    return { success: true, status: res.status, text };
  } catch (e) {
    return { success: false, error: e.message, text: null };
  }
}

function extractJSONLD(html) {
  if (!html) return [];
  const blocks = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      blocks.push(parsed);
    } catch (e) {
      blocks.push({ parseError: true, raw: match[1].trim().substring(0, 200) });
    }
  }
  return blocks;
}

function findOrganizationSchema(blocks) {
  const orgTypes = new Set(['Organization', 'Corporation', 'LocalBusiness']);
  for (const block of blocks) {
    if (!block || block.parseError) continue;
    if (block['@graph']) {
      const org = block['@graph'].find(item => item && orgTypes.has(item['@type']));
      if (org) return org;
    }
    if (orgTypes.has(block['@type'])) return block;
    if (Array.isArray(block)) {
      const org = block.find(item => item && orgTypes.has(item['@type']));
      if (org) return org;
    }
  }
  return null;
}

function findJobPostingSchema(blocks) {
  for (const block of blocks) {
    if (!block || block.parseError) continue;
    if (block['@graph']) {
      const job = block['@graph'].find(item => item['@type'] === 'JobPosting');
      if (job) return job;
    }
    if (block['@type'] === 'JobPosting') return block;
    if (Array.isArray(block)) {
      const job = block.find(item => item && item['@type'] === 'JobPosting');
      if (job) return job;
    }
  }
  return null;
}

function auditJobPostingSchema(schema) {
  if (!schema) return { present: false, fields: {}, score: 0, gaps: [] };

  const required = ['title', 'description', 'datePosted', 'hiringOrganization', 'jobLocation'];
  const recommended = ['baseSalary', 'employmentType', 'validThrough', 'jobLocationType',
    'applicantLocationRequirements', 'identifier', 'jobBenefits', 'experienceRequirements'];

  const fields = {};
  const gaps = [];

  required.forEach(f => {
    fields[f] = { present: !!schema[f], required: true, value: schema[f] ? String(schema[f]).substring(0, 100) : null };
    if (!schema[f]) gaps.push({ field: f, priority: 'required', impact: 'high' });
  });

  recommended.forEach(f => {
    fields[f] = { present: !!schema[f], required: false, value: schema[f] ? String(schema[f]).substring(0, 100) : null };
    if (!schema[f]) gaps.push({ field: f, priority: 'recommended', impact: 'medium' });
  });

  const requiredScore = required.filter(f => schema[f]).length * 10;
  const recommendedScore = recommended.filter(f => schema[f]).length * 6.25;
  const score = Math.round(requiredScore + recommendedScore);

  return { present: true, fields, score, gaps, schemaType: schema['@type'] };
}

function auditPageMeta(html) {
  if (!html) return { canonical: false, metaTitle: false, metaDescription: false, ogTags: false, hreflang: false };
  return {
    canonical: /<link[^>]+rel=["']canonical["']/i.test(html),
    metaTitle: /<title[^>]*>[^<]+<\/title>/i.test(html),
    metaDescription: /<meta[^>]+name=["']description["']/i.test(html),
    ogTags: /<meta[^>]+property=["']og:/i.test(html),
    hreflang: /<link[^>]+hreflang=/i.test(html)
  };
}

// LLM crawler user-agent strings to check for explicit blocks in robots.txt
const LLM_BOT_AGENTS = ['gptbot', 'claude-web', 'claudebot', 'anthropic-ai', 'perplexitybot', 'cohere-ai'];

// D1 tier-specific category weights per UTP V2 spec §3.1
const D1_CATEGORY_WEIGHTS = {
  1: { core: 1.00, enhanced: 0.00, advanced: 0.00 },
  2: { core: 0.70, enhanced: 0.30, advanced: 0.00 },
  3: { core: 0.50, enhanced: 0.30, advanced: 0.20 },
  4: { core: 0.40, enhanced: 0.30, advanced: 0.30 },
};

function auditRobotsTxt(text, domain) {
  if (!text) return { found: false, issues: ['robots.txt not found or unreachable'] };

  const issues = [];
  const lines = text.toLowerCase().split('\n');
  let currentAgent = null;
  let blocksAll = false;
  let blocksJobs = false;
  const llmBotsBlocked = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('user-agent:')) {
      currentAgent = trimmed.replace('user-agent:', '').trim();
    }
    if (trimmed.startsWith('disallow:')) {
      const path = trimmed.replace('disallow:', '').trim();
      if (currentAgent === '*' || currentAgent === 'googlebot') {
        if (path === '/' || path === '/*') blocksAll = true;
        if (path.includes('/jobs') || path.includes('/careers') || path.includes('/apply')) blocksJobs = true;
      }
      // Detect LLM-specific crawler blocks
      if (LLM_BOT_AGENTS.includes(currentAgent) && (path === '/' || path === '/*')) {
        if (!llmBotsBlocked.includes(currentAgent)) llmBotsBlocked.push(currentAgent);
      }
    }
  }

  if (blocksAll) issues.push('robots.txt Disallow: / blocks all crawlers from the entire site');
  if (blocksJobs) issues.push('robots.txt blocks /jobs or /careers paths from crawlers');
  if (llmBotsBlocked.length > 0) issues.push(`robots.txt explicitly blocks LLM crawlers: ${llmBotsBlocked.join(', ')}`);
  if (!text.toLowerCase().includes('sitemap')) issues.push('No Sitemap directive found in robots.txt');

  return {
    found: true,
    hasSitemapDirective: text.toLowerCase().includes('sitemap'),
    blocksAll,
    blocksJobs,
    llmBotsBlocked,
    issues,
    snippet: text.substring(0, 500)
  };
}

function auditSitemap(text) {
  if (!text) return { found: false, issues: ['sitemap.xml not found or unreachable'] };

  const issues = [];
  const urlCount = (text.match(/<url>/gi) || []).length;
  const hasJobUrls = text.includes('/jobs') || text.includes('/careers') || text.includes('/job/') || text.includes('/position');
  const hasLastmod = text.includes('<lastmod>');

  if (!hasJobUrls) issues.push('Sitemap does not appear to include job posting URLs');
  if (!hasLastmod) issues.push('No <lastmod> dates in sitemap — search engines cannot determine content freshness');
  if (urlCount === 0) issues.push('Sitemap appears empty or malformed');

  return { found: true, urlCount, hasJobUrls, hasLastmod, issues };
}

function computeD1CategoryScores(jobAudits, careerSiteBlocks, tierResult) {
  const tier = tierResult?.tier || 2;
  const weights = D1_CATEGORY_WEIGHTS[tier];
  const ok = s => s ? '✓' : '✗';

  const successAudits = jobAudits.filter(j => j.fetchSuccess && j.schemaAudit);

  // ── CORE MARKERS ─────────────────────────────────────────────────────────
  const hasJobPosting = successAudits.some(j => j.schemaAudit.present);
  const hasJSONLD = successAudits.some(j => j.jsonldBlockCount > 0);
  const rf = ['title', 'description', 'datePosted', 'hiringOrganization', 'jobLocation'];
  const rfPresence = Object.fromEntries(rf.map(f => [f, successAudits.some(j => j.schemaAudit.present && j.schemaAudit.fields[f]?.present)]));
  const hasCanonical = successAudits.some(j => j.pageMeta?.canonical);
  const hasMetaTags = successAudits.some(j => j.pageMeta?.metaTitle || j.pageMeta?.metaDescription || j.pageMeta?.ogTags);
  const hasOrgSchema = !!findOrganizationSchema(careerSiteBlocks);

  const coreChecks = {
    jobPostingPresent: hasJobPosting,
    jsonLDFormat: hasJSONLD,
    fieldTitle: rfPresence.title,
    fieldDescription: rfPresence.description,
    fieldDatePosted: rfPresence.datePosted,
    fieldHiringOrganization: rfPresence.hiringOrganization,
    fieldJobLocation: rfPresence.jobLocation,
    canonicalUrl: hasCanonical,
    metaTags: hasMetaTags,
    organizationSchema: hasOrgSchema,
  };
  const corePassed = Object.values(coreChecks).filter(Boolean).length;
  const coreTotal = Object.keys(coreChecks).length;
  const coreRate = coreTotal ? corePassed / coreTotal : 0;

  // ── ENHANCED MARKERS ──────────────────────────────────────────────────────
  const ef = ['baseSalary', 'employmentType', 'validThrough', 'applicantLocationRequirements'];
  const efPresence = Object.fromEntries(ef.map(f => [f, successAudits.some(j => j.schemaAudit.present && j.schemaAudit.fields[f]?.present)]));
  const hasBreadcrumb = careerSiteBlocks.some(b => {
    if (!b || b.parseError) return false;
    if (b['@type'] === 'BreadcrumbList') return true;
    return b['@graph']?.some(item => item?.['@type'] === 'BreadcrumbList') || false;
  });

  const enhancedChecks = { ...efPresence, breadcrumbList: hasBreadcrumb };
  const enhancedPassed = Object.values(enhancedChecks).filter(Boolean).length;
  const enhancedTotal = Object.keys(enhancedChecks).length;
  const enhancedRate = enhancedTotal ? enhancedPassed / enhancedTotal : 0;

  // ── ADVANCED MARKERS ──────────────────────────────────────────────────────
  const hasHreflang = successAudits.some(j => j.pageMeta?.hreflang);
  const hasApplyAction = careerSiteBlocks.some(b => {
    if (!b || b.parseError) return false;
    if (b['@type'] === 'ApplyAction') return true;
    return b['@graph']?.some(item => item?.['@type'] === 'ApplyAction') || false;
  });

  const advancedChecks = { hreflang: hasHreflang, applyActionMarkup: hasApplyAction };
  const advancedPassed = Object.values(advancedChecks).filter(Boolean).length;
  const advancedTotal = Object.keys(advancedChecks).length;
  const advancedRate = advancedTotal ? advancedPassed / advancedTotal : 0;

  const suggestedScore = Math.round((coreRate * weights.core + enhancedRate * weights.enhanced + advancedRate * weights.advanced) * 100);
  const noUrls = successAudits.length === 0;

  const lines = [
    `D1 SCHEMA INTEGRITY — CATEGORY-WEIGHTED AUDIT`,
    `T${tier}: Core ${Math.round(weights.core*100)}% / Enhanced ${Math.round(weights.enhanced*100)}% / Advanced ${Math.round(weights.advanced*100)}%`,
    ``,
    `CORE (${corePassed}/${coreTotal} = ${Math.round(coreRate*100)}%) × ${Math.round(weights.core*100)}% weight:`,
    `  JobPosting schema: ${ok(hasJobPosting)} · JSON-LD format: ${ok(hasJSONLD)}`,
    `  Required fields: title ${ok(rfPresence.title)} · description ${ok(rfPresence.description)} · datePosted ${ok(rfPresence.datePosted)} · hiringOrganization ${ok(rfPresence.hiringOrganization)} · jobLocation ${ok(rfPresence.jobLocation)}`,
    `  Canonical URL: ${ok(hasCanonical)} · Meta tags (title/desc/og:*): ${ok(hasMetaTags)} · Organization schema: ${ok(hasOrgSchema)}`,
    ``,
    `ENHANCED (${enhancedPassed}/${enhancedTotal} = ${Math.round(enhancedRate*100)}%) × ${Math.round(weights.enhanced*100)}% weight:`,
    `  baseSalary: ${ok(efPresence.baseSalary)} · employmentType: ${ok(efPresence.employmentType)} · validThrough: ${ok(efPresence.validThrough)} · applicantLocationRequirements: ${ok(efPresence.applicantLocationRequirements)} · BreadcrumbList: ${ok(hasBreadcrumb)}`,
    ``,
    `ADVANCED (${advancedPassed}/${advancedTotal} = ${Math.round(advancedRate*100)}%) × ${Math.round(weights.advanced*100)}% weight:`,
    `  hreflang: ${ok(hasHreflang)} · ApplyAction markup: ${ok(hasApplyAction)}`,
    ``,
    `SUGGESTED D1 SCORE: ${suggestedScore}/100${noUrls ? ' (no job URLs provided — schema markers N/A; score based on career site only)' : ''}`,
  ];

  return { suggestedScore, noUrls, summary: lines.join('\n') };
}

function extractVisibleText(html) {
  if (!html) return '';
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.substring(0, 8000);
}

// ─── D2 JD SUB-PROTOCOL SCORING ──────────────────────────────────────────────
// Scores job description content against the 6 UTP V2 sub-dimensions.
// Each sub-dimension scored 1–5; total max 30; normalized to 0–100 for composite.
// Score interpretation: 25–30 = Excellent, 13–24 = Improvement needed, <13 = Rewrite required.

const UTP_METADATA_FIELDS = [
  { key: 'roleTitle',     label: 'Role Title',          pattern: /\b(title|role|position)\s*:/i },
  { key: 'roleLevel',     label: 'Role Level',          pattern: /\b(senior|junior|lead|principal|staff|ic[1-5]|manager|director|vp|associate|mid.?level)\b/i },
  { key: 'function',      label: 'Function',            pattern: /\b(engineering|product|sales|marketing|operations|finance|legal|hr|design|data|research|customer success|support|security)\b/i },
  { key: 'stage',         label: 'Stage',               pattern: /\b(pre.?seed|seed|series [abcde]|pre.?ipo|growth.?stage|startup|early.?stage)\b/i },
  { key: 'location',      label: 'Location',            pattern: /\b(remote|hybrid|on.?site|in.?office|[A-Z][a-z]+,\s*[A-Z]{2})\b/ },
  { key: 'dealSize',      label: 'Deal Size / Scope',   pattern: /\b(deal size|quota|book of business|territory|aov|arr|\$[\d]+[kmb])\b/i },
  { key: 'teamSize',      label: 'Team Size Owned',     pattern: /\b(team of \d|manage \d+|lead a team|direct reports|reports to you)\b/i },
  { key: 'yearsRequired', label: 'Years Required',      pattern: /\b(\d\+?\s*years?|[0-9]+[-–][0-9]+\s*years?)\b/i },
  { key: 'compensation',  label: 'Compensation',        pattern: /\$[\d,]+|\b(salary|base pay|total comp|equity|ote|on.?target earnings)\b/i },
  { key: 'department',    label: 'Department',          pattern: /\b(reports to|reporting to|department|division)\b/i },
];

const UTP_SECTIONS = [
  { key: 'opportunity', label: 'THE OPPORTUNITY',         pattern: /\b(the opportunity|about (the |this )?(role|opportunity|position)|opportunity overview)\b/i },
  { key: 'roleType',    label: 'ROLE TYPE',               pattern: /\b(role type|position type|this is a|this role is)\b/i },
  { key: 'ownership',   label: 'WHAT YOU WILL OWN',       pattern: /\b(what you('ll| will) own|key responsibilities|you will own|your responsibilities|what you('ll| will) do|responsibilities)\b/i },
  { key: 'required',    label: 'REQUIRED SKILLS',         pattern: /\b(required (skills?|qualifications?)|must.?have|minimum qualifications|what (we'?re?|you) (looking for|need|require))\b/i },
  { key: 'preferred',   label: 'STRONGLY PREFERRED',      pattern: /\b(preferred|nice.?to.?have|bonus if|strongly preferred|plus if you|ideal candidate)\b/i },
  { key: 'whoYouAre',   label: 'WHO YOU ARE',             pattern: /\b(who you are|about you|you bring|you are someone|the ideal candidate|what you bring)\b/i },
  { key: 'success',     label: 'WHAT SUCCESS LOOKS LIKE', pattern: /\b(success looks like|what success|30.60.90|first (30|90|6) (days?|months?)|in your first)\b/i },
];

function scoreD2JDContent(text) {
  if (!text || text.trim().length === 0) {
    return { totalScore: 5, normalizedScore: 17, subDimensions: {}, note: 'No content available to score' };
  }

  const lower = text.toLowerCase();
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  // ── Sub-dimension 1: Metadata Clarity ──────────────────────────────────────
  const metadataDetail = {};
  let metadataFieldsFound = 0;
  for (const field of UTP_METADATA_FIELDS) {
    const found = field.pattern.test(text);
    metadataDetail[field.key] = { label: field.label, found };
    if (found) metadataFieldsFound++;
  }
  const metadataScore = metadataFieldsFound >= 9 ? 5
    : metadataFieldsFound >= 7 ? 4
    : metadataFieldsFound >= 5 ? 3
    : metadataFieldsFound >= 3 ? 2 : 1;

  // ── Sub-dimension 2: Structural Clarity ────────────────────────────────────
  const sectionDetail = {};
  let sectionsFound = 0;
  for (const section of UTP_SECTIONS) {
    const found = section.pattern.test(text);
    sectionDetail[section.key] = { label: section.label, found };
    if (found) sectionsFound++;
  }
  const hasHeaders = /\n[A-Z][A-Z\s]{4,}[\n:]/.test(text);
  const hasBullets = (text.match(/\n\s*[-•*]\s/g) || []).length >= 3;
  const baseStructural = sectionsFound >= 6 ? 5 : sectionsFound >= 4 ? 4 : sectionsFound >= 2 ? 3 : sectionsFound >= 1 ? 2 : 1;
  const structuralScore = Math.min(5, baseStructural + (sectionsFound < 3 && (hasHeaders || hasBullets) ? 1 : 0));

  // ── Sub-dimension 3: Specificity & Quantification ──────────────────────────
  const specificitySignals = {
    yearsWithNumbers:    /\b\d+\+?\s*years?\b/i.test(text),
    specificTech:        /\b(python|javascript|typescript|react|node\.?js|aws|gcp|azure|sql|salesforce|hubspot|java|golang|kubernetes|terraform|postgresql|mongodb)\b/i.test(lower),
    measurableOutcome:   /\b(\d+%|\d+x|increase|reduce|grow|improve).{0,40}(revenue|retention|efficiency|pipeline|conversion|mrr|arr|churn)\b/i.test(lower),
    specificCredential:  /\b(bachelor|master|mba|phd|bs|ms|ba|degree in|certified|certification|cpa|cfa|pmp)\b/i.test(lower),
    dollarFigures:       /\$[\d,]+(k|m|b|\s*million|\s*thousand)?\b/i.test(text),
    scopeNumbers:        /\b(team of \d+|\d+ direct|\d+ engineers?|\d+ accounts?|manage \d+|\d+\s*reports)\b/i.test(lower),
  };
  const specificityCount = Object.values(specificitySignals).filter(Boolean).length;
  const specificityScore = specificityCount >= 5 ? 5 : specificityCount >= 4 ? 4 : specificityCount >= 2 ? 3 : specificityCount >= 1 ? 2 : 1;

  // ── Sub-dimension 4: Role Clarity ──────────────────────────────────────────
  const firstThird = text.substring(0, Math.floor(text.length * 0.35));
  const roleClaritySignals = {
    overviewEarly:    /\b(about (the |this )?(role|position)|overview|summary|what you('ll| will) do|the role|position summary)\b/i.test(firstThird),
    whyRoleExists:    /\b(we('re| are) (looking for|hiring|growing)|this role (exists?|will|is critical)|as we (scale|grow|expand))\b/i.test(lower),
    outcomeOrImpact:  /\b(you('ll| will) (own|drive|lead|build|be responsible)|your (impact|mission|goal|focus)|success in this role)\b/i.test(lower),
    jobCategory:      /\b(individual contributor|people manager|technical lead|founding|player.?coach|ic role|management role)\b/i.test(lower),
    reportingLine:    /\b(reports? to|reporting (line|to)|part of the .{3,25} team)\b/i.test(lower),
  };
  const roleClarityCount = Object.values(roleClaritySignals).filter(Boolean).length;
  const roleClarityScore = roleClarityCount >= 4 ? 5 : roleClarityCount >= 3 ? 4 : roleClarityCount >= 2 ? 3 : roleClarityCount >= 1 ? 2 : 1;

  // ── Sub-dimension 5: Brand Voice & Authenticity ────────────────────────────
  const jargonCount = (lower.match(/\b(rockstar|ninja|guru|wizard|unicorn|thought leader|disruptive|synergy|leverage|paradigm|ecosystem|best.?in.?class|world.?class|fast.?paced environment|wear many hats|hit the ground running|self.?starter|passionate about)\b/gi) || []).length;
  const genericCount = (lower.match(/\b(competitive (salary|compensation|benefits)|great (culture|team|opportunity)|dynamic (team|environment)|collaborative (team|environment)|exciting opportunity)\b/gi) || []).length;
  const brandVoiceSignals = {
    lowJargon:        jargonCount < 3,
    minimalGeneric:   genericCount < 2,
    humanNarrative:   /\b(we believe|our team|we('re| are) building|the challenge (is|we face)|our (mission|vision|approach|values))\b/i.test(lower),
    specificCulture:  /\b(we (move fast|ship|iterate|debate|disagree|value|prioritize|care about)|our (process|principles|way of working))\b/i.test(lower),
    goodLength:       wordCount >= 200 && wordCount <= 800,
  };
  const brandVoiceCount = Object.values(brandVoiceSignals).filter(Boolean).length;
  const brandVoiceScore = brandVoiceCount >= 4 ? 5 : brandVoiceCount >= 3 ? 4 : brandVoiceCount >= 2 ? 3 : brandVoiceCount >= 1 ? 2 : 1;

  // ── Sub-dimension 6: Candidate Self-Assessment ─────────────────────────────
  const selfAssessSignals = {
    reqVsPreferred:   sectionDetail.required?.found && sectionDetail.preferred?.found,
    youAreFraming:    /\b(you are|you bring|you have|you('ve| have) (built|led|managed|shipped)|you thrive|you('re| are) excited)\b/i.test(lower),
    fitIndicators:    /\b(this role (is|isn'?t) for you|you('ll| will) (thrive|excel|succeed)|if you (are|have|love|enjoy))\b/i.test(lower),
    transparentExpect:/\b(this is (hard|challenging|demanding)|be prepared|you should expect|this role requires)\b/i.test(lower),
    selfSelectLang:   /\b(if you('re| are) (the type|someone who)|you might be a (good |great |strong |perfect )?fit|does this (sound|resonate))\b/i.test(lower),
  };
  const selfAssessCount = Object.values(selfAssessSignals).filter(Boolean).length;
  const selfAssessScore = selfAssessCount >= 4 ? 5 : selfAssessCount >= 3 ? 4 : selfAssessCount >= 2 ? 3 : selfAssessCount >= 1 ? 2 : 1;

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totalScore = metadataScore + structuralScore + specificityScore + roleClarityScore + brandVoiceScore + selfAssessScore;
  const normalizedScore = Math.round((totalScore / 30) * 100);
  const interpretation = totalScore >= 25 ? 'Excellent' : totalScore >= 13 ? 'Improvement needed' : 'Rewrite required';

  return {
    totalScore,      // out of 30
    normalizedScore, // out of 100 — use as D2 score
    interpretation,
    subDimensions: {
      metadataClarity:           { score: metadataScore,    label: 'Metadata Clarity',             fieldsFound: metadataFieldsFound, fieldDetail: metadataDetail },
      structuralClarity:         { score: structuralScore,  label: 'Structural Clarity',           sectionsFound, sectionDetail },
      specificityQuantification: { score: specificityScore, label: 'Specificity & Quantification', signals: specificitySignals },
      roleClarity:               { score: roleClarityScore, label: 'Role Clarity',                 signals: roleClaritySignals },
      brandVoiceAuthenticity:    { score: brandVoiceScore,  label: 'Brand Voice & Authenticity',   jargonCount, genericCount, signals: brandVoiceSignals },
      candidateSelfAssessment:   { score: selfAssessScore,  label: 'Candidate Self-Assessment',    signals: selfAssessSignals },
    },
    wordCount,
  };
}

// ─── D2 CAREER SITE SUB-PROTOCOL SCORING ─────────────────────────────────────
// Sub-Protocol 2: scores the main career site page against 6 adapted sub-dimensions.
// Same 1–5 per sub-dimension / max 30 / normalized to 100 structure as the JD sub-protocol.

function scoreD2CareerSiteContent(text) {
  if (!text || text.trim().length === 0) {
    return { totalScore: 5, normalizedScore: 17, subDimensions: {}, note: 'No career site content available' };
  }

  const lower = text.toLowerCase();
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  // ── Sub-dimension 1: Company Info Completeness ─────────────────────────────
  const companyInfoSignals = {
    missionStatement:    /\b(our mission|mission statement|we exist to|our purpose|what we do|why we exist)\b/i.test(lower),
    valuesPresent:       /\b(our values|core values|we believe|what we stand for|our principles)\b/i.test(lower),
    teamSizeInfo:        /\b(\d+\s*(employees?|people|team members?)|team of \d+|\d+[\s-]person)\b/i.test(lower),
    officeLocations:     /\b(headquartered in|offices? in|based in|remote.?first|distributed team)\b/i.test(lower),
    companyHistory:      /\b(founded in \d{4}|since \d{4}|started in \d{4}|\d+ years? (ago|old|of experience))\b/i.test(lower),
    cultureDescription:  /\b(our culture|work environment|how we work|the way we work|life at)\b/i.test(lower),
    benefitsOverview:    /\b(benefits?|perks?|health insurance|401k|pto|vacation|flexible|equity|stock options?)\b/i.test(lower),
    leadershipMentioned: /\b(leadership team|our (leaders?|executives?|founders?)|ceo|cto|cpo|founded by)\b/i.test(lower),
    diversityCommitment: /\b(diversity|inclusion|belonging|dei|equal opportunity)\b/i.test(lower),
    fundingOrStage:      /\b(backed by|series [abcde]|funded|venture|raised \$|vc.backed|investors?)\b/i.test(lower),
  };
  const companyInfoCount = Object.values(companyInfoSignals).filter(Boolean).length;
  const companyInfoScore = companyInfoCount >= 8 ? 5 : companyInfoCount >= 6 ? 4 : companyInfoCount >= 4 ? 3 : companyInfoCount >= 2 ? 2 : 1;

  // ── Sub-dimension 2: Structural Clarity ───────────────────────────────────
  const structureSignals = {
    aboutSection:    /\b(about us|our story|who we are)\b/i.test(lower),
    cultureSection:  /\b(culture|life at|working at|our team)\b/i.test(lower),
    benefitsSection: /\b(benefits?|perks?|what we offer|total rewards)\b/i.test(lower),
    missionSection:  /\b(mission|vision|purpose|what we('re| are) building)\b/i.test(lower),
    teamSection:     /\b(meet the team|our people|leadership|who you('ll| will) work with)\b/i.test(lower),
    valuesSection:   /\b(our values|core values|principles|what we stand for)\b/i.test(lower),
    careersSection:  /\b(join us|join the team|open roles?|we('re| are) hiring|work with us)\b/i.test(lower),
  };
  const structureCount = Object.values(structureSignals).filter(Boolean).length;
  const structureScore = structureCount >= 6 ? 5 : structureCount >= 4 ? 4 : structureCount >= 3 ? 3 : structureCount >= 1 ? 2 : 1;

  // ── Sub-dimension 3: Specificity & Quantification ─────────────────────────
  const specificitySignals = {
    specificHeadcount:    /\b\d{2,4}\+?\s*(employees?|people|team members?)\b/i.test(lower),
    specificLocations:    /\b\d+\s*(offices?|locations?|cities)\b/i.test(lower),
    specificBenefits:     /\b(\d+\s*days?\s*(pto|vacation|off)|unlimited pto|\d+%\s*(match|equity)|\$[\d,]+\s*(stipend|allowance))\b/i.test(lower),
    specificGrowthMetric: /\b(\d+x|\d+%\s*(growth|yoy)|grew from \d|raised \$[\d]+[mb])\b/i.test(lower),
    specificCustomers:    /\b(\d+\s*(customers?|clients?|companies|enterprises?|users?))\b/i.test(lower),
    specificFunding:      /\$[\d]+(\.\d+)?\s*(m|b|million|billion)\b/i.test(lower),
  };
  const specificityCount = Object.values(specificitySignals).filter(Boolean).length;
  const specificityScore = specificityCount >= 5 ? 5 : specificityCount >= 3 ? 4 : specificityCount >= 2 ? 3 : specificityCount >= 1 ? 2 : 1;

  // ── Sub-dimension 4: EVP Clarity (Employer Value Proposition) ─────────────
  const evpSignals = {
    whyWorkHere:      /\b(why (join|work (at|for|with)|work here)|what makes (us|[a-z]+ )?(different|unique|special))\b/i.test(lower),
    growthOpportunity:/\b(grow (your career|professionally|with us)|career (growth|development|path)|learning (opportunities?|culture)|mentorship)\b/i.test(lower),
    impactLanguage:   /\b(make (an )?impact|meaningful work|real impact|change the (world|industry)|our (impact|mission) is)\b/i.test(lower),
    uniquePosition:   /\b(first|only|leading|pioneer|transforming).{0,50}(market|industry|space|category)\b/i.test(lower),
    workStyleClarity: /\b(async|remote.?first|flexible (hours?|schedule|work)|in.?person|hybrid|distributed)\b/i.test(lower),
  };
  const evpCount = Object.values(evpSignals).filter(Boolean).length;
  const evpScore = evpCount >= 4 ? 5 : evpCount >= 3 ? 4 : evpCount >= 2 ? 3 : evpCount >= 1 ? 2 : 1;

  // ── Sub-dimension 5: Brand Voice & Authenticity ────────────────────────────
  const genericPhraseCount = (lower.match(/\b(we('re| are) a family|work hard play hard|fast.?paced (startup|environment|culture)|passionate (team|people)|best.?in.?class culture|collaborative environment|innovative (team|company)|exciting (company|team))\b/gi) || []).length;
  const brandVoiceSignals = {
    lowGenericLanguage:  genericPhraseCount < 2,
    specificTeamStories: /\b(our (engineers?|team|people) (build|ship|solve|work on)|team spotlight|employee (story|spotlight))\b/i.test(lower),
    honestCulture:       /\b(we (debate|disagree|challenge|question)|(hard (problems?|challenges?))|not (for everyone|a fit for everyone)|(honest|candid|transparent) (about|culture))\b/i.test(lower),
    humanNarrative:      /\b(we (believe|care|think|love)|our (journey|story)|started (because|when|after))\b/i.test(lower),
    noGenericPhrases:    genericPhraseCount === 0,
  };
  const brandVoiceCount = Object.values(brandVoiceSignals).filter(Boolean).length;
  const brandVoiceScore = brandVoiceCount >= 4 ? 5 : brandVoiceCount >= 3 ? 4 : brandVoiceCount >= 2 ? 3 : brandVoiceCount >= 1 ? 2 : 1;

  // ── Sub-dimension 6: Candidate Self-Assessment Enablement ─────────────────
  const selfAssessSignals = {
    cultureFitLanguage:   /\b(if you (thrive|excel|love|enjoy|are (the type|someone who))|you('ll| will) (love|thrive|fit) (if|when|here))\b/i.test(lower),
    clearValues:          /\b(we (value|believe in|prioritize|care about|stand for) [a-z])/i.test(lower),
    thrivingConditions:   /\b(to (thrive|succeed|excel) here|what (it takes|you need)|the ideal (teammate|person|hire))\b/i.test(lower),
    notForEveryone:       /\b(not for everyone|this isn('?t| not) for|(might not|won'?t) be (a fit|right) (if|for))\b/i.test(lower),
    explicitExpectations: /\b((high (bar|standards?|expectations?))|(demanding|challenging) (environment|work)|(we (expect|ask) a lot))\b/i.test(lower),
  };
  const selfAssessCount = Object.values(selfAssessSignals).filter(Boolean).length;
  const selfAssessScore = selfAssessCount >= 4 ? 5 : selfAssessCount >= 3 ? 4 : selfAssessCount >= 2 ? 3 : selfAssessCount >= 1 ? 2 : 1;

  const totalScore = companyInfoScore + structureScore + specificityScore + evpScore + brandVoiceScore + selfAssessScore;
  const normalizedScore = Math.round((totalScore / 30) * 100);
  const interpretation = totalScore >= 25 ? 'Excellent' : totalScore >= 13 ? 'Improvement needed' : 'Rewrite required';

  return {
    totalScore,
    normalizedScore,
    interpretation,
    subDimensions: {
      companyInfoCompleteness:   { score: companyInfoScore, label: 'Company Info Completeness',   signalsFound: companyInfoCount, signals: companyInfoSignals },
      structuralClarity:         { score: structureScore,   label: 'Structural Clarity',          signalsFound: structureCount,  signals: structureSignals },
      specificityQuantification: { score: specificityScore, label: 'Specificity & Quantification', signals: specificitySignals },
      evpClarity:                { score: evpScore,         label: 'EVP Clarity',                 signals: evpSignals },
      brandVoiceAuthenticity:    { score: brandVoiceScore,  label: 'Brand Voice & Authenticity',  genericPhraseCount, signals: brandVoiceSignals },
      candidateSelfAssessment:   { score: selfAssessScore,  label: 'Candidate Self-Assessment',   signals: selfAssessSignals },
    },
    wordCount,
  };
}

// Returns UTP time-weight label for a Reddit post based on its age
function getPostTimeWeight(publishedAt) {
  if (!publishedAt) return '<6 months (100% weight)';
  const ageDays = (Date.now() - new Date(publishedAt).getTime()) / 86400000;
  if (ageDays > 730) return '>24 months — EXCLUDED per UTP time-weighting';
  if (ageDays > 365) return '12–24 months (50% weight)';
  if (ageDays > 180) return '6–12 months (75% weight)';
  return '<6 months (100% weight)';
}

function normalizeDomain(domain) {
  let d = domain.trim();
  if (!d.startsWith('http')) d = 'https://' + d;
  try {
    const url = new URL(d);
    return url.origin;
  } catch (e) {
    return 'https://' + domain.trim();
  }
}

// ─── MAIN AUDIT ENDPOINT ──────────────────────────────────────────────────────

app.post('/audit', async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { domain, brand, industry, context, jobUrls, careerUrl, selectedATS, isOwnCompany, declaredTier } = req.body;

  if (!domain || !brand) {
    return res.status(400).json({ error: 'domain and brand are required' });
  }

  const baseUrl = normalizeDomain(domain);
  const urls = (jobUrls || []).filter(u => u && u.trim().length > 0);
  const careerSiteFetchUrl = careerUrl?.trim() || baseUrl;

  // ── PARALLEL DATA COLLECTION ──────────────────────────────────────────────
  // Reddit runs in parallel with the rest — D4 data arrives at the same time

  const [robotsResult, sitemapResult, redditResult, careerSiteResult, ...jobPageResults] = await Promise.all([
    fetchText(`${baseUrl}/robots.txt`),
    fetchText(`${baseUrl}/sitemap.xml`),
    fetchRedditSignals(brand),
    fetchHTML(careerSiteFetchUrl),
    ...urls.map(u => fetchHTML(u.trim()))
  ]);

  // ── PARSE COLLECTED DATA ──────────────────────────────────────────────────

  const robotsAudit = auditRobotsTxt(robotsResult.text, baseUrl);
  const sitemapAudit = auditSitemap(sitemapResult.text);
  const d4Score = scoreD4Sentiment(redditResult);

  const careerSiteText = careerSiteResult.success ? extractVisibleText(careerSiteResult.html) : null;
  const careerSiteBlocks = extractJSONLD(careerSiteResult.html || '');
  const d2CareerScore = careerSiteText ? scoreD2CareerSiteContent(careerSiteText) : null;

  const dataCompleteness = calculateDataCompleteness({
    robotsFound: robotsResult.success,
    sitemapFound: sitemapResult.success,
    careerSiteSuccess: careerSiteResult.success,
    redditSuccess: redditResult.success,
    jobResults: jobPageResults,
  });

  const jobAudits = jobPageResults.map((result, i) => {
    if (!result.success) {
      return { url: urls[i], fetchSuccess: false, error: result.error || `HTTP ${result.status}`, schema: null, schemaAudit: null, contentPreview: null };
    }
    const jsonldBlocks = extractJSONLD(result.html);
    const jobSchema = findJobPostingSchema(jsonldBlocks);
    const schemaAudit = auditJobPostingSchema(jobSchema);
    const pageMeta = auditPageMeta(result.html);
    const contentPreview = extractVisibleText(result.html);
    const d2Score = scoreD2JDContent(contentPreview);
    return {
      url: urls[i],
      fetchSuccess: true,
      jsonldBlockCount: jsonldBlocks.length,
      hasJobPostingSchema: !!jobSchema,
      schemaAudit,
      pageMeta,
      contentPreview,
      d2Score,
      allSchemaTypes: jsonldBlocks.filter(b => !b.parseError).map(b => b['@type'] || (b['@graph'] ? '@graph' : 'unknown'))
    };
  });

  // Strip verbose d2Score and contentPreview from jobPages before sending to Claude —
  // d2Context already has all the formatted D2 data Claude needs; no need to duplicate.
  const jobPagesForPrompt = jobAudits.map(({ d2Score, contentPreview, ...rest }) => rest);

  const realDataSummary = {
    domain: baseUrl,
    robotsTxt: robotsAudit,
    sitemap: sitemapAudit,
    jobPages: jobPagesForPrompt,
    urlsProvided: urls.length,
    reddit: {
      fetched: redditResult.success,
      totalMentions: redditResult.totalMentions || 0,
      subredditsFound: redditResult.subredditsFound || [],
      sentimentBreakdown: redditResult.sentimentBreakdown || {},
      topPosts: redditResult.posts || [],
      topSignals: redditResult.topSignals || [],
      d4SuggestedScore: d4Score ? d4Score.suggestedScore : null,
      note: redditResult.note || redditResult.error || null
    }
  };

  // ── TIER CLASSIFICATION ───────────────────────────────────────────────────

  let tierResult;
  try {
    tierResult = await classifyTier({
      domain: baseUrl,
      companyName: brand,
      declaredTier: declaredTier || null,
      isOwnCompany: !!isOwnCompany,
    });
  } catch (err) {
    console.error('Tier classification error:', err.message);
    tierResult = {
      tier: 2, confidence: 'low', assignment_method: 'system',
      pdl_headcount: null, pdl_revenue_usd: null, funding_stage: null,
      pdl_found: false, discrepancy: false, discrepancy_detail: null,
    };
  }

  const TIER_NAMES = { 1: 'Startup / Early-Stage', 2: 'Growth-Stage', 3: 'Established Mid-Market', 4: 'Enterprise' };
  const TIER_WEIGHTS = {
    1: { d1: 0.15, d2: 0.15, d3: 0.10, d4: 0.20, d5: 0.40 },
    2: { d1: 0.15, d2: 0.20, d3: 0.15, d4: 0.15, d5: 0.35 },
    3: { d1: 0.15, d2: 0.20, d3: 0.20, d4: 0.15, d5: 0.30 },
    4: { d1: 0.15, d2: 0.25, d3: 0.20, d4: 0.10, d5: 0.30 },
  };
  const tierWeights = TIER_WEIGHTS[tierResult.tier];
  const goodThresholds  = { 1: 50, 2: 65, 3: 70, 4: 75 };
  const excellentThresholds = { 1: 65, 2: 80, 3: 85, 4: 90 };
  const goodThreshold = goodThresholds[tierResult.tier];
  const excellentThreshold = excellentThresholds[tierResult.tier];

  const tierContext = `TIER CLASSIFICATION:
Company tier: T${tierResult.tier} — ${TIER_NAMES[tierResult.tier]}
Assignment method: ${tierResult.assignment_method}
Confidence: ${tierResult.confidence}
PDL headcount: ${tierResult.pdl_headcount ?? 'not found'}
PDL revenue: ${tierResult.pdl_revenue_usd ? '$' + tierResult.pdl_revenue_usd.toLocaleString() : 'not found'}${tierResult.discrepancy ? `
DISCREPANCY FLAGGED: ${tierResult.discrepancy_detail}` : ''}

Dimension weights for T${tierResult.tier}:
- D1 Schema Integrity: ${Math.round(tierWeights.d1 * 100)}%
- D2 Content Readiness: ${Math.round(tierWeights.d2 * 100)}%
- D3 Brand Signal: ${Math.round(tierWeights.d3 * 100)}%
- D4 Continuity Indicator: ${Math.round(tierWeights.d4 * 100)}%
- D5 Distribution / Agentic Readiness: ${Math.round(tierWeights.d5 * 100)}%

Good threshold for T${tierResult.tier}: ${goodThreshold}+
Excellent threshold for T${tierResult.tier}: ${excellentThreshold}+

Apply these weights when calculating the composite score. Reference the tier in your narrative and grade label.`;

  // ── CLAUDE PROMPT CONTEXTS ────────────────────────────────────────────────

  // D1 context: tier-weighted category audit + robots.txt + sitemap
  const d1Scores = computeD1CategoryScores(jobAudits, careerSiteBlocks, tierResult);
  const d1RobotsLine = robotsAudit.found
    ? `robots.txt: found. Blocks all: ${robotsAudit.blocksAll}. Blocks job paths: ${robotsAudit.blocksJobs}. Sitemap directive: ${robotsAudit.hasSitemapDirective}.${robotsAudit.issues.length > 0 ? ' Issues: ' + robotsAudit.issues.join('; ') : ''}`
    : `robots.txt: not found or unreachable.`;
  const d1SitemapLine = sitemapAudit.found
    ? `sitemap.xml: found. URLs: ${sitemapAudit.urlCount}. Includes job URLs: ${sitemapAudit.hasJobUrls}. Has lastmod: ${sitemapAudit.hasLastmod}.${sitemapAudit.issues.length > 0 ? ' Issues: ' + sitemapAudit.issues.join('; ') : ''}`
    : `sitemap.xml: not found or unreachable.`;
  const d1Context = `${d1Scores.summary}

CRAWLER ACCESS (also feeds D1):
${d1RobotsLine}
${d1SitemapLine}`;

  // D2 context: JD sub-protocol (60%) + career site sub-protocol (40%) composite
  const d2ScoredPages = jobAudits.filter(j => j.fetchSuccess && j.d2Score);
  const d2JDAvgScore = d2ScoredPages.length > 0
    ? Math.round(d2ScoredPages.reduce((sum, j) => sum + j.d2Score.normalizedScore, 0) / d2ScoredPages.length)
    : null;

  // Composite: 60% JD sub-protocol + 40% career site sub-protocol
  // Falls back gracefully if either source is unavailable
  let d2CompositeScore = null;
  if (d2JDAvgScore !== null && d2CareerScore !== null) {
    d2CompositeScore = Math.round(d2JDAvgScore * 0.6 + d2CareerScore.normalizedScore * 0.4);
  } else if (d2JDAvgScore !== null) {
    d2CompositeScore = d2JDAvgScore;
  } else if (d2CareerScore !== null) {
    d2CompositeScore = d2CareerScore.normalizedScore;
  }

  const d2Context = (d2ScoredPages.length > 0 || d2CareerScore)
    ? `D2 CONTENT READINESS — UTP SUB-PROTOCOL SCORES (JD 60% + Career Site 40%):

${d2ScoredPages.length > 0 ? `JD SUB-PROTOCOL: ${d2ScoredPages.length} job page(s) scored.
${d2ScoredPages.map(j => {
  const s = j.d2Score;
  const sd = s.subDimensions;
  const missingFields = sd.metadataClarity?.fieldDetail
    ? Object.values(sd.metadataClarity.fieldDetail).filter(f => !f.found).map(f => f.label)
    : [];
  const missingSections = sd.structuralClarity?.sectionDetail
    ? Object.values(sd.structuralClarity.sectionDetail).filter(f => !f.found).map(f => f.label)
    : [];
  return `URL: ${j.url}
  JD Score: ${s.totalScore}/30 (${s.normalizedScore}/100) — ${s.interpretation}
  Sub-dimension scores (each out of 5):
    1. Metadata Clarity: ${sd.metadataClarity?.score}/5 — ${sd.metadataClarity?.fieldsFound}/10 UTP fields detected${missingFields.length > 0 ? '. Missing: ' + missingFields.join(', ') : ''}
    2. Structural Clarity: ${sd.structuralClarity?.score}/5 — ${sd.structuralClarity?.sectionsFound}/7 UTP sections detected${missingSections.length > 0 ? '. Missing: ' + missingSections.join(', ') : ''}
    3. Specificity & Quantification: ${sd.specificityQuantification?.score}/5
    4. Role Clarity: ${sd.roleClarity?.score}/5
    5. Brand Voice & Authenticity: ${sd.brandVoiceAuthenticity?.score}/5 (jargon count: ${sd.brandVoiceAuthenticity?.jargonCount})
    6. Candidate Self-Assessment: ${sd.candidateSelfAssessment?.score}/5
  Word count: ${s.wordCount}`;
}).join('\n')}` : `JD SUB-PROTOCOL: No job URLs provided or pages could not be fetched.`}

${d2CareerScore ? `CAREER SITE SUB-PROTOCOL: ${careerSiteFetchUrl}
  Career Site Score: ${d2CareerScore.totalScore}/30 (${d2CareerScore.normalizedScore}/100) — ${d2CareerScore.interpretation}
  Sub-dimension scores (each out of 5):
    1. Company Info Completeness: ${d2CareerScore.subDimensions.companyInfoCompleteness?.score}/5 (${d2CareerScore.subDimensions.companyInfoCompleteness?.signalsFound}/10 signals)
    2. Structural Clarity: ${d2CareerScore.subDimensions.structuralClarity?.score}/5 (${d2CareerScore.subDimensions.structuralClarity?.signalsFound}/7 sections)
    3. Specificity & Quantification: ${d2CareerScore.subDimensions.specificityQuantification?.score}/5
    4. EVP Clarity: ${d2CareerScore.subDimensions.evpClarity?.score}/5
    5. Brand Voice & Authenticity: ${d2CareerScore.subDimensions.brandVoiceAuthenticity?.score}/5 (generic phrase count: ${d2CareerScore.subDimensions.brandVoiceAuthenticity?.genericPhraseCount})
    6. Candidate Self-Assessment: ${d2CareerScore.subDimensions.candidateSelfAssessment?.score}/5` : `CAREER SITE SUB-PROTOCOL: Career site could not be fetched.`}

D2 composite score (${d2JDAvgScore !== null && d2CareerScore ? '60% JD + 40% career site' : d2JDAvgScore !== null ? 'JD only — career site unavailable' : 'career site only — no JD URLs'}): ${d2CompositeScore}/100.
Use ${d2CompositeScore} as the D2 score.
Reference the UTP 7-step fix methodology in D2 recommendations when any JD totalScore < 25.
Call out specific missing metadata fields and sections by name in D2 findings.

UTP Non-Negotiables — apply these principles explicitly in D2 findings and recommendations:
1. Optimization ≠ Templating: Fix structure and fill metadata gaps while preserving the company's brand voice. Never recommend generic templates.
2. Metadata is non-negotiable: Both the visible metadata block AND embedded JSON-LD are required for LLM retrievability. Surface gaps in both layers.
3. Candidate self-assessment is a quality metric: If candidates cannot determine from the JD whether they are a fit, the JD has failed — regardless of other scores.`
    : `D2 DATA: No job URLs and career site could not be fetched. Score D2 as inferred from domain/brand knowledge only.`;


  // ── D4 CONTEXT FOR CLAUDE ─────────────────────────────────────────────────

  let d4Context;
  if (redditResult.success && redditResult.totalMentions > 0) {
    const { positive, negative, neutral } = redditResult.sentimentBreakdown;
    d4Context = `D3 + D4 REAL DATA — REDDIT BRAND SIGNALS (feeds both Brand Signal Assessment and Continuity Indicator):
Reddit mentions found: ${redditResult.totalMentions}
Subreddits: ${redditResult.subredditsFound.join(', ') || 'none identified'}
Sentiment breakdown: ${positive} positive, ${negative} negative, ${neutral} neutral/mixed

Top posts (by Reddit score) with UTP time-weights:
${redditResult.posts.map(p => `- [${p.sentiment.toUpperCase()}] "${p.title}" (r/${p.subreddit}, score: ${p.score}, ${getPostTimeWeight(p.publishedAt)})`).join('\n')}

Key signals:
${redditResult.topSignals.map(s => {
  if (s.type === 'negative') return `- NEGATIVE SIGNAL: ${s.count} negative post(s). Top: "${s.topPost}"`;
  if (s.type === 'positive') return `- POSITIVE SIGNAL: ${s.count} positive post(s). Top: "${s.topPost}"`;
  if (s.type === 'candidate_subreddit_presence') return `- CANDIDATE COMMUNITY PRESENCE: Mentioned in ${s.subreddits.join(', ')}`;
  return '';
}).join('\n')}

Suggested D3 (Brand Signal Assessment) score based on Reddit signals: ${d4Score ? d4Score.suggestedScore : 'N/A'}/100
You may adjust up or down based on industry norms, brand size, and recency.
For D4 (Continuity Indicator): use Reddit sentiment vs. career site owned content as a theme-level continuity signal. Describe any divergence descriptively, not prosecutorially.
UTP time-weighting for D4: posts labeled ">24 months — EXCLUDED" should not contribute to continuity scoring. Posts labeled "6–12 months" carry 75% weight; "12–24 months" carry 50% weight. Weight older signals accordingly.
Set dataSource to "reddit+real" for D3 and "real" for D4.
Reference specific post titles or subreddits in D3 findings.`;

  } else if (redditResult.success && redditResult.totalMentions === 0) {
    if (tierResult?.tier === 1) {
      d4Context = `D3 + D4 REDDIT DATA: Reddit searched successfully — no mentions of "${brand}" found.
This is a T1 Startup. Absence of downstream Reddit signal is expected at this stage.
D3: score at neutral baseline 45/100. D4: score as 50 (neutral) and note in findings that downstream signal is absent — this is expected for an early-stage company and should NOT be penalized. Reference the absence as context, not a gap.
Set dataSource to "reddit+real" for D3 and "real" for D4.`;
    } else {
      d4Context = `D3 + D4 REDDIT DATA: Reddit searched successfully — no mentions of "${brand}" found.
Brand may be small, niche, or not publicly discussed.
Suggested D3 score: 45/100 (neutral baseline). D4: note absence of downstream signal; do not heavily penalize.
Set dataSource to "reddit+real" for D3 and "real" for D4.`;
    }

  } else {
    d4Context = `D3 + D4 DATA: Reddit fetch failed (${redditResult.error || 'unknown error'}). Score D3 and D4 as inferred from brand/domain knowledge only.
Set dataSource to "inferred" for both D3 and D4.`;
  }

  // Reference career site D2 scores in d4Context for continuity comparison.
  // Raw career site text is not appended here — the D2 career site sub-dimension scores
  // in d2Context already represent the owned content themes Claude needs for D4 analysis.
  if (d2CareerScore) {
    d4Context += `

OWNED CONTENT THEMES (from D2 Career Site Sub-Protocol scores for ${careerSiteFetchUrl}):
Company Info: ${d2CareerScore.subDimensions.companyInfoCompleteness?.score}/5 | Structure: ${d2CareerScore.subDimensions.structuralClarity?.score}/5 | EVP Clarity: ${d2CareerScore.subDimensions.evpClarity?.score}/5 | Brand Voice: ${d2CareerScore.subDimensions.brandVoiceAuthenticity?.score}/5
Use these owned content signals for theme-level D4 continuity comparison. Describe any divergence from Reddit earned signals descriptively, not prosecutorially.`;
  }

  const d5Context = (selectedATS && selectedATS.length > 0)
    ? `D5 ATS CONTEXT: The user has indicated they use the following ATS platform(s): ${selectedATS.join(', ')}.
For the D5 dimension, provide specific, actionable optimization tips tailored to these platforms. Cover:
- Any schema or structured data requirements specific to these ATSs
- Feed configuration settings that affect Google for Jobs eligibility
- Known indexing quirks or limitations that impact AI/LLM visibility
- Posting visibility or template settings candidates and crawlers commonly miss
- Any platform-specific best practices for maximizing distribution reach
Reference each selected ATS by name in the D5 findings. Be specific — not generic distribution advice.`
    : `D5 CONTEXT: No ATS platform selected. Provide general distribution coverage advice for D5.`;

  const systemPrompt = `You are the Cassillon AI GEO Audit Engine.
You will receive REAL audit data collected from the client's actual career site, job posting URLs, and Reddit.

Do not invent findings. Base every score and finding on the real data provided.
OUTPUT DISCIPLINE: Keep each finding to one concise sentence. Keep recommendations tight — title + one sentence description. The JSON response must be complete; do not let it truncate.

${tierContext}

DATA COMPLETENESS: ${dataCompleteness.pct}% (${dataCompleteness.filled}/${dataCompleteness.total} data sources returned usable data). Score status: ${dataCompleteness.scoreStatus.toUpperCase()}.${dataCompleteness.scoreStatus === 'provisional' ? ' Note "Provisional Score" in your executive summary — data gaps limit confidence.' : ''}

${d1Context}

${d2Context}

${d4Context}

${d5Context}

Return ONLY valid JSON
{
  "overallScore": 0-100,
  "scoreGrade": "Poor|Fair|Developing|Good|Strong|Excellent",
  "geoProfile": {
    "metrics": [
      {"label": "AI Citation Rate", "value": "string"},
      {"label": "LLM Visibility", "value": "string"},
      {"label": "Structured Data Coverage", "value": "string"},
      {"label": "Brand Entity Strength", "value": "string"},
      {"label": "Distribution Index", "value": "string"},
      {"label": "Content GEO Score", "value": "string"}
    ],
    "signals": [
      {"platform": "Google for Jobs", "status": "ok|warn|fail|na"},
      {"platform": "LinkedIn Jobs", "status": "ok|warn|fail|na"},
      {"platform": "Glassdoor", "status": "ok|warn|fail|na"},
      {"platform": "Indeed ATS Feed", "status": "ok|warn|fail|na"},
      {"platform": "Schema.org JobPosting", "status": "ok|warn|fail|na"},
      {"platform": "Bing Career Search", "status": "ok|warn|fail|na"}
    ],
    "narrative": "3-4 sentence GEO profile narrative based on the real audit data"
  },
  "dimensions": [
    {
      "id": "D1",
      "name": "Schema Integrity",
      "score": 0-100,
      "colorClass": "blue",
      "findings": ["specific finding referencing schema audit, robots.txt, and sitemap data", "finding 2", "finding 3"],
      "dataSource": "real"
    },
    {
      "id": "D2",
      "name": "Content Readiness",
      "score": 0-100,
      "colorClass": "teal",
      "findings": ["1-sentence finding citing the lowest-scoring sub-dimension and top gap", "finding 2", "finding 3"],
      "dataSource": "${(d2ScoredPages.length > 0 || d2CareerScore) ? 'real' : 'inferred'}",
      "perUrlScores": [{"url": "string", "score": 0-100, "topGaps": ["up to 3 missing fields or sub-dimensions"]}]
    },
    {
      "id": "D3",
      "name": "Brand Signal Assessment",
      "score": 0-100,
      "colorClass": "amber",
      "findings": ["finding referencing real Reddit data — specific post titles, subreddits, or sentiment counts", "finding 2", "finding 3"],
      "dataSource": "${redditResult.success ? 'reddit+real' : 'inferred'}"
    },
    {
      "id": "D4",
      "name": "Continuity Indicator",
      "score": 0-100,
      "colorClass": "purple",
      "findings": ["descriptive theme-level continuity finding — not prosecutorial", "finding 2", "finding 3"],
      "dataSource": "${redditResult.success ? 'real' : 'inferred'}"
    },
    {
      "id": "D5",
      "name": "Distribution & Agentic Readiness",
      "score": 0-100,
      "colorClass": "red",
      "findings": ["finding 1", "finding 2", "finding 3"],
      "dataSource": "${selectedATS && selectedATS.length > 0 ? 'ats+tips' : 'inferred'}"
    }
  ],
  "internalActions": [
    {"title": "action title", "description": "specific actionable step referencing real findings", "effort": "Low|Medium|High", "impact": "High|Medium", "dimension": "D1"}
  ],
  "cassillonActions": [
    {"title": "service title", "description": "what Cassillon would deliver", "effort": "Low|Medium|High", "impact": "High|Medium"}
  ]
}

Provide exactly 5 internalActions and exactly 4 cassillonActions.
Make all findings and actions specific to the real data — not generic.

IMPORTANT: Sort internalActions by impact/effort ratio — highest value first:
1. Impact: High + Effort: Low  (quick wins — always first)
2. Impact: High + Effort: Medium
3. Impact: High + Effort: High
4. Impact: Medium + Effort: Low
5. Impact: Medium + Effort: Medium
Do not sort by dimension. A D5 quick win should appear before a D1 high-effort fix.`;

  const userPrompt = `Audit this employer brand for GEO visibility.

Brand: ${brand}
Domain: ${baseUrl}
Industry: ${industry || 'Not specified'}
Additional context: ${context || 'None'}

REAL AUDIT DATA:
${JSON.stringify(realDataSummary, null, 2)}`;



  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', err);
      return res.status(502).json({ error: 'Upstream API error', detail: err });
    }

    const data = await response.json();
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const report = JSON.parse(clean);

    // Persist audit to database (non-blocking — don't fail the response if DB write fails)
    try {
      const companyId = await upsertCompany({
        name: brand,
        domain: baseUrl,
        industry: industry || null,
      });
      const auditId = await saveAudit({
        companyId,
        report,
        auditData: realDataSummary,
        requestBody: req.body,
        tierResult,
        dataCompleteness,
      });
      res.json({ success: true, report, auditData: realDataSummary, auditId, dataCompleteness });
    } catch (dbErr) {
      console.error('DB persist error (audit still returned):', dbErr.message);
      res.json({ success: true, report, auditData: realDataSummary, auditId: null, dataCompleteness });
    }

  } catch (err) {
    console.error('Audit error:', err);
    res.status(500).json({ error: 'Audit failed', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Talent GEO backend v5 running on port ${PORT}`);
});
