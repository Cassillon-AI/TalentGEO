const fetch = require('node-fetch');

const PDL_API_KEY = process.env.PDL_API_KEY;
const PDL_COMPANY_URL = 'https://api.peopledatalabs.com/v5/company/enrich';

// ─── TIER MAPPING ─────────────────────────────────────────────────────────────
// Per UTP V2 spec § 1. Headcount is primary; revenue is secondary.
// When both signals are available and agree → high confidence.
// When they disagree → defer to most recent verified data (headcount wins for MVP).
// When only one is available → medium confidence.
// When neither is available → low confidence, default T2 (conservative middle).

const TIER_HEADCOUNT_RANGES = [
  { tier: 1, min: 0,    max: 99   },
  { tier: 2, min: 100,  max: 999  },
  { tier: 3, min: 1000, max: 4999 },
  { tier: 4, min: 5000, max: Infinity },
];

const TIER_REVENUE_RANGES = [
  { tier: 1, min: 0,           max: 49_999_999    },
  { tier: 2, min: 50_000_000,  max: 999_999_999   },
  { tier: 3, min: 1_000_000_000, max: 1_999_999_999 },
  { tier: 4, min: 2_000_000_000, max: Infinity     },
];

function tierFromHeadcount(headcount) {
  if (headcount == null) return null;
  const match = TIER_HEADCOUNT_RANGES.find(r => headcount >= r.min && headcount <= r.max);
  return match ? match.tier : null;
}

function tierFromRevenue(revenueUsd) {
  if (revenueUsd == null) return null;
  const match = TIER_REVENUE_RANGES.find(r => revenueUsd >= r.min && revenueUsd <= r.max);
  return match ? match.tier : null;
}

// ─── PDL COMPANY ENRICH ───────────────────────────────────────────────────────

async function fetchPDLCompany(domain, companyName) {
  if (!PDL_API_KEY) {
    throw new Error('PDL_API_KEY not configured');
  }
  // PDL accepts website OR name — domain is more reliable
  const body = domain
    ? { website: domain.replace(/^https?:\/\//, '') }
    : { name: companyName };

  const res = await fetch(PDL_COMPANY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': PDL_API_KEY.trim(),
    },
    body: JSON.stringify(body),
    timeout: 10000,
  });

  if (res.status === 404) return null; // Company not found in PDL
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PDL API error ${res.status}: ${text.substring(0, 200)}`);
  }

  return res.json();
}

// ─── CLASSIFY TIER ────────────────────────────────────────────────────────────
// Returns:
// {
//   tier: 1|2|3|4,
//   confidence: 'high'|'medium'|'low',
//   assignment_method: 'system'|'employer_declared',
//   pdl_headcount: integer|null,
//   pdl_revenue_usd: integer|null,
//   funding_stage: string|null,
//   pdl_found: boolean,
//   discrepancy: boolean,          — true when declared tier ≠ PDL-derived tier
//   discrepancy_detail: string|null,
// }

async function classifyTier({ domain, companyName, declaredTier = null, isOwnCompany = false }) {
  let pdlData = null;
  let pdlHeadcount = null;
  let pdlRevenueUsd = null;
  let fundingStage = null;
  let pdlFound = false;

  try {
    pdlData = await fetchPDLCompany(domain, companyName);
  } catch (err) {
    console.warn(`[tierClassifier] PDL fetch failed for ${domain}: ${err.message}`);
  }

  if (pdlData) {
    pdlFound = true;
    pdlHeadcount = pdlData.employee_count ?? null;
    fundingStage = pdlData.latest_funding_stage ?? null;

    // PDL returns inferred_revenue as a string like "$10M-$50M" — parse the lower bound
    pdlRevenueUsd = parseRevenueString(pdlData.inferred_revenue);
  }

  const tierFromHC  = tierFromHeadcount(pdlHeadcount);
  const tierFromRev = tierFromRevenue(pdlRevenueUsd);

  // Resolve PDL-derived tier
  let pdlTier = null;
  let confidence = 'low';

  if (tierFromHC !== null && tierFromRev !== null) {
    if (tierFromHC === tierFromRev) {
      pdlTier = tierFromHC;
      confidence = 'high';
    } else {
      // Signals disagree — headcount wins per V2 MVP spec
      pdlTier = tierFromHC;
      confidence = 'medium';
    }
  } else if (tierFromHC !== null) {
    pdlTier = tierFromHC;
    confidence = 'medium';
  } else if (tierFromRev !== null) {
    pdlTier = tierFromRev;
    confidence = 'medium';
  } else {
    // No PDL signals — conservative default
    pdlTier = 2;
    confidence = 'low';
  }

  // ── Handle self-declaration ───────────────────────────────────────────────
  if (isOwnCompany && declaredTier != null) {
    const declared = parseInt(declaredTier, 10);
    const discrepancy = pdlFound && pdlTier !== declared;

    return {
      tier: declared,
      confidence: discrepancy ? 'medium' : confidence,
      assignment_method: 'employer_declared',
      pdl_headcount: pdlHeadcount,
      pdl_revenue_usd: pdlRevenueUsd,
      funding_stage: fundingStage,
      pdl_found: pdlFound,
      discrepancy,
      discrepancy_detail: discrepancy
        ? `Declared T${declared} but PDL signals suggest T${pdlTier} (headcount: ${pdlHeadcount ?? 'unknown'}).`
        : null,
    };
  }

  // ── System assignment ─────────────────────────────────────────────────────
  return {
    tier: pdlTier,
    confidence,
    assignment_method: 'system',
    pdl_headcount: pdlHeadcount,
    pdl_revenue_usd: pdlRevenueUsd,
    funding_stage: fundingStage,
    pdl_found: pdlFound,
    discrepancy: false,
    discrepancy_detail: null,
  };
}

// ─── REVENUE STRING PARSER ────────────────────────────────────────────────────
// PDL inferred_revenue looks like "$10M-$50M", "$1B-$10B", "<$1M", "$500M+"
// We extract the lower bound in USD.

function parseRevenueString(str) {
  if (!str || typeof str !== 'string') return null;

  const s = str.replace(/,/g, '').toLowerCase();

  // Handle ranges like "$10m-$50m" — take lower bound
  const rangeMatch = s.match(/\$?([\d.]+)\s*([bm]?)[\s\-–]+\$?([\d.]+)\s*([bm]?)/);
  if (rangeMatch) {
    return parseRevenueValue(rangeMatch[1], rangeMatch[2]);
  }

  // Handle "$500m+" or ">$1b"
  const singleMatch = s.match(/[>$]?\s*([\d.]+)\s*([bm]?)\+?/);
  if (singleMatch) {
    return parseRevenueValue(singleMatch[1], singleMatch[2]);
  }

  return null;
}

function parseRevenueValue(numStr, unit) {
  const num = parseFloat(numStr);
  if (isNaN(num)) return null;
  if (unit === 'b') return Math.round(num * 1_000_000_000);
  if (unit === 'm') return Math.round(num * 1_000_000);
  return Math.round(num);
}

module.exports = { classifyTier };
