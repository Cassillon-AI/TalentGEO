-- ============================================================
-- TalentGEO — Postgres Schema v1
-- Cloud SQL (Postgres 15+)
-- ============================================================


-- ============================================================
-- TIER WEIGHT VERSIONS
-- Lookup table for dimension weights per tier.
-- Defined before audits so audits can FK into it.
-- ============================================================
CREATE TABLE tier_weight_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_name   VARCHAR(50)  NOT NULL UNIQUE,  -- e.g. 'v2_mvp_launch'
  effective_from TIMESTAMPTZ  NOT NULL,
  effective_to   TIMESTAMPTZ,                   -- NULL = currently active
  notes          TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE tier_weights (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id  UUID       NOT NULL REFERENCES tier_weight_versions(id),
  tier        SMALLINT   NOT NULL CHECK (tier BETWEEN 1 AND 4),
  d1_weight   NUMERIC(4,2) NOT NULL,
  d2_weight   NUMERIC(4,2) NOT NULL,
  d3_weight   NUMERIC(4,2) NOT NULL,
  d4_weight   NUMERIC(4,2) NOT NULL,
  d5_weight   NUMERIC(4,2) NOT NULL,
  UNIQUE (version_id, tier)
);

-- Seed: V2 MVP weights from spec § 2
INSERT INTO tier_weight_versions (id, version_name, effective_from, notes)
VALUES (
  'b1000000-0000-0000-0000-000000000001',
  'v2_mvp_launch',
  '2026-06-22T00:00:00Z',
  'Placeholder weights per UTP V2 spec § 2. Empirically refined post-baseline audits.'
);

INSERT INTO tier_weights (version_id, tier, d1_weight, d2_weight, d3_weight, d4_weight, d5_weight) VALUES
  ('b1000000-0000-0000-0000-000000000001', 1, 0.15, 0.15, 0.10, 0.20, 0.40),
  ('b1000000-0000-0000-0000-000000000001', 2, 0.15, 0.20, 0.15, 0.15, 0.35),
  ('b1000000-0000-0000-0000-000000000001', 3, 0.15, 0.20, 0.20, 0.15, 0.30),
  ('b1000000-0000-0000-0000-000000000001', 4, 0.15, 0.25, 0.20, 0.10, 0.30);


