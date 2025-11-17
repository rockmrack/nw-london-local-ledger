/**
 * Phase 5 Schema: User Accounts & Personalization
 * Adds user authentication, saved searches, favorites, and notifications
 */

-- =====================================================
-- 1. USERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  password_hash VARCHAR(255), -- NULL for OAuth users
  email_verified BOOLEAN DEFAULT false,
  email_verified_at TIMESTAMP,
  image_url TEXT,
  provider VARCHAR(50) DEFAULT 'email', -- 'email', 'google', 'microsoft'
  provider_id VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_provider ON users(provider, provider_id);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- =====================================================
-- 2. USER SESSIONS (for NextAuth)
-- =====================================================

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  access_token TEXT,
  expires TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(session_token);
CREATE INDEX idx_sessions_expires ON sessions(expires);

-- =====================================================
-- 3. USER PREFERENCES
-- =====================================================

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Geographic preferences
  favorite_areas TEXT[], -- e.g., ['Hampstead', 'Camden']
  default_search_radius_km INTEGER DEFAULT 5,
  default_center_lat DECIMAL(10, 7),
  default_center_lng DECIMAL(10, 7),

  -- Display preferences
  map_style VARCHAR(50) DEFAULT 'streets', -- 'streets', 'satellite', 'dark'
  results_per_page INTEGER DEFAULT 20,
  default_sort VARCHAR(50) DEFAULT 'price_desc', -- 'price_desc', 'price_asc', 'date_desc'

  -- Notification preferences
  email_notifications BOOLEAN DEFAULT true,
  planning_alerts BOOLEAN DEFAULT false,
  price_alerts BOOLEAN DEFAULT false,
  weekly_digest BOOLEAN DEFAULT true,
  instant_alerts BOOLEAN DEFAULT false,

  -- Privacy
  profile_public BOOLEAN DEFAULT false,
  share_analytics BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 4. SAVED SEARCHES
-- =====================================================

CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Search criteria (stored as JSON)
  criteria JSONB NOT NULL,
  /*
  Example criteria:
  {
    "areas": ["Hampstead", "Belsize Park"],
    "property_type": "flat",
    "min_price": 500000,
    "max_price": 1000000,
    "min_bedrooms": 2,
    "planning_status": ["approved", "pending"]
  }
  */

  -- Metadata
  search_type VARCHAR(50) NOT NULL, -- 'property', 'planning', 'area'
  result_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMP,

  -- Alerts
  alert_enabled BOOLEAN DEFAULT false,
  alert_frequency VARCHAR(50) DEFAULT 'daily', -- 'instant', 'daily', 'weekly'
  last_alert_sent_at TIMESTAMP,

  -- Organization
  is_favorite BOOLEAN DEFAULT false,
  tags TEXT[],

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_saved_searches_user_id ON saved_searches(user_id);
CREATE INDEX idx_saved_searches_type ON saved_searches(search_type);
CREATE INDEX idx_saved_searches_alerts ON saved_searches(user_id, alert_enabled) WHERE alert_enabled = true;
CREATE INDEX idx_saved_searches_criteria ON saved_searches USING gin(criteria);

-- =====================================================
-- 5. FAVORITE PROPERTIES
-- =====================================================

CREATE TABLE IF NOT EXISTS favorite_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  -- Organization
  collection_name VARCHAR(255), -- e.g., 'Potential Investments', 'Dream Homes'
  notes TEXT,
  tags TEXT[],

  -- Tracking
  price_when_saved DECIMAL(15, 2),
  price_change_since DECIMAL(15, 2),

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, property_id)
);

CREATE INDEX idx_favorite_properties_user_id ON favorite_properties(user_id);
CREATE INDEX idx_favorite_properties_property_id ON favorite_properties(property_id);
CREATE INDEX idx_favorite_properties_collection ON favorite_properties(user_id, collection_name);

