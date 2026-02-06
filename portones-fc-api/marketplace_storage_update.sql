-- Agregar columnas para URLs de archivos a marketplace_items
ALTER TABLE marketplace_items
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Crear índice para búsquedas más rápidas
CREATE INDEX IF NOT EXISTS idx_marketplace_items_image_url ON marketplace_items(image_url) WHERE image_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketplace_items_pdf_url ON marketplace_items(pdf_url) WHERE pdf_url IS NOT NULL;
