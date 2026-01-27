# Guía de Integración con Supabase

Esta guía te ayudará a completar la configuración después de ejecutar el script SQL en Supabase.

## ✅ Ya Ejecutaste en Supabase

- ✅ Tabla `profiles` creada con roles (admin, resident, revoked)
- ✅ Tabla `access_logs` para auditoría
- ✅ Row Level Security (RLS) habilitado
- ✅ Trigger automático para crear perfiles al registrarse

## 📋 Pasos Pendientes

### 1. Backend - Agregar SERVICE_ROLE_KEY

El backend necesita la clave de servicio para escribir en `access_logs` y leer todos los perfiles.

**Ubicación:** `portones-fc-api/.env`

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Navega a **Settings → API**
3. Copia el `service_role key` (⚠️ **NO lo compartas públicamente**)
4. Agrégalo a tu archivo `.env`:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu-anon-key-aqui
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-aqui  # ← AGREGAR ESTA LÍNEA
```

### 2. Reiniciar el Backend

Después de agregar la clave:

```bash
cd portones-fc-api
npm run dev
```

### 3. App Móvil - Reinstalar Dependencias

La app móvil ya está actualizada para obtener perfiles. Solo asegúrate de tener las dependencias correctas:

```bash
cd portones-fc-app
npm install
npm start
```

## 🎯 Nuevas Funcionalidades Implementadas

### Backend (`server.ts`)

✅ **Validación de roles antes de abrir el portón**

- Obtiene el perfil del usuario desde `profiles`
- Verifica que no tenga rol `revoked`
- Bloquea el acceso si está revocado

✅ **Registro de auditoría en `access_logs`**

- Registra cada intento exitoso de apertura
- Registra intentos denegados por usuarios revocados
- Incluye: `user_id`, `action`, `status`, `ip_address`, `timestamp`

### App Móvil

✅ **AuthContext actualizado**

- Obtiene automáticamente el perfil del usuario al iniciar sesión
- Interfaz `UserProfile` con tipos TypeScript
- Función `refreshProfile()` para actualizar el perfil

✅ **GateControl mejorado**

- Muestra email, apartment_unit y rol del usuario
- Detecta usuarios con rol `revoked`
- Muestra mensaje de "Acceso Denegado" si está revocado
- Deshabilita el botón para usuarios revocados

## 🧪 Pruebas

### Probar Usuario Normal (Resident)

1. Registra un nuevo usuario en la app
2. El trigger creará automáticamente un perfil con rol `resident`
3. El usuario podrá abrir el portón normalmente

### Probar Usuario Revocado

1. En Supabase Dashboard, ve a **Table Editor → profiles**
2. Encuentra el usuario de prueba
3. Cambia su `role` de `resident` a `revoked`
4. En la app móvil, verás:
   - El mensaje "Acceso Denegado"
   - El botón de apertura deshabilitado
   - Instrucciones para contactar al administrador

### Probar Logs de Acceso

1. Abre el portón desde la app (con un usuario `resident`)
2. En Supabase, ve a **Table Editor → access_logs**
3. Verás un registro con:
   - `user_id`: ID del usuario
   - `action`: "OPEN_GATE"
   - `status`: "SUCCESS"
   - `ip_address`: IP del servidor
   - `created_at`: Timestamp

### Probar Usuario con Apartment Unit

1. En Supabase, edita el perfil de un usuario
2. Agrega un valor en `apartment_unit` (ej: "Apt 402")
3. En la app, verás el número de departamento bajo el email

## 🔐 Seguridad Implementada

### Row Level Security (RLS)

- ✅ Usuarios solo pueden ver su propio perfil
- ✅ Solo el backend (SERVICE_ROLE_KEY) puede escribir en `access_logs`
- ✅ Previene manipulación de datos por parte de usuarios

### Backend

- ✅ Validación JWT en cada request
- ✅ Verificación de rol antes de permitir acciones
- ✅ Logs de auditoría inmutables

### App Móvil

- ✅ UI adapta según el rol del usuario
- ✅ Bloqueo en el cliente si está revocado
- ✅ Doble validación (cliente + servidor)

## 📊 Consultas SQL Útiles

### Ver todos los perfiles

```sql
SELECT id, email, role, apartment_unit, created_at
FROM profiles
ORDER BY created_at DESC;
```

### Ver logs de acceso recientes

```sql
SELECT
  al.id,
  al.action,
  al.status,
  p.email,
  p.apartment_unit,
  al.created_at
FROM access_logs al
LEFT JOIN profiles p ON al.user_id = p.id
ORDER BY al.created_at DESC
LIMIT 20;
```

### Revocar acceso a un usuario

```sql
UPDATE profiles
SET role = 'revoked', updated_at = NOW()
WHERE email = 'usuario@ejemplo.com';
```

### Restaurar acceso

```sql
UPDATE profiles
SET role = 'resident', updated_at = NOW()
WHERE email = 'usuario@ejemplo.com';
```

### Promover a admin

```sql
UPDATE profiles
SET role = 'admin', updated_at = NOW()
WHERE email = 'admin@ejemplo.com';
```

## 🎨 Personalización de la UI

### Mostrar Badge de Admin

Puedes agregar un badge especial para administradores en `GateControl.tsx`:

```tsx
{
  profile?.role === 'admin' && (
    <Text fontSize='$2' color='$blue11' fontWeight='bold'>
      👑 ADMIN
    </Text>
  )
}
```

### Agregar Funcionalidad de Admin

En el futuro, puedes crear una pantalla adicional para administradores que muestre:

- Lista de todos los residentes
- Historial de accesos
- Capacidad de revocar/restaurar accesos

## ❗ Importante

1. **NUNCA compartas el `SERVICE_ROLE_KEY` públicamente**

   - Solo úsalo en el backend
   - Nunca lo incluyas en la app móvil
   - Agrega `.env` a `.gitignore`

2. **El trigger funciona automáticamente**

   - Cuando alguien se registra, se crea su perfil
   - El rol por defecto es `resident`
   - No necesitas crear perfiles manualmente

3. **Los logs son inmutables**
   - Una vez creados, los `access_logs` no deben modificarse
   - Esto garantiza la integridad de la auditoría

## 🚀 Próximos Pasos Sugeridos

1. **Panel de Administración Web**

   - Crear una web app para administradores
   - Ver y gestionar usuarios
   - Ver estadísticas de uso

2. **Notificaciones**

   - Notificar cuando se abre el portón
   - Alertas de seguridad para accesos denegados
   - Push notifications en la app

3. **Reportes**
   - Reporte semanal/mensual de accesos
   - Detectar patrones de uso
   - Exportar logs para análisis

## 📞 Soporte

Si encuentras algún problema:

1. Verifica que el `SERVICE_ROLE_KEY` esté en el `.env`
2. Revisa los logs del backend: `npm run dev`
3. Verifica que las tablas existan en Supabase
4. Asegúrate de que el trigger se haya creado correctamente

---

¡Tu sistema está completamente integrado con Supabase! 🎉
