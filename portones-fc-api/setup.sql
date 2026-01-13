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
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'revoked')),
  apartment_unit TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE profiles IS 'User profiles with roles and apartment info';
COMMENT ON COLUMN profiles.id IS 'References auth.users(id)';
COMMENT ON COLUMN profiles.role IS 'User role: user, admin, or revoked';
COMMENT ON COLUMN profiles.apartment_unit IS 'Apartment unit identifier';

-- ==========================================
-- 2. CREATE ACCESS_LOGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('OPEN_GATE', 'CLOSE_GATE')),
  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'DENIED_REVOKED', 'DENIED_NO_ACCESS')),
  ip_address TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE access_logs IS 'Audit log for gate access attempts';
COMMENT ON COLUMN access_logs.action IS 'OPEN_GATE or CLOSE_GATE';
COMMENT ON COLUMN access_logs.status IS 'SUCCESS, DENIED_REVOKED, or DENIED_NO_ACCESS';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_timestamp ON access_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- ==========================================
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- ==========================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 4. CREATE RLS POLICIES FOR PROFILES
-- ==========================================

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
