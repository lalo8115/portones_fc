# Portones FC - Mobile App

Aplicación móvil React Native para control de portones inteligentes.

## 🚀 Inicio Rápido

### 1. Instalar Dependencias

```bash
npm install
```

### 2. Configurar Variables de Entorno

Crea un archivo `.env` basado en `.env.example`:

```bash
cp .env.example .env
```

Edita `.env` con tus credenciales:

```env
EXPO_PUBLIC_API_URL=http://tu-backend-ip:3000
EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=tu-supabase-anon-key

# (Opcional) Google OAuth Client IDs para login con token (id_token -> Supabase)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
```

**⚠️ Importante para dispositivos físicos:**

- Si pruebas en un dispositivo físico, usa la IP de tu computadora en lugar de `localhost`
- Ejemplo: `EXPO_PUBLIC_API_URL=http://192.168.1.100:3000`
- Asegúrate de que el backend esté accesible desde la red local

### 3. Iniciar la App

```bash
npm start
```

Luego elige:

- Presiona `a` para Android
- Presiona `i` para iOS
- Escanea el QR con Expo Go

## 📱 Funcionalidades

### Autenticación

- ✅ Login con email/password
- ✅ Registro de nuevos usuarios
- ✅ Gestión automática de sesión
- ✅ Integración con Supabase Auth

### Control de Portón

- ✅ Botón grande y accesible
- ✅ UI optimista (feedback inmediato)
- ✅ Estados visuales claros
- ✅ Manejo de errores

### Estados de la UI

1. **Idle**: Botón listo para presionar
2. **Opening**: Animación de "Abriendo..."
3. **Success**: Confirmación "¡Portón Abierto!"
4. **Error**: Mensaje de error si falla

## 🏗️ Arquitectura

```
App.tsx (Root)
  ├── TamaguiProvider (UI Framework)
  ├── QueryClientProvider (State Management)
  └── AuthProvider (Authentication)
      ├── LoginScreen (if not authenticated)
      └── GateControl (if authenticated)
```

## 📂 Estructura de Archivos

```
portones-fc-app/
├── App.tsx                 # Componente principal
├── GateControl.tsx         # Control del portón
├── LoginScreen.tsx         # Pantalla de login
├── AuthContext.tsx         # Context de autenticación
├── tamagui.config.ts       # Configuración de Tamagui
├── .env.example            # Plantilla de variables
└── package.json            # Dependencias
```

## 🔐 Autenticación con Supabase

### Crear Usuario para Pruebas

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Navega a **Authentication → Users**
3. Click en **Add User** → **Create new user**
4. Ingresa email y contraseña
5. Usa esas credenciales en la app

### Flujo de Autenticación

1. Usuario ingresa email/password
2. App llama a `supabase.auth.signInWithPassword()`
3. Supabase retorna un `access_token` (JWT)
4. Token se guarda automáticamente en el estado
5. Token se envía en header `Authorization: Bearer <token>` al backend

## 🎨 Personalización UI

### Cambiar Colores

Edita `tamagui.config.ts`:

```typescript
const tamaguiConfig = createTamagui({
  ...config,
  themes: {
    ...config.themes
    // Añade tus temas personalizados
  }
})
```

### Modificar el Botón

Edita `GateControl.tsx`:

```typescript
<Button
  size="$6"          // Tamaño: $1-$10
  theme="blue"       // Tema: blue, green, red, etc.
  borderRadius="$6"  // Bordes redondeados
  // ... más props
>
```

## 🧪 Testing Local

### Prueba sin Backend Real

Puedes usar un endpoint mock temporalmente:

```typescript
// En GateControl.tsx
const openGate = async (apiUrl: string, authToken: string) => {
  // Mock para testing sin backend
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        message: 'Mock success',
        timestamp: new Date().toISOString()
      })
    }, 1000)
  })
}
```

### Prueba sin Autenticación

Comenta la verificación en `App.tsx`:

```typescript
// return <LoginScreen />;  // Comentar esta línea

return <GateControl apiUrl={API_URL} authToken='mock-token-for-testing' />
```

## 🐛 Troubleshooting

### Error: "Network request failed"

- Verifica que el backend esté corriendo
- Usa la IP correcta (no `localhost` en dispositivos físicos)
- Asegúrate de estar en la misma red

### Error: "Invalid JWT token"

- Verifica que estés logueado
- El token puede haber expirado (vuelve a iniciar sesión)
- Verifica que Supabase esté configurado correctamente

### La app no carga

- Ejecuta `npm install` nuevamente
- Limpia el cache: `expo start -c`
- Verifica que todas las dependencias estén instaladas

### Icono no aparece

- Asegúrate de tener instalado `@tamagui/lucide-icons`
- Reinicia el bundler: `expo start -c`

## 📦 Dependencias Principales

- **expo**: Framework de React Native
- **tamagui**: Librería de UI components
- **@tanstack/react-query**: Estado y cache
- **@supabase/supabase-js**: Cliente de Supabase
- **@tamagui/lucide-icons**: Iconos

## 🚀 Build para Producción

### Android

```bash
eas build --platform android
```

### iOS

```bash
eas build --platform ios
```

**Nota**: Necesitas configurar EAS Build en tu proyecto.

## 📝 Notas

- Esta es una app MVP para demostración
- Para producción, añade:
  - Manejo de errores más robusto
  - Validación de formularios
  - Recuperación de contraseña
  - Persistencia de sesión offline
  - Tests automatizados
  - Analytics

## 📄 Licencia

MIT