-- =====================================================
-- 6. FAVORITE PLANNING APPLICATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS favorite_planning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  planning_id UUID NOT NULL REFERENCES planning_applications(id) ON DELETE CASCADE,

  -- Organization
  notes TEXT,
  tags TEXT[],
  watch_updates BOOLEAN DEFAULT true,

  -- Tracking
  status_when_saved VARCHAR(100),
  status_changed BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, planning_id)
);

CREATE INDEX idx_favorite_planning_user_id ON favorite_planning(user_id);
CREATE INDEX idx_favorite_planning_planning_id ON favorite_planning(planning_id);
CREATE INDEX idx_favorite_planning_watch ON favorite_planning(user_id, watch_updates) WHERE watch_updates = true;

-- =====================================================
-- 7. USER ALERTS & NOTIFICATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS user_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Alert definition
  alert_type VARCHAR(50) NOT NULL, -- 'planning_new', 'planning_update', 'price_change', 'saved_search'
  criteria JSONB NOT NULL,

  -- Configuration
  is_active BOOLEAN DEFAULT true,
  frequency VARCHAR(50) DEFAULT 'daily', -- 'instant', 'daily', 'weekly'
  delivery_method VARCHAR(50) DEFAULT 'email', -- 'email', 'sms', 'push', 'in_app'

  -- Tracking
  last_triggered_at TIMESTAMP,
  last_sent_at TIMESTAMP,
  trigger_count INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_alerts_user_id ON user_alerts(user_id);
CREATE INDEX idx_user_alerts_active ON user_alerts(is_active, frequency) WHERE is_active = true;
CREATE INDEX idx_user_alerts_type ON user_alerts(alert_type);

-- =====================================================
-- 8. NOTIFICATION QUEUE
-- =====================================================

CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Notification details
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSONB, -- Additional data (e.g., property_id, link)

  -- Delivery
  delivery_method VARCHAR(50) NOT NULL,
  priority INTEGER DEFAULT 5, -- 1 (high) to 10 (low)

  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'read'
  sent_at TIMESTAMP,
  read_at TIMESTAMP,
  failed_reason TEXT,
  retry_count INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notification_queue_user_id ON notification_queue(user_id);
CREATE INDEX idx_notification_queue_status ON notification_queue(status, created_at);
CREATE INDEX idx_notification_queue_pending ON notification_queue(status, priority) WHERE status = 'pending';

-- =====================================================
-- 9. USER ACTIVITY LOG
-- =====================================================

CREATE TABLE IF NOT EXISTS user_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(255),

  -- Activity details
  activity_type VARCHAR(100) NOT NULL, -- 'search', 'view_property', 'save_search', 'contact'
  entity_type VARCHAR(50), -- 'property', 'planning', 'area'
  entity_id UUID,

  -- Context
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  referrer TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_activity_user_id ON user_activity(user_id, created_at DESC);
CREATE INDEX idx_user_activity_type ON user_activity(activity_type, created_at DESC);
CREATE INDEX idx_user_activity_session ON user_activity(session_id);

-- =====================================================
-- 10. API KEYS (for public API access)
-- =====================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Key details
  key_hash VARCHAR(255) UNIQUE NOT NULL,
  key_prefix VARCHAR(20) NOT NULL, -- First 8 chars for display
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Permissions
  scopes TEXT[] DEFAULT ARRAY['read:properties', 'read:planning'], -- 'read:*', 'write:*'
  rate_limit_per_hour INTEGER DEFAULT 1000,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP,
  usage_count BIGINT DEFAULT 0,

  -- Expiry
  expires_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(is_active, expires_at);

-- =====================================================
-- 11. SEARCH HISTORY
-- =====================================================

CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(255),

  -- Search details
  query_text TEXT,
  filters JSONB,
  search_type VARCHAR(50), -- 'property', 'planning', 'area'

  -- Results
  result_count INTEGER,
  results_viewed INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_search_history_user_id ON search_history(user_id, created_at DESC);
CREATE INDEX idx_search_history_session ON search_history(session_id);

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Update user updated_at timestamp
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_users_updated_at();

-- Update user_preferences updated_at timestamp
CREATE TRIGGER trigger_update_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_users_updated_at();

