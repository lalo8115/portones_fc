-- ==========================================
-- Portones FC - Supabase Setup Script
-- ==========================================
-- Copia y pega este script en el SQL Editor de Supabase
-- https://app.supabase.com/project/[tu-proyecto]/sql
-- COMPLETAMENTE IDEMPOTENTE - Se puede ejecutar múltiples veces
-- ==========================================

-- ==========================================
-- 1. ENSURE REQUIRED FUNCTIONS EXIST
-- ==========================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create or replace set_updated_at function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ==========================================
-- 2. CREATE/UPDATE PROFILES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'revoked')),
  colonia_id UUID,
  house_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add house_id column if it doesn't exist
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS house_id UUID;

-- Remove apartment_unit column if it exists
ALTER TABLE profiles
  DROP COLUMN IF EXISTS apartment_unit;

-- Remove adeudo_meses column if it exists  
ALTER TABLE profiles
  DROP COLUMN IF EXISTS adeudo_meses;

-- Ensure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop all old policies and recreate them
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "Service role full access profiles" ON profiles;

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (except role)
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM profiles WHERE id = auth.uid()));

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update any profile
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role (backend) can do everything
CREATE POLICY "Service role full access profiles"
  ON profiles FOR ALL
  USING (auth.role() = 'service_role');

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS profiles_set_updated_at ON profiles;

-- Create trigger
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add comments
COMMENT ON TABLE profiles IS 'User profiles with roles and house info';
COMMENT ON COLUMN profiles.id IS 'References auth.users(id)';
COMMENT ON COLUMN profiles.role IS 'User role: user, admin, or revoked';
COMMENT ON COLUMN profiles.house_id IS 'References houses table';
COMMENT ON COLUMN profiles.colonia_id IS 'References colonias table';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_colonia_id ON profiles(colonia_id);
CREATE INDEX IF NOT EXISTS idx_profiles_house_id ON profiles(house_id);

-- ==========================================
-- 3. CREATE COLONIAS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS colonias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  maintenance_monthly_amount SMALLINT DEFAULT 0,
  streets TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure streets column exists
ALTER TABLE colonias
  ADD COLUMN IF NOT EXISTS streets TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Ensure descripcion column exists
ALTER TABLE colonias
  ADD COLUMN IF NOT EXISTS descripcion TEXT;

-- Ensure RLS is enabled
ALTER TABLE colonias ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "Authenticated users can view colonias" ON colonias;
DROP POLICY IF EXISTS "Admins can manage colonias" ON colonias;
DROP POLICY IF EXISTS "Service role full access colonias" ON colonias;

-- Authenticated users can view colonias
CREATE POLICY "Authenticated users can view colonias"
  ON colonias FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admins can manage colonias
CREATE POLICY "Admins can manage colonias"
  ON colonias FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Service role full access
CREATE POLICY "Service role full access colonias"
  ON colonias FOR ALL
  USING (auth.role() = 'service_role');

-- Drop old trigger and recreate
DROP TRIGGER IF EXISTS colonias_set_updated_at ON colonias;
CREATE TRIGGER colonias_set_updated_at
  BEFORE UPDATE ON colonias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_colonias_nombre ON colonias(nombre);

-- Add comments
COMMENT ON TABLE colonias IS 'Residential communities/colonias';
COMMENT ON COLUMN colonias.nombre IS 'Display name of the colonia';
COMMENT ON COLUMN colonias.streets IS 'Array of street names in the colonia';

