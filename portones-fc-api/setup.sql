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

-- ==========================================
-- 0. CREATE COLONIAS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS colonias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  maintenance_monthly_amount number
);

-- Add comments
COMMENT ON TABLE colonias IS 'Colonias/comunidades que tienen portones';
COMMENT ON COLUMN colonias.id IS 'ID único de la colonia';
COMMENT ON COLUMN colonias.nombre IS 'Nombre de la colonia';

-- Create index
CREATE INDEX IF NOT EXISTS idx_colonias_nombre ON colonias(nombre);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'revoked')),
  apartment_unit TEXT,
  colonia_id UUID REFERENCES colonias(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure columna_id exists for existing deployments
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS colonia_id UUID REFERENCES colonias(id) ON DELETE SET NULL;

-- Add comments
COMMENT ON TABLE profiles IS 'User profiles with roles and apartment info';
COMMENT ON COLUMN profiles.id IS 'References auth.users(id)';
COMMENT ON COLUMN profiles.role IS 'User role: user, admin, or revoked';
COMMENT ON COLUMN profiles.apartment_unit IS 'Apartment unit identifier';
COMMENT ON COLUMN profiles.colonia_id IS 'Colonia a la que pertenece el usuario';

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
COMMENT ON COLUMN access_logs.gate_id IS 'ID del portón asociado (1..4)';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_timestamp ON access_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_colonia_id ON profiles(colonia_id);

-- ==========================================
-- CREATE GATES TABLE (Portones)
-- ==========================================
-- Tabla de portones para controlar y referenciar los IDs usados en firmware y app
-- IDs deben coincidir con 1..4 según el código (ver firmware y app)
CREATE TABLE IF NOT EXISTS gates (
  id SMALLINT PRIMARY KEY CHECK (id BETWEEN 1 AND 4),
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  colonia_id UUID REFERENCES colonias(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure colonia_id exists for existing deployments
ALTER TABLE gates
  ADD COLUMN IF NOT EXISTS colonia_id UUID REFERENCES colonias(id) ON DELETE CASCADE;

-- Comentarios
COMMENT ON TABLE gates IS 'Listado de portones controlables (IDs 1..4)';
COMMENT ON COLUMN gates.id IS 'ID del portón. Debe coincidir con firmware/app (1..4)';
COMMENT ON COLUMN gates.enabled IS 'Habilita/Deshabilita el portón para uso';
COMMENT ON COLUMN gates.colonia_id IS 'Colonia a la que pertenece el portón';

-- Índices
CREATE INDEX IF NOT EXISTS idx_gates_enabled ON gates(enabled);
CREATE INDEX IF NOT EXISTS idx_gates_colonia_id ON gates(colonia_id);

-- RLS para gates
ALTER TABLE gates ENABLE ROW LEVEL SECURITY;

-- Hacer idempotentes las políticas de gates
DROP POLICY IF EXISTS "Authenticated users can view gates" ON gates;
DROP POLICY IF EXISTS "Admins can manage gates" ON gates;
DROP POLICY IF EXISTS "Service role full access gates" ON gates;

-- Usuarios autenticados pueden consultar solo los portones de su colonia
CREATE POLICY "Authenticated users can view gates"
  ON gates FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      colonia_id IS NULL OR
      colonia_id IN (
        SELECT colonia_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- Admins pueden administrar solo portones de su colonia
CREATE POLICY "Admins can manage gates"
  ON gates FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND (
          profiles.colonia_id IS NULL AND gates.colonia_id IS NULL OR
          profiles.colonia_id = gates.colonia_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND (
          profiles.colonia_id IS NULL AND gates.colonia_id IS NULL OR
          profiles.colonia_id = gates.colonia_id
        )
    )
  );

-- service_role (backend) acceso total
CREATE POLICY "Service role full access gates"
  ON gates FOR ALL
  USING (auth.role() = 'service_role');

-- Seed/Upsert de portones (IDs 1..4)
-- NOTA: Actualiza los colonia_id según tus colonias existentes
-- Por ahora se insertan sin colonia (NULL) - debes asignarlas después
INSERT INTO gates (id, name, enabled, colonia_id)
VALUES
  (1, 'Portón 1', TRUE, NULL),
  (2, 'Portón 2', TRUE, NULL),
  (3, 'Portón 3', TRUE, NULL),
  (4, 'Portón 4', TRUE, NULL)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    enabled = EXCLUDED.enabled,
    colonia_id = EXCLUDED.colonia_id,
    updated_at = NOW();

-- ==========================================
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- ==========================================
ALTER TABLE colonias ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 3b. CREATE RLS POLICIES FOR COLONIAS
-- ==========================================

-- Idempotencia de políticas en colonias
DROP POLICY IF EXISTS "Authenticated users can view colonias" ON colonias;
DROP POLICY IF EXISTS "Admins can manage colonias" ON colonias;
DROP POLICY IF EXISTS "Service role full access colonias" ON colonias;

-- Usuarios autenticados pueden ver todas las colonias
CREATE POLICY "Authenticated users can view colonias"
  ON colonias FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admins solo pueden ver/gestionar su colonia
CREATE POLICY "Admins can manage colonias"
  ON colonias FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND colonia_id = colonias.id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND colonia_id = colonias.id
    )
  );

-- Service role (backend) puede hacer todo
CREATE POLICY "Service role full access colonias"
  ON colonias FOR ALL
  USING (auth.role() = 'service_role');

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

-- Admins pueden ver perfiles solo de su colonia
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles AS admins
      WHERE admins.id = auth.uid()
        AND admins.role = 'admin'
        AND (
          admins.colonia_id IS NULL AND profiles.colonia_id IS NULL OR
          admins.colonia_id = profiles.colonia_id
        )
    )
  );

