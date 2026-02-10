-- ==========================================
-- UPDATE: Eliminar política 'temporal' de visitor_qr
-- ==========================================
-- Ejecutar en Supabase SQL Editor

-- 1. Eliminar constraint viejo que incluye 'temporal'
ALTER TABLE visitor_qr DROP CONSTRAINT IF EXISTS visitor_qr_rubro_check;

-- 2. Crear nuevo constraint sin 'temporal'
ALTER TABLE visitor_qr
  ADD CONSTRAINT visitor_qr_rubro_check 
  CHECK (rubro IN ('delivery_app', 'family', 'friend', 'parcel', 'service'));

-- 3. (Opcional) Actualizar registros existentes con rubro 'temporal' si los hay
-- Descomentar si necesitas migrar datos existentes:
-- UPDATE visitor_qr SET rubro = 'friend' WHERE rubro = 'temporal';

COMMENT ON CONSTRAINT visitor_qr_rubro_check ON visitor_qr IS 'Valid rubros: delivery_app, family, friend, parcel, service';