-- ============================================================
-- COMPANIES
-- One row per employer, ever.
-- ============================================================
CREATE TABLE companies (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 VARCHAR(255) NOT NULL,
  domain               VARCHAR(255) NOT NULL UNIQUE,
  canonical_url        VARCHAR(500),
  headquarters         VARCHAR(255),
  industry             VARCHAR(100),
  pdl_company_id       VARCHAR(100),
  fortune_ranking      INTEGER,
  fortune_ranking_year SMALLINT,               -- e.g. 2026; ranking changes annually
  is_public            BOOLEAN      NOT NULL DEFAULT FALSE,
  deleted_at           TIMESTAMPTZ,            -- soft delete
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_companies_domain    ON companies(domain);
CREATE INDEX idx_companies_active    ON companies(id) WHERE deleted_at IS NULL;


-- ============================================================
-- TIER CLASSIFICATIONS
-- Full history preserved. One active row per company
-- (effective_to IS NULL = current).
-- ============================================================
CREATE TABLE tier_classifications (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID         NOT NULL REFERENCES companies(id),
  tier              SMALLINT     NOT NULL CHECK (tier BETWEEN 1 AND 4),
  assignment_method VARCHAR(20)  NOT NULL
                    CHECK (assignment_method IN ('system','employer_declared','manual')),
  pdl_headcount     INTEGER,
  pdl_revenue_usd   BIGINT,
  funding_stage     VARCHAR(30),               -- 'seed', 'series-a', 'series-b', etc.
  confidence        VARCHAR(10)  NOT NULL
                    CHECK (confidence IN ('high','medium','low')),
  effective_from    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  effective_to      TIMESTAMPTZ,               -- NULL = currently active
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tier_active         ON tier_classifications(company_id) WHERE effective_to IS NULL;
CREATE INDEX idx_tier_company        ON tier_classifications(company_id, effective_from DESC);


-- ============================================================
-- USERS
-- Defined before audits so audits can FK into it.
-- ============================================================
CREATE TABLE users (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) NOT NULL UNIQUE,
  company_id  UUID         REFERENCES companies(id),
  role        VARCHAR(20)  NOT NULL DEFAULT 'customer'
              CHECK (role IN ('customer','cassillon_admin')),
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- ============================================================
-- AUDITS
-- One row per audit run. The time-series spine of the system.
-- tier_percentile is NOT stored here — computed at query time
-- via the audit_scores_with_percentile view below.
-- ============================================================
CREATE TABLE audits (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               UUID         NOT NULL REFERENCES companies(id),
  initiated_by_user_id     UUID         REFERENCES users(id),   -- NULL for baseline/system audits
  audit_type               VARCHAR(20)  NOT NULL
                           CHECK (audit_type IN ('customer','baseline','internal')),
  initiated_by             VARCHAR(20)  NOT NULL
                           CHECK (initiated_by IN ('employer','cassillon','system')),
  tier_at_audit            SMALLINT     NOT NULL CHECK (tier_at_audit BETWEEN 1 AND 4),
  weights_version_id       UUID         NOT NULL REFERENCES tier_weight_versions(id),

  -- Composite scoring
  composite_score          NUMERIC(5,2),
  grade_label              VARCHAR(20)
                           CHECK (grade_label IN ('Excellent','Good','Average','Needs Improvement')),

  -- Per-dimension scores
  d1_score                 NUMERIC(5,2),
  d2_score                 NUMERIC(5,2),
  d3_score                 NUMERIC(5,2),
  d4_score                 NUMERIC(5,2),
  d5_score                 NUMERIC(5,2),

  -- Failure flags
  catastrophic_d1_failure  BOOLEAN      NOT NULL DEFAULT FALSE,
  composite_capped         BOOLEAN      NOT NULL DEFAULT FALSE,  -- capped at 30 due to D1

  -- Data quality
  data_completeness_pct    NUMERIC(5,2),
  score_status             VARCHAR(15)  NOT NULL DEFAULT 'final'
                           CHECK (score_status IN ('final','provisional','insufficient')),

  -- Execution metadata
  claude_model             VARCHAR(60),
  data_sources_used        JSONB,
  edge_cases_applied       JSONB,
  duration_ms              INTEGER,

  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audits_company_time ON audits(company_id, created_at DESC);
CREATE INDEX idx_audits_tier_score   ON audits(tier_at_audit, composite_score);
CREATE INDEX idx_audits_tier_time    ON audits(tier_at_audit, created_at DESC);
CREATE INDEX idx_audits_type         ON audits(audit_type);


-- ============================================================
-- TIER PERCENTILE VIEW
-- Computes percentile at query time against the live baseline
-- cohort. PERCENT_RANK() = 0 (lowest score) → 1 (highest).
-- Multiply by 100 so 85 = "better than 85% of tier peers."
-- Filter to baseline audits only — customer one-offs should
-- not distort the benchmark cohort.
-- ============================================================
CREATE VIEW audit_scores_with_percentile AS
SELECT
  a.*,
  ROUND(
    (PERCENT_RANK() OVER (
      PARTITION BY a.tier_at_audit
      ORDER BY a.composite_score ASC
    ) * 100)::NUMERIC,
    1
  ) AS tier_percentile
FROM audits a
WHERE a.audit_type = 'baseline'
  AND a.composite_score IS NOT NULL;


-- ============================================================
-- D1 — SCHEMA INTEGRITY DETAIL
-- No UNIQUE on audit_id — partial re-audits are in scope.
-- Current row: replaced_at IS NULL.
-- ============================================================
CREATE TABLE audit_d1 (
  id                          UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id                    UUID     NOT NULL REFERENCES audits(id),
  replaced_at                 TIMESTAMPTZ,            -- set when superseded by a re-audit

  -- Core markers (all tiers)
  jobposting_schema_present   BOOLEAN,
  uses_json_ld                BOOLEAN,
  field_title                 BOOLEAN,
  field_description           BOOLEAN,
  field_date_posted           BOOLEAN,
  field_hiring_org            BOOLEAN,
  field_job_location          BOOLEAN,
  org_schema_present          BOOLEAN,
  robots_allows_llm_crawlers  BOOLEAN,
  sitemap_exists              BOOLEAN,
  sitemap_includes_jobs       BOOLEAN,
  has_canonical_urls          BOOLEAN,
  has_meta_tags               BOOLEAN,
  core_pass_rate              NUMERIC(5,2),

  -- Enhanced markers (T2+)
  field_base_salary           BOOLEAN,
  field_employment_type       BOOLEAN,
  field_valid_through         BOOLEAN,
  field_applicant_location    BOOLEAN,
  has_breadcrumb_schema       BOOLEAN,
  has_place_schema            BOOLEAN,
  enhanced_pass_rate          NUMERIC(5,2),

  -- Advanced markers (T3+)
  has_hreflang                BOOLEAN,
  has_hierarchical_org_schema BOOLEAN,
  has_action_schema           BOOLEAN,
  json_ld_validates           BOOLEAN,
  advanced_pass_rate          NUMERIC(5,2),

  -- ATS context
  ats_platform                VARCHAR(100),
  ats_controls_schema         BOOLEAN DEFAULT FALSE,
  no_career_site              BOOLEAN DEFAULT FALSE,  -- D1 = N/A case

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_d1_audit         ON audit_d1(audit_id);
CREATE INDEX idx_d1_audit_current ON audit_d1(audit_id) WHERE replaced_at IS NULL;


-- ============================================================
-- D2 — CONTENT READINESS DETAIL
-- ============================================================
CREATE TABLE audit_d2 (
  id                              UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id                        UUID     NOT NULL REFERENCES audits(id),
  replaced_at                     TIMESTAMPTZ,

  -- JD audit (Sub-Protocol 1)
  jd_metadata_clarity             SMALLINT CHECK (jd_metadata_clarity BETWEEN 1 AND 5),
  jd_structural_clarity           SMALLINT CHECK (jd_structural_clarity BETWEEN 1 AND 5),
  jd_specificity_quantification   SMALLINT CHECK (jd_specificity_quantification BETWEEN 1 AND 5),
  jd_role_clarity                 SMALLINT CHECK (jd_role_clarity BETWEEN 1 AND 5),
  jd_brand_voice                  SMALLINT CHECK (jd_brand_voice BETWEEN 1 AND 5),
  jd_candidate_self_assessment    SMALLINT CHECK (jd_candidate_self_assessment BETWEEN 1 AND 5),
  jd_total_score                  SMALLINT,   -- sum, max 30
  jd_urls_audited                 JSONB,      -- array of URLs sampled
  jd_sample_size                  SMALLINT,

  -- Career site audit (Sub-Protocol 2)
  cs_metadata_clarity             SMALLINT CHECK (cs_metadata_clarity BETWEEN 1 AND 5),
  cs_structural_clarity           SMALLINT CHECK (cs_structural_clarity BETWEEN 1 AND 5),
  cs_specificity_quantification   SMALLINT CHECK (cs_specificity_quantification BETWEEN 1 AND 5),
  cs_role_clarity                 SMALLINT CHECK (cs_role_clarity BETWEEN 1 AND 5),
  cs_brand_voice                  SMALLINT CHECK (cs_brand_voice BETWEEN 1 AND 5),
  cs_candidate_self_assessment    SMALLINT CHECK (cs_candidate_self_assessment BETWEEN 1 AND 5),
  cs_total_score                  SMALLINT,

  -- UTP metadata block
  metadata_block_present          BOOLEAN,
  metadata_fields_populated       JSONB,      -- {role_title: true, compensation: false, ...}
  metadata_completeness_pct       NUMERIC(5,2),

  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_d2_audit         ON audit_d2(audit_id);
CREATE INDEX idx_d2_audit_current ON audit_d2(audit_id) WHERE replaced_at IS NULL;


-- ============================================================
-- D3 — BRAND SIGNAL DETAIL
-- mention_sample moved to audit_d3_mentions below.
-- ============================================================
CREATE TABLE audit_d3 (
  id                      UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id                UUID     NOT NULL REFERENCES audits(id),
  replaced_at             TIMESTAMPTZ,

  -- TSOV
  tsov_score              NUMERIC(5,2),
  competitive_set         JSONB,          -- array of competitor names used
  competitive_set_size    SMALLINT,

  -- Sentiment summary
  total_mentions          INTEGER,
  sentiment_positive_pct  NUMERIC(5,2),
  sentiment_neutral_pct   NUMERIC(5,2),
  sentiment_negative_pct  NUMERIC(5,2),

  -- Source diversity
  sources_queried         JSONB,          -- which sources were attempted
  sources_with_data       JSONB,          -- which returned results
  source_diversity_score  NUMERIC(5,2),
  tier1_source_count      SMALLINT,
  tier2_source_count      SMALLINT,

  -- Review sites
  glassdoor_rating        NUMERIC(3,2),
  glassdoor_review_count  INTEGER,
  indeed_rating           NUMERIC(3,2),
  indeed_review_count     INTEGER,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_d3_audit         ON audit_d3(audit_id);
CREATE INDEX idx_d3_audit_current ON audit_d3(audit_id) WHERE replaced_at IS NULL;


-- ============================================================
-- D3 MENTIONS
-- One row per signal mention. Separated from audit_d3 to
-- avoid JSONB row bloat on high-volume sources.
-- ============================================================
CREATE TABLE audit_d3_mentions (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id         UUID         NOT NULL REFERENCES audits(id),
  source           VARCHAR(50)  NOT NULL,   -- 'reddit', 'glassdoor', 'indeed', 'hackernews', etc.
  source_tier      SMALLINT     CHECK (source_tier BETWEEN 1 AND 3),
  authority_weight NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  url              TEXT,
  title            TEXT,
  content_snippet  TEXT,
  sentiment        VARCHAR(10)  CHECK (sentiment IN ('positive','neutral','negative')),
  subreddit        VARCHAR(100),            -- NULL if not Reddit
  published_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_d3_mentions_audit     ON audit_d3_mentions(audit_id);
CREATE INDEX idx_d3_mentions_sentiment ON audit_d3_mentions(audit_id, sentiment);


-- ============================================================
-- D4 — CONTINUITY INDICATOR DETAIL
-- ============================================================
CREATE TABLE audit_d4 (
  id                          UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id                    UUID     NOT NULL REFERENCES audits(id),
  replaced_at                 TIMESTAMPTZ,

  -- Theme alignment
  theme_alignment_pct         NUMERIC(5,2),
  continuity_level            VARCHAR(25)
                              CHECK (continuity_level IN (
                                'Strong Alignment','Mostly Aligned',
                                'Mixed Signal','Significant Divergence')),
  upstream_themes             JSONB,
  downstream_themes           JSONB,

  -- Sentiment direction
  upstream_sentiment          VARCHAR(10) CHECK (upstream_sentiment IN ('positive','neutral','negative')),
  downstream_sentiment        VARCHAR(10) CHECK (downstream_sentiment IN ('positive','neutral','negative')),
  sentiment_direction_aligned BOOLEAN,

  -- Divergence (descriptive, not prosecutorial)
  divergence_flags            JSONB,      -- array of theme-level descriptions
  divergence_count            SMALLINT,

  -- Data quality
  downstream_data_age_months  NUMERIC(4,1),
  d4_applicable               BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE for tiny T1 with no downstream signal

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_d4_audit         ON audit_d4(audit_id);
CREATE INDEX idx_d4_audit_current ON audit_d4(audit_id) WHERE replaced_at IS NULL;


-- ============================================================
-- D5 — DISTRIBUTION + AGENTIC READINESS DETAIL
-- Linked: signal quality (defense) × agentic readiness.
-- ============================================================
CREATE TABLE audit_d5 (
  id                           UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id                     UUID     NOT NULL REFERENCES audits(id),
  replaced_at                  TIMESTAMPTZ,

  -- Distribution maturity (1=career site only, 2=multi-channel, 3=agentic)
  distribution_tier            SMALLINT CHECK (distribution_tier BETWEEN 1 AND 3),

  -- Channel presence
  on_career_site               BOOLEAN,
  on_linkedin_jobs             BOOLEAN,
  on_indeed                    BOOLEAN,
  on_google_for_jobs           BOOLEAN,
  on_glassdoor_jobs            BOOLEAN,
  on_wellfound                 BOOLEAN,
  on_builtin                   BOOLEAN,
  additional_channels          JSONB,   -- other boards detected

  -- Sub-Dimension A: Spam/Fraud vulnerability
  signal_quality_score         NUMERIC(5,2),
  has_captcha                  BOOLEAN,
  has_rate_limiting            BOOLEAN,
  ats_fraud_defense_enabled    BOOLEAN,
  easy_apply_exposed           BOOLEAN, -- LinkedIn Easy Apply / Indeed Apply
  open_api_unprotected         BOOLEAN,

  -- Sub-Dimension B: Agentic readiness
  agentic_readiness_score      NUMERIC(5,2),
  has_structured_feed          BOOLEAN,
  has_job_listings_api         BOOLEAN,
  has_real_time_freshness      BOOLEAN,
  has_conversational_interface BOOLEAN,
  schema_completeness_score    NUMERIC(5,2),

  -- Linkage outcome
  d5_status                    VARCHAR(25)
                               CHECK (d5_status IN (
                                 'OPTIMAL','DEFENDED_BUT_INVISIBLE',
                                 'LEGACY','DANGEROUS')),
  score_penalized              BOOLEAN NOT NULL DEFAULT FALSE,

  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_d5_audit         ON audit_d5(audit_id);
CREATE INDEX idx_d5_audit_current ON audit_d5(audit_id) WHERE replaced_at IS NULL;


-- ============================================================
-- RECOMMENDATIONS
-- Per-audit. prior_recommendation_id chains recurrences
-- across audits so you can track "this gap was flagged in
-- audit A, persists in audit B, resolved in audit C."
-- ============================================================
CREATE TABLE audit_recommendations (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id                 UUID         NOT NULL REFERENCES audits(id),
  prior_recommendation_id  UUID         REFERENCES audit_recommendations(id),  -- chain across audits
  priority_class           VARCHAR(15)  NOT NULL
                           CHECK (priority_class IN ('critical','high_impact','quick_win','strategic')),
  dimension                VARCHAR(5),            -- 'D1'–'D5', NULL = cross-dimensional
  title                    VARCHAR(255) NOT NULL,
  description              TEXT,
  rule_triggered           VARCHAR(100),          -- e.g. 'D1_CATASTROPHIC_FAILURE'
  sort_order               SMALLINT,
  -- Outcome tracking
  status                   VARCHAR(15)  NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open','completed','dismissed')),
  resolved_in_audit_id     UUID         REFERENCES audits(id),
  completed_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recs_audit          ON audit_recommendations(audit_id);
CREATE INDEX idx_recs_prior          ON audit_recommendations(prior_recommendation_id)
                                     WHERE prior_recommendation_id IS NOT NULL;
CREATE INDEX idx_recs_resolved       ON audit_recommendations(resolved_in_audit_id)
                                     WHERE resolved_in_audit_id IS NOT NULL;
CREATE INDEX idx_recs_open           ON audit_recommendations(audit_id)
                                     WHERE status = 'open';


-- ============================================================
-- AUDIT LOG
-- Append-only record of sensitive mutations.
-- ============================================================
CREATE TABLE audit_log (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name           VARCHAR(100) NOT NULL,
  record_id            UUID         NOT NULL,
  action               VARCHAR(10)  NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  changed_by_user_id   UUID         REFERENCES users(id),
  old_values           JSONB,
  new_values           JSONB,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_time   ON audit_log(created_at DESC);


-- ============================================================
-- updated_at TRIGGER
-- Postgres doesn't auto-update updated_at. This trigger
-- handles it for any table that has the column.
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
