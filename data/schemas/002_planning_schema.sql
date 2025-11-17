-- NW London Local Ledger - Planning Applications Schema
-- Version: 1.0.0
-- Description: Tables for planning applications and related data

-- ============================================
-- PLANNING APPLICATIONS
-- ============================================

-- Planning Applications
CREATE TABLE planning_applications (
    id SERIAL PRIMARY KEY,

    -- Application identifiers
    reference VARCHAR(100) NOT NULL UNIQUE,
    council VARCHAR(50) NOT NULL,

    -- Property reference
    property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,

    -- Address (may not match exact property)
    address TEXT NOT NULL,
    postcode VARCHAR(10),
    area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,

    -- Geographical data
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    location GEOMETRY(POINT, 4326),

    -- Application details
    proposal TEXT NOT NULL,
    application_type VARCHAR(100),
    development_type VARCHAR(100), -- 'extension', 'loft_conversion', 'new_build', etc.

    -- Status and dates
    status VARCHAR(50) NOT NULL,
    submitted_date DATE,
    validated_date DATE,
    decision_date DATE,
    decision VARCHAR(100),
    appeal_status VARCHAR(50),

    -- Case officer
    case_officer VARCHAR(200),

    -- Public consultation
    consultation_start_date DATE,
    consultation_end_date DATE,

    -- SEO fields
    slug VARCHAR(300) NOT NULL UNIQUE,
    meta_title VARCHAR(200),
    meta_description TEXT,

    -- Scraper metadata
    source_url TEXT,
    last_scraped_at TIMESTAMP,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_planning_reference ON planning_applications(reference);
CREATE INDEX idx_planning_council ON planning_applications(council);
CREATE INDEX idx_planning_property_id ON planning_applications(property_id);
CREATE INDEX idx_planning_area_id ON planning_applications(area_id);
CREATE INDEX idx_planning_postcode ON planning_applications(postcode);
CREATE INDEX idx_planning_status ON planning_applications(status);
CREATE INDEX idx_planning_application_type ON planning_applications(application_type);
CREATE INDEX idx_planning_development_type ON planning_applications(development_type);
CREATE INDEX idx_planning_submitted_date ON planning_applications(submitted_date DESC);
CREATE INDEX idx_planning_decision_date ON planning_applications(decision_date DESC);
CREATE INDEX idx_planning_location ON planning_applications USING GIST(location);
CREATE INDEX idx_planning_slug ON planning_applications(slug);

-- Planning Documents
CREATE TABLE planning_documents (
    id SERIAL PRIMARY KEY,
    planning_application_id INTEGER REFERENCES planning_applications(id) ON DELETE CASCADE,

    -- Document details
    document_type VARCHAR(100),
    title VARCHAR(300) NOT NULL,
    description TEXT,

    -- File information
    file_url TEXT NOT NULL,
    file_name VARCHAR(300),
    file_size_bytes BIGINT,
    mime_type VARCHAR(100),

    -- Dates
    published_date DATE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_planning_docs_application_id ON planning_documents(planning_application_id);
CREATE INDEX idx_planning_docs_document_type ON planning_documents(document_type);
CREATE INDEX idx_planning_docs_published_date ON planning_documents(published_date DESC);

-- Planning Comments (public objections/support)
CREATE TABLE planning_comments (
    id SERIAL PRIMARY KEY,
    planning_application_id INTEGER REFERENCES planning_applications(id) ON DELETE CASCADE,

    -- Comment details
    comment_type VARCHAR(50), -- 'objection', 'support', 'neutral'
    comment_text TEXT,
    commenter_name VARCHAR(200),

    -- Dates
    submitted_date DATE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_planning_comments_application_id ON planning_comments(planning_application_id);
CREATE INDEX idx_planning_comments_comment_type ON planning_comments(comment_type);
CREATE INDEX idx_planning_comments_submitted_date ON planning_comments(submitted_date DESC);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER update_planning_applications_updated_at BEFORE UPDATE ON planning_applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VIEWS
-- ============================================

-- Recent planning applications view
CREATE VIEW recent_planning_applications AS
SELECT
    pa.*,
    a.name as area_name,
    a.slug as area_slug,
    COUNT(pc.id) as comment_count
FROM planning_applications pa
LEFT JOIN areas a ON pa.area_id = a.id
LEFT JOIN planning_comments pc ON pa.id = pc.planning_application_id
WHERE pa.submitted_date >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY pa.id, a.name, a.slug
ORDER BY pa.submitted_date DESC;

-- Planning applications by area summary
CREATE VIEW planning_by_area AS
SELECT
    a.id as area_id,
    a.name as area_name,
    a.slug as area_slug,
    COUNT(pa.id) as total_applications,
    COUNT(CASE WHEN pa.status = 'Approved' THEN 1 END) as approved_count,
    COUNT(CASE WHEN pa.status = 'Refused' THEN 1 END) as refused_count,
    COUNT(CASE WHEN pa.status = 'Pending' THEN 1 END) as pending_count,
    COUNT(CASE WHEN pa.development_type = 'extension' THEN 1 END) as extension_count,
    COUNT(CASE WHEN pa.development_type = 'loft_conversion' THEN 1 END) as loft_conversion_count
FROM areas a
LEFT JOIN planning_applications pa ON a.id = pa.area_id
    AND pa.submitted_date >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY a.id, a.name, a.slug;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE planning_applications IS 'Planning applications scraped from council portals';
COMMENT ON TABLE planning_documents IS 'Documents associated with planning applications';
COMMENT ON TABLE planning_comments IS 'Public comments on planning applications';
