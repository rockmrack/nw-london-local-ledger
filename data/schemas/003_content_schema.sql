-- NW London Local Ledger - Content Schema
-- Version: 1.0.0
-- Description: Tables for news, articles, and AI-generated content

-- ============================================
-- SCHOOLS
-- ============================================

-- Schools
CREATE TABLE schools (
    id SERIAL PRIMARY KEY,

    -- School identifiers
    name VARCHAR(300) NOT NULL,
    slug VARCHAR(300) NOT NULL UNIQUE,
    urn VARCHAR(50) UNIQUE, -- Unique Reference Number from Ofsted

    -- School details
    school_type VARCHAR(100), -- 'primary', 'secondary', 'nursery', etc.
    phase VARCHAR(50),
    religious_character VARCHAR(100),

    -- Address
    address_line_1 VARCHAR(200),
    address_line_2 VARCHAR(200),
    postcode VARCHAR(10),
    area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,

    -- Geographical data
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    location GEOMETRY(POINT, 4326),

    -- Performance data
    ofsted_rating VARCHAR(50),
    ofsted_date DATE,
    ofsted_report_url TEXT,

    student_count INTEGER,
    pupil_teacher_ratio DECIMAL(5, 2),

    -- Admissions
    admission_policy VARCHAR(100),
    catchment_distance_meters INTEGER,

    -- Contact
    phone VARCHAR(50),
    email VARCHAR(200),
    website TEXT,

    -- SEO
    meta_title VARCHAR(200),
    meta_description TEXT,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_schools_slug ON schools(slug);
CREATE INDEX idx_schools_urn ON schools(urn);
CREATE INDEX idx_schools_area_id ON schools(area_id);
CREATE INDEX idx_schools_school_type ON schools(school_type);
CREATE INDEX idx_schools_ofsted_rating ON schools(ofsted_rating);
CREATE INDEX idx_schools_location ON schools USING GIST(location);

-- ============================================
-- NEWS & ARTICLES
-- ============================================

-- News Articles
CREATE TABLE news_articles (
    id SERIAL PRIMARY KEY,

    -- Article details
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) NOT NULL UNIQUE,
    excerpt TEXT,
    content TEXT NOT NULL,

    -- Article metadata
    article_type VARCHAR(50) NOT NULL, -- 'news', 'analysis', 'guide', 'data_journalism'
    source VARCHAR(100), -- 'ai_generated', 'aggregated', 'manual'

    -- Related entities
    area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
    related_property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
    related_planning_id INTEGER REFERENCES planning_applications(id) ON DELETE SET NULL,

    -- Publication
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'published', 'archived'
    published_at TIMESTAMP,
    author VARCHAR(200),

    -- SEO
    meta_title VARCHAR(200),
    meta_description TEXT,
    featured_image_url TEXT,

    -- Engagement
    view_count INTEGER DEFAULT 0,

    -- AI metadata
    ai_generated BOOLEAN DEFAULT FALSE,
    ai_model VARCHAR(100),
    ai_prompt_version VARCHAR(50),
    human_reviewed BOOLEAN DEFAULT FALSE,
    reviewed_by VARCHAR(200),
    reviewed_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_news_slug ON news_articles(slug);
CREATE INDEX idx_news_area_id ON news_articles(area_id);
CREATE INDEX idx_news_status ON news_articles(status);
CREATE INDEX idx_news_article_type ON news_articles(article_type);
CREATE INDEX idx_news_published_at ON news_articles(published_at DESC);
CREATE INDEX idx_news_ai_generated ON news_articles(ai_generated);
CREATE INDEX idx_news_source ON news_articles(source);

-- Article Tags
CREATE TABLE article_tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_article_tags_slug ON article_tags(slug);

-- Article Tag Associations
CREATE TABLE article_tag_associations (
    article_id INTEGER REFERENCES news_articles(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES article_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (article_id, tag_id)
);

CREATE INDEX idx_article_tag_assoc_article ON article_tag_associations(article_id);
CREATE INDEX idx_article_tag_assoc_tag ON article_tag_associations(tag_id);

-- ============================================
-- EXTERNAL NEWS SOURCES
-- ============================================

-- News Sources (for aggregation)
CREATE TABLE news_sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    source_type VARCHAR(50), -- 'rss', 'scraper', 'api'
    url TEXT NOT NULL,

    -- Config
    scraper_config JSONB,
    active BOOLEAN DEFAULT TRUE,

    -- Metadata
    last_fetched_at TIMESTAMP,
    fetch_frequency_minutes INTEGER DEFAULT 60,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_news_sources_active ON news_sources(active);

-- Aggregated News Items (raw items before processing)
CREATE TABLE aggregated_news_items (
    id SERIAL PRIMARY KEY,
    news_source_id INTEGER REFERENCES news_sources(id) ON DELETE CASCADE,

    -- Item details
    title VARCHAR(500) NOT NULL,
    url TEXT NOT NULL UNIQUE,
    content TEXT,
    published_date TIMESTAMP,

    -- Processing
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP,
    created_article_id INTEGER REFERENCES news_articles(id) ON DELETE SET NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_aggregated_news_source ON aggregated_news_items(news_source_id);
CREATE INDEX idx_aggregated_news_processed ON aggregated_news_items(processed);
CREATE INDEX idx_aggregated_news_published_date ON aggregated_news_items(published_date DESC);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON schools
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_news_articles_updated_at BEFORE UPDATE ON news_articles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_news_sources_updated_at BEFORE UPDATE ON news_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VIEWS
-- ============================================

-- Published articles view
CREATE VIEW published_articles AS
SELECT
    na.*,
    a.name as area_name,
    a.slug as area_slug
FROM news_articles na
LEFT JOIN areas a ON na.area_id = a.id
WHERE na.status = 'published'
ORDER BY na.published_at DESC;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE schools IS 'Schools in NW London with Ofsted ratings and performance data';
COMMENT ON TABLE news_articles IS 'News articles, guides, and AI-generated content';
COMMENT ON TABLE article_tags IS 'Tags for categorizing articles';
COMMENT ON TABLE news_sources IS 'External news sources for aggregation';
COMMENT ON TABLE aggregated_news_items IS 'Raw news items from external sources before processing';
