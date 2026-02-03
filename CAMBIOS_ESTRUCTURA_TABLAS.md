# Cambios de Estructura de Tablas - Actualización del API

## Resumen de Cambios
Se ha actualizado la estructura de las tablas de base de datos y el código del servidor para utilizar una nueva organización que separa la información de las casas en una tabla independiente.

## Cambios en la Base de Datos

### ❌ Eliminado
- Columna `apartment_unit` de la tabla `profiles`
- Columna `adeudo_meses` de la tabla `profiles`

### ✅ Agregado
- Tabla `houses` con campos:
  - `id` (UUID, PK)
  - `colonia_id` (FK a colonias)
  - `street` (nombre de calle)
  - `external_number` (número de casa/depto)
  - `number_of_people` (cantidad de habitantes)
  - `adeudos_months` (meses adeudados de mantenimiento)

- Columna `house_id` en tabla `profiles` (FK a houses)
- Columna `house_id` en tabla `maintenance_payments` (FK a houses)

## Cambios en el Servidor (server.ts)

### 1. **Controlador de Portones: `/gate/open` y `/gate/close`**
```typescript
// Antes
.select('role, apartment_unit, colonia_id')

// Ahora
.select('role, house_id, colonia_id')
```
- Se cambió la selección de `apartment_unit` por `house_id`
- El datos de dirección se obtienen de la tabla `houses` cuando es necesario

### 2. **Endpoint de Pago de Mantenimiento: `/payment/maintenance`**
```typescript
// Antes
adeudo_meses: 0,  // en profiles

// Ahora
adeudos_months: 0,  // en houses
```
- Se actualiza la tabla `houses` en lugar de `profiles`
- Se resetea el campo `adeudos_months` cuando el pago es exitoso

Código agregado:
```typescript
// Actualizar la casa para resetear adeudos_months a 0
if (houseId) {
  const { error: houseUpdateError } = await supabaseAdmin
    .from('houses')
    .update({
      adeudos_months: 0,
      updated_at: currentDate.toISOString()
    })
    .eq('id', houseId)
  
  if (houseUpdateError) {
    fastify.log.error({ error: houseUpdateError }, 'Error al actualizar la casa después del pago')
  } else {
    fastify.log.info('Casa actualizada exitosamente para user ' + user.id)
  }
}
```

### 3. **Forum Posts: `/forum/posts` GET**
```typescript
// Antes
.select(`
  id,
  title,
  content,
  category,
  created_at,
  author_id,
  profiles:author_id (
    id,
    apartment_unit
  )
`)

// Ahora
.select(`
  id,
  title,
  content,
  category,
  created_at,
  author_id,
  profiles:author_id (
    id,
    house_id,
    houses:house_id (
      street,
      external_number
    )
  )
`)
```

- Se obtiene `house_id` de `profiles` y luego se hace join a `houses`
- El campo de respuesta cambió de `author_unit` a `author_address`
- La dirección se compone como: `${street} ${external_number}`

### 4. **Forum Posts: `/forum/posts` POST**
```typescript
// Antes
.select('colonia_id, apartment_unit')
// ...
author_unit: profile.apartment_unit ?? undefined,

// Ahora
.select('colonia_id, house_id, houses!fk_profiles_house(street, external_number)')
// ...
const houseData = (profile as any).houses
const authorAddress = houseData
  ? `${houseData.street} ${houseData.external_number}`
  : 'Dirección no disponible'
// ...
author_address: authorAddress,
```

- Cambio similar al GET: se obtienen datos de la casa para mostrar dirección
- El campo de respuesta es `author_address` en lugar de `author_unit`

### 5. **Support Messages: `/support/send`**
```typescript
// Antes
.select('apartment_unit, colonia_id')
// ...
apartment_unit: profile?.apartment_unit || null,

// Ahora
.select('colonia_id, house_id, houses!fk_profiles_house(street, external_number)')
const houseData = (profile as any)?.houses
const apartmentUnit = houseData
  ? `${houseData.street} ${houseData.external_number}`
  : null
// ...
apartment_unit: apartmentUnit,
```

- Se mantiene el campo `apartment_unit` en la tabla `support_messages` para compatibilidad histórica
- Se compone la dirección a partir de los datos de la casa

## Relaciones de Tablas

```
profiles (user profile)
├── house_id → houses (FK)
└── colonia_id → colonias (FK)

houses
├── colonia_id → colonias (FK)
├── street, external_number, number_of_people
└── adeudos_months (antes estaba en profiles)

maintenance_payments
├── user_id → profiles (FK)
├── colonia_id → colonias (FK)
├── house_id → houses (FK) [NUEVO]
└── transaction_id → Openpay

forum_posts
├── author_id → profiles (FK)
└── colonia_id → colonias (FK)

access_logs
├── user_id → profiles (FK)
└── gate_id → gates (FK)

support_messages
├── user_id → auth.users (FK)
└── colonia_id → colonias (FK)
```

## Beneficios de la Nueva Estructura

✅ **Normalización**: Elimina redundancia de datos de dirección
✅ **Escalabilidad**: Permite múltiples usuarios por casa
✅ **Rastreabilidad**: El campo `adeudos_months` está en la casa, no en el usuario
✅ **Flexibilidad**: Facilita agregar campos nuevos a las casas sin afectar perfiles
✅ **Auditoría**: Mejor control sobre quién vive en qué casa

## Checklists para Validación

### Base de Datos
- [x] Tabla `houses` creada con todas las columnas
- [x] Foreign key `fk_profiles_house` agregada
- [x] Índices creados en `houses` para performance
- [x] RLS (Row Level Security) configurado
- [x] Triggers para `updated_at` configurados

### API Server
- [x] Endpoints `/gate/open` y `/gate/close` actualizados
- [x] Endpoint `/payment/maintenance` actualizado con lógica de `adeudos_months`
- [x] Endpoint `/forum/posts` GET actualizado
- [x] Endpoint `/forum/posts` POST actualizado
- [x] Endpoint `/support/send` actualizado
- [x] Sin errores de sintaxis

## Pendiente en Cliente (portones-fc-app)

Se ha actualizado el cliente para usar la nueva estructura:

### ✅ Actualizado

#### MaintenancePaymentScreen.tsx
```typescript
// Antes
const adeudoMeses = profile?.adeudo_meses ?? 0

// Ahora  
const adeudoMeses = profile?.house?.adeudos_months ?? 0
```

```typescript
// Antes
{profile?.apartment_unit && (
  <Text fontSize='$3' color='$gray11'>
    Departamento: {profile.apartment_unit}
  </Text>
)}

// Ahora
{profile?.house && (
  <Text fontSize='$3' color='$gray11'>
    Dirección: {profile.house.street} {profile.house.external_number}
  </Text>
)}
```

#### RevokedAccessScreen.tsx
```typescript
// Antes
const adeudoMeses = profile?.adeudo_meses ?? 0

// Ahora
const adeudoMeses = profile?.house?.adeudos_months ?? 0
```

```typescript
// Antes
{profile?.apartment_unit && (
  <Text fontSize='$3' color='$gray11'>
    {profile.apartment_unit}
  </Text>
)}

// Ahora
{profile?.house && (
  <Text fontSize='$3' color='$gray11'>
    {profile.house.street} {profile.house.external_number}
  </Text>
)}
```

#### AccessHistoryScreen.tsx
- Se agregó tipo de dato `user_address?: string | null` en interfaz `AccessRecord`
- El campo `apartment_unit` se mantiene para compatibilidad histórica
