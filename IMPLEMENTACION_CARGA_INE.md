# Implementación de Carga de Fotos INE

## ✅ Cambios Completados

### 1. GateControl.tsx
Se implementó un sistema completo de carga de imágenes:

#### Nuevas Funcionalidades:
- **Input de archivos HTML5** optimizado para móviles (permite selección desde cámara o galería)
- **Vista previa local**: Muestra la imagen antes de subirla usando FileReader API
- **Validación**: Máximo 5MB, solo JPG/PNG
- **Carga a Supabase Storage**: Con nombre único `{userId}/{timestamp}-{random}.{ext}`
- **Estados de carga**: Spinner mientras sube, badge de confirmación cuando termina
- **Limpieza automática**: Reset de preview al generar QR, volver o "Generar Otro QR"

#### Componentes Actualizados:
- ✅ Formulario FAMILY (líneas 1654-1707)
- ✅ Formulario SERVICE (líneas 1910-1970)

#### Ubicación de la Funcionalidad:
```typescript
// Estados (líneas 1195-1208)
const [uploadingImage, setUploadingImage] = useState(false)
const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)

// Función de selección (línea 1220)
const pickImage = () => { ... }

// Función de carga a Supabase (línea 1256)
const uploadImageToSupabase = async (file: File) => { ... }
```

### 2. QRManagementScreen.tsx
**Ya existe el botón "Ver Identificación"** (líneas 653-667):
- Se muestra solo para QRs de tipo `family` o `service` que tengan `url_ine`
- Abre un Sheet modal con la imagen en pantalla completa
- Usa el icono `IdCard` de lucide-icons

## 🔧 Configuración Requerida

### 1. Ejecutar SQL en Supabase
```bash
# Desde la consola de Supabase SQL Editor, ejecutar:
portones-fc-api/setup_ine_photos_bucket.sql
```

Este script:
- Crea el bucket `ine-photos` (público, 5MB límite)
- Configura 4 políticas de seguridad:
  1. **INSERT**: Solo usuarios autenticados en su carpeta (`auth.uid()`)
  2. **SELECT**: Lectura pública
  3. **UPDATE**: Solo propietario puede actualizar
  4. **DELETE**: Solo propietario puede eliminar

### 2. Variables de Entorno
Verificar que existan en el entorno:
```
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu-clave-anon-publica
```

## 📱 Flujo de Usuario (PWA Móvil)

1. **En GateControl Screen**:
   - Usuario selecciona tipo "Entrada Familiar" o "Prestador de Servicios"
   - Usuario llena datos requeridos (nombre, apellido, etc.)
   - Usuario toca "📷 Tomar/Subir Foto"
   - Navegador móvil muestra opciones:
     - "Tomar foto" (cámara)
     - "Elegir de galería"
   - Usuario selecciona imagen
   - **Preview inmediato** se muestra en Card de 200px
   - **Carga automática** a Supabase
   - Badge verde de confirmación "✓ Foto cargada"
   - Usuario toca "Generar QR"
   - QR se genera con `url_ine` guardada en base de datos

2. **En QR Management Screen**:
   - Usuario abre historial de QRs
   - Usuario toca un QR con INE cargada
   - Aparece botón verde "Ver Identificación"
   - Usuario toca el botón
   - Sheet modal muestra imagen INE en pantalla completa
   - Usuario puede hacer zoom o cerrar

## 🧪 Checklist de Pruebas

### Pruebas de Carga
- [ ] **FAMILY Form**: Cargar INE → Ver preview → Generar QR
- [ ] **SERVICE Form**: Cargar INE → Ver preview → Generar QR
- [ ] **Validación de tamaño**: Intentar subir archivo >5MB (debe rechazar)
- [ ] **Validación de tipo**: Intentar subir PDF o TXT (debe rechazar)
- [ ] **Cámara móvil**: En navegador móvil, seleccionar "Tomar foto"
- [ ] **Galería móvil**: En navegador móvil, seleccionar "Elegir de galería"

### Pruebas de Navegación
- [ ] **Reset al generar**: Generar QR → Verificar que preview desaparece
- [ ] **Reset al volver**: Cargar imagen → Volver atrás → Verificar limpieza
- [ ] **Generar Otro QR**: Generar QR → "Generar Otro QR" → Verificar reset

### Pruebas de Visualización
- [ ] **QR con INE**: Buscar QR generado → Tocar → Verificar botón "Ver Identificación"
- [ ] **QR sin INE**: QRs antiguos sin `url_ine` NO deben mostrar el botón
- [ ] **Sheet viewer**: Abrir INE → Verificar imagen a pantalla completa
- [ ] **Zoom**: Intentar hacer zoom en la imagen (debe permitir)

### Pruebas de Seguridad
- [ ] **URL pública**: Copiar URL de imagen y abrirla en navegador (debe funcionar)
- [ ] **Carpeta de usuario**: Verificar que imágenes se guardan en carpeta con `userId`
- [ ] **Nombre único**: Subir 2 imágenes seguidas → Verificar nombres diferentes

## 📂 Estructura de Archivos en Supabase

```
ine-photos/
  ├── {userId-1}/
  │   ├── 1703001234567-abc123.jpg
  │   ├── 1703001345678-def456.png
  │   └── ...
  ├── {userId-2}/
  │   ├── 1703002234567-ghi789.jpg
  │   └── ...
  └── ...
```

## 🔍 Debugging

### Si la carga falla:
1. Verificar en DevTools (F12) → Console
2. Buscar errores de Supabase:
   - `StorageError: Bucket not found` → Ejecutar `setup_ine_photos_bucket.sql`
   - `StorageError: Policy violation` → Revisar políticas de seguridad
   - `403 Forbidden` → Verificar `SUPABASE_ANON_KEY`

### Si el preview no aparece:
1. Verificar tamaño de archivo (<5MB)
2. Verificar formato (JPG/PNG solamente)
3. Revisar Console para errores de FileReader

### Si el botón "Ver Identificación" no aparece:
1. Verificar que el QR tenga `url_ine` en base de datos
2. Confirmar que `rubro === 'family'` o `rubro === 'service'`
3. Recargar lista de QRs (pull to refresh)

## 📝 Notas Técnicas

### Compatibilidad
- **iOS Safari**: ✅ Soporte completo de input file + cámara
- **Android Chrome**: ✅ Soporte completo de input file + cámara
- **Desktop Web**: ✅ Funciona con selección de archivos local

### Limitaciones
- Archivos mayores a 5MB serán rechazados
- Solo formatos JPG/PNG/JPEG permitidos
- Requiere conexión a internet para subir (no funciona offline)

### Mejoras Futuras Sugeridas
- Compresión automática de imágenes >2MB
- Captura directa con `getUserMedia()` API
- Modo offline con cola de subida
- Edición básica (recortar, rotar)
- Eliminación de fotos antiguas desde la app
