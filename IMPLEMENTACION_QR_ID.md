# Implementación: access_logs con qr_id

## ✅ 1. Ejecutar migración en Supabase

Archivo: `/portones-fc-api/MIGRATION_access_logs_qr_id.sql`

```bash
# Copiar y ejecutar en Supabase SQL Editor
```

## ✅ 2. Actualizar server.ts

**Ubicación:** `portones-fc-api/src/server.ts` línea ~1812

**ANTES:**
```typescript
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
```

**DESPUÉS:**
```typescript
await supabaseAdmin.from('access_logs').insert({
  user_id: null,       // NULL para visitantes
  qr_id: qrCode.id,    // ← ID del QR en visitor_qr
  action: 'OPEN_GATE',
  status: 'SUCCESS',
  method: 'QR',
  gate_id: gateId,
  ip_address: request.ip
})
```

## ✅ 3. Actualizar AccessHistoryScreen.tsx

**Cambiar el query para incluir JOIN con visitor_qr:**

```typescript
const { data: logsData, error: logsError } = await fetch(`${apiUrl}/access/history?limit=50`, {
  headers: { Authorization: `Bearer ${authToken}` }
}).then(r => r.json())
```

**Backend debe modificar `/access/history` para enriquecer los datos:**

```typescript
// En server.ts, endpoint GET /access/history (línea ~220)
// Agregar JOIN con visitor_qr cuando method='QR'

const { data: logs } = await query

// Enriquecer logs con info de QR
const enrichedLogs = logs.map(log => {
  if (log.method === 'QR' && log.qr_id) {
    // Hacer query a visitor_qr
    const qr = await supabaseAdmin
      .from('visitor_qr')
      .select('invitado, short_code, rubro')
      .eq('id', log.qr_id)
      .single()
    
    return {
      ...log,
      visitor_name: qr.invitado,
      visitor_code: qr.short_code,
      visitor_type: qr.rubro
    }
  }
  return log
})
```

## 🎯 Resultado Final

**Tabla access_logs:**
```
id          | user_id | qr_id                | method | action     | gate_id | timestamp
uuid-1      | user-a  | NULL                 | APP    | OPEN_GATE  | 1       | 2026-02-06
uuid-2      | NULL    | qr-uuid-123          | QR     | OPEN_GATE  | 2       | 2026-02-06
uuid-3      | NULL    | qr-uuid-123          | QR     | OPEN_GATE  | 3       | 2026-02-06 (salida)
```

**Query para ver logs completos:**
```sql
SELECT 
  al.id,
  al.method,
  al.action,
  al.timestamp,
  al.gate_id,
  -- Si es APP, traer info de usuario
  CASE WHEN al.method = 'APP' THEN au.email END as user_email,
  -- Si es QR, traer info de visitante
  CASE WHEN al.method = 'QR' THEN vq.invitado END as visitor_name,
  CASE WHEN al.method = 'QR' THEN vq.short_code END as visitor_code,
  CASE WHEN al.method = 'QR' THEN vq.rubro END as visitor_type
FROM access_logs al
LEFT JOIN auth.users au ON al.user_id = au.id
LEFT JOIN visitor_qr vq ON al.qr_id = vq.id
ORDER BY al.timestamp DESC;
```

## 📋 Checklist

- [ ] Ejecutar `MIGRATION_access_logs_qr_id.sql` en Supabase
- [ ] Cambiar línea 1812 en `server.ts` (quitar metadata, agregar qr_id)
- [ ] Modificar endpoint `/access/history` para enriquecer logs con visitor_qr
- [ ] Probar flujo completo: generar QR → escanear → ver en historial
- [ ] Verificar que RLS permite ver logs QR de visitantes de la propia casa
