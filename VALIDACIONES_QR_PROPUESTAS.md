# Validaciones Implementadas y Propuestas Adicionales

## ✅ Validaciones Implementadas

### 1. **Validación de Campos Vacíos**
- ✅ Nombre de familiar/amigo/empresa/profesional requerido
- ✅ Foto de ID requerida (familia y servicios)
- ✅ Validación con emojis y mensajes descriptivos

### 2. **Validación de Longitud de Nombres**
- ✅ Mínimo 3 caracteres para todos los nombres
- ✅ Máximo 100 caracteres para evitar desbordamiento de BD
- ✅ Mensajes claros: "❌ Nombre muy corto/largo"

### 3. **Validación de Fechas**
- ✅ Fechas en el pasado no permitidas (amigos, paquetería, servicios)
- ✅ Rango de paquetería máximo 30 días
- ✅ Fecha de fin >= fecha de inicio (paquetería)
- ✅ Fecha/hora de servicio no puede ser anterior a ahora

### 4. **Validación de Duración de Servicio**
- ✅ Entre 1 y 12 horas
- ✅ Emoji de reloj ⏱️ para mejor UX

### 5. **Manejo de Errores del Servidor**
- ✅ **Error 400 - Límite de QRs**: Mensaje específico con opciones:
  - "Ver mis QRs" para ir a gestión
  - "Entendido" para cerrar
- ✅ **Error 403**: Acceso denegado
- ✅ **Error 500**: Error del servidor
- ✅ **Error de red**: Sin conexión a internet
- ✅ **Mensaje de éxito**: Confirmación al generar QR con código

---

## 🚀 Propuestas de Validaciones Adicionales

### **A. Validación de Datos de Imagen**

#### 1. **Tamaño de Archivo**
```typescript
// En pickImage(), añadir antes de subir:
if (file.size > 5 * 1024 * 1024) { // 5MB
  Alert.alert(
    '📦 Archivo muy grande',
    'La imagen no puede exceder 5MB.\n\nIntenta comprimir la foto o toma una nueva con menor resolución.'
  )
  return
}
```

**Justificación**: Ya está validado en el código, pero podría mejorarse con compresión automática.

#### 2. **Formato de Imagen**
```typescript
const validFormats = ['image/jpeg', 'image/png', 'image/jpg']
if (!validFormats.includes(file.type)) {
  Alert.alert(
    '🖼️ Formato inválido',
    'Solo se permiten imágenes JPG y PNG.\n\nFormato detectado: ' + file.type
  )
  return
}
```

**Justificación**: Ya validado en input accept, pero útil como respaldo.

---

### **B. Validación de Nombres (Adicional)**

#### 3. **Caracteres Especiales No Válidos**
```typescript
const validateName = (name: string) => {
  // Permitir letras, espacios, acentos, ñ, guiones, apóstrofes
  const validNameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s\-'\.]+$/
  return validNameRegex.test(name)
}

// En validación de nombres:
if (!validateName(visitorName.trim())) {
  Alert.alert(
    '❌ Caracteres inválidos',
    'El nombre solo puede contener letras, espacios, guiones y apóstrofes.\n\nNo se permiten números ni símbolos especiales.'
  )
  return
}
```

**Justificación**: Evita inyección de datos maliciosos y mantiene BD limpia.

#### 4. **Capitalización Automática**
```typescript
const capitalizeWords = (text: string) => {
  return text
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Aplicar al guardar:
requestData.visitorName = capitalizeWords(visitorName.trim())
```

**Justificación**: UX mejorada, datos consistentes en BD.

---

### **C. Validación de Duplicados**

#### 5. **QRs Duplicados Activos**
```typescript
// Verificar antes de generar:
const checkDuplicateQR = async (name: string, type: string) => {
  const response = await fetch(`${apiUrl}/qr/list`, {
    headers: { Authorization: `Bearer ${authToken}` }
  })
  const data = await response.json()
  
  const duplicate = data.qrCodes?.find(
    qr => qr.invitado?.toLowerCase() === name.toLowerCase() 
       && qr.rubro === type 
       && qr.status === 'active'
  )
  
  if (duplicate) {
    return new Promise((resolve) => {
      Alert.alert(
        '⚠️ QR Duplicado',
        `Ya existe un QR activo para "${name}" de tipo "${type}".\n\n¿Deseas crear uno nuevo de todas formas?`,
        [
          { text: 'Cancelar', onPress: () => resolve(false), style: 'cancel' },
          { text: 'Crear de todas formas', onPress: () => resolve(true) }
        ]
      )
    })
  }
  return true
}
```

