# Portones FC - Sistema de Control de Portones Inteligentes

Sistema IoT completo para control de portones mediante aplicación móvil, backend y ESP32.

## 🏗️ Arquitectura

```
Mobile App (React Native)
    ↓ HTTP POST
Backend (Fastify)
    ↓ MQTT Publish
ESP32 (Subscriber)
    ↓ GPIO Control
Servo Motor
```

## 📦 Componentes

### 1. Backend (portones-fc-api)

- **Framework**: Fastify + TypeScript
- **Autenticación**: Supabase Auth (JWT)
- **Protocolo**: MQTT (HiveMQ)
- **Puerto**: 3000

### 2. Frontend (portones-fc-app)

- **Framework**: Expo + React Native
- **UI**: Tamagui
- **Estado**: React Query
- **Features**: UI optimista

### 3. Firmware (portones-fc-firmware)

- **Plataforma**: ESP32
- **Framework**: Arduino
- **Librerías**: WiFi, PubSubClient, ESP32Servo
- **Pin Servo**: GPIO 13

## 🚀 Configuración Rápida

### Backend Setup

1. **Crear archivo `.env`** (basado en `.env.example`):

```bash
cd portones-fc-api
cp .env.example .env
```

2. **Editar `.env` con tus credenciales**:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu-clave-anon-de-supabase

MQTT_HOST=tu-broker.hivemq.cloud
MQTT_PORT=8883
MQTT_USERNAME=tu-usuario-mqtt
MQTT_PASSWORD=tu-password-mqtt
MQTT_USE_TLS=true

PORT=3000
```

3. **Instalar y ejecutar**:

```bash
npm install
npm run dev
```

El servidor estará en `http://localhost:3000`

### Frontend Setup

1. **Configurar API URL** en tu componente principal:

```tsx
import { GateControl } from './GateControl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GateControl
        apiUrl='http://localhost:3000'
        authToken='tu-jwt-token-de-supabase'
      />
    </QueryClientProvider>
  )
}
```

2. **Instalar Tamagui config** (si no está):

```bash
cd portones-fc-app
npm install
```

3. **Ejecutar**:

```bash
npm start
```

### Firmware Setup

1. **Editar `src/main.cpp`** con tus credenciales:

```cpp
// WiFi
const char* WIFI_SSID = "TU_RED_WIFI";
const char* WIFI_PASSWORD = "TU_PASSWORD_WIFI";

// MQTT
const char* MQTT_BROKER = "tu-broker.hivemq.cloud";
const char* MQTT_USERNAME = "tu-usuario-mqtt";
const char* MQTT_PASSWORD = "tu-password-mqtt";
```

2. **Conectar el servo**:

- **Señal**: GPIO 13
- **VCC**: 5V
- **GND**: GND

3. **Compilar y subir**:

```bash
cd portones-fc-firmware
pio run --target upload
pio device monitor
```

## 🔐 Configuración de Supabase

1. Crea un proyecto en [Supabase](https://supabase.com)
2. Ve a **Settings → API**
3. Copia:

   - `URL del proyecto` → `SUPABASE_URL`
   - `anon/public key` → `SUPABASE_ANON_KEY`

4. Crea usuarios en **Authentication → Users**
5. Obtén el JWT token desde el cliente o consola

## 📡 Configuración de HiveMQ Cloud

1. Crea una cuenta en [HiveMQ Cloud](https://www.hivemq.com/mqtt-cloud-broker/)
2. Crea un cluster gratuito
3. Configura credenciales en **Access Management**
4. Usa la URL del cluster (ej: `xxxxx.s1.eu.hivemq.cloud`)

## 🧪 Testing

### Test del Backend

```bash
# Health check
curl http://localhost:3000/health

# Test de autenticación (requiere token válido)
curl -X POST http://localhost:3000/gate/open \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

### Test del ESP32

El firmware imprime logs detallados en el serial monitor. Deberías ver:

```
==========================================
   ESP32 Gate Controller Starting...
==========================================

[SERVO] Initialized on GPIO 13
[WiFi] Connected!
[MQTT] Connected!
[MQTT] Subscribed to topic: portones/gate/command
[SYSTEM] Setup complete. Ready to receive commands.
```

## 📋 Flujo de Operación

1. **Usuario presiona botón** en la app
2. **UI optimista** muestra "Abriendo..." inmediatamente
3. **App envía POST** a `/gate/open` con JWT token
4. **Backend valida** el token con Supabase
5. **Backend publica** mensaje MQTT: `{"action": "OPEN", "timestamp": "..."}`
6. **ESP32 recibe** el mensaje en el topic `portones/gate/command`
7. **ESP32 mueve servo** a 90° (abierto)
8. **Espera 5 segundos**
9. **ESP32 mueve servo** a 0° (cerrado)
10. **UI muestra** "¡Portón Abierto!" y luego vuelve a estado inicial

## 🔧 Troubleshooting

### Backend no conecta a MQTT

- Verifica las credenciales en `.env`
- Asegúrate de usar el puerto correcto (8883 para TLS)
- Revisa los logs: `npm run dev`

### ESP32 no conecta a WiFi

- Verifica SSID y password en `main.cpp`
- Asegúrate de estar en rango del router
- Revisa el serial monitor: `pio device monitor`

### App no autentica

- Verifica que el token JWT sea válido
- El token debe comenzar con "Bearer "
- Crea un usuario en Supabase primero

### Servo no se mueve

- Verifica la conexión física (GPIO 13, VCC, GND)
- Asegúrate de que el servo tenga suficiente corriente (fuente externa recomendada)
- Revisa los logs del ESP32

## 📝 Notas Importantes

- **Seguridad**: En producción, usa HTTPS para el backend y configuración adecuada de CORS
- **Servo**: Para portones reales, considera usar un relay y motor más potente
- **MVP**: Este código es para un MVP funcional. Para producción, añade:
  - Manejo de errores más robusto
  - Logs centralizados
  - Monitoreo de estado del dispositivo
  - Confirmación de apertura/cierre
  - Timeouts configurables
  - Tests automatizados

## 📄 Licencia

MIT
