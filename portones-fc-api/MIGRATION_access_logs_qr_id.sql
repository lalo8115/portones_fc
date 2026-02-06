-- ==========================================
-- MIGRATION: Cambiar access_logs de metadata JSONB a qr_id UUID
-- ==========================================
-- Ejecutar en Supabase SQL Editor DESPUÉS del setup.sql principal

-- 1. Agregar columna qr_id
ALTER TABLE access_logs ADD COLUMN IF NOT EXISTS qr_id UUID;

-- 2. Remover columna metadata (opcional, mantenerla si hay datos históricos)
-- ALTER TABLE access_logs DROP COLUMN IF EXISTS metadata;

-- 3. Hacer user_id nullable (ya debería estarlo pero por seguridad)
ALTER TABLE access_logs ALTER COLUMN user_id DROP NOT NULL;

-- 4. Agregar FK constraint  
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_access_logs_qr'
  ) THEN
    ALTER TABLE access_logs
      ADD CONSTRAINT fk_access_logs_qr
      FOREIGN KEY (qr_id) REFERENCES visitor_qr(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Agregar constraint: user_id o qr_id debe estar presente
ALTER TABLE access_logs DROP CONSTRAINT IF EXISTS check_user_or_qr;
ALTER TABLE access_logs 
  ADD CONSTRAINT check_user_or_qr 
  CHECK (
    (user_id IS NOT NULL AND qr_id IS NULL) 
    OR 
    (user_id IS NULL AND qr_id IS NOT NULL)
  );

-- 6. Crear índices
CREATE INDEX IF NOT EXISTS idx_access_logs_qr_id ON access_logs(qr_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_method ON access_logs(method);

-- 7. ACTUALIZAR POLÍTICA RLS - ¡IMPORTANTE!
DROP POLICY IF EXISTS "Users can view own logs" ON access_logs;

CREATE POLICY "Users can view own logs"
  ON access_logs FOR SELECT
  USING (
    -- Usuario puede ver sus propios logs
    auth.uid() = user_id 
    OR 
    -- Usuario puede ver logs QR de visitantes de su casa
    (
      method = 'QR' 
      AND qr_id IN (
        SELECT vq.id 
        FROM visitor_qr vq
        INNER JOIN profiles p ON p.house_id = vq.house_id
        WHERE p.id = auth.uid()
      )
    )
  );

-- 8. Actualizar comentarios
COMMENT ON COLUMN access_logs.qr_id IS 'QR code used (null for APP/MANUAL access, JOIN visitor_qr for details)';
COMMENT ON COLUMN access_logs.user_id IS 'Resident user (null for QR visitor access)';

-- Query de ejemplo para ver logs unificados:
-- SELECT 
--   al.id,
--   al.method,
--   al.action,
--   al.timestamp,
--   CASE 
--     WHEN al.method = 'APP' THEN (SELECT email FROM auth.users WHERE id = al.user_id)
--     WHEN al.method = 'QR' THEN vq.invitado
--   END as accessor_name,
--   CASE
--     WHEN al.method = 'APP' THEN 'Residente'
--     WHEN al.method = 'QR' THEN vq.rubro
--   END as accessor_type
-- FROM access_logs al
-- LEFT JOIN visitor_qr vq ON al.qr_id = vq.id
-- ORDER BY al.timestamp DESC;