**Justificación**: Evita QRs redundantes por error del usuario.

---

### **D. Validación de Contexto Temporal**

#### 6. **Advertencia de Fecha Muy Lejana**
```typescript
// Para amigos:
const monthsAhead = (visitDateStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24 * 30)
if (monthsAhead > 3) {
  const confirmed = await new Promise((resolve) => {
    Alert.alert(
      '📅 Fecha muy lejana',
      `La visita es dentro de ${Math.ceil(monthsAhead)} meses.\n\n¿Estás seguro de generar este QR ahora?`,
      [
        { text: 'Revisar fecha', onPress: () => resolve(false) },
        { text: 'Confirmar', onPress: () => resolve(true) }
      ]
    )
  })
  if (!confirmed) return
}
```

**Justificación**: Previene errores al seleccionar fecha incorrecta.

#### 7. **Servicio en Horario No Laboral**
```typescript
const serviceHour = serviceDate.getHours()
if (serviceHour < 7 || serviceHour >= 22) {
  Alert.alert(
    '🌙 Horario inusual',
    `El servicio está programado para las ${serviceHour}:00 horas.\n\n¿Es correcto?`,
    [
      { text: 'Revisar', style: 'cancel' },
      { text: 'Confirmar' }
    ]
  )
}
```

**Justificación**: Detecta posibles errores de AM/PM.

---

### **E. Validación de Cuota de Uso**

#### 8. **Advertencia Cercana al Límite**
```typescript
// Antes de generar, consultar cuántos QRs activos hay:
const activeCount = await getActiveQRCount(policy.id)
const maxAllowed = policy.maxQRsPerHouse

if (activeCount >= maxAllowed - 1 && maxAllowed !== null) {
  Alert.alert(
    '⚠️ Cerca del límite',
    `Tienes ${activeCount}/${maxAllowed} QRs activos de tipo "${policy.description}".\n\nDespués de este, alcanzarás el límite máximo.`,
    [{ text: 'Entendido' }]
  )
}
```

**Justificación**: Informa proactivamente al usuario.

---

### **F. Validación de Conectividad**

#### 9. **Verificar Conexión Antes de Subir Imagen**
```typescript
const checkConnection = async () => {
  try {
    const response = await fetch(`${apiUrl}/health`, { 
      method: 'HEAD',
      signal: AbortSignal.timeout(3000)
    })
    return response.ok
  } catch {
    return false
  }
}

// En pickImage() antes de uploadImageToSupabase():
if (!(await checkConnection())) {
  Alert.alert(
    '📡 Sin conexión',
    'No se detectó conexión a internet.\n\nLa imagen no se subirá. Verifica tu conexión.'
  )
  return
}
```

**Justificación**: Evita frustración al usuario esperando upload que fallará.

---

### **G. Validación de Permisos y Estado**

#### 10. **Casa Sin Asignar**
```typescript
// Ya manejado en backend, pero útil en frontend también:
const checkHouseAssignment = async () => {
  const response = await fetch(`${apiUrl}/profile`, {
    headers: { Authorization: `Bearer ${authToken}` }
  })
  const profile = await response.json()
  
  if (!profile.house_id) {
    Alert.alert(
      '🏠 Casa no asignada',
      'Tu cuenta no tiene una casa asignada.\n\nContacta al administrador de la colonia.',
      [{ text: 'OK' }]
    )
    return false
  }
  return true
}
```

**Justificación**: Mensaje más claro desde el inicio.

---

## 📊 Priorización Recomendada

### **Alta Prioridad** (Implementar ahora)
1. ✅ Validación de caracteres especiales en nombres
2. ✅ Advertencia cercana al límite de QRs
3. ✅ Capitalización automática de nombres

