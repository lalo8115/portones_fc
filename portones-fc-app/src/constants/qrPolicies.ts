// Políticas de QR - Configuración centralizada
// Este archivo mantiene la consistencia entre todas las pantallas

export type QRPolicyType = 'delivery_app' | 'family' | 'friend' | 'parcel' | 'service'

export interface QRPolicy {
  id: QRPolicyType
  title: string
  description: string
  icon: string
  color: string
  duration: string
  visits: number
  requiresId: boolean
  requiresName: boolean
  maxQRsPerHouse: number | null // null = sin límite
}

// Mapeo de emojis por tipo de rubro
export const QR_RUBRO_ICONS: Record<QRPolicyType, string> = {
  delivery_app: '🛵',
  family: '👨‍👩‍👧‍👦',
  friend: '👥',
  parcel: '📦',
  service: '🔧'
}

// Mapeo de textos por tipo de rubro
export const QR_RUBRO_TEXT: Record<QRPolicyType, string> = {
  delivery_app: 'Repartidor',
  family: 'Familiar',
  friend: 'Amigo',
  parcel: 'Paquetería',
  service: 'Servicio'
}

// Mapeo de colores por tipo de rubro
export const QR_RUBRO_COLORS: Record<QRPolicyType, string> = {
  delivery_app: '$orange10',
  family: '$green10',
  friend: '$blue10',
  parcel: '$purple10',
  service: '$yellow10'
}

// Políticas completas para uso en UI de creación
export const QR_POLICIES: QRPolicy[] = [
  {
    id: 'family',
    title: 'Familiar',
    description: 'Acceso indefinido con ID',
    icon: '👨‍👩‍👧‍👦',
    color: '$green10',
    duration: '1 año',
    visits: 500,
    requiresId: true,
    requiresName: true,
    maxQRsPerHouse: 4 // Máximo 4
  },
  {
    id: 'friend',
    title: 'Amigo',
    description: 'Visita social',
    icon: '👥',
    color: '$blue10',
    duration: 'Programado',
    visits: 2,
    requiresId: false,
    requiresName: true,
    maxQRsPerHouse: 8 // Máximo 8
  },
  {
    id: 'delivery_app',
    title: 'Repartidor App',
    description: 'Uber Eats, Rappi, DiDi Food',
    icon: '🛵',
    color: '$orange10',
    duration: '2 horas',
    visits: 1,
    requiresId: false,
    requiresName: true,
    maxQRsPerHouse: null // Sin límite
  },
  {
    id: 'parcel',
    title: 'Paquetería',
    description: 'DHL, FedEx, Estafeta',
    icon: '📦',
    color: '$purple10',
    duration: 'Programado',
    visits: 1,
    requiresId: false,
    requiresName: true,
    maxQRsPerHouse: null // Sin límite
  },
  {
    id: 'service',
    title: 'Servicio',
    description: 'Plomero, electricista, etc.',
    icon: '🔧',
    color: '$yellow10',
    duration: 'Programado',
    visits: 10,
    requiresId: true,
    requiresName: true,
    maxQRsPerHouse: 2 // Máximo 2
  }
]

// Funciones helper
export const getRubroIcon = (rubro?: string | null): string | null => {
  if (!rubro) return null
  return QR_RUBRO_ICONS[rubro as QRPolicyType] || '🎫'
}

export const getRubroText = (rubro?: string | null): string | null => {
  if (!rubro) return null
  return QR_RUBRO_TEXT[rubro as QRPolicyType] || rubro
}

export const getRubroColor = (rubro?: string | null): string => {
  if (!rubro) return '$gray10'
  return QR_RUBRO_COLORS[rubro as QRPolicyType] || '$gray10'
}
