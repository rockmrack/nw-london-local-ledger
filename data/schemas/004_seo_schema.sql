-- NW London Local Ledger - SEO and Analytics Schema
-- Version: 1.0.0
-- Description: Tables for SEO management, analytics, and page generation

-- ============================================
-- SEO PAGES
-- ============================================

-- Generated Pages (tracking for programmatic SEO)
CREATE TABLE generated_pages (
    id SERIAL PRIMARY KEY,

    -- Page identifiers
    page_type VARCHAR(50) NOT NULL, -- 'property', 'area', 'street', 'school', 'planning', 'news'
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER NOT NULL,

    -- URL and SEO
    path VARCHAR(500) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    meta_description TEXT,
    canonical_url TEXT,

    -- Schema markup
    schema_type VARCHAR(100),
    schema_json JSONB,

    -- Status
    status VARCHAR(50) DEFAULT 'published', -- 'draft', 'published', 'archived'
    indexed_by_google BOOLEAN DEFAULT FALSE,
    last_crawled_at TIMESTAMP,

    -- Performance
    page_speed_score INTEGER,
    core_web_vitals JSONB,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT generated_pages_entity_unique UNIQUE(page_type, entity_id)
);

CREATE INDEX idx_generated_pages_page_type ON generated_pages(page_type);
CREATE INDEX idx_generated_pages_entity ON generated_pages(entity_type, entity_id);
CREATE INDEX idx_generated_pages_path ON generated_pages(path);
CREATE INDEX idx_generated_pages_status ON generated_pages(status);
CREATE INDEX idx_generated_pages_indexed ON generated_pages(indexed_by_google);

-- Internal Links (tracking internal linking structure)
CREATE TABLE internal_links (
    id SERIAL PRIMARY KEY,

    -- Link details
    from_page_id INTEGER REFERENCES generated_pages(id) ON DELETE CASCADE,
    to_page_id INTEGER REFERENCES generated_pages(id) ON DELETE CASCADE,

    -- Link attributes
    anchor_text VARCHAR(300),
    link_type VARCHAR(50), -- 'contextual', 'navigation', 'related', 'footer'
    position_on_page VARCHAR(50), -- 'content', 'sidebar', 'header', 'footer'

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT internal_links_unique UNIQUE(from_page_id, to_page_id, anchor_text)
);

CREATE INDEX idx_internal_links_from ON internal_links(from_page_id);
CREATE INDEX idx_internal_links_to ON internal_links(to_page_id);
CREATE INDEX idx_internal_links_type ON internal_links(link_type);

-- ============================================
-- SEO KEYWORDS
-- ============================================