-- Track property price changes for favorites
CREATE OR REPLACE FUNCTION update_favorite_price_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current_value IS DISTINCT FROM OLD.current_value THEN
    UPDATE favorite_properties
    SET price_change_since = NEW.current_value - price_when_saved
    WHERE property_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_favorite_price
  AFTER UPDATE OF current_value ON properties
  FOR EACH ROW
  EXECUTE FUNCTION update_favorite_price_change();

-- Track planning status changes for favorites
CREATE OR REPLACE FUNCTION update_favorite_planning_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE favorite_planning
    SET status_changed = true
    WHERE planning_id = NEW.id AND watch_updates = true;

    -- Create notification
    INSERT INTO notification_queue (user_id, type, title, message, data, delivery_method)
    SELECT
      user_id,
      'planning_status_change',
      'Planning Application Status Changed',
      'The status of a planning application you are watching has changed from ' || OLD.status || ' to ' || NEW.status,
      jsonb_build_object('planning_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status),
      'email'
    FROM favorite_planning
    WHERE planning_id = NEW.id AND watch_updates = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_favorite_planning
  AFTER UPDATE OF status ON planning_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_favorite_planning_status();

-- =====================================================
-- VIEWS FOR ANALYTICS
-- =====================================================

-- User engagement metrics
CREATE OR REPLACE VIEW user_engagement_metrics AS
SELECT
  u.id as user_id,
  u.email,
  u.name,
  u.created_at as joined_date,
  u.last_login_at,
  COUNT(DISTINCT ss.id) as saved_searches_count,
  COUNT(DISTINCT fp.id) as favorite_properties_count,
  COUNT(DISTINCT fpl.id) as favorite_planning_count,
  COUNT(DISTINCT ua.id) as total_activities,
  COUNT(DISTINCT ua.id) FILTER (WHERE ua.created_at > NOW() - INTERVAL '7 days') as activities_last_7_days,
  COUNT(DISTINCT ua.id) FILTER (WHERE ua.created_at > NOW() - INTERVAL '30 days') as activities_last_30_days
FROM users u
LEFT JOIN saved_searches ss ON u.id = ss.user_id
LEFT JOIN favorite_properties fp ON u.id = fp.user_id
LEFT JOIN favorite_planning fpl ON u.id = fpl.user_id
LEFT JOIN user_activity ua ON u.id = ua.user_id
GROUP BY u.id, u.email, u.name, u.created_at, u.last_login_at;

-- Popular searches
CREATE OR REPLACE VIEW popular_searches AS
SELECT
  query_text,
  search_type,
  COUNT(*) as search_count,
  AVG(result_count) as avg_results,
  COUNT(DISTINCT user_id) as unique_users,
  MAX(created_at) as last_searched
FROM search_history
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY query_text, search_type
HAVING COUNT(*) >= 5
ORDER BY search_count DESC
LIMIT 100;

-- =====================================================
-- SAMPLE DATA (for development)
-- =====================================================

-- Create a test user
INSERT INTO users (email, name, email_verified, provider)
VALUES ('test@hampsteadrenovations.co.uk', 'Test User', true, 'email')
ON CONFLICT (email) DO NOTHING;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO your_app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_app_user;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE users IS 'User accounts for authentication and personalization';
COMMENT ON TABLE sessions IS 'Active user sessions for NextAuth.js';
COMMENT ON TABLE user_preferences IS 'User-specific preferences and settings';
COMMENT ON TABLE saved_searches IS 'Saved search queries with optional email alerts';
COMMENT ON TABLE favorite_properties IS 'Properties bookmarked by users';
COMMENT ON TABLE favorite_planning IS 'Planning applications followed by users';
COMMENT ON TABLE user_alerts IS 'Alert subscriptions for users';
COMMENT ON TABLE notification_queue IS 'Pending and sent notifications';
COMMENT ON TABLE user_activity IS 'User activity tracking for analytics';
COMMENT ON TABLE api_keys IS 'API keys for programmatic access';
COMMENT ON TABLE search_history IS 'Search history for autocomplete and analytics';
