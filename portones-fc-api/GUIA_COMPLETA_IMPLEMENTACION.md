
# 🚀 Implementación Completa: access_logs con qr_id

## Paso 1: Ejecutar Migración SQL

**Archivo:** [MIGRATION_access_logs_qr_id.sql](./MIGRATION_access_logs_qr_id.sql)

Copiar y ejecutar en Supabase SQL Editor:
- Agrega columna `qr_id UUID`
- Crea FK a `visitor_qr(id)` 
- Agrega constraint `CHECK (user_id XOR qr_id)`
- Actualiza política RLS con JOIN
- Crea índices

## Paso 2: Actualizar server.ts

### 2.1 Endpoint `/gate/open-with-qr` (línea ~1812)

```typescript
// CAMBIAR ESTO:
await supabaseAdmin.from('access_logs').insert({
  user_id: null,
  action: 'OPEN_GATE',
  status: 'SUCCESS',
  method: 'QR',
  gate_id: gateId,
  ip_address: request.ip,
  metadata: {
    qr_code: shortCode,
    visitor_name: qrCode.invitado,
    access_type: expectedGateType,
    house_id: qrCode.house_id
  }
})

// POR ESTO:
await supabaseAdmin.from('access_logs').insert({
  user_id: null,
  qr_id: qrCode.id,    // ← Referencia directa al QR
  action: 'OPEN_GATE',
  status: 'SUCCESS',
  method: 'QR',
  gate_id: gateId,
  ip_address: request.ip
})
```

### 2.2 Endpoint `/access/history` (línea ~238)

**Cambio 1:** Agregar `qr_id` al SELECT (línea ~290)

```typescript
// ANTES:
let query = supabaseAdmin
  .from('access_logs')
  .select('id, user_id, action, status, method, timestamp, gate_id', {
    count: 'exact'
  })
  .order('timestamp', { ascending: false })
  .limit(limit)

// DESPUÉS:
let query = supabaseAdmin
  .from('access_logs')
  .select('id, user_id, qr_id, action, status, method, timestamp, gate_id', {
    count: 'exact'
  })
  .order('timestamp', { ascending: false })
  .limit(limit)
```

**Cambio 2:** Obtener datos de visitor_qr (después de línea ~365, antes de gatesMap)

```typescript
// AGREGAR ESTE BLOQUE NUEVO:

// Get QR data for QR method logs
const qrIds = Array.from(
  new Set(
    (logs ?? [])
      .filter((log: any) => log.method === 'QR' && log.qr_id)
      .map((log: any) => log.qr_id)
  )
)

let qrMap = new Map<string, { 
  invitado: string | null
  short_code: number
  rubro: string | null 
}>()

if (qrIds.length > 0) {
  const { data: qrData, error: qrError } = await supabaseAdmin
    .from('visitor_qr')
    .select('id, invitado, short_code, rubro')
    .in('id', qrIds)

  if (!qrError && qrData) {
    qrData.forEach((qr: any) => {
      qrMap.set(qr.id, {
        invitado: qr.invitado,
        short_code: qr.short_code,
        rubro: qr.rubro
      })
    })
  }
}

// (Continuar con el código existente de gatesMap...)
```

**Cambio 3:** Enriquecer records con datos de QR (línea ~405)

```typescript
// CAMBIAR ESTO:
const records = (logs ?? []).map((log: any) => {
  const gateInfo = gatesMap.get(log.gate_id) || {}
  const profileInfo = profilesMap.get(log.user_id) || { house_address: null }
  const userEmail = emailsMap.get(log.user_id) || null

  return {
    id: log.id,
    gate_id: log.gate_id,
    gate_name: gateInfo.name || (log.gate_id ? `Portón ${log.gate_id}` : 'Portón'),
    gate_type: gateInfo.type || 'ENTRADA',
    user_id: log.user_id,
    user_email: userEmail,
    house_address: profileInfo.house_address ?? null,
    action: log.action === 'OPEN_GATE' ? 'OPEN' : 'CLOSE',
    timestamp: log.timestamp,
    method: log.method || 'APP',
    status: log.status
  }
})

// POR ESTO:
const records = (logs ?? []).map((log: any) => {
  const gateInfo = gatesMap.get(log.gate_id) || {}
  const profileInfo = profilesMap.get(log.user_id) || { house_address: null }
  const userEmail = emailsMap.get(log.user_id) || null
  const qrInfo = log.qr_id ? qrMap.get(log.qr_id) : null

  // Determinar nombre del accessor (residente o visitante)
  const accessorName = log.method === 'QR' && qrInfo
    ? qrInfo.invitado || `QR ${qrInfo.short_code}`
    : userEmail

  // Determinar tipo de accessor
  const accessorType = log.method === 'QR' && qrInfo
    ? qrInfo.rubro || 'Visitante'
    : 'Residente'

  return {
    id: log.id,
    gate_id: log.gate_id,
    gate_name: gateInfo.name || (log.gate_id ? `Portón ${log.gate_id}` : 'Portón'),
    gate_type: gateInfo.type || 'ENTRADA',
    user_id: log.user_id,
    user_email: userEmail,
    house_address: profileInfo.house_address ?? null,
    action: log.action === 'OPEN_GATE' ? 'OPEN' : 'CLOSE',
    timestamp: log.timestamp,
    method: log.method || 'APP',
    status: log.status,
    // Nuevos campos para QR
    accessor_name: accessorName,
    accessor_type: accessorType,
    qr_id: log.qr_id || null,
    qr_code: qrInfo?.short_code || null,
    visitor_name: qrInfo?.invitado || null
  }
})
```

## Paso 3: Actualizar AccessHistoryScreen.tsx (Frontend)

El frontend ya no necesita cambios si usas `accessor_name` en lugar de `user_email`:

```typescript
// En AccessHistoryScreen.tsx, cambiar:
<Text>{record.user_email || 'Usuario desconocido'}</Text>

// Por:
<Text>{record.accessor_name || 'Desconocido'}</Text>
<Text fontSize='$2' color='$gray10'>{record.accessor_type}</Text>
```

También agregar badge para visitantes QR:

```typescript
{record.method === 'QR' && (
  <Badge backgroundColor='$purple10'>
    <Text color='white' fontSize='$1'>QR {record.qr_code}</Text>
  </Badge>
)}
```

## 📋 Checklist Final

- [ ] Ejecutar MIGRATION_access_logs_qr_id.sql en Supabase
- [ ] Cambiar línea 1812: insertar con `qr_id` en vez de `metadata`
- [ ] Cambiar línea 290: agregar `qr_id` al SELECT
- [ ] Agregar bloque para obtener datos de visitor_qr (después de línea 365)
- [ ] Cambiar línea 405: enriquecer records con qrInfo
- [ ] Actualizar AccessHistoryScreen.tsx para mostrar visitor names
- [ ] Probar: Generar QR → Escanear → Ver en historial
- [ ] Verificar que resid House A ve QRs de su casa pero no de House B

## 🎯 Resultado Esperado

**Historial de Acceso Unificado:**

```
👤 juan.perez@email.com       Residente    → Portón 1 ENTRADA    10:00 AM
👤 maria.gomez@email.com       Residente    → Portón 3 SALIDA     10:05 AM
📦 Juan Visitante              Paquetería   → Portón 1 ENTRADA    10:10 AM
📦 Juan Visitante              Paquetería   → Portón 3 SALIDA     10:15 AM
👨‍👩‍👧 María Familiar              Familiar     → Portón 1 ENTRADA    10:20 AM
```

Cada log tiene toda la información necesaria sin duplicar datos.
