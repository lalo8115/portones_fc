-- ==========================================
-- CONFIGURACIÓN DE SUPABASE STORAGE
-- Para Estados de Cuenta (PDFs)
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase
-- ==========================================

-- 1. Crear bucket público para estados de cuenta
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'account-statements',
  'account-statements',
  true,
  10485760, -- 10MB límite por archivo
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf']::text[];

-- 2. Política: Usuarios autenticados pueden subir (validación se hace en app)
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'account-statements' 
  AND auth.uid() IS NOT NULL
);

-- 3. Política: Usuarios autenticados pueden actualizar
DROP POLICY IF EXISTS "Authenticated users can update" ON storage.objects;
CREATE POLICY "Authenticated users can update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'account-statements'
  AND auth.uid() IS NOT NULL
);

-- 4. Política: Usuarios autenticados pueden eliminar
DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;
CREATE POLICY "Authenticated users can delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'account-statements'
  AND auth.uid() IS NOT NULL
);

-- 5. Política: Todos los usuarios autenticados pueden ver archivos
DROP POLICY IF EXISTS "Authenticated users can view statements" ON storage.objects;
CREATE POLICY "Authenticated users can view statements"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'account-statements'
  AND auth.uid() IS NOT NULL
);

-- ==========================================
-- ✅ Configuración completada
-- ==========================================
-- Estructura de archivos sugerida:
-- account-statements/
--   {colonia_id}/
--     {YYYY-MM}/
--       estado-cuenta-{YYYY-MM}.pdf
-- ==========================================
