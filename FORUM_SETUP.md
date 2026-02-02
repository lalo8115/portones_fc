# 🗣️ Configuración del Foro Comunitario

## 📋 Descripción

El foro comunitario permite a los residentes de cada colonia interactuar mediante tres categorías:
- **Eventos** 📅 - Publicar eventos de la colonia
- **Mensajes** 💬 - Avisos y mensajes generales  
- **Peticiones** ⚠️ - Solicitudes de la comunidad

## 🗄️ Migración de Base de Datos

### Paso 1: Acceder a Supabase SQL Editor

1. Inicia sesión en [Supabase](https://app.supabase.com)
2. Selecciona tu proyecto
3. Ve a **SQL Editor** en el menú lateral

### Paso 2: Ejecutar Script SQL

Copia y ejecuta el siguiente script SQL:

```sql
-- ==========================================
-- FORUM POSTS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS forum_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) <= 100),
  content TEXT NOT NULL CHECK (char_length(content) <= 1000),
  category TEXT NOT NULL CHECK (category IN ('events', 'messages', 'requests')),
  colonia_id UUID NOT NULL REFERENCES colonias(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Comentarios
COMMENT ON TABLE forum_posts IS 'Community forum posts for colonias';
COMMENT ON COLUMN forum_posts.title IS 'Post title, max 100 characters';
COMMENT ON COLUMN forum_posts.content IS 'Post content, max 1000 characters';
COMMENT ON COLUMN forum_posts.category IS 'Post category: events, messages, or requests';
COMMENT ON COLUMN forum_posts.colonia_id IS 'References colonias table';
COMMENT ON COLUMN forum_posts.author_id IS 'References profiles table';

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_forum_posts_colonia_id ON forum_posts(colonia_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_category ON forum_posts(category);
CREATE INDEX IF NOT EXISTS idx_forum_posts_created_at ON forum_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_author_id ON forum_posts(author_id);

-- Trigger para actualizar updated_at
CREATE TRIGGER forum_posts_set_updated_at
  BEFORE UPDATE ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==========================================
-- ROW LEVEL SECURITY
-- ==========================================

ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;

-- Los usuarios pueden ver posts de su colonia
CREATE POLICY "Users can view posts from their colonia"
ON forum_posts
FOR SELECT
USING (
  colonia_id IN (
    SELECT colonia_id FROM profiles WHERE id = auth.uid()
  )
);

-- Los usuarios pueden crear posts en su colonia
CREATE POLICY "Users can create posts in their colonia"
ON forum_posts
FOR INSERT
WITH CHECK (
  colonia_id IN (
    SELECT colonia_id FROM profiles WHERE id = auth.uid()
  )
  AND author_id = auth.uid()
);

-- Los usuarios pueden actualizar sus propios posts
CREATE POLICY "Users can update their own posts"
ON forum_posts
FOR UPDATE
USING (author_id = auth.uid())
WITH CHECK (author_id = auth.uid());

-- Los usuarios pueden eliminar sus propios posts o admins pueden eliminar cualquiera
CREATE POLICY "Users can delete their own posts"
ON forum_posts
FOR DELETE
USING (
  author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);
```

### Paso 3: Verificar la Tabla

Ejecuta esta query para verificar que la tabla fue creada correctamente:

```sql
SELECT * FROM forum_posts;
SELECT * FROM information_schema.tables WHERE table_name = 'forum_posts';
```

## 🚀 Endpoints API

### GET `/forum/posts?category={category}`

Obtiene las publicaciones de una categoría específica de la colonia del usuario.

**Query Parameters:**
- `category` (requerido): `events`, `messages`, o `requests`

**Headers:**
```
Authorization: Bearer {token}
```

**Response 200:**
```json
[
  {
    "id": "uuid",
    "title": "Título de la publicación",
    "content": "Contenido de la publicación",
    "category": "events",
    "created_at": "2026-02-01T10:00:00Z",
    "author_name": "usuario",
    "author_unit": "Depto 101",
    "replies_count": 0
  }
]
```

### POST `/forum/posts`

Crea una nueva publicación en el foro.

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{
  "title": "Título de la publicación",
  "content": "Contenido de la publicación (máx 1000 caracteres)",
  "category": "events"
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "title": "Título de la publicación",
  "content": "Contenido de la publicación",
  "category": "events",
  "created_at": "2026-02-01T10:00:00Z",
  "author_name": "usuario",
  "author_unit": "Depto 101",
  "replies_count": 0
}
```

## 🎯 Características de Seguridad

### Row Level Security (RLS)

1. **Lectura**: Los usuarios solo pueden ver posts de su propia colonia
2. **Creación**: Los usuarios solo pueden crear posts en su colonia asignada
3. **Actualización**: Los usuarios solo pueden editar sus propios posts
4. **Eliminación**: Los usuarios pueden eliminar sus propios posts, los admins pueden eliminar cualquiera

### Validaciones

- **Título**: Máximo 100 caracteres
- **Contenido**: Máximo 1000 caracteres
- **Categoría**: Solo permite `events`, `messages`, o `requests`
- **Colonia**: El usuario debe estar asignado a una colonia
- **Autoría**: El autor debe ser el usuario autenticado

## 📱 Frontend

La interfaz del foro está implementada en:
- [`portones-fc-app/src/screens/CommunityForumScreen.tsx`](portones-fc-app/src/screens/CommunityForumScreen.tsx)

### Características de la UI:

- ✅ Navegación por pestañas entre categorías
- ✅ Crear publicaciones con título y contenido
- ✅ Vista de lista de publicaciones
- ✅ Información del autor y unidad
- ✅ Timestamps relativos (hace X minutos/horas/días)
- ✅ Estados vacíos informativos
- ✅ Pull to refresh
- ✅ Diseño responsivo y accesible

## 🔄 Próximas Funcionalidades (Opcionales)

- [ ] Respuestas/comentarios en publicaciones
- [ ] Likes o reacciones
- [ ] Notificaciones push para nuevos posts
- [ ] Imágenes en publicaciones
- [ ] Búsqueda y filtrado
- [ ] Posts destacados/fijados
- [ ] Moderación de contenido
- [ ] Reportar contenido inapropiado

## 🐛 Solución de Problemas

### Error: "Debes estar asignado a una colonia"
- Verifica que el usuario tiene un `colonia_id` en su perfil
- Ejecuta: `SELECT * FROM profiles WHERE id = '{user_id}'`

### Error: "No se pudieron obtener las publicaciones"
- Verifica que la tabla `forum_posts` existe
- Verifica que las políticas RLS están habilitadas
- Revisa los logs del servidor API

### Los posts no se muestran
- Verifica que existe al menos una colonia en la tabla `colonias`
- Verifica que el usuario está asignado a esa colonia
- Crea un post de prueba usando el SQL Editor

## 📞 Soporte

Para más información o soporte, contacta al equipo de desarrollo.
