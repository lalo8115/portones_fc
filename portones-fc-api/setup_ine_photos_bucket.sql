-- Crear bucket para fotos de identificaciones (INE)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ine-photos',
  'ine-photos',
  true, -- Bucket público para acceso directo
  5242880, -- 5MB límite
  ARRAY['image/jpeg', 'image/png', 'image/jpg']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de seguridad

-- 1. Usuarios autenticados pueden subir sus propias fotos INE
CREATE POLICY "Usuarios autenticados pueden subir sus propias fotos INE"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ine-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 2. Todos pueden leer fotos INE (bucket público)
CREATE POLICY "Todos pueden leer fotos INE"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'ine-photos');

-- 3. Usuarios pueden actualizar sus propias fotos INE
CREATE POLICY "Usuarios pueden actualizar sus propias fotos INE"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'ine-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Usuarios pueden eliminar sus propias fotos INE
CREATE POLICY "Usuarios pueden eliminar sus propias fotos INE"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'ine-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Verificar que el bucket fue creado correctamente
SELECT 
  id, 
  name, 
  public, 
  file_size_limit, 
  allowed_mime_types 
FROM storage.buckets 
WHERE id = 'ine-photos';
