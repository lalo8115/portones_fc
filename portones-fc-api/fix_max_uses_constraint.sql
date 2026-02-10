-- Eliminar constraint antiguo que limitaba max_uses
ALTER TABLE visitor_qr DROP CONSTRAINT IF EXISTS visitor_qr_max_uses_check;

-- Crear nuevo constraint que permita hasta 500 usos
ALTER TABLE visitor_qr ADD CONSTRAINT visitor_qr_max_uses_check 
CHECK (max_uses > 0 AND max_uses <= 500);

-- Verificar que el constraint se aplicó correctamente
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'visitor_qr'::regclass 
AND conname = 'visitor_qr_max_uses_check';