-- ==========================================
-- 4. ADD FK CONSTRAINT FOR COLONIAS
-- ==========================================
DO $$
BEGIN
    -- Drop old duplicate constraint if exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'profiles_colonia_id_fkey'
    ) THEN
        ALTER TABLE profiles DROP CONSTRAINT profiles_colonia_id_fkey;
    END IF;
    
    -- Add or ensure fk_profiles_colonia exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_profiles_colonia'
    ) THEN
        ALTER TABLE profiles
            ADD CONSTRAINT fk_profiles_colonia
            FOREIGN KEY (colonia_id) REFERENCES colonias(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ==========================================
-- 5. CREATE HOUSES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS houses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id UUID NOT NULL REFERENCES colonias(id) ON DELETE CASCADE,
  street TEXT NOT NULL,
  external_number TEXT NOT NULL,
  number_of_people SMALLINT NOT NULL DEFAULT 1 CHECK (number_of_people > 0),
  adeudos_months SMALLINT NOT NULL DEFAULT 0 CHECK (adeudos_months >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure adeudos_months column exists if table was created earlier
ALTER TABLE houses
  ADD COLUMN IF NOT EXISTS adeudos_months SMALLINT NOT NULL DEFAULT 0;

-- Ensure RLS is enabled
ALTER TABLE houses ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "Users can view houses from their colonia" ON houses;
DROP POLICY IF EXISTS "Admins can manage houses" ON houses;
DROP POLICY IF EXISTS "Service role full access houses" ON houses;

-- Users can view houses from their colonia
CREATE POLICY "Users can view houses from their colonia"
  ON houses FOR SELECT
  USING (colonia_id IN (SELECT colonia_id FROM profiles WHERE id = auth.uid()));

-- Admins can manage houses
CREATE POLICY "Admins can manage houses"
  ON houses FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Service role (backend) can do everything
CREATE POLICY "Service role full access houses"
  ON houses FOR ALL
  USING (auth.role() = 'service_role');

-- Drop old trigger and recreate
DROP TRIGGER IF EXISTS houses_set_updated_at ON houses;
CREATE TRIGGER houses_set_updated_at
  BEFORE UPDATE ON houses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_houses_colonia_id ON houses(colonia_id);
CREATE INDEX IF NOT EXISTS idx_houses_street ON houses(street);
CREATE INDEX IF NOT EXISTS idx_houses_colonia_street ON houses(colonia_id, street);

-- Add comments
COMMENT ON TABLE houses IS 'Houses/units in colonias';
COMMENT ON COLUMN houses.colonia_id IS 'References colonias table';
COMMENT ON COLUMN houses.street IS 'Street name where the house is located';
COMMENT ON COLUMN houses.external_number IS 'External house/unit number';
COMMENT ON COLUMN houses.number_of_people IS 'Number of people living in the house';
COMMENT ON COLUMN houses.adeudos_months IS 'Number of months with pending maintenance payments';

-- ==========================================
-- 6. ADD FK CONSTRAINT FOR HOUSES
-- ==========================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_profiles_house'
    ) THEN
        ALTER TABLE profiles
            ADD CONSTRAINT fk_profiles_house
            FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ==========================================
-- 7. CREATE ACCESS_LOGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('OPEN_GATE', 'CLOSE_GATE')),
  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'DENIED_REVOKED', 'DENIED_NO_ACCESS')),
  method TEXT DEFAULT 'APP' CHECK (method IN ('APP', 'QR', 'MANUAL', 'AUTOMATIC')),
  gate_id SMALLINT,
  ip_address TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure columns exist
ALTER TABLE access_logs
  ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'APP';
ALTER TABLE access_logs
  ADD COLUMN IF NOT EXISTS gate_id SMALLINT;

-- Ensure RLS is enabled
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "Users can view own logs" ON access_logs;
DROP POLICY IF EXISTS "Admins can view all logs" ON access_logs;
DROP POLICY IF EXISTS "Service role can insert logs" ON access_logs;
DROP POLICY IF EXISTS "Service role full access logs" ON access_logs;

-- Users can view their own logs
CREATE POLICY "Users can view own logs"
  ON access_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all logs
CREATE POLICY "Admins can view all logs"
  ON access_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Service role (backend) can insert logs
CREATE POLICY "Service role can insert logs"
  ON access_logs FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Service role can view all logs
CREATE POLICY "Service role full access logs"
  ON access_logs FOR SELECT
  USING (auth.role() = 'service_role');

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_timestamp ON access_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_gate_id ON access_logs(gate_id);

-- Add comments
COMMENT ON TABLE access_logs IS 'Audit log for gate access attempts';
COMMENT ON COLUMN access_logs.action IS 'OPEN_GATE or CLOSE_GATE';
COMMENT ON COLUMN access_logs.status IS 'SUCCESS, DENIED_REVOKED, or DENIED_NO_ACCESS';
COMMENT ON COLUMN access_logs.method IS 'Access method: APP, QR, MANUAL, or AUTOMATIC';

