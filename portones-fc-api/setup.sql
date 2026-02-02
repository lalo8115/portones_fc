-- ==========================================
-- Portones FC - Supabase Setup Script
-- ==========================================
-- Copia y pega este script en el SQL Editor de Supabase
-- https://app.supabase.com/project/[tu-proyecto]/sql
--
-- Este script crea:
-- 1. Tabla 'profiles' para datos de usuarios
-- 2. Tabla 'access_logs' para auditoría
-- 3. Políticas RLS (Row Level Security)
-- 4. Trigger para auto-crear perfil al registrarse
-- ==========================================

-- ==========================================
-- 1. CREATE PROFILES TABLE
-- ==========================================
-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'revoked')),
  house_id UUID REFERENCES houses(id) ON DELETE SET NULL,
  colonia_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE profiles IS 'User profiles with roles and house info';
COMMENT ON COLUMN profiles.id IS 'References auth.users(id)';
COMMENT ON COLUMN profiles.role IS 'User role: user, admin, or revoked';
COMMENT ON COLUMN profiles.house_id IS 'References houses table';
COMMENT ON COLUMN profiles.colonia_id IS 'References colonias table';

-- ==========================================
-- 2. CREATE ACCESS_LOGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('OPEN_GATE', 'CLOSE_GATE')),
  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'DENIED_REVOKED', 'DENIED_NO_ACCESS')),
  method TEXT DEFAULT 'APP' CHECK (method IN ('APP', 'QR', 'MANUAL', 'AUTOMATIC')),
  ip_address TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add method column if it doesn't exist (for existing installations)
ALTER TABLE access_logs
  ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'APP' CHECK (method IN ('APP', 'QR', 'MANUAL', 'AUTOMATIC'));

-- Add comments
COMMENT ON TABLE access_logs IS 'Audit log for gate access attempts';
COMMENT ON COLUMN access_logs.action IS 'OPEN_GATE or CLOSE_GATE';
COMMENT ON COLUMN access_logs.status IS 'SUCCESS, DENIED_REVOKED, or DENIED_NO_ACCESS';
COMMENT ON COLUMN access_logs.method IS 'Access method: APP, QR, MANUAL, or AUTOMATIC';
COMMENT ON COLUMN access_logs.gate_id IS 'ID del portón asociado (1..4)';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_timestamp ON access_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_house_id ON profiles(house_id);

-- Update profiles table for existing installations (idempotent)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS house_id UUID REFERENCES houses(id) ON DELETE SET NULL;

-- Drop old apartment_unit column if it exists (for clean migrations)
ALTER TABLE profiles
  DROP COLUMN IF EXISTS apartment_unit;

-- ==========================================
-- CREATE COLONIAS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS colonias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  maintenance_monthly_amount DECIMAL(10, 2) DEFAULT 0.00,
  streets TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE colonias IS 'Residential communities/colonias';
COMMENT ON COLUMN colonias.nombre IS 'Display name of the colonia';
COMMENT ON COLUMN colonias.id IS 'UUID serves as both primary key and join code for residents';
COMMENT ON COLUMN colonias.maintenance_monthly_amount IS 'Monthly maintenance fee in MXN';
COMMENT ON COLUMN colonias.streets IS 'Array of street names in the colonia';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_colonias_nombre ON colonias(nombre);

-- RLS for colonias
ALTER TABLE colonias ENABLE ROW LEVEL SECURITY;

-- Drop policies if exist
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
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role full access
CREATE POLICY "Service role full access colonias"
  ON colonias FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger for updated_at
