-- NW London Local Ledger - Comprehensive Coverage Schema
-- Version: 3.0.0
-- Description: Adds tables for transport, schools, amenities, crime stats, and energy ratings

-- ============================================
-- TRANSPORT STATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS transport_stations (
    id SERIAL PRIMARY KEY,
    station_id VARCHAR(50) UNIQUE NOT NULL, -- TfL station ID
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    station_type VARCHAR(50) NOT NULL, -- tube, overground, dlr, tram, bus
    lines TEXT[], -- Array of lines serving this station
    zone INTEGER, -- TfL zone number
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    location GEOGRAPHY(POINT, 4326),
    postcode VARCHAR(10),
    area_id INTEGER REFERENCES areas(id),

    -- Accessibility
    step_free_access BOOLEAN DEFAULT FALSE,
    lift_access BOOLEAN DEFAULT FALSE,
    escalator_count INTEGER DEFAULT 0,

    -- Services
    ticket_halls INTEGER DEFAULT 1,
    toilets BOOLEAN DEFAULT FALSE,
    wifi BOOLEAN DEFAULT FALSE,
    car_park BOOLEAN DEFAULT FALSE,
    bicycle_parking BOOLEAN DEFAULT FALSE,
    taxi_rank BOOLEAN DEFAULT FALSE,

    -- Usage stats
    annual_entries BIGINT, -- Annual passenger entries
    annual_exits BIGINT, -- Annual passenger exits
    annual_interchanges BIGINT, -- Annual interchanges

    -- Real-time status
    current_status VARCHAR(50) DEFAULT 'good', -- good, minor_delays, severe_delays, closed
    status_message TEXT,
    status_updated_at TIMESTAMP WITH TIME ZONE,

    -- PTAL scores
    ptal_score DECIMAL(2,1), -- Public Transport Accessibility Level (0-6b)

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_scraped_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_transport_stations_area ON transport_stations(area_id);
CREATE INDEX idx_transport_stations_type ON transport_stations(station_type);
CREATE INDEX idx_transport_stations_zone ON transport_stations(zone);
CREATE INDEX idx_transport_stations_location ON transport_stations USING GIST(location);
CREATE INDEX idx_transport_stations_postcode ON transport_stations(postcode);
CREATE INDEX idx_transport_stations_ptal ON transport_stations(ptal_score DESC);

-- ============================================
-- TRANSPORT CONNECTIONS TABLE (Station to Station)
-- ============================================

CREATE TABLE IF NOT EXISTS transport_connections (
    id SERIAL PRIMARY KEY,
    from_station_id INTEGER REFERENCES transport_stations(id) ON DELETE CASCADE,
    to_station_id INTEGER REFERENCES transport_stations(id) ON DELETE CASCADE,
    line VARCHAR(100) NOT NULL, -- Line name
    journey_time_minutes INTEGER, -- Journey time in minutes
    distance_km DECIMAL(5,2),
    connection_type VARCHAR(50), -- direct, interchange

    UNIQUE(from_station_id, to_station_id, line)
);

CREATE INDEX idx_transport_connections_from ON transport_connections(from_station_id);
CREATE INDEX idx_transport_connections_to ON transport_connections(to_station_id);
CREATE INDEX idx_transport_connections_line ON transport_connections(line);

-- ============================================
-- SCHOOLS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS schools (
    id SERIAL PRIMARY KEY,
    urn VARCHAR(20) UNIQUE, -- Unique Reference Number
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    school_type VARCHAR(100), -- Primary, Secondary, Special, Independent
    phase VARCHAR(50), -- Primary, Secondary, All-through, 16 plus, Not applicable
    status VARCHAR(50), -- Open, Closed, Proposed to close

    -- Location
    address_line_1 VARCHAR(255),
    address_line_2 VARCHAR(255),
    postcode VARCHAR(10),
    area_id INTEGER REFERENCES areas(id),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    location GEOGRAPHY(POINT, 4326),

    -- Contact
    telephone VARCHAR(20),
    website VARCHAR(500),
    email VARCHAR(255),
    head_teacher VARCHAR(255),

    -- Demographics
    gender VARCHAR(50), -- Mixed, Boys, Girls
    age_range_lower INTEGER,
    age_range_upper INTEGER,
    religious_character VARCHAR(100),
    admissions_policy VARCHAR(100), -- Comprehensive, Selective, Modern, Non-selective

    -- Capacity
    school_capacity INTEGER,
    total_pupils INTEGER,
    total_boys INTEGER,
    total_girls INTEGER,
    percentage_fsm DECIMAL(5,2), -- Free school meals percentage

    -- Ofsted
    ofsted_rating VARCHAR(50), -- Outstanding, Good, Requires Improvement, Inadequate
    ofsted_last_inspection DATE,
    ofsted_report_url VARCHAR(500),

    -- Performance (Key Stage data)
    ks2_reading_progress DECIMAL(5,2),
    ks2_writing_progress DECIMAL(5,2),
    ks2_maths_progress DECIMAL(5,2),
    ks4_progress_8 DECIMAL(5,2),
    ks4_attainment_8 DECIMAL(5,2),
    ks4_ebacc_entry DECIMAL(5,2),
    ks5_progress DECIMAL(5,2),

    -- Transport links
    nearest_station_id INTEGER REFERENCES transport_stations(id),
    distance_to_station_m INTEGER,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_scraped_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_schools_area ON schools(area_id);
CREATE INDEX idx_schools_postcode ON schools(postcode);
CREATE INDEX idx_schools_type ON schools(school_type);
CREATE INDEX idx_schools_phase ON schools(phase);
CREATE INDEX idx_schools_ofsted ON schools(ofsted_rating);
CREATE INDEX idx_schools_location ON schools USING GIST(location);
CREATE INDEX idx_schools_capacity ON schools(school_capacity DESC);

-- ============================================
-- AMENITIES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS amenities (
    id SERIAL PRIMARY KEY,
    place_id VARCHAR(255) UNIQUE, -- Google Places ID or other unique identifier
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255),
    category VARCHAR(100) NOT NULL, -- restaurant, cafe, supermarket, gym, park, etc.
    subcategory VARCHAR(100), -- More specific type

    -- Location
    address VARCHAR(500),
    postcode VARCHAR(10),
    area_id INTEGER REFERENCES areas(id),
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    location GEOGRAPHY(POINT, 4326),

    -- Details
    phone VARCHAR(50),
    website VARCHAR(500),
    opening_hours JSONB, -- Structured opening hours
    price_level INTEGER CHECK (price_level BETWEEN 1 AND 4), -- 1=cheap, 4=expensive

    -- Ratings
    rating DECIMAL(2,1) CHECK (rating BETWEEN 0 AND 5),
    rating_count INTEGER,

    -- Features
    wheelchair_accessible BOOLEAN,
    parking_available BOOLEAN,
    wifi_available BOOLEAN,
    outdoor_seating BOOLEAN,
    delivery BOOLEAN,
    takeaway BOOLEAN,
    reservations BOOLEAN,

    -- Photos
    photo_url VARCHAR(500),

    -- Transport
    nearest_station_id INTEGER REFERENCES transport_stations(id),
    distance_to_station_m INTEGER,

    -- Source
    data_source VARCHAR(50), -- google_places, nhs, foursquare, etc.
    source_updated_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_amenities_area ON amenities(area_id);
CREATE INDEX idx_amenities_postcode ON amenities(postcode);
CREATE INDEX idx_amenities_category ON amenities(category);
CREATE INDEX idx_amenities_subcategory ON amenities(subcategory);
CREATE INDEX idx_amenities_location ON amenities USING GIST(location);
CREATE INDEX idx_amenities_rating ON amenities(rating DESC) WHERE rating IS NOT NULL;

-- ============================================
-- CRIME STATISTICS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS crime_stats (
    id SERIAL PRIMARY KEY,
    crime_id VARCHAR(100) UNIQUE, -- Police API crime ID

    -- Location
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    location GEOGRAPHY(POINT, 4326),
    street_name VARCHAR(255),
    postcode VARCHAR(10),
    area_id INTEGER REFERENCES areas(id),

    -- Crime details
    category VARCHAR(100) NOT NULL, -- burglary, violent-crime, anti-social-behaviour, etc.
    crime_type VARCHAR(255),
    month DATE NOT NULL, -- Month of the crime
    outcome_status VARCHAR(100), -- Investigation complete, Under investigation, etc.

    -- Context
    location_type VARCHAR(100), -- On or near, specific location type
    location_subtype VARCHAR(100),
    context TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_crime_stats_area ON crime_stats(area_id);
CREATE INDEX idx_crime_stats_postcode ON crime_stats(postcode);
CREATE INDEX idx_crime_stats_category ON crime_stats(category);
CREATE INDEX idx_crime_stats_month ON crime_stats(month DESC);
CREATE INDEX idx_crime_stats_location ON crime_stats USING GIST(location);
CREATE INDEX idx_crime_stats_outcome ON crime_stats(outcome_status);

-- ============================================
-- ENERGY RATINGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS energy_ratings (
    id SERIAL PRIMARY KEY,
    certificate_hash VARCHAR(100) UNIQUE, -- EPC certificate unique ID

    -- Property identification
    address_line_1 VARCHAR(255),
    address_line_2 VARCHAR(255),
    address_line_3 VARCHAR(255),
    postcode VARCHAR(10) NOT NULL,
    uprn VARCHAR(20), -- Unique Property Reference Number
    property_id INTEGER REFERENCES properties(id),
    area_id INTEGER REFERENCES areas(id),

    -- Energy performance
    current_energy_rating VARCHAR(2), -- A, B, C, D, E, F, G
    current_energy_efficiency INTEGER, -- 1-100 score
    potential_energy_rating VARCHAR(2),
    potential_energy_efficiency INTEGER,

    -- Environmental impact
    current_co2_emissions DECIMAL(6,2), -- tonnes per year
    potential_co2_emissions DECIMAL(6,2),
    current_co2_emissions_per_floor_area DECIMAL(6,2), -- kg per m² per year

    -- Property details
    property_type VARCHAR(100),
    built_form VARCHAR(100), -- Detached, Semi-Detached, Terraced, etc.
    floor_area DECIMAL(7,2), -- m²
    number_rooms INTEGER,
    number_habitable_rooms INTEGER,

    -- Construction
    walls_description TEXT,
    roof_description TEXT,
    floor_description TEXT,
    windows_description TEXT,
    main_heating_description TEXT,
    main_heating_fuel VARCHAR(100),
    hot_water_description TEXT,

    -- Costs
    lighting_cost_current DECIMAL(7,2), -- £ per year
    heating_cost_current DECIMAL(7,2),
    hot_water_cost_current DECIMAL(7,2),
    total_energy_cost_current DECIMAL(8,2),
    total_energy_cost_potential DECIMAL(8,2),
    potential_saving DECIMAL(7,2),

    -- Dates
    inspection_date DATE,
    certificate_date DATE,
    valid_until DATE,

    -- Assessor
    assessor_name VARCHAR(255),
    assessor_accreditation VARCHAR(100),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_energy_ratings_property ON energy_ratings(property_id);
CREATE INDEX idx_energy_ratings_area ON energy_ratings(area_id);
CREATE INDEX idx_energy_ratings_postcode ON energy_ratings(postcode);
CREATE INDEX idx_energy_ratings_rating ON energy_ratings(current_energy_rating);
CREATE INDEX idx_energy_ratings_efficiency ON energy_ratings(current_energy_efficiency DESC);
CREATE INDEX idx_energy_ratings_date ON energy_ratings(certificate_date DESC);

-- ============================================
-- AGGREGATED AREA STATISTICS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS area_statistics (
    id SERIAL PRIMARY KEY,
    area_id INTEGER REFERENCES areas(id) UNIQUE,

    -- Transport
    station_count INTEGER DEFAULT 0,
    avg_ptal_score DECIMAL(2,1),
    tube_stations INTEGER DEFAULT 0,
    overground_stations INTEGER DEFAULT 0,
    bus_stops INTEGER DEFAULT 0,

    -- Schools
    school_count INTEGER DEFAULT 0,
    primary_schools INTEGER DEFAULT 0,
    secondary_schools INTEGER DEFAULT 0,
    outstanding_schools INTEGER DEFAULT 0,
    good_schools INTEGER DEFAULT 0,
    avg_ofsted_score DECIMAL(3,2),

    -- Amenities
    restaurant_count INTEGER DEFAULT 0,
    cafe_count INTEGER DEFAULT 0,
    supermarket_count INTEGER DEFAULT 0,
    gym_count INTEGER DEFAULT 0,
    park_count INTEGER DEFAULT 0,
    avg_amenity_rating DECIMAL(2,1),

    -- Crime (per 1000 residents per year)
    total_crimes_annual INTEGER DEFAULT 0,
    violent_crimes_annual INTEGER DEFAULT 0,
    burglary_annual INTEGER DEFAULT 0,
    vehicle_crimes_annual INTEGER DEFAULT 0,
    crime_rate_per_1000 DECIMAL(6,2),

    -- Energy
    avg_energy_rating VARCHAR(2),
    avg_energy_efficiency DECIMAL(5,2),
    properties_with_epc INTEGER DEFAULT 0,

    -- Overall scores
    transport_score INTEGER, -- 1-100 score based on PTAL and station proximity
    education_score INTEGER, -- 1-100 score based on schools
    lifestyle_score INTEGER, -- 1-100 score based on amenities
    safety_score INTEGER, -- 1-100 score based on crime stats
    sustainability_score INTEGER, -- 1-100 score based on energy ratings
    overall_score INTEGER, -- Weighted average of all scores

    last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_area_statistics_area ON area_statistics(area_id);
CREATE INDEX idx_area_statistics_overall_score ON area_statistics(overall_score DESC);

-- ============================================
-- MATERIALIZED VIEWS FOR PERFORMANCE
-- ============================================

-- Transport accessibility by area
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_area_transport_access AS
SELECT
    a.id as area_id,
    a.name as area_name,
    COUNT(DISTINCT ts.id) as station_count,
    AVG(ts.ptal_score) as avg_ptal_score,
    MIN(ST_Distance(p.location::geometry, ts.location::geometry)) as nearest_station_distance,
    ARRAY_AGG(DISTINCT ts.name ORDER BY ts.name) as station_names,
    ARRAY_AGG(DISTINCT line ORDER BY line) as available_lines
FROM areas a
LEFT JOIN transport_stations ts ON ts.area_id = a.id
LEFT JOIN properties p ON p.area_id = a.id
LEFT JOIN LATERAL (
    SELECT unnest(ts.lines) as line
) lines ON true
GROUP BY a.id, a.name
WITH DATA;

CREATE UNIQUE INDEX idx_mv_area_transport ON mv_area_transport_access(area_id);

-- School performance by area
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_area_school_performance AS
SELECT
    a.id as area_id,
    a.name as area_name,
    COUNT(s.id) as school_count,
    COUNT(CASE WHEN s.ofsted_rating = 'Outstanding' THEN 1 END) as outstanding_count,
    COUNT(CASE WHEN s.ofsted_rating = 'Good' THEN 1 END) as good_count,
    AVG(s.total_pupils) as avg_school_size,
    AVG(s.ks4_progress_8) as avg_progress_8,
    AVG(s.ks4_attainment_8) as avg_attainment_8
FROM areas a
LEFT JOIN schools s ON s.area_id = a.id
GROUP BY a.id, a.name
WITH DATA;

CREATE UNIQUE INDEX idx_mv_area_schools ON mv_area_school_performance(area_id);

-- ============================================
-- STORED PROCEDURES
-- ============================================

-- Calculate area scores
CREATE OR REPLACE FUNCTION calculate_area_scores(p_area_id INTEGER)
RETURNS void AS $$
DECLARE
    v_transport_score INTEGER;
    v_education_score INTEGER;
    v_lifestyle_score INTEGER;
    v_safety_score INTEGER;
    v_sustainability_score INTEGER;
BEGIN
    -- Calculate transport score (based on PTAL and station count)
    SELECT
        LEAST(100, GREATEST(0,
            COALESCE(AVG(ptal_score) * 15, 0) +
            LEAST(COUNT(*) * 5, 25)
        ))::INTEGER
    INTO v_transport_score
    FROM transport_stations
    WHERE area_id = p_area_id;

    -- Calculate education score (based on school ratings and performance)
    SELECT
        LEAST(100, GREATEST(0,
            COALESCE(
                CASE
                    WHEN COUNT(*) = 0 THEN 50
                    ELSE (
                        (COUNT(CASE WHEN ofsted_rating IN ('Outstanding', 'Good') THEN 1 END)::DECIMAL / COUNT(*)::DECIMAL) * 70 +
                        COALESCE(AVG(ks4_attainment_8) / 80 * 30, 0)
                    )
                END, 50
            )
        ))::INTEGER
    INTO v_education_score
    FROM schools
    WHERE area_id = p_area_id;

    -- Calculate lifestyle score (based on amenity availability and ratings)
    SELECT
        LEAST(100, GREATEST(0,
            COALESCE(
                LEAST(COUNT(*) * 2, 50) +
                COALESCE(AVG(rating) * 10, 25), 50
            )
        ))::INTEGER
    INTO v_lifestyle_score
    FROM amenities
    WHERE area_id = p_area_id;

    -- Calculate safety score (inverse of crime rate)
    SELECT
        LEAST(100, GREATEST(0,
            100 - LEAST(COUNT(*) / 10, 50)
        ))::INTEGER
    INTO v_safety_score
    FROM crime_stats
    WHERE area_id = p_area_id
    AND month >= CURRENT_DATE - INTERVAL '12 months';

    -- Calculate sustainability score (based on energy ratings)
    SELECT
        LEAST(100, GREATEST(0,
            COALESCE(AVG(
                CASE current_energy_rating
                    WHEN 'A' THEN 100
                    WHEN 'B' THEN 85
                    WHEN 'C' THEN 70
                    WHEN 'D' THEN 55
                    WHEN 'E' THEN 40
                    WHEN 'F' THEN 25
                    WHEN 'G' THEN 10
                    ELSE 50
                END
            ), 50)
        ))::INTEGER
    INTO v_sustainability_score
    FROM energy_ratings
    WHERE area_id = p_area_id;

    -- Update area_statistics table
    INSERT INTO area_statistics (
        area_id,
        transport_score,
        education_score,
        lifestyle_score,
        safety_score,
        sustainability_score,
        overall_score,
        last_calculated_at
    ) VALUES (
        p_area_id,
        COALESCE(v_transport_score, 50),
        COALESCE(v_education_score, 50),
        COALESCE(v_lifestyle_score, 50),
        COALESCE(v_safety_score, 50),
        COALESCE(v_sustainability_score, 50),
        (
            COALESCE(v_transport_score, 50) * 0.25 +
            COALESCE(v_education_score, 50) * 0.20 +
            COALESCE(v_lifestyle_score, 50) * 0.20 +
            COALESCE(v_safety_score, 50) * 0.20 +
            COALESCE(v_sustainability_score, 50) * 0.15
        )::INTEGER,
        NOW()
    )
    ON CONFLICT (area_id) DO UPDATE SET
        transport_score = EXCLUDED.transport_score,
        education_score = EXCLUDED.education_score,
        lifestyle_score = EXCLUDED.lifestyle_score,
        safety_score = EXCLUDED.safety_score,
        sustainability_score = EXCLUDED.sustainability_score,
        overall_score = EXCLUDED.overall_score,
        last_calculated_at = EXCLUDED.last_calculated_at,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE transport_stations IS 'TfL stations with real-time status and accessibility information';
COMMENT ON TABLE schools IS 'School data including Ofsted ratings and performance metrics';
COMMENT ON TABLE amenities IS 'Local amenities from Google Places and other sources';
COMMENT ON TABLE crime_stats IS 'Police crime statistics by location and category';
COMMENT ON TABLE energy_ratings IS 'EPC energy performance certificates for properties';
COMMENT ON TABLE area_statistics IS 'Pre-computed area scores and statistics';