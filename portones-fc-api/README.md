# Portones FC - API Backend

Backend para el sistema de control de portones inteligentes. Construido con Fastify, Supabase y MQTT.

## 🏗️ Arquitectura

```
Mobile App (HTTP POST)
    ↓
Fastify Backend (TypeScript)
    ├── JWT Validation (Supabase)
    ├── Access Control (Profiles DB)
    ├── Audit Logs (Access Logs DB)
    └── MQTT Publisher
        ↓
    HiveMQ Broker
        ↓
    ESP32 Subscribers
```

## 🚀 Configuración Inicial

### 1. Requisitos

- Node.js 18+
- npm o yarn
- Variables de entorno configuradas

### 2. Instalación

```bash
cd portones-fc-api
npm install
```

### 3. Configurar Variables de Entorno

Copia `.env.example` a `.env` y edita con tus credenciales:

```bash
cp .env.example .env
```

**Variables requeridas:**

```env
# Supabase
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu-clave-anon
SUPABASE_SERVICE_ROLE_KEY=tu-clave-admin

# MQTT (HiveMQ)
MQTT_HOST=tu-broker.hivemq.cloud
MQTT_PORT=8883
MQTT_USERNAME=tu-usuario
MQTT_PASSWORD=tu-contraseña
MQTT_USE_TLS=true

# Server
PORT=3000
```

### 4. Ejecutar en Desarrollo

```bash
npm run dev
```

El servidor estará disponible en `http://localhost:3000`

### 5. Build para Producción

```bash
npm run build
npm start
```

## 🧪 Tests

### Health Check

```
GET /health
```

Verifica el estado del servidor.

**Respuesta:**

```json
{
  "status": "ok",
  "timestamp": "2026-01-12T10:30:00.000Z",
  "mqtt": "unknown"
}
```

---

### Obtener Estado de Portones

```
GET /gates
Authentication: Required (Bearer Token)
```

Obtiene el estado actual de todos los portones.

**Respuesta:**

```json
{
  "1": "CLOSED",
  "2": "OPENING",
  "3": "UNKNOWN",
  "4": "CLOSED"
}
```

**Estados posibles:**

- `OPEN`: Portón abierto
- `CLOSED`: Portón cerrado
- `OPENING`: Portón abriendo
- `CLOSING`: Portón cerrando
- `UNKNOWN`: Estado desconocido

---

### Abrir Portón

```
POST /gate/open
Authentication: Required (Bearer Token)
Content-Type: application/json
```

Envía comando para abrir un portón.

**Cuerpo de solicitud:**

```json
{
  "gateId": 1
}
```

**Respuesta:**

```json
{
  "success": true,
  "message": "Gate opening command sent",
  "timestamp": "2026-01-12T10:30:00.000Z"
}
```

**Códigos de error:**

- `400`: ID de portón inválido o ausente
- `401`: Token inválido o expirado
- `403`: Usuario no tiene acceso (revocado o sin permisos)
- `500`: Error del servidor o MQTT

---

### Cerrar Portón

```
POST /gate/close
Authentication: Required (Bearer Token)
Content-Type: application/json
```

Envía comando para cerrar un portón.

**Cuerpo de solicitud:**

```json
{
  "gateId": 1
}
```

**Respuesta:** Idéntica a `/gate/open`

---

## �️ Setup de Base de Datos (Supabase)

### Usando el Script SQL

1. Ve a tu proyecto en [Supabase](https://app.supabase.com)
2. Abre **SQL Editor** (en el sidebar izquierdo)
3. Haz clic en **Create a new query**
4. Copia todo el contenido de [setup.sql](./setup.sql)
5. Pega en el editor
6. Ejecuta (botón **▶ Run**)

Este script crea:
- Tabla `profiles` (usuarios con roles)
- Tabla `access_logs` (auditoría)
- Políticas RLS (seguridad)
- Trigger automático para crear perfil al registrarse

### Manual Setup

Si prefieres hacer paso a paso, consulta la sección "Base de Datos" en este README.

---

## 🧪 Testing Manual (cURL)

### Health Check

```bash
curl http://localhost:3000/health
```

### Obtener Portones (requiere token válido)

```bash
curl http://localhost:3000/gates \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Abrir Portón

```bash
curl -X POST http://localhost:3000/gate/open \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"gateId": 1}'
```

### Cerrar Portón

```bash
curl -X POST http://localhost:3000/gate/close \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"gateId": 1}'
```

---

### Token JWT

La API usa JWT tokens de Supabase para autenticar solicitudes.

**Header requerido:**

```
Authorization: Bearer <JWT_TOKEN>
```

**Obtener un token:**

1. Crea un usuario en Supabase (Authentication → Users)
2. Usa el cliente de Supabase para obtener el token:

```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'usuario@ejemplo.com',
  password: 'contraseña'
})

const token = data.session?.access_token
```

3. Envía en el header `Authorization: Bearer ${token}`

### Control de Acceso

El sistema verifica:

1. **Token válido**: Debe estar vigente y emitido por Supabase
2. **Perfil de usuario**: Debe existir en la tabla `profiles`
3. **Permisos**: El rol del usuario no debe ser `"revoked"`

---

## 📊 Base de Datos (Supabase)

### Tabla: `profiles`

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  role TEXT NOT NULL DEFAULT 'user', -- 'user', 'admin', 'revoked'
  apartment_unit TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Tabla: `access_logs`

```sql
CREATE TABLE access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL, -- 'OPEN_GATE', 'CLOSE_GATE'
  status TEXT NOT NULL, -- 'SUCCESS', 'DENIED_REVOKED', 'DENIED_NO_ACCESS'
  ip_address TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);
```

---

## 📡 Protocolo MQTT

### Topics

- **Comando**: `portones/gate/command` (Backend → ESP32)
- **Estado**: `portones/gate/status` (ESP32 → Backend)

### Formato de Comando

```json
{
  "action": "OPEN",
  "timestamp": "2026-01-12T10:30:00.000Z",
  "userId": "user-uuid"
}
```

### Formato de Estado

```json
{
  "gateId": 1,
  "status": "OPEN",
  "timestamp": "2026-01-12T10:30:00.000Z"
}
```

---

## 🧪 Tests

### Ejecutar Tests

```bash
# Ejecutar tests una sola vez
npm test

# Ejecutar tests en modo watch (se re-ejecutan cuando cambias código)
npm run test:watch

# Ejecutar tests con interfaz visual
npm run test:ui
```

### Cobertura de Tests

Los tests incluyen:

- ✅ **Health Check**: Verifica que el servidor responde
- ✅ **Gates Status**: Obtiene estado de todos los portones
- ✅ **Gate Open**: Abre un portón con validación
- ✅ **Gate Close**: Cierra un portón con validación
- ✅ **Validación de gateId**: Rechaza IDs inválidos (0, 5, strings)
- ✅ **Formato de respuesta**: Verifica que todos los campos requeridos están presentes
- ✅ **Timestamps**: Valida que el timestamp sea ISO 8601

## 📡 Endpoints de la API

## 🔧 Estructura del Proyecto

```
src/
├── server.ts              # Punto de entrada, rutas principales
├── config/
│   └── env.ts             # Validación de variables de entorno
├── plugins/
│   └── mqtt.ts            # Cliente MQTT y suscripciones
├── state/
│   └── gates.ts           # Gestión de estado de portones
└── middleware/
    └── auth.ts            # Middleware de autenticación
```

---

## 🐛 Troubleshooting

### Backend no conecta a MQTT

```bash
# Verificar credenciales
cat .env | grep MQTT

# Ver logs
npm run dev

# Probar conexión
mosquitto_pub -h tu-broker.hivemq.cloud -p 8883 \
  -u usuario -P contraseña \
  -t test/topic -m "test" --cafile ca.crt
```

### Error 401 Unauthorized

- Verifica que el token sea válido: `Authorization: Bearer <token>`
- Asegúrate de incluir "Bearer " antes del token
- El token podría estar expirado, obtén uno nuevo

### Error 403 Forbidden

- Verifica que el usuario existe en tabla `profiles`
- Asegúrate de que el rol no es `"revoked"`
- Consulta los logs de acceso en la tabla `access_logs`

### Conexión MQTT rechazada

- Verifica `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`, `MQTT_PASSWORD`
- Asegúrate de usar puerto **8883** con TLS activado (`MQTT_USE_TLS=true`)
- En HiveMQ Cloud, verifica que el cliente esté autorizado en Access Management

---

## 📝 Variables de Entorno Requeridas

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `SUPABASE_URL` | URL del proyecto Supabase | `https://xxxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Clave pública de Supabase | JWT string |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave administrativa | JWT string |
| `MQTT_HOST` | Host del broker MQTT | `xxxxx.s1.eu.hivemq.cloud` |
| `MQTT_PORT` | Puerto MQTT | `8883` |
| `MQTT_USERNAME` | Usuario MQTT | `tu-usuario` |
| `MQTT_PASSWORD` | Contraseña MQTT | `tu-contraseña` |
| `MQTT_USE_TLS` | Usar TLS (recomendado) | `true` |
| `PORT` | Puerto del servidor | `3000` |

---

## 🚀 Deployment

### Heroku

```bash
git push heroku main
heroku config:set SUPABASE_URL="..." MQTT_HOST="..." ...
heroku logs --tail
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

```bash
docker build -t portones-api .
docker run -p 3000:3000 \
  -e SUPABASE_URL="..." \
  -e MQTT_HOST="..." \
  portones-api
```

---

## 📄 Licencia

MIT
