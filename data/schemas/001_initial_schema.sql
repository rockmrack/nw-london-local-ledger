-- NW London Local Ledger - Initial Database Schema
-- Version: 1.0.0
-- Description: Core tables for properties, areas, postcodes, and users

-- Enable PostGIS extension for geographical data
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- For text search
CREATE EXTENSION IF NOT EXISTS btree_gist; -- For specialized indexes

-- ============================================
-- CORE GEOGRAPHICAL TABLES
-- ============================================

-- Areas (Neighbourhoods like Hampstead, Kilburn, etc.)
CREATE TABLE areas (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    postcode_prefix VARCHAR(10) NOT NULL, -- e.g., 'NW3', 'NW6'
    description TEXT,
    population INTEGER,
    area_sqkm DECIMAL(10, 2),
    median_income INTEGER,
    council VARCHAR(50) NOT NULL,

    -- Geographical data
    geometry GEOMETRY(POLYGON, 4326),
    center_point GEOMETRY(POINT, 4326),
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Indexes
    CONSTRAINT areas_postcode_prefix_check CHECK (postcode_prefix ~ '^NW[0-9]{1,2}$')
);

CREATE INDEX idx_areas_slug ON areas(slug);
CREATE INDEX idx_areas_postcode_prefix ON areas(postcode_prefix);
CREATE INDEX idx_areas_council ON areas(council);
CREATE INDEX idx_areas_geometry ON areas USING GIST(geometry);
CREATE INDEX idx_areas_center_point ON areas USING GIST(center_point);

-- Postcodes
CREATE TABLE postcodes (
    id SERIAL PRIMARY KEY,
    postcode VARCHAR(10) NOT NULL UNIQUE,
    area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
    outward_code VARCHAR(4) NOT NULL, -- e.g., 'NW3'
    inward_code VARCHAR(3) NOT NULL,  -- e.g., '1AB'

    -- Geographical data
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    location GEOMETRY(POINT, 4326),

    -- Statistics
    property_count INTEGER DEFAULT 0,
    average_price DECIMAL(12, 2),

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_postcodes_postcode ON postcodes(postcode);
CREATE INDEX idx_postcodes_area_id ON postcodes(area_id);
CREATE INDEX idx_postcodes_outward_code ON postcodes(outward_code);
CREATE INDEX idx_postcodes_location ON postcodes USING GIST(location);

-- Streets
CREATE TABLE streets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) NOT NULL,
    area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
    postcode_prefix VARCHAR(10),

    -- Geographical data
    geometry GEOMETRY(LINESTRING, 4326),

    -- Statistics
    property_count INTEGER DEFAULT 0,
    average_price DECIMAL(12, 2),

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(name, area_id)
);

CREATE INDEX idx_streets_slug ON streets(slug);
CREATE INDEX idx_streets_area_id ON streets(area_id);
CREATE INDEX idx_streets_name ON streets USING GIN(name gin_trgm_ops);
CREATE INDEX idx_streets_geometry ON streets USING GIST(geometry);

-- ============================================
-- PROPERTY TABLES
-- ============================================

-- Properties
CREATE TABLE properties (
    id SERIAL PRIMARY KEY,

    -- Address information
    address_line_1 VARCHAR(200) NOT NULL,
    address_line_2 VARCHAR(200),
    street_id INTEGER REFERENCES streets(id) ON DELETE SET NULL,
    area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
    postcode_id INTEGER REFERENCES postcodes(id) ON DELETE SET NULL,
    postcode VARCHAR(10) NOT NULL,

    -- Property details
    property_type VARCHAR(50), -- 'detached', 'semi-detached', 'terraced', 'flat', etc.
    tenure VARCHAR(50),        -- 'freehold', 'leasehold'
    bedrooms INTEGER,
    bathrooms INTEGER,
    floor_area_sqm DECIMAL(10, 2),

    -- Price information
    current_value DECIMAL(12, 2),
    last_sale_price DECIMAL(12, 2),
    last_sale_date DATE,

    -- Geographical data
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    location GEOMETRY(POINT, 4326),

    -- SEO fields
    slug VARCHAR(300) NOT NULL UNIQUE,
    meta_title VARCHAR(200),
    meta_description TEXT,

    -- Metadata
    land_registry_id VARCHAR(100),
    epc_rating VARCHAR(10),
    council_tax_band VARCHAR(1),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT properties_bedrooms_check CHECK (bedrooms >= 0 AND bedrooms <= 50),
    CONSTRAINT properties_bathrooms_check CHECK (bathrooms >= 0 AND bathrooms <= 20)
);

CREATE INDEX idx_properties_slug ON properties(slug);
CREATE INDEX idx_properties_street_id ON properties(street_id);
CREATE INDEX idx_properties_area_id ON properties(area_id);
CREATE INDEX idx_properties_postcode_id ON properties(postcode_id);
CREATE INDEX idx_properties_postcode ON properties(postcode);
CREATE INDEX idx_properties_property_type ON properties(property_type);
CREATE INDEX idx_properties_last_sale_date ON properties(last_sale_date DESC);
CREATE INDEX idx_properties_current_value ON properties(current_value);
CREATE INDEX idx_properties_location ON properties USING GIST(location);

-- Property Sales (historical price paid data from Land Registry)
CREATE TABLE property_sales (
    id SERIAL PRIMARY KEY,
    property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,

    -- Sale details
    price DECIMAL(12, 2) NOT NULL,
    sale_date DATE NOT NULL,
    property_type VARCHAR(50),
    tenure VARCHAR(50),
    new_build BOOLEAN DEFAULT FALSE,

    -- Land Registry data
    transaction_id VARCHAR(100) UNIQUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT property_sales_price_check CHECK (price >= 0)
);

CREATE INDEX idx_property_sales_property_id ON property_sales(property_id);
CREATE INDEX idx_property_sales_sale_date ON property_sales(sale_date DESC);
CREATE INDEX idx_property_sales_price ON property_sales(price);
CREATE INDEX idx_property_sales_transaction_id ON property_sales(transaction_id);

-- ============================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update_updated_at trigger to tables
CREATE TRIGGER update_areas_updated_at BEFORE UPDATE ON areas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_postcodes_updated_at BEFORE UPDATE ON postcodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_streets_updated_at BEFORE UPDATE ON streets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE areas IS 'Neighbourhoods and districts in NW London';
COMMENT ON TABLE postcodes IS 'UK postcodes with geographical coordinates';
COMMENT ON TABLE streets IS 'Streets with geographical data and statistics';
COMMENT ON TABLE properties IS 'Individual properties with address and details';
COMMENT ON TABLE property_sales IS 'Historical property sales from Land Registry';
