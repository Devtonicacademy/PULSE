-- ==============================================================================
-- PULSE: Real-Time Hyper-Local Discovery Platform
-- Supabase PostgreSQL + PostGIS Schema Migration
-- ==============================================================================

-- 1. Enable PostGIS Extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS
CREATE TYPE moment_category_enum AS ENUM (
  'events',
  'alerts',
  'food_drinks',
  'lost_found',
  'recommendations',
  'activities',
  'deals',
  'community'
);

CREATE TYPE reaction_type_enum AS ENUM (
  'helpful',
  'trending',
  'confirmed',
  'interested',
  'going'
);

CREATE TYPE report_reason_enum AS ENUM (
  'spam',
  'harassment',
  'false_information',
  'dangerous_content'
);

-- 3. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  avatar VARCHAR(500),
  bio TEXT,
  reputation INTEGER DEFAULT 50,
  badges JSONB DEFAULT '["Local Scout"]'::jsonb,
  is_verified_business BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. MOMENTS TABLE (The core live pulse units)
CREATE TABLE IF NOT EXISTS moments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  category moment_category_enum NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  geom GEOGRAPHY(Point, 4326),
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  engagement_score INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT FALSE,
  is_blurred BOOLEAN DEFAULT FALSE,
  approx_address VARCHAR(255)
);

-- Ensure PostGIS point is populated automatically
CREATE OR REPLACE FUNCTION set_moment_geom()
RETURNS TRIGGER AS $$
BEGIN
  NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_moment_geom ON moments;
CREATE TRIGGER trigger_set_moment_geom
BEFORE INSERT OR UPDATE OF latitude, longitude ON moments
FOR EACH ROW EXECUTE FUNCTION set_moment_geom();

-- Spatial & Filter Indexes
CREATE INDEX IF NOT EXISTS moments_geom_idx ON moments USING GIST (geom);
CREATE INDEX IF NOT EXISTS moments_category_idx ON moments (category);
CREATE INDEX IF NOT EXISTS moments_expires_at_idx ON moments (expires_at);
CREATE INDEX IF NOT EXISTS moments_created_at_idx ON moments (created_at DESC);

-- 5. REACTIONS TABLE
CREATE TABLE IF NOT EXISTS reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  moment_id UUID REFERENCES moments(id) ON DELETE CASCADE,
  reaction_type reaction_type_enum NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, moment_id, reaction_type)
);

CREATE INDEX IF NOT EXISTS reactions_moment_id_idx ON reactions (moment_id);

-- 6. COMMENTS TABLE (Threaded)
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  moment_id UUID REFERENCES moments(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comments_moment_id_idx ON comments (moment_id);
CREATE INDEX IF NOT EXISTS comments_parent_id_idx ON comments (parent_id);

-- 7. BUSINESSES TABLE
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  location VARCHAR(255),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  geom GEOGRAPHY(Point, 4326),
  verified BOOLEAN DEFAULT TRUE,
  subscription_plan VARCHAR(50) DEFAULT 'pro',
  avatar TEXT,
  cover_image TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. BUSINESS POSTS / LIVE PINS
CREATE TABLE IF NOT EXISTS business_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  offer TEXT NOT NULL,
  live_pin_type VARCHAR(50) DEFAULT 'Flash Sale', -- Happy Hour, Food Truck, Flash Sale, Limited Offer
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  geom GEOGRAPHY(Point, 4326),
  views INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '12 hours'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. ACTIVITY ZONES / PULSE SCORE
CREATE TABLE IF NOT EXISTS activity_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_name VARCHAR(100) NOT NULL,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  radius_meters DOUBLE PRECISION DEFAULT 2500,
  activity_score INTEGER DEFAULT 50, -- 0-100 Pulse Score
  active_users INTEGER DEFAULT 0,
  moment_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. TEMPORARY COMMUNITIES
CREATE TABLE IF NOT EXISTS temporary_communities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(150) NOT NULL,
  description TEXT,
  trigger_type VARCHAR(50) DEFAULT 'event', -- event, festival, campus, concert
  moment_id UUID REFERENCES moments(id) ON DELETE SET NULL,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  active_until TIMESTAMPTZ NOT NULL,
  member_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. REPORTS TABLE (Trust & Safety)
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  moment_id UUID REFERENCES moments(id) ON DELETE CASCADE,
  reason report_reason_enum NOT NULL,
  notes TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- pending, reviewed, dismissed, removed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- POSTGIS SPATIAL FUNCTIONS
-- ==============================================================================

-- Fetch moments within specified radius in meters, sorted by recency & engagement
CREATE OR REPLACE FUNCTION get_moments_within_radius(
  user_lat DOUBLE PRECISION,
  user_lng DOUBLE PRECISION,
  radius_meters DOUBLE PRECISION
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  title VARCHAR,
  description TEXT,
  category moment_category_enum,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  photo_url TEXT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  engagement_score INTEGER,
  views_count INTEGER,
  distance_meters DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.user_id,
    m.title,
    m.description,
    m.category,
    m.latitude,
    m.longitude,
    m.photo_url,
    m.created_at,
    m.expires_at,
    m.engagement_score,
    m.views_count,
    ST_Distance(
      m.geom,
      ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
    ) AS distance_meters
  FROM moments m
  WHERE m.is_archived = FALSE
    AND m.expires_at > NOW()
    AND ST_DWithin(
      m.geom,
      ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
      radius_meters
    )
  ORDER BY m.engagement_score DESC, m.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Pulse Score calculation for a zone based on moments, reactions, comments, views
CREATE OR REPLACE FUNCTION calculate_zone_pulse_score(p_zone_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_score INTEGER := 0;
  v_moment_count INTEGER := 0;
  v_reaction_count INTEGER := 0;
  v_comment_count INTEGER := 0;
  v_total_views INTEGER := 0;
  v_center GEOGRAPHY;
  v_radius DOUBLE PRECISION;
BEGIN
  SELECT 
    ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
    radius_meters
  INTO v_center, v_radius
  FROM activity_zones
  WHERE id = p_zone_id;

  IF NOT FOUND THEN
    RETURN 50;
  END IF;

  SELECT 
    COUNT(m.id),
    COALESCE(SUM(m.views_count), 0)
  INTO v_moment_count, v_total_views
  FROM moments m
  WHERE m.is_archived = FALSE
    AND m.expires_at > NOW()
    AND ST_DWithin(m.geom, v_center, v_radius);

  -- Pulse formula: (Moments * 15) + (Views * 0.4) + Baseline
  v_score := LEAST(100, GREATEST(10, (v_moment_count * 15) + (v_total_views / 20)));

  UPDATE activity_zones
  SET activity_score = v_score,
      moment_count = v_moment_count,
      updated_at = NOW()
  WHERE id = p_zone_id;

  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- Auto-archive expired moments
CREATE OR REPLACE FUNCTION auto_archive_expired_moments()
RETURNS VOID AS $$
BEGIN
  UPDATE moments
  SET is_archived = TRUE
  WHERE expires_at <= NOW() AND is_archived = FALSE;
END;
$$ LANGUAGE plpgsql;
