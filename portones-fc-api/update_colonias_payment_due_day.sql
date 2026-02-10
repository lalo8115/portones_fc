-- ==========================================
-- Update COLONIAS table - Add payment_due_day
-- ==========================================
-- Copia y pega este script en el SQL Editor de Supabase
-- https://app.supabase.com/project/[tu-proyecto]/sql
-- IDEMPOTENTE - Se puede ejecutar múltiples veces sin error
-- ==========================================

-- Drop old payment_due_date column if it exists (TEXT version)
ALTER TABLE colonias
  DROP COLUMN IF EXISTS payment_due_date;

-- Add payment_due_day column (día del mes: 1-31)
ALTER TABLE colonias
  ADD COLUMN IF NOT EXISTS payment_due_day SMALLINT 
  CHECK (payment_due_day BETWEEN 1 AND 31);

-- Add comment to the new column
COMMENT ON COLUMN colonias.payment_due_day IS 'Day of the month when maintenance payment is due (1-31)';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_colonias_payment_due_day ON colonias(payment_due_day);

-- Verification query (optional - just to see the updated table structure)
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'colonias' 
-- ORDER BY ordinal_position;
