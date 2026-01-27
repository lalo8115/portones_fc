# Migración de Sistema de Colonias

## 📋 Resumen de Cambios

Se ha implementado un sistema de **colonias** para gestionar el acceso a portones de manera más segmentada. Ahora cada usuario pertenece a una colonia y solo puede abrir los portones de su colonia.

### Cambios Principales

1. **Nueva tabla `colonias`**: Almacena la información de cada colonia
2. **Campo `colonia_id` en `profiles`**: Cada usuario pertenece a una colonia
3. **Campo `colonia_id` en `gates`**: Cada portón pertenece a una colonia
4. **Validación de acceso por colonia**: Los usuarios solo pueden ver y controlar portones de su colonia

---

## 🗄️ Cambios en Base de Datos

### Nueva Tabla: `colonias`

```sql
CREATE TABLE colonias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Columnas Agregadas

**Tabla `profiles`:**
- `colonia_id` UUID (FK a `colonias.id`)

**Tabla `gates`:**
- `colonia_id` UUID (FK a `colonias.id`)

### Políticas RLS Actualizadas

- Los usuarios solo pueden ver portones de su colonia o portones sin colonia asignada
- Los administradores pueden gestionar todas las colonias y portones

---

## 🚀 Pasos de Migración

### 1. Ejecutar el Script SQL Actualizado

El archivo [setup.sql](portones-fc-api/setup.sql) ya contiene todos los cambios necesarios:

```bash
# En Supabase Dashboard:
# 1. Ve a SQL Editor
# 2. Crea una nueva query
# 3. Copia y pega el contenido completo de setup.sql
# 4. Ejecuta el script
```

### 2. Crear tus Colonias

Después de ejecutar el script, necesitas crear las colonias de tu sistema:

```sql
-- Ejemplo: Crear 3 colonias
INSERT INTO colonias (id, nombre, descripcion)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Colonia Norte', 'Zona residencial norte'),
  ('22222222-2222-2222-2222-222222222222', 'Colonia Sur', 'Zona residencial sur'),
  ('33333333-3333-3333-3333-333333333333', 'Colonia Centro', 'Zona central');
```

> ⚠️ **Importante**: Guarda los IDs generados, los necesitarás para los siguientes pasos.

### 3. Asignar Portones a Colonias

Actualiza cada portón para asignarlo a una colonia:

```sql
-- Ejemplo: Portones 1 y 2 para Colonia Norte
UPDATE gates 
SET colonia_id = '11111111-1111-1111-1111-111111111111' 
WHERE id IN (1, 2);

-- Portón 3 para Colonia Sur
UPDATE gates 
SET colonia_id = '22222222-2222-2222-2222-222222222222' 
WHERE id = 3;

-- Portón 4 para Colonia Centro
UPDATE gates 
SET colonia_id = '33333333-3333-3333-3333-333333333333' 
WHERE id = 4;
```

### 4. Asignar Usuarios a Colonias

Actualiza los perfiles de usuarios existentes para asignarlos a una colonia:

```sql
-- Opción A: Asignar usuarios específicos
UPDATE profiles 
SET colonia_id = '11111111-1111-1111-1111-111111111111' 
WHERE id = 'usuario-uuid-aqui';

-- Opción B: Asignar todos los usuarios existentes a una colonia por defecto
UPDATE profiles 
SET colonia_id = '11111111-1111-1111-1111-111111111111' 
WHERE colonia_id IS NULL;
```

### 5. Verificar la Migración

Ejecuta estas queries para verificar que todo está correcto:

```sql
-- Ver colonias creadas
SELECT * FROM colonias;

-- Ver portones con sus colonias
SELECT 
  g.id,
  g.name,
  g.enabled,
  c.nombre as colonia
FROM gates g
LEFT JOIN colonias c ON g.colonia_id = c.id
ORDER BY g.id;

-- Ver usuarios con sus colonias
SELECT 
  p.id,
  p.role,
  p.apartment_unit,
  c.nombre as colonia
FROM profiles p
LEFT JOIN colonias c ON p.colonia_id = c.id
ORDER BY p.created_at DESC
LIMIT 10;

-- Ver distribución de usuarios por colonia
SELECT 
  c.nombre as colonia,
  COUNT(p.id) as total_usuarios
FROM colonias c
LEFT JOIN profiles p ON p.colonia_id = c.id
GROUP BY c.id, c.nombre
ORDER BY total_usuarios DESC;
```

---

## 🔐 Nuevas Reglas de Acceso

### Para Usuarios Regulares

1. Solo ven los portones de su colonia
2. Solo pueden abrir/cerrar portones de su colonia
3. Si intentan acceder a un portón de otra colonia, reciben error 403

### Para Usuarios Sin Colonia (Migración)

- Los usuarios sin `colonia_id` asignado pueden ver todos los portones
- Los portones sin `colonia_id` son accesibles por todos
- **Recomendación**: Asigna colonias a todos los usuarios para mejor control

### Para Administradores

- Ven y controlan todos los portones
- Pueden gestionar todas las colonias
- Pueden asignar usuarios y portones a colonias

---

## 🔄 Cambios en el Backend

### Validación Actualizada

El servidor ahora valida:

```typescript
// 1. Usuario tiene perfil
// 2. Usuario no tiene rol 'revoked'
// 3. Portón existe y está habilitado
// 4. Usuario pertenece a la misma colonia que el portón ✨ NUEVO
```

### Nuevos Endpoints (sin cambios en API)

Los endpoints existentes funcionan igual, pero ahora retornan información de colonia:

**GET `/profile`**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "role": "user",
  "apartment_unit": "101",
  "colonia_id": "uuid",
  "colonia": {
    "id": "uuid",
    "nombre": "Colonia Norte"
  },
  "created_at": "...",
  "updated_at": "..."
}
```