DROP TRIGGER IF EXISTS colonias_set_updated_at ON colonias;
CREATE TRIGGER colonias_set_updated_at
  BEFORE UPDATE ON colonias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add foreign key to profiles after colonias table exists (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_profiles_colonia'
    ) THEN
        ALTER TABLE profiles
            ADD CONSTRAINT fk_profiles_colonia
            FOREIGN KEY (colonia_id) REFERENCES colonias(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_colonia_id ON profiles(colonia_id);

-- ==========================================
-- ENSURE STREETS COLUMN EXISTS IN COLONIAS
-- ==========================================
ALTER TABLE colonias
  ADD COLUMN IF NOT EXISTS streets TEXT[] DEFAULT ARRAY[]::TEXT[];

-- ==========================================
-- CREATE HOUSES TABLE
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

-- Add comments
COMMENT ON TABLE houses IS 'Houses/units in colonias';
COMMENT ON COLUMN houses.id IS 'Unique house identifier';
COMMENT ON COLUMN houses.colonia_id IS 'References colonias table';
COMMENT ON COLUMN houses.street IS 'Street name where the house is located';
COMMENT ON COLUMN houses.external_number IS 'External house/unit number';
COMMENT ON COLUMN houses.number_of_people IS 'Number of people living in the house';
COMMENT ON COLUMN houses.adeudos_months IS 'Number of months with pending maintenance payments';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_houses_colonia_id ON houses(colonia_id);
CREATE INDEX IF NOT EXISTS idx_houses_street ON houses(street);
CREATE INDEX IF NOT EXISTS idx_houses_colonia_street ON houses(colonia_id, street);

-- RLS for houses
ALTER TABLE houses ENABLE ROW LEVEL SECURITY;

-- Drop policies if exist (idempotence)
DROP POLICY IF EXISTS "Users can view houses from their colonia" ON houses;
DROP POLICY IF EXISTS "Admins can manage houses" ON houses;
DROP POLICY IF EXISTS "Service role full access houses" ON houses;

-- Users can view houses from their colonia
CREATE POLICY "Users can view houses from their colonia"
  ON houses FOR SELECT
  USING (
    colonia_id IN (
      SELECT colonia_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Admins can manage houses
CREATE POLICY "Admins can manage houses"
  ON houses FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role (backend) can do everything
CREATE POLICY "Service role full access houses"
  ON houses FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger for updated_at
DROP TRIGGER IF EXISTS houses_set_updated_at ON houses;
CREATE TRIGGER houses_set_updated_at
  BEFORE UPDATE ON houses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==========================================
-- CREATE GATES TABLE (Portones)
-- ==========================================
-- Tabla de portones para controlar y referenciar los IDs usados en firmware y app
-- IDs deben coincidir con 1..4 según el código (ver firmware y app)
CREATE TABLE IF NOT EXISTS gates (
  id SMALLINT PRIMARY KEY CHECK (id BETWEEN 1 AND 4),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'ENTRADA' CHECK (type IN ('ENTRADA', 'SALIDA')),
  colonia_id UUID REFERENCES colonias(id) ON DELETE SET NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Comentarios
COMMENT ON TABLE gates IS 'Listado de portones controlables (IDs 1..4)';
COMMENT ON COLUMN gates.id IS 'ID del portón. Debe coincidir con firmware/app (1..4)';
COMMENT ON COLUMN gates.type IS 'Gate type: ENTRADA or SALIDA';
COMMENT ON COLUMN gates.colonia_id IS 'Associated colonia (NULL = accessible to all)';
COMMENT ON COLUMN gates.enabled IS 'Habilita/Deshabilita el portón para uso';

-- Índices
CREATE INDEX IF NOT EXISTS idx_gates_enabled ON gates(enabled);
CREATE INDEX IF NOT EXISTS idx_gates_colonia_id ON gates(colonia_id);

-- RLS para gates
ALTER TABLE gates ENABLE ROW LEVEL SECURITY;

-- Hacer idempotentes las políticas de gates
DROP POLICY IF EXISTS "Authenticated users can view gates" ON gates;
DROP POLICY IF EXISTS "Admins can manage gates" ON gates;
DROP POLICY IF EXISTS "Service role full access gates" ON gates;

-- Usuarios autenticados pueden consultar la lista de portones
CREATE POLICY "Authenticated users can view gates"
  ON gates FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admins pueden administrar portones
CREATE POLICY "Admins can manage gates"
  ON gates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- service_role (backend) acceso total
CREATE POLICY "Service role full access gates"
  ON gates FOR ALL
  USING (auth.role() = 'service_role');

-- Seed/Upsert de portones (IDs 1..4)
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

-- ==========================================
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- ==========================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 4. CREATE RLS POLICIES FOR PROFILES
-- ==========================================

-- Idempotencia de políticas en profiles
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

-- ==========================================
-- 5. CREATE RLS POLICIES FOR ACCESS_LOGS
-- ==========================================

-- Idempotencia de políticas en access_logs
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
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role (backend) can insert logs
CREATE POLICY "Service role can insert logs"
  ON access_logs FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Service role can view all logs
CREATE POLICY "Service role full access logs"
  ON access_logs FOR SELECT
  USING (auth.role() = 'service_role');

-- ==========================================
-- LINK ACCESS_LOGS TO GATES
-- ==========================================
-- Agrega columna gate_id y su índice (si no existen)
ALTER TABLE access_logs
  ADD COLUMN IF NOT EXISTS gate_id SMALLINT REFERENCES gates(id);

CREATE INDEX IF NOT EXISTS idx_access_logs_gate_id ON access_logs(gate_id);

-- ==========================================
-- CREATE MAINTENANCE_PAYMENTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS maintenance_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  colonia_id UUID REFERENCES colonias(id) ON DELETE SET NULL,
  apartment_unit TEXT,
  amount DECIMAL(10, 2) NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  period_month SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year SMALLINT NOT NULL CHECK (period_year >= 2020),
  transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  payment_method TEXT DEFAULT 'card',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure column exists for existing installations
ALTER TABLE maintenance_payments
  ADD COLUMN IF NOT EXISTS apartment_unit TEXT;

-- Add comments
COMMENT ON TABLE maintenance_payments IS 'Record of maintenance payment transactions';
COMMENT ON COLUMN maintenance_payments.user_id IS 'User who made the payment';
COMMENT ON COLUMN maintenance_payments.colonia_id IS 'Colonia associated with payment';
COMMENT ON COLUMN maintenance_payments.apartment_unit IS 'Apartment unit (house) identifier';
COMMENT ON COLUMN maintenance_payments.amount IS 'Payment amount in MXN';
COMMENT ON COLUMN maintenance_payments.period_month IS 'Month being paid for (1-12)';
COMMENT ON COLUMN maintenance_payments.period_year IS 'Year being paid for';
COMMENT ON COLUMN maintenance_payments.transaction_id IS 'External payment gateway transaction ID';
COMMENT ON COLUMN maintenance_payments.status IS 'Payment status: pending, completed, failed, refunded';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_maintenance_payments_user_id ON maintenance_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_payments_colonia_id ON maintenance_payments(colonia_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_payments_apartment_unit ON maintenance_payments(apartment_unit);
CREATE INDEX IF NOT EXISTS idx_maintenance_payments_period ON maintenance_payments(period_year DESC, period_month DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_payments_status ON maintenance_payments(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_payments_payment_date ON maintenance_payments(payment_date DESC);

-- RLS for maintenance_payments
ALTER TABLE maintenance_payments ENABLE ROW LEVEL SECURITY;

-- Drop policies if exist (idempotence)
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
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role (backend) can do everything
CREATE POLICY "Service role full access payments"
  ON maintenance_payments FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger for updated_at
DROP TRIGGER IF EXISTS maintenance_payments_set_updated_at ON maintenance_payments;
CREATE TRIGGER maintenance_payments_set_updated_at
  BEFORE UPDATE ON maintenance_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==========================================
-- 6. CREATE AUTO-CREATE PROFILE TRIGGER
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

-- ==========================================
-- 6b. UPDATED_AT TRIGGER FUNCTION & TRIGGERS
-- ==========================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop triggers if exist
DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS gates_set_updated_at ON public.gates;

-- Create triggers
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER gates_set_updated_at
  BEFORE UPDATE ON public.gates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==========================================
-- 7. SEED DATA (OPTIONAL)
-- ==========================================
-- Descomenta esto para agregar datos de prueba
-- El password es: Test123!

-- INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
-- VALUES (
--   '00000000-0000-0000-0000-000000000001',
--   'admin@example.com',
--   crypt('Test123!', gen_salt('bf')),
--   NOW(),
--   NOW(),
--   NOW()
-- );

-- INSERT INTO profiles (id, role, apartment_unit)
-- VALUES (
--   '00000000-0000-0000-0000-000000000001',
--   'admin',
--   'ADMIN'
-- );

-- ==========================================
-- VERIFICACIÓN
-- ==========================================
-- Ejecuta estas queries para verificar que todo está bien:

-- SELECT * FROM profiles;
-- SELECT * FROM access_logs;
-- SELECT * FROM information_schema.tables WHERE table_schema = 'public';
-- ==========================================
-- 8. FORUM POSTS TABLE
-- ==========================================
-- Tabla para publicaciones del foro comunitario

CREATE TABLE IF NOT EXISTS forum_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) <= 100),
  content TEXT NOT NULL CHECK (char_length(content) <= 1000),
  category TEXT NOT NULL CHECK (category IN ('events', 'messages', 'requests')),
  colonia_id UUID NOT NULL REFERENCES colonias(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE forum_posts IS 'Community forum posts for colonias';
COMMENT ON COLUMN forum_posts.title IS 'Post title, max 100 characters';
COMMENT ON COLUMN forum_posts.content IS 'Post content, max 1000 characters';
COMMENT ON COLUMN forum_posts.category IS 'Post category: events, messages, or requests';
COMMENT ON COLUMN forum_posts.colonia_id IS 'References colonias table';
COMMENT ON COLUMN forum_posts.author_id IS 'References profiles table';

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_forum_posts_colonia_id ON forum_posts(colonia_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_category ON forum_posts(category);
CREATE INDEX IF NOT EXISTS idx_forum_posts_created_at ON forum_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_author_id ON forum_posts(author_id);

-- Trigger para actualizar updated_at
CREATE TRIGGER forum_posts_set_updated_at
  BEFORE UPDATE ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==========================================
-- 9. ROW LEVEL SECURITY FOR FORUM_POSTS
-- ==========================================
ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view posts from their own colonia
CREATE POLICY "Users can view posts from their colonia"
ON forum_posts
FOR SELECT
USING (
  colonia_id IN (
    SELECT colonia_id FROM profiles WHERE id = auth.uid()
  )
);

-- Policy: Users can create posts in their own colonia
CREATE POLICY "Users can create posts in their colonia"
ON forum_posts
FOR INSERT
WITH CHECK (
  colonia_id IN (
    SELECT colonia_id FROM profiles WHERE id = auth.uid()
  )
  AND author_id = auth.uid()
);

-- Policy: Users can update their own posts
CREATE POLICY "Users can update their own posts"
ON forum_posts
FOR UPDATE
USING (author_id = auth.uid())
WITH CHECK (author_id = auth.uid());

-- Policy: Users can delete their own posts or admins can delete any post
CREATE POLICY "Users can delete their own posts"
ON forum_posts
FOR DELETE
USING (
  author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);