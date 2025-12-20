-- sql/create_tables.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  is_blocked BOOLEAN DEFAULT false,
  extra JSONB
);

-- otps (for audit only; active otps stored in redis)
CREATE TABLE IF NOT EXISTS otps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_phone TEXT,
  verification_id TEXT UNIQUE,
  otp_code TEXT,
  expires_at TIMESTAMPTZ,
  attempts INTEGER DEFAULT 0,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT,
  gateway_subscription_id TEXT,
  status TEXT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  gateway TEXT,
  gateway_payment_id TEXT UNIQUE,
  gateway_order_id TEXT,
  amount INTEGER,
  currency TEXT,
  status TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- webhook events
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gateway TEXT,
  event_type TEXT,
  received_at TIMESTAMPTZ DEFAULT now(),
  payload JSONB,
  signature_valid BOOLEAN,
  processed BOOLEAN DEFAULT false,
  processing_result JSONB
);

-- sessions (optional)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_id TEXT UNIQUE,
  device_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_seen TIMESTAMPTZ
);