**GET `/gates`**
```json
{
  "gates": [
    {
      "id": 1,
      "name": "Portón 1",
      "enabled": true,
      "colonia_id": "uuid",
      "colonia": {
        "id": "uuid",
        "nombre": "Colonia Norte"
      },
      "status": "OPEN",
      "lastUpdate": "..."
    }
  ]
}
```

---

## 📱 Actualización de la App (Futuro)

La app móvil ya recibirá la información de colonia en el perfil. Para mostrarla al usuario:

1. Actualizar `GateControl.tsx` para mostrar nombre de colonia
2. Filtrar portones por colonia en el UI (opcional, el backend ya lo hace)
3. Mostrar mensaje si usuario no tiene colonia asignada

---

## 🧪 Pruebas Recomendadas

### 1. Crear Colonias de Prueba
```sql
INSERT INTO colonias (nombre) VALUES ('Colonia Prueba A'), ('Colonia Prueba B');
```

### 2. Crear Usuarios de Prueba
- Usuario A en Colonia Prueba A
- Usuario B en Colonia Prueba B
- Usuario C sin colonia

### 3. Asignar Portones
- Portón 1 → Colonia Prueba A
- Portón 2 → Colonia Prueba B
- Portón 3 → Sin colonia

### 4. Verificar Acceso
- Usuario A solo ve Portón 1 y 3
- Usuario B solo ve Portón 2 y 3
- Usuario C ve todos los portones

---

## 🔧 Troubleshooting

### Usuarios no pueden abrir ningún portón

**Solución**: Asigna el usuario a una colonia
```sql
UPDATE profiles 
SET colonia_id = (SELECT id FROM colonias LIMIT 1) 
WHERE id = 'usuario-uuid';
```

### Portones no aparecen en la app

**Solución**: Verifica que el portón esté habilitado y tenga la misma colonia que el usuario
```sql
SELECT 
  p.id as usuario_id,
  p.colonia_id as usuario_colonia,
  g.id as porton_id,
  g.colonia_id as porton_colonia,
  CASE 
    WHEN p.colonia_id = g.colonia_id THEN 'Tiene acceso'
    WHEN g.colonia_id IS NULL THEN 'Portón público'
    ELSE 'SIN ACCESO'
  END as acceso
FROM profiles p
CROSS JOIN gates g
WHERE p.id = 'usuario-uuid';
```

### Error al ejecutar setup.sql

Si ya habías ejecutado versiones anteriores:

1. Las migraciones son **idempotentes** y se pueden ejecutar múltiples veces
2. Si hay conflictos, elimina y recrea las tablas (⚠️ se perderán datos)
3. Contacta al equipo de desarrollo si necesitas ayuda

---

## 📊 Schema Final

```
┌─────────────┐         ┌──────────────┐         ┌──────────┐
│  colonias   │◄────────│   profiles   │         │  gates   │◄────┐
│             │         │              │         │          │     │
│ - id (PK)   │         │ - id (PK)    │         │ - id(PK) │     │
│ - nombre    │         │ - role       │         │ - name   │     │
│ - descr...  │         │ - apt_unit   │         │ - enabled│     │
└─────────────┘         │ - colonia_id │         │ - colo...│     │
                        └──────────────┘         └──────────┘     │
                               │                        │          │
                               │                        └──────────┘
                               │                     (FK: colonia_id)
                               │
                               ▼
                        ┌─────────────┐
                        │ access_logs │
                        │             │
                        │ - id (PK)   │
                        │ - user_id   │
                        │ - gate_id   │
                        │ - action    │
                        │ - status    │
                        └─────────────┘
```

---

## ✅ Checklist de Migración

- [ ] Ejecutar `setup.sql` actualizado en Supabase
- [ ] Crear colonias para tu sistema
- [ ] Asignar portones a colonias
- [ ] Asignar usuarios existentes a colonias
- [ ] Verificar con queries de validación
- [ ] Probar acceso desde la app
- [ ] Actualizar backend (si no está corriendo la última versión)
- [ ] Reiniciar el servidor backend
- [ ] Documentar las colonias creadas y su distribución

---

## 📞 Soporte

Si tienes problemas durante la migración:

1. Revisa los logs del backend para errores
2. Verifica las políticas RLS en Supabase
3. Consulta la sección de Troubleshooting
4. Revisa los queries de verificación

---

**Última actualización**: Enero 2026  
**Versión**: 2.0.0 - Sistema de Colonias