-- ==========================================
-- 8. CREATE GATES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS gates (
  id SMALLINT PRIMARY KEY CHECK (id BETWEEN 1 AND 4),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'ENTRADA' CHECK (type IN ('ENTRADA', 'SALIDA')),
  colonia_id UUID REFERENCES colonias(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure type column exists
ALTER TABLE gates
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'ENTRADA';

-- Ensure RLS is enabled
ALTER TABLE gates ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "Authenticated users can view gates" ON gates;
DROP POLICY IF EXISTS "Admins can manage gates" ON gates;
DROP POLICY IF EXISTS "Service role full access gates" ON gates;

-- Authenticated users can view gates
CREATE POLICY "Authenticated users can view gates"
  ON gates FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admins can manage gates
CREATE POLICY "Admins can manage gates"
  ON gates FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Service role (backend) can do everything
CREATE POLICY "Service role full access gates"
  ON gates FOR ALL
  USING (auth.role() = 'service_role');

-- Drop old trigger and recreate
DROP TRIGGER IF EXISTS gates_set_updated_at ON gates;
CREATE TRIGGER gates_set_updated_at
  BEFORE UPDATE ON gates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_gates_enabled ON gates(enabled);
CREATE INDEX IF NOT EXISTS idx_gates_colonia_id ON gates(colonia_id);

-- Seed gates (upsert)
INSERT INTO gates (id, name, enabled)
VALUES
  (1, 'Portón 1', TRUE),
  (2, 'Portón 2', TRUE),
  (3, 'Portón 3', TRUE),
  (4, 'Portón 4', TRUE)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    enabled = EXCLUDED.enabled,
    updated_at = NOW();

-- Add comments
COMMENT ON TABLE gates IS 'Listado de portones controlables (IDs 1..4)';
COMMENT ON COLUMN gates.id IS 'ID del portón (1..4)';
COMMENT ON COLUMN gates.type IS 'Gate type: ENTRADA or SALIDA';

-- ==========================================
-- 9. CREATE MAINTENANCE_PAYMENTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS maintenance_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  colonia_id UUID REFERENCES colonias(id) ON DELETE SET NULL,
  house_id UUID REFERENCES houses(id) ON DELETE SET NULL,
  amount NUMERIC(10, 2) NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  period_month SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year SMALLINT NOT NULL CHECK (period_year >= 2020),
  transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  payment_method TEXT DEFAULT 'card',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Drop apartment_unit column if it exists and add house_id
ALTER TABLE maintenance_payments
  DROP COLUMN IF EXISTS apartment_unit;

ALTER TABLE maintenance_payments
  ADD COLUMN IF NOT EXISTS house_id UUID REFERENCES houses(id) ON DELETE SET NULL;

-- Ensure RLS is enabled
ALTER TABLE maintenance_payments ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "Users can view own payments" ON maintenance_payments;
DROP POLICY IF EXISTS "Admins can view all payments" ON maintenance_payments;
DROP POLICY IF EXISTS "Service role full access payments" ON maintenance_payments;

-- Users can view their own payment history
CREATE POLICY "Users can view own payments"
  ON maintenance_payments FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all payments
CREATE POLICY "Admins can view all payments"
  ON maintenance_payments FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Service role (backend) can do everything
CREATE POLICY "Service role full access payments"
  ON maintenance_payments FOR ALL
  USING (auth.role() = 'service_role');

-- Drop old trigger and recreate
DROP TRIGGER IF EXISTS maintenance_payments_set_updated_at ON maintenance_payments;
CREATE TRIGGER maintenance_payments_set_updated_at
  BEFORE UPDATE ON maintenance_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_maintenance_payments_user_id ON maintenance_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_payments_colonia_id ON maintenance_payments(colonia_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_payments_house_id ON maintenance_payments(house_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_payments_period ON maintenance_payments(period_year DESC, period_month DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_payments_status ON maintenance_payments(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_payments_payment_date ON maintenance_payments(payment_date DESC);

-- Add comments
COMMENT ON TABLE maintenance_payments IS 'Record of maintenance payment transactions';
COMMENT ON COLUMN maintenance_payments.user_id IS 'User who made the payment';
COMMENT ON COLUMN maintenance_payments.colonia_id IS 'Colonia associated with payment';
COMMENT ON COLUMN maintenance_payments.house_id IS 'House associated with payment';

-- ==========================================
-- 10. CREATE FORUM_POSTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS forum_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) <= 100),
  content TEXT NOT NULL CHECK (char_length(content) <= 1000),
  category TEXT NOT NULL CHECK (category IN ('events', 'messages', 'statements')),
  colonia_id UUID NOT NULL REFERENCES colonias(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_date TEXT,
  event_time TEXT,
  event_duration TEXT,
  file_url TEXT,
  file_month TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add event columns if they don't exist (for existing tables)
ALTER TABLE forum_posts
  ADD COLUMN IF NOT EXISTS event_date TEXT;
ALTER TABLE forum_posts
  ADD COLUMN IF NOT EXISTS event_time TEXT;
ALTER TABLE forum_posts
  ADD COLUMN IF NOT EXISTS event_duration TEXT;

-- Add statement columns if they don't exist (for existing tables)
ALTER TABLE forum_posts
  ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE forum_posts
  ADD COLUMN IF NOT EXISTS file_month TEXT;

-- Ensure RLS is enabled
ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "Users can view posts from their colonia" ON forum_posts;
DROP POLICY IF EXISTS "Users can create posts in their colonia" ON forum_posts;
DROP POLICY IF EXISTS "Users can update their own posts" ON forum_posts;
DROP POLICY IF EXISTS "Users can delete their own posts" ON forum_posts;

-- Users can view posts from their colonia
CREATE POLICY "Users can view posts from their colonia"
  ON forum_posts FOR SELECT
  USING (colonia_id IN (SELECT colonia_id FROM profiles WHERE id = auth.uid()));

-- Users can create posts in their colonia
-- Only admins can create posts with category 'statements'
CREATE POLICY "Users can create posts in their colonia"
  ON forum_posts FOR INSERT
  WITH CHECK (
    colonia_id IN (SELECT colonia_id FROM profiles WHERE id = auth.uid())
    AND author_id = auth.uid()
    AND (
      category != 'statements' 
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- Users can update their own posts
CREATE POLICY "Users can update their own posts"
  ON forum_posts FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- Users can delete their own posts or admins can delete any post
CREATE POLICY "Users can delete their own posts"
  ON forum_posts FOR DELETE
  USING (author_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Drop old trigger and recreate
DROP TRIGGER IF EXISTS forum_posts_set_updated_at ON forum_posts;
CREATE TRIGGER forum_posts_set_updated_at
  BEFORE UPDATE ON forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_forum_posts_colonia_id ON forum_posts(colonia_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_category ON forum_posts(category);
CREATE INDEX IF NOT EXISTS idx_forum_posts_created_at ON forum_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_author_id ON forum_posts(author_id);

-- Add comments
COMMENT ON TABLE forum_posts IS 'Community forum posts for colonias';

-- ==========================================
-- 11. CREATE SUPPORT_MESSAGES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  apartment_unit TEXT,
  colonia_id UUID REFERENCES colonias(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure RLS is enabled
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "Users can view own messages" ON support_messages;
DROP POLICY IF EXISTS "Users can create messages" ON support_messages;
DROP POLICY IF EXISTS "Admins can view all messages" ON support_messages;
DROP POLICY IF EXISTS "Service role full access messages" ON support_messages;

-- Users can view their own messages
CREATE POLICY "Users can view own messages"
  ON support_messages FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create messages
CREATE POLICY "Users can create messages"
  ON support_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all messages
CREATE POLICY "Admins can view all messages"
  ON support_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Service role (backend) can do everything
CREATE POLICY "Service role full access messages"
  ON support_messages FOR ALL
  USING (auth.role() = 'service_role');

-- Drop old trigger and recreate
DROP TRIGGER IF EXISTS support_messages_set_updated_at ON support_messages;
CREATE TRIGGER support_messages_set_updated_at
  BEFORE UPDATE ON support_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_support_messages_user_id ON support_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_status ON support_messages(status);
CREATE INDEX IF NOT EXISTS idx_support_messages_created_at ON support_messages(created_at DESC);

-- Add comments
COMMENT ON TABLE support_messages IS 'Support messages from users';

-- ==========================================
-- 12. CREATE AUTO-CREATE PROFILE TRIGGER
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, created_at, updated_at)
  VALUES (new.id, 'user', NOW(), NOW());
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user IS 'Automatically create a profile when a new user signs up';
