-- Tabla para almacenar mensajes de soporte
CREATE TABLE IF NOT EXISTS support_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  apartment_unit TEXT,
  colonia_name TEXT,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mejorar las consultas
CREATE INDEX idx_support_messages_user_id ON support_messages(user_id);
CREATE INDEX idx_support_messages_status ON support_messages(status);
CREATE INDEX idx_support_messages_created_at ON support_messages(created_at DESC);

-- RLS (Row Level Security)
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios solo pueden ver sus propios mensajes
CREATE POLICY "Users can view their own support messages"
  ON support_messages
  FOR SELECT
  USING (auth.uid() = user_id);

-- Política: Los usuarios pueden crear sus propios mensajes
CREATE POLICY "Users can create their own support messages"
  ON support_messages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Política: Los admins pueden ver todos los mensajes
CREATE POLICY "Admins can view all support messages"
  ON support_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Política: Los admins pueden actualizar el status de los mensajes
CREATE POLICY "Admins can update support messages"
  ON support_messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

COMMENT ON TABLE support_messages IS 'Almacena mensajes de soporte enviados por los usuarios';
COMMENT ON COLUMN support_messages.status IS 'Estado del mensaje: pending, in_progress, resolved';