### **Media Prioridad** (Fase 2)
4. Validación de duplicados activos
5. Advertencia de fecha muy lejana
6. Verificación de conexión antes de upload

### **Baja Prioridad** (Futuro)
7. Servicio en horario no laboral
8. Compresión automática de imágenes grandes
9. Validación de casa sin asignar en frontend

---

## 🎯 Casos de Prueba Sugeridos

### **Casos Positivos**
- ✅ Generar QR con todos los campos válidos
- ✅ Generar QR en el límite (3/4, 4/4)
- ✅ Generar QR con nombres con acentos/ñ
- ✅ Generar QR con fechas futuras válidas

### **Casos Negativos a Probar**
- ❌ Intentar generar 5to QR familia (debe mostrar alerta de límite)
- ❌ Nombre con <3 caracteres
- ❌ Nombre con >100 caracteres
- ❌ Fecha en el pasado
- ❌ Sin foto ID (familia/servicio)
- ❌ Duración servicio inválida (0, 13 horas)
- ❌ Rango paquetería >30 días
- ❌ Sin conexión a internet

### **Casos de Edge**
- ⚠️ Generar QR justo a medianoche
- ⚠️ Cambiar de pantalla mientras se sube imagen
- ⚠️ Nombre solo con espacios
- ⚠️ Foto muy grande (>5MB)
- ⚠️ App en background durante generación

---

## 🔐 Seguridad

### **Validaciones de Seguridad Adicionales**
```typescript
// 1. Sanitización de inputs
const sanitizeInput = (text: string) => {
  return text
    .trim()
    .replace(/[<>]/g, '') // Evitar HTML injection
    .substring(0, 100) // Límite estricto
}

// 2. Rate limiting en frontend
let lastQRGeneration = 0
const MIN_INTERVAL_MS = 2000 // 2 segundos entre QRs

if (Date.now() - lastQRGeneration < MIN_INTERVAL_MS) {
  Alert.alert('⏱️ Espera un momento', 'Por favor espera antes de generar otro QR')
  return
}
lastQRGeneration = Date.now()

// 3. Validación de token expirado
if (!authToken || authToken === 'expired') {
  Alert.alert(
    '🔑 Sesión expirada',
    'Tu sesión ha caducado. Por favor inicia sesión nuevamente.',
    [{ text: 'OK', onPress: () => logout() }]
  )
  return
}
```

---

## 📱 UX/UI Mejoradas

### **Mejoras de Experiencia**
```typescript
// 1. Indicador de progreso durante upload de imagen
setUploadingImage(true)
// ... mostrar porcentaje si es posible

// 2. Confirmación de salida con datos sin guardar
const hasUnsavedData = visitorName || companyName || appName || imagePreviewUrl
if (hasUnsavedData) {
  Alert.alert(
    '⚠️ Datos sin guardar',
    '¿Estás seguro de salir? Se perderán los datos ingresados.',
    [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', onPress: () => goBack(), style: 'destructive' }
    ]
  )
}

// 3. Autocompletado de nombres frecuentes
// Guardar en AsyncStorage los últimos 5 nombres usados
// Mostrar sugerencias al escribir
```

---

## 🎨 Resumen

### **Implementaciones Actuales**
- ✅ 15+ validaciones activas
- ✅ Manejo robusto de errores del servidor
- ✅ Mensajes con emojis para mejor UX
- ✅ Botones de acción contextual en alertas

### **Próximos Pasos Recomendados**
1. Implementar validación de caracteres especiales
2. Agregar capitalización automática
3. Mostrar advertencia cercana al límite
4. Implementar rate limiting
5. Añadir verificación de duplicados

### **Casos Críticos Cubiertos**
- ✅ Límite de QRs alcanzado → Alerta con navegación a gestión
- ✅ Campos vacíos → Validación previa con mensaje claro
- ✅ Fechas inválidas → Múltiples validaciones temporales
- ✅ Sin conexión → Manejo de error de red
- ✅ Error del servidor → Mensajes específicos por código HTTP
