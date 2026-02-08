-- ==========================================
-- MIGRATION: Add valid_from column to visitor_qr
-- ==========================================
-- Purpose: Add explicit start date for QR validity period
-- Date: 2026-02-08
-- ==========================================

-- 1. Add the valid_from column
ALTER TABLE visitor_qr 
ADD COLUMN IF NOT EXISTS valid_from TIMESTAMP WITH TIME ZONE;

-- 2. Set valid_from to created_at for all existing records
UPDATE visitor_qr 
SET valid_from = created_at 
WHERE valid_from IS NULL;

-- 3. Make the column NOT NULL and set default
ALTER TABLE visitor_qr 
ALTER COLUMN valid_from SET NOT NULL,
ALTER COLUMN valid_from SET DEFAULT NOW();

-- 4. Add comment to the column
COMMENT ON COLUMN visitor_qr.valid_from IS 'Start date/time when QR code becomes valid (for scheduled QRs like parcel/service)';

-- ==========================================
-- VERIFICATION QUERIES
-- ==========================================
-- Verify the column was added correctly:
-- SELECT column_name, data_type, is_nullable, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'visitor_qr' AND column_name = 'valid_from';

-- Check sample data:
-- SELECT id, short_code, rubro, created_at, valid_from, expires_at 
-- FROM visitor_qr 
-- ORDER BY created_at DESC 
-- LIMIT 10;
