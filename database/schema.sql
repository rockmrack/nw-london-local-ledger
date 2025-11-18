-- NW London Renovation & Maintenance Services Database Schema
-- PostgreSQL 14+ with PostGIS for geographic features

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Customers table
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    secondary_phone VARCHAR(20),
    address TEXT,
    postcode VARCHAR(10),
    area VARCHAR(10),
    customer_type VARCHAR(20) DEFAULT 'homeowner' CHECK (customer_type IN ('homeowner', 'landlord', 'developer', 'commercial', 'estate-agent')),
    properties_owned INTEGER DEFAULT 1,
    total_spend DECIMAL(12,2) DEFAULT 0,
    loyalty_points INTEGER DEFAULT 0,
    preferred_contact_method VARCHAR(20) DEFAULT 'email' CHECK (preferred_contact_method IN ('email', 'phone', 'sms', 'whatsapp', 'both')),
    marketing_opt_in BOOLEAN DEFAULT false,
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_contact_date TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_postcode ON customers(postcode);
CREATE INDEX idx_customers_area ON customers(area);
CREATE INDEX idx_customers_type ON customers(customer_type);

-- Properties table
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    address TEXT NOT NULL,
    street VARCHAR(255),
    area VARCHAR(10) NOT NULL,
    postcode VARCHAR(10) NOT NULL,
    property_type VARCHAR(50) NOT NULL CHECK (property_type IN ('victorian', 'edwardian', 'georgian', 'modern', 'apartment', 'terrace', 'detached', 'semi-detached')),
    bedrooms INTEGER,
    bathrooms INTEGER,
    square_footage INTEGER,
    year_built INTEGER,
    listed_building BOOLEAN DEFAULT false,
    conservation_area BOOLEAN DEFAULT false,
    estimated_value DECIMAL(12,2),
    location GEOGRAPHY(POINT, 4326), -- PostGIS point for mapping
    owner_id UUID REFERENCES customers(id),
    last_survey_date DATE,
    epc_rating VARCHAR(2),
    council_tax_band VARCHAR(2),
    tenure VARCHAR(20) CHECK (tenure IN ('freehold', 'leasehold', 'shared-ownership')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_properties_postcode ON properties(postcode);
CREATE INDEX idx_properties_area ON properties(area);
CREATE INDEX idx_properties_type ON properties(property_type);
CREATE INDEX idx_properties_owner ON properties(owner_id);
CREATE INDEX idx_properties_location ON properties USING GIST(location);

-- ============================================================================
-- RENOVATION TABLES
-- ============================================================================

CREATE TABLE renovation_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    property_id UUID REFERENCES properties(id),
    property_address TEXT NOT NULL,
    postcode VARCHAR(10) NOT NULL,
    street VARCHAR(255),
    property_type VARCHAR(50) NOT NULL,
    project_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'enquiry',
    budget_min DECIMAL(12,2),
    budget_max DECIMAL(12,2),
    quote_amount DECIMAL(12,2),
    quote_valid_until DATE,
    actual_cost DECIMAL(12,2),
    priority VARCHAR(20) DEFAULT 'medium',
    planning_permission_required BOOLEAN DEFAULT false,
    planning_permission_status VARCHAR(50),
    building_control_required BOOLEAN DEFAULT false,
    building_control_status VARCHAR(50),
    party_wall_agreement_required BOOLEAN DEFAULT false,
    conservation_area_work BOOLEAN DEFAULT false,
    estimated_start_date DATE,
    estimated_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    duration_weeks INTEGER,
    survey_scheduled_date TIMESTAMP WITH TIME ZONE,
    survey_completed_date TIMESTAMP WITH TIME ZONE,
    surveyor_name VARCHAR(255),
    survey_findings TEXT,
    requirements TEXT[],
    project_manager_id UUID,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_renovation_customer ON renovation_projects(customer_id);
CREATE INDEX idx_renovation_property ON renovation_projects(property_id);
CREATE INDEX idx_renovation_status ON renovation_projects(status);
CREATE INDEX idx_renovation_postcode ON renovation_projects(postcode);
CREATE INDEX idx_renovation_dates ON renovation_projects(estimated_start_date, estimated_end_date);

-- Project quotes breakdown
CREATE TABLE renovation_quote_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES renovation_projects(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    cost DECIMAL(12,2) NOT NULL,
    vat DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_quote_items_project ON renovation_quote_items(project_id);

-- Project materials
CREATE TABLE renovation_materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES renovation_projects(id) ON DELETE CASCADE,
    item VARCHAR(255) NOT NULL,
    quantity DECIMAL(10,2) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    estimated_cost DECIMAL(10,2),
    actual_cost DECIMAL(10,2),
    supplier VARCHAR(255),
    ordered BOOLEAN DEFAULT false,
    order_date DATE,
    delivery_date DATE,
    received BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_materials_project ON renovation_materials(project_id);

-- ============================================================================
-- MAINTENANCE TABLES
-- ============================================================================

CREATE TABLE maintenance_contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    property_id UUID NOT NULL REFERENCES properties(id),
    contract_type VARCHAR(20) NOT NULL CHECK (contract_type IN ('bronze', 'silver', 'gold', 'platinum')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    annual_cost DECIMAL(10,2) NOT NULL,
    payment_frequency VARCHAR(20) NOT NULL CHECK (payment_frequency IN ('monthly', 'quarterly', 'annual')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'suspended')),
    auto_renew BOOLEAN DEFAULT true,
    emergency_callouts_allowed INTEGER NOT NULL,
    emergency_callouts_used INTEGER DEFAULT 0,
    scheduled_visits_per_year INTEGER NOT NULL,
    scheduled_visits_completed INTEGER DEFAULT 0,
    next_scheduled_visit DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_contracts_customer ON maintenance_contracts(customer_id);
CREATE INDEX idx_contracts_property ON maintenance_contracts(property_id);
CREATE INDEX idx_contracts_status ON maintenance_contracts(status);
CREATE INDEX idx_contracts_end_date ON maintenance_contracts(end_date);

CREATE TABLE maintenance_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    property_id UUID REFERENCES properties(id),
    contract_id UUID REFERENCES maintenance_contracts(id),
    property_address TEXT NOT NULL,
    postcode VARCHAR(10) NOT NULL,
    street VARCHAR(255),
    job_type VARCHAR(50) NOT NULL,
    category VARCHAR(20) NOT NULL CHECK (category IN ('scheduled', 'reactive', 'emergency', 'preventive')),
    priority VARCHAR(20) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    description TEXT NOT NULL,
    detailed_notes TEXT,
    reported_by VARCHAR(255),
    reported_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    scheduled_date TIMESTAMP WITH TIME ZONE,
    completed_date TIMESTAMP WITH TIME ZONE,
    assigned_contractor_id UUID,
    estimated_cost DECIMAL(10,2),
    actual_cost DECIMAL(10,2),
    customer_rating INTEGER CHECK (customer_rating BETWEEN 1 AND 5),
    customer_feedback TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_maintenance_customer ON maintenance_jobs(customer_id);
CREATE INDEX idx_maintenance_property ON maintenance_jobs(property_id);
CREATE INDEX idx_maintenance_contract ON maintenance_jobs(contract_id);
CREATE INDEX idx_maintenance_status ON maintenance_jobs(status);
CREATE INDEX idx_maintenance_priority ON maintenance_jobs(priority);
CREATE INDEX idx_maintenance_dates ON maintenance_jobs(scheduled_date, completed_date);

-- Maintenance job parts
CREATE TABLE maintenance_job_parts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES maintenance_jobs(id) ON DELETE CASCADE,
    part VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    cost DECIMAL(10,2) NOT NULL,
    ordered BOOLEAN DEFAULT false,
    received BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_job_parts_job ON maintenance_job_parts(job_id);

-- ============================================================================
-- EMERGENCY TABLES
-- ============================================================================

CREATE TABLE emergency_calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    property_id UUID REFERENCES properties(id),
    customer_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    property_address TEXT NOT NULL,
    postcode VARCHAR(10) NOT NULL,
    emergency_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium')),
    description TEXT NOT NULL,
    safety_risk BOOLEAN DEFAULT false,
    people_affected INTEGER,
    water_shutoff_required BOOLEAN DEFAULT false,
    gas_shutoff_required BOOLEAN DEFAULT false,
    electricity_shutoff_required BOOLEAN DEFAULT false,
    status VARCHAR(50) NOT NULL DEFAULT 'received',
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    response_time_minutes INTEGER,
    arrival_time TIMESTAMP WITH TIME ZONE,
    completion_time TIMESTAMP WITH TIME ZONE,
    assigned_contractor_id UUID,
    estimated_cost DECIMAL(10,2),
    actual_cost DECIMAL(10,2),
    follow_up_required BOOLEAN DEFAULT true,
    follow_up_notes TEXT,
    insurance_claim BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_emergency_customer ON emergency_calls(customer_id);
CREATE INDEX idx_emergency_status ON emergency_calls(status);
CREATE INDEX idx_emergency_severity ON emergency_calls(severity);
CREATE INDEX idx_emergency_postcode ON emergency_calls(postcode);
CREATE INDEX idx_emergency_received ON emergency_calls(received_at);

-- Emergency actions log
CREATE TABLE emergency_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID NOT NULL REFERENCES emergency_calls(id) ON DELETE CASCADE,
    action_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    action TEXT NOT NULL,
    performed_by VARCHAR(255) NOT NULL,
    notes TEXT
);

CREATE INDEX idx_emergency_actions_call ON emergency_actions(call_id);

-- ============================================================================
-- CONTRACTOR TABLES
-- ============================================================================

CREATE TABLE contractors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    trades VARCHAR(50)[],
    specialties TEXT[],
    service_areas VARCHAR(10)[],
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL,
    address TEXT,
    public_liability_insurance DECIMAL(12,2),
    professional_indemnity_insurance DECIMAL(12,2),
    insurance_expiry_date DATE,
    insurance_verified BOOLEAN DEFAULT false,
    gas_safe_number VARCHAR(50),
    niceic_number VARCHAR(50),
    other_certifications JSONB,
    day_rate DECIMAL(10,2),
    hourly_rate DECIMAL(10,2),
    minimum_charge DECIMAL(10,2),
    emergency_callout_fee DECIMAL(10,2),
    availability_status VARCHAR(20) DEFAULT 'available' CHECK (availability_status IN ('available', 'busy', 'fully-booked', 'unavailable')),
    next_available_date DATE,
    working_days VARCHAR(20)[],
    emergency_callouts BOOLEAN DEFAULT false,
    overall_rating DECIMAL(3,2) DEFAULT 0,
    total_reviews INTEGER DEFAULT 0,
    completed_jobs INTEGER DEFAULT 0,
    years_experience INTEGER,
    languages VARCHAR(50)[],
    verified BOOLEAN DEFAULT false,
    featured BOOLEAN DEFAULT false,
    joined_date DATE DEFAULT CURRENT_DATE,
    last_active_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_contractors_trades ON contractors USING GIN(trades);
CREATE INDEX idx_contractors_areas ON contractors USING GIN(service_areas);
CREATE INDEX idx_contractors_availability ON contractors(availability_status);
CREATE INDEX idx_contractors_rating ON contractors(overall_rating DESC);

-- ============================================================================
-- MATERIALS & SUPPLIERS TABLES
-- ============================================================================

CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    address TEXT NOT NULL,
    postcode VARCHAR(10) NOT NULL,
    area VARCHAR(10),
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    website VARCHAR(255),
    location GEOGRAPHY(POINT, 4326),
    categories TEXT[],
    services TEXT[],
    opening_hours JSONB,
    delivery_available BOOLEAN DEFAULT true,
    delivery_fee DECIMAL(10,2),
    free_delivery_threshold DECIMAL(10,2),
    delivery_areas VARCHAR(10)[],
    same_day_delivery BOOLEAN DEFAULT false,
    next_day_delivery BOOLEAN DEFAULT true,
    trade_account_available BOOLEAN DEFAULT true,
    trade_discount_percentage INTEGER,
    overall_rating DECIMAL(3,2) DEFAULT 0,
    total_reviews INTEGER DEFAULT 0,
    featured BOOLEAN DEFAULT false,
    verified BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_suppliers_postcode ON suppliers(postcode);
CREATE INDEX idx_suppliers_categories ON suppliers USING GIN(categories);
CREATE INDEX idx_suppliers_rating ON suppliers(overall_rating DESC);
CREATE INDEX idx_suppliers_location ON suppliers USING GIST(location);

-- ============================================================================
-- PORTFOLIO & REVIEWS TABLES
-- ============================================================================

CREATE TABLE project_portfolio (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    renovation_project_id UUID REFERENCES renovation_projects(id),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    project_type VARCHAR(50) NOT NULL,
    property_type VARCHAR(50) NOT NULL,
    street VARCHAR(255),
    area VARCHAR(10) NOT NULL,
    postcode VARCHAR(10),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    duration_weeks INTEGER,
    total_cost DECIMAL(12,2),
    scope TEXT[],
    features TEXT[],
    challenges_and_solutions JSONB,
    property_value_increase DECIMAL(12,2),
    energy_efficiency_improvement VARCHAR(20),
    space_gained_sqft INTEGER,
    roi DECIMAL(5,2),
    tags TEXT[],
    featured BOOLEAN DEFAULT false,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_portfolio_area ON project_portfolio(area);
CREATE INDEX idx_portfolio_type ON project_portfolio(project_type);
CREATE INDEX idx_portfolio_featured ON project_portfolio(featured);
CREATE INDEX idx_portfolio_views ON project_portfolio(views DESC);

CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    project_id UUID REFERENCES renovation_projects(id),
    maintenance_job_id UUID REFERENCES maintenance_jobs(id),
    contractor_id UUID REFERENCES contractors(id),
    review_type VARCHAR(20) NOT NULL CHECK (review_type IN ('project', 'contractor', 'company', 'material', 'supplier')),
    overall_rating DECIMAL(3,2) NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
    quality_rating DECIMAL(3,2),
    value_rating DECIMAL(3,2),
    communication_rating DECIMAL(3,2),
    punctuality_rating DECIMAL(3,2),
    cleanliness_rating DECIMAL(3,2),
    professionalism_rating DECIMAL(3,2),
    title VARCHAR(255) NOT NULL,
    comment TEXT NOT NULL,
    would_recommend BOOLEAN DEFAULT true,
    verified BOOLEAN DEFAULT false,
    helpful_count INTEGER DEFAULT 0,
    reported_count INTEGER DEFAULT 0,
    company_response TEXT,
    company_responded_by VARCHAR(255),
    company_responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reviews_customer ON reviews(customer_id);
CREATE INDEX idx_reviews_contractor ON reviews(contractor_id);
CREATE INDEX idx_reviews_type ON reviews(review_type);
CREATE INDEX idx_reviews_rating ON reviews(overall_rating DESC);
CREATE INDEX idx_reviews_created ON reviews(created_at DESC);

-- ============================================================================
-- ANALYTICS & TRACKING TABLES
-- ============================================================================

CREATE TABLE street_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    street VARCHAR(255) NOT NULL,
    area VARCHAR(10) NOT NULL,
    postcode_prefix VARCHAR(10),
    property_count INTEGER DEFAULT 0,
    average_property_age INTEGER,
    predominant_property_type VARCHAR(50),
    conservation_area BOOLEAN DEFAULT false,
    average_property_value DECIMAL(12,2),
    renovation_activity_score INTEGER CHECK (renovation_activity_score BETWEEN 0 AND 100),
    maintenance_needs_score INTEGER CHECK (maintenance_needs_score BETWEEN 0 AND 100),
    demand_score INTEGER CHECK (demand_score BETWEEN 0 AND 100),
    last_calculated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(street, area)
);

CREATE INDEX idx_street_analytics_area ON street_analytics(area);
CREATE INDEX idx_street_analytics_renovation ON street_analytics(renovation_activity_score DESC);

-- ============================================================================
-- COMMUNICATION & NOTIFICATIONS TABLES
-- ============================================================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id),
    contractor_id UUID REFERENCES contractors(id),
    notification_type VARCHAR(50) NOT NULL,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'push', 'whatsapp')),
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    message TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_customer ON notifications(customer_id);
CREATE INDEX idx_notifications_contractor ON notifications(contractor_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- ============================================================================
-- SYSTEM TABLES
-- ============================================================================

CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    user_type VARCHAR(20) CHECK (user_type IN ('customer', 'contractor', 'admin', 'system')),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    description TEXT,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_activity_log_user ON activity_log(user_id);
CREATE INDEX idx_activity_log_action ON activity_log(action);
CREATE INDEX idx_activity_log_created ON activity_log(created_at DESC);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update trigger to all relevant tables
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_renovation_updated_at BEFORE UPDATE ON renovation_projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_maintenance_contracts_updated_at BEFORE UPDATE ON maintenance_contracts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_maintenance_jobs_updated_at BEFORE UPDATE ON maintenance_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_emergency_calls_updated_at BEFORE UPDATE ON emergency_calls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contractors_updated_at BEFORE UPDATE ON contractors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate emergency response time
CREATE OR REPLACE FUNCTION calculate_emergency_response_time()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.arrival_time IS NOT NULL AND OLD.arrival_time IS NULL THEN
        NEW.response_time_minutes := EXTRACT(EPOCH FROM (NEW.arrival_time - NEW.received_at)) / 60;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER emergency_response_time_trigger BEFORE UPDATE ON emergency_calls
    FOR EACH ROW EXECUTE FUNCTION calculate_emergency_response_time();

-- ============================================================================
-- VIEWS FOR ANALYTICS
-- ============================================================================

CREATE VIEW renovation_project_stats AS
SELECT
    area,
    project_type,
    COUNT(*) as total_projects,
    AVG(actual_cost) as avg_cost,
    AVG(duration_weeks) as avg_duration,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
    AVG(actual_cost) FILTER (WHERE status = 'completed') as avg_completed_cost
FROM renovation_projects
GROUP BY area, project_type;

CREATE VIEW emergency_response_performance AS
SELECT
    SUBSTRING(postcode FROM 1 FOR 3) as area,
    emergency_type,
    COUNT(*) as total_calls,
    AVG(response_time_minutes) as avg_response_time,
    MIN(response_time_minutes) as min_response_time,
    MAX(response_time_minutes) as max_response_time,
    COUNT(*) FILTER (WHERE response_time_minutes <= 30) * 100.0 / COUNT(*) as percentage_within_30min
FROM emergency_calls
WHERE arrival_time IS NOT NULL
GROUP BY SUBSTRING(postcode FROM 1 FOR 3), emergency_type;

CREATE VIEW contractor_performance AS
SELECT
    c.id,
    c.name,
    c.trades,
    c.overall_rating,
    COUNT(DISTINCT mj.id) as jobs_completed,
    AVG(mj.customer_rating) as avg_customer_rating,
    COUNT(DISTINCT ec.id) as emergency_calls_handled,
    COUNT(DISTINCT r.id) as total_reviews
FROM contractors c
LEFT JOIN maintenance_jobs mj ON c.id = mj.assigned_contractor_id AND mj.status = 'completed'
LEFT JOIN emergency_calls ec ON c.id = ec.assigned_contractor_id AND ec.status = 'completed'
LEFT JOIN reviews r ON c.id = r.contractor_id
GROUP BY c.id, c.name, c.trades, c.overall_rating;

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Insert sample NW London streets for reference
CREATE TABLE nw_london_streets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    street_name VARCHAR(255) NOT NULL,
    area VARCHAR(10) NOT NULL,
    postcode_prefix VARCHAR(10),
    property_count_estimate INTEGER,
    predominant_type VARCHAR(50),
    conservation_area BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_nw_streets_area ON nw_london_streets(area);
CREATE INDEX idx_nw_streets_name ON nw_london_streets(street_name);
