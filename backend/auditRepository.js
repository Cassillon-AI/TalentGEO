const db = require('./db');

// Active weights version — matches the seed in schema.sql
const WEIGHTS_VERSION_ID = 'b1000000-0000-0000-0000-000000000001';

// Tier weights per spec § 2 (mirrored from tier_weights table for composite calc)
const TIER_WEIGHTS = {
  1: { d1: 0.15, d2: 0.15, d3: 0.10, d4: 0.20, d5: 0.40 },
  2: { d1: 0.15, d2: 0.20, d3: 0.15, d4: 0.15, d5: 0.35 },
  3: { d1: 0.15, d2: 0.20, d3: 0.20, d4: 0.15, d5: 0.30 },
  4: { d1: 0.15, d2: 0.25, d3: 0.20, d4: 0.10, d5: 0.30 },
};

// ─── UPSERT COMPANY ──────────────────────────────────────────────────────────
// Inserts a new company or returns the existing one by domain.
async function upsertCompany({ name, domain, industry }) {
  const result = await db.query(
    `INSERT INTO companies (name, domain, industry)
     VALUES ($1, $2, $3)
     ON CONFLICT (domain) DO UPDATE
       SET name = EXCLUDED.name,
           industry = COALESCE(EXCLUDED.industry, companies.industry),
           updated_at = NOW()
     RETURNING id`,
    [name, domain, industry || null]
  );
  return result.rows[0].id;
}

// ─── SAVE AUDIT ──────────────────────────────────────────────────────────────
// Persists a completed audit and all dimension detail rows.
// Returns the new audit UUID.
async function saveAudit({ companyId, report, auditData, requestBody, tierResult }) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const dimensions = report.dimensions || [];
    const d1 = dimensions.find(d => d.id === 'D1');
    const d2 = dimensions.find(d => d.id === 'D2');
    const d3 = dimensions.find(d => d.id === 'D3');
    const d4 = dimensions.find(d => d.id === 'D4');
    const d5 = dimensions.find(d => d.id === 'D5');

    const d1Score = d1?.score ?? null;
    const d2Score = d2?.score ?? null;
    const d3Score = d3?.score ?? null;
    const d4Score = d4?.score ?? null;
    const d5Score = d5?.score ?? null;

    const tier = tierResult?.tier ?? 2;
    const weights = TIER_WEIGHTS[tier];

    // Composite score using tier-aware weights
    let compositeScore = null;
    if (d1Score !== null && d2Score !== null && d3Score !== null && d4Score !== null && d5Score !== null) {
      compositeScore = Math.round(
        d1Score * weights.d1 +
        d2Score * weights.d2 +
        d3Score * weights.d3 +
        d4Score * weights.d4 +
        d5Score * weights.d5
      );
    }

    const catastrophicD1 = d1Score !== null && d1Score < 20;
    const compositeCapped = catastrophicD1 && compositeScore > 30;
    if (compositeCapped) compositeScore = 30;

    const GRADE_THRESHOLDS = {
      1: { excellent: 65, good: 50 },
      2: { excellent: 80, good: 65 },
      3: { excellent: 85, good: 70 },
      4: { excellent: 90, good: 75 },
    };
    const thresholds = GRADE_THRESHOLDS[tier] ?? GRADE_THRESHOLDS[2];
    const gradeLabel = compositeScore === null ? null
      : compositeScore >= thresholds.excellent ? 'Excellent'
      : compositeScore >= thresholds.good ? 'Good'
      : compositeScore >= 40 ? 'Average'
      : 'Needs Improvement';

    // ── tier_classifications row ──────────────────────────────────────────────
    // Close any existing active classification before inserting the new one.
    await client.query(
      `UPDATE tier_classifications
       SET effective_to = NOW()
       WHERE company_id = $1 AND effective_to IS NULL`,
      [companyId]
    );

    await client.query(
      `INSERT INTO tier_classifications (
         company_id, tier, assignment_method,
         pdl_headcount, pdl_revenue_usd, funding_stage,
         confidence, discrepancy, discrepancy_detail, effective_from
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        companyId,
        tier,
        tierResult?.assignment_method ?? 'system',
        tierResult?.pdl_headcount ?? null,
        tierResult?.pdl_revenue_usd ?? null,
        tierResult?.funding_stage ?? null,
        tierResult?.confidence ?? 'low',
        tierResult?.discrepancy ?? false,
        tierResult?.discrepancy_detail ?? null,
      ]
    );

    // ── audits row ────────────────────────────────────────────────────────────
    const auditResult = await client.query(
      `INSERT INTO audits (
         company_id, audit_type, initiated_by, tier_at_audit, weights_version_id,
         composite_score, grade_label,
         d1_score, d2_score, d3_score, d4_score, d5_score,
         catastrophic_d1_failure, composite_capped,
         data_completeness_pct, score_status,
         claude_model, data_sources_used
       ) VALUES (
         $1, 'customer', $2, $3, $4,
         $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13,
         $14, 'final',
         'claude-sonnet-4-6', $15
       ) RETURNING id`,
      [
        companyId,
        tierResult?.assignment_method === 'employer_declared' ? 'employer' : 'cassillon',
        tier, WEIGHTS_VERSION_ID,
        compositeScore, gradeLabel,
        d1Score, d2Score, d3Score, d4Score, d5Score,
        catastrophicD1, compositeCapped,
        null, // data_completeness_pct — calculated once data sourcing is richer
        JSON.stringify({
          robots: auditData?.robotsData ? true : false,
          sitemap: auditData?.sitemapData ? true : false,
          reddit: auditData?.redditData?.success || false,
          jobPages: (auditData?.jobPageData?.length || 0),
        }),
      ]
    );
    const auditId = auditResult.rows[0].id;

    // ── audit_d1 row ──────────────────────────────────────────────────────────
    const robots = auditData?.robotsData || '';
    const sitemap = auditData?.sitemapData || '';
    await client.query(
      `INSERT INTO audit_d1 (
         audit_id,
         robots_allows_llm_crawlers, sitemap_exists, sitemap_includes_jobs,
         ats_platform, ats_controls_schema
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        auditId,
        robots ? !robots.includes('GPTBot') && !robots.includes('Disallow: /') : null,
        sitemap ? sitemap.length > 0 : false,
        sitemap ? sitemap.includes('job') || sitemap.includes('career') : false,
        requestBody?.selectedATS || null,
        !!requestBody?.selectedATS,
      ]
    );

    // ── audit_d2 row ──────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO audit_d2 (audit_id, jd_urls_audited, jd_sample_size)
       VALUES ($1, $2, $3)`,
      [
        auditId,
        JSON.stringify(requestBody?.jobUrls || []),
        (requestBody?.jobUrls || []).length,
      ]
    );

    // ── audit_d3 row + mentions ───────────────────────────────────────────────
    const reddit = auditData?.redditData || {};
    const d3Row = await client.query(
      `INSERT INTO audit_d3 (
         audit_id,
         total_mentions, sentiment_positive_pct, sentiment_neutral_pct, sentiment_negative_pct,
         sources_queried, sources_with_data
       ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        auditId,
        reddit.totalPosts || 0,
        reddit.sentimentBreakdown?.positive || 0,
        reddit.sentimentBreakdown?.neutral || 0,
        reddit.sentimentBreakdown?.negative || 0,
        JSON.stringify(['reddit']),
        JSON.stringify(reddit.success ? ['reddit'] : []),
      ]
    );

    // Save individual Reddit mentions
    if (reddit.posts && reddit.posts.length > 0) {
      for (const post of reddit.posts.slice(0, 50)) {
        await client.query(
          `INSERT INTO audit_d3_mentions (
             audit_id, source, source_tier, url, title, content_snippet,
             sentiment, subreddit, published_at
           ) VALUES ($1, 'reddit', 2, $2, $3, $4, $5, $6, $7)`,
          [
            auditId,
            post.url || null,
            post.title || null,
            post.snippet || null,
            post.sentiment || 'neutral',
            post.subreddit || null,
            post.publishedAt ? new Date(post.publishedAt) : null,
          ]
        );
      }
    }

    // ── audit_d4 row ──────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO audit_d4 (audit_id, d4_applicable)
       VALUES ($1, true)`,
      [auditId]
    );

    // ── audit_d5 row ──────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO audit_d5 (audit_id, on_career_site)
       VALUES ($1, true)`,
      [auditId]
    );

    // ── recommendations ───────────────────────────────────────────────────────
    const actions = [
      ...(report.internalActions || []).map((a, i) => ({
        priority_class: a.impact === 'High' && a.effort === 'Low' ? 'quick_win'
          : a.impact === 'High' ? 'high_impact'
          : 'strategic',
        dimension: a.dimension || null,
        title: a.title,
        description: a.description,
        rule_triggered: null,
        sort_order: i,
      })),
    ];

    for (const rec of actions) {
      await client.query(
        `INSERT INTO audit_recommendations
           (audit_id, priority_class, dimension, title, description, rule_triggered, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [auditId, rec.priority_class, rec.dimension, rec.title, rec.description, rec.rule_triggered, rec.sort_order]
      );
    }

    await client.query('COMMIT');
    return auditId;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { upsertCompany, saveAudit };
