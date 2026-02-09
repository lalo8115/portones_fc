-- ==========================================
-- Update COLONIAS table - Add payment_due_date
-- ==========================================
-- Copia y pega este script en el SQL Editor de Supabase
-- https://app.supabase.com/project/[tu-proyecto]/sql
-- IDEMPOTENTE - Se puede ejecutar múltiples veces sin error
-- ==========================================

-- Add payment_due_date column to colonias table if it doesn't exist
ALTER TABLE colonias
  ADD COLUMN IF NOT EXISTS payment_due_date TEXT;

-- Add comment to the new column
COMMENT ON COLUMN colonias.payment_due_date IS 'Due date for monthly maintenance payments (e.g., "2024-05-15" or just date format)';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_colonias_payment_due_date ON colonias(payment_due_date);

-- Verification query (optional - just to see the updated table structure)
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'colonias' 
-- ORDER BY ordinal_position;
