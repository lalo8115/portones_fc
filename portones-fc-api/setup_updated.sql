-- MIGRATION SCRIPT: access_logs con qr_id
-- Ejecutar en Supabase SQL Editor

-- 1. Agregar columna qr_id
ALTER TABLE access_logs ADD COLUMN IF NOT EXISTS qr_id UUID;

-- 2. Hacer user_id nullable
ALTER TABLE access_logs ALTER COLUMN user_id DROP NOT NULL;

-- 3. Agregar FK constraint
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

-- 4. Agregar constraint: user_id o qr_id debe estar presente
ALTER TABLE access_logs DROP CONSTRAINT IF EXISTS check_user_or_qr;
ALTER TABLE access_logs 
  ADD CONSTRAINT check_user_or_qr 
  CHECK (
    (user_id IS NOT NULL AND qr_id IS NULL) 
    OR 
    (user_id IS NULL AND qr_id IS NOT NULL)
  );

-- 5. Remover columna metadata si existe
ALTER TABLE access_logs DROP COLUMN IF EXISTS metadata;

-- 6. Crear índices
CREATE INDEX IF NOT EXISTS idx_access_logs_qr_id ON access_logs(qr_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_method ON access_logs(method);

-- 7. Actualizar política RLS
DROP POLICY IF EXISTS "Users can view own logs" ON access_logs;

CREATE POLICY "Users can view own logs"
  ON access_logs FOR SELECT
  USING (
    auth.uid() = user_id 
    OR 
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
COMMENT ON COLUMN access_logs.qr_id IS 'QR code used (null for APP/MANUAL access, references visitor_qr table)';
COMMENT ON COLUMN access_logs.user_id IS 'User who accessed (null for visitor QR access)';