-- Admins pueden actualizar perfiles solo de su colonia
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM profiles AS admins
      WHERE admins.id = auth.uid()
        AND admins.role = 'admin'
        AND (
          admins.colonia_id IS NULL AND profiles.colonia_id IS NULL OR
          admins.colonia_id = profiles.colonia_id
        )
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

-- Admins pueden ver logs solo de su colonia (por gate o usuario)
CREATE POLICY "Admins can view all logs"
  ON access_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles AS admins
      WHERE admins.id = auth.uid()
        AND admins.role = 'admin'
        AND (
          -- Coincide por gate
          EXISTS (
            SELECT 1
            FROM gates
            WHERE gates.id = access_logs.gate_id
              AND (
                admins.colonia_id IS NULL AND gates.colonia_id IS NULL OR
                admins.colonia_id = gates.colonia_id
              )
          )
          OR
          -- Coincide por usuario
          EXISTS (
            SELECT 1
            FROM profiles AS users
            WHERE users.id = access_logs.user_id
              AND (
                admins.colonia_id IS NULL AND users.colonia_id IS NULL OR
                admins.colonia_id = users.colonia_id
              )
          )
        )
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
DROP TRIGGER IF EXISTS colonias_set_updated_at ON public.colonias;

-- Create triggers
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER gates_set_updated_at
  BEFORE UPDATE ON public.gates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER colonias_set_updated_at
  BEFORE UPDATE ON public.colonias
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
-- 7b. SEED COLONIAS (EJEMPLO)
-- ==========================================
-- Descomenta y edita según tus colonias reales
-- Luego actualiza gates y profiles con los colonia_id correctos

-- INSERT INTO colonias (id, nombre, descripcion)
-- VALUES 
--   ('11111111-1111-1111-1111-111111111111', 'Colonia Norte', 'Zona residencial norte'),
--   ('22222222-2222-2222-2222-222222222222', 'Colonia Sur', 'Zona residencial sur'),
--   ('33333333-3333-3333-3333-333333333333', 'Colonia Centro', 'Zona central');

-- Asignar portones a colonias (ejemplo):
-- UPDATE gates SET colonia_id = '11111111-1111-1111-1111-111111111111' WHERE id = 1;
-- UPDATE gates SET colonia_id = '11111111-1111-1111-1111-111111111111' WHERE id = 2;
-- UPDATE gates SET colonia_id = '22222222-2222-2222-2222-222222222222' WHERE id = 3;
-- UPDATE gates SET colonia_id = '33333333-3333-3333-3333-333333333333' WHERE id = 4;

-- Asignar usuarios a colonias (ejemplo):
-- UPDATE profiles SET colonia_id = '11111111-1111-1111-1111-111111111111' WHERE id = '00000000-0000-0000-0000-000000000001';

-- ==========================================
-- VERIFICACIÓN
-- ==========================================
-- Ejecuta estas queries para verificar que todo está bien:

-- SELECT * FROM profiles;
-- SELECT * FROM access_logs;
-- SELECT * FROM information_schema.tables WHERE table_schema = 'public';