-- Keywords
CREATE TABLE keywords (
    id SERIAL PRIMARY KEY,

    -- Keyword details
    keyword VARCHAR(300) NOT NULL UNIQUE,
    keyword_type VARCHAR(50), -- 'primary', 'secondary', 'long_tail'
    search_volume INTEGER,
    competition VARCHAR(50), -- 'low', 'medium', 'high'
    cpc DECIMAL(10, 2),

    -- Targeting
    target_page_id INTEGER REFERENCES generated_pages(id) ON DELETE SET NULL,

    -- Performance
    current_position INTEGER,
    best_position INTEGER,
    last_checked_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_keywords_keyword ON keywords(keyword);
CREATE INDEX idx_keywords_type ON keywords(keyword_type);
CREATE INDEX idx_keywords_target_page ON keywords(target_page_id);
CREATE INDEX idx_keywords_position ON keywords(current_position);

-- Keyword Rankings History
CREATE TABLE keyword_rankings (
    id SERIAL PRIMARY KEY,
    keyword_id INTEGER REFERENCES keywords(id) ON DELETE CASCADE,

    -- Ranking data
    position INTEGER,
    url TEXT,
    search_volume INTEGER,

    -- Snapshot date
    recorded_at DATE NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(keyword_id, recorded_at)
);

CREATE INDEX idx_keyword_rankings_keyword ON keyword_rankings(keyword_id);
CREATE INDEX idx_keyword_rankings_recorded_at ON keyword_rankings(recorded_at DESC);

-- ============================================
-- ANALYTICS
-- ============================================

-- Page Analytics (daily aggregation)
CREATE TABLE page_analytics (
    id SERIAL PRIMARY KEY,
    page_id INTEGER REFERENCES generated_pages(id) ON DELETE CASCADE,

    -- Traffic data
    pageviews INTEGER DEFAULT 0,
    unique_visitors INTEGER DEFAULT 0,
    bounce_rate DECIMAL(5, 2),
    avg_time_on_page INTEGER, -- seconds

    -- Sources
    organic_traffic INTEGER DEFAULT 0,
    direct_traffic INTEGER DEFAULT 0,
    referral_traffic INTEGER DEFAULT 0,
    social_traffic INTEGER DEFAULT 0,

    -- Conversions
    clicks_to_main_site INTEGER DEFAULT 0,

    -- Date
    analytics_date DATE NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(page_id, analytics_date)
);

CREATE INDEX idx_page_analytics_page ON page_analytics(page_id);
CREATE INDEX idx_page_analytics_date ON page_analytics(analytics_date DESC);

-- Search Console Data
CREATE TABLE search_console_data (
    id SERIAL PRIMARY KEY,
    page_id INTEGER REFERENCES generated_pages(id) ON DELETE CASCADE,

    -- Search data
    query VARCHAR(500) NOT NULL,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    ctr DECIMAL(5, 4),
    position DECIMAL(5, 2),

    -- Date
    data_date DATE NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(page_id, query, data_date)
);

CREATE INDEX idx_search_console_page ON search_console_data(page_id);
CREATE INDEX idx_search_console_query ON search_console_data(query);
CREATE INDEX idx_search_console_date ON search_console_data(data_date DESC);
CREATE INDEX idx_search_console_clicks ON search_console_data(clicks DESC);

-- ============================================
-- BACKLINKS
-- ============================================

-- Backlinks (from external sites)
CREATE TABLE backlinks (
    id SERIAL PRIMARY KEY,

    -- Link details
    source_url TEXT NOT NULL,
    source_domain VARCHAR(300) NOT NULL,
    target_page_id INTEGER REFERENCES generated_pages(id) ON DELETE SET NULL,
    target_url TEXT NOT NULL,

    -- Link attributes
    anchor_text VARCHAR(500),
    link_type VARCHAR(50), -- 'dofollow', 'nofollow'

    -- Metrics
    domain_authority INTEGER,
    page_authority INTEGER,
    spam_score INTEGER,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    first_seen_at TIMESTAMP,
    last_seen_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(source_url, target_url)
);

CREATE INDEX idx_backlinks_source_domain ON backlinks(source_domain);
CREATE INDEX idx_backlinks_target_page ON backlinks(target_page_id);
CREATE INDEX idx_backlinks_is_active ON backlinks(is_active);
CREATE INDEX idx_backlinks_domain_authority ON backlinks(domain_authority DESC);

-- ============================================
-- SITEMAP
-- ============================================

-- Sitemap Entries
CREATE TABLE sitemap_entries (
    id SERIAL PRIMARY KEY,
    page_id INTEGER REFERENCES generated_pages(id) ON DELETE CASCADE,

    -- Sitemap details
    loc TEXT NOT NULL UNIQUE,
    lastmod TIMESTAMP,
    changefreq VARCHAR(20), -- 'always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'
    priority DECIMAL(2, 1),

    -- Status
    included_in_sitemap BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sitemap_page ON sitemap_entries(page_id);
CREATE INDEX idx_sitemap_included ON sitemap_entries(included_in_sitemap);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER update_generated_pages_updated_at BEFORE UPDATE ON generated_pages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_keywords_updated_at BEFORE UPDATE ON keywords
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_backlinks_updated_at BEFORE UPDATE ON backlinks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sitemap_entries_updated_at BEFORE UPDATE ON sitemap_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VIEWS
-- ============================================

-- Top performing pages
CREATE VIEW top_performing_pages AS
SELECT
    gp.id,
    gp.path,
    gp.title,
    gp.page_type,
    SUM(pa.pageviews) as total_pageviews,
    SUM(pa.unique_visitors) as total_unique_visitors,
    SUM(pa.clicks_to_main_site) as total_conversions,
    AVG(pa.bounce_rate) as avg_bounce_rate
FROM generated_pages gp
JOIN page_analytics pa ON gp.id = pa.page_id
WHERE pa.analytics_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY gp.id, gp.path, gp.title, gp.page_type
ORDER BY total_pageviews DESC;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE generated_pages IS 'Programmatically generated pages for SEO';
COMMENT ON TABLE internal_links IS 'Internal linking structure between pages';
COMMENT ON TABLE keywords IS 'Target keywords and their rankings';
COMMENT ON TABLE page_analytics IS 'Daily page analytics aggregated data';
COMMENT ON TABLE backlinks IS 'External backlinks to the site';
COMMENT ON TABLE sitemap_entries IS 'Sitemap management for generated pages';
