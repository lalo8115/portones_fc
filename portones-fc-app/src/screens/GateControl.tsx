import React, { useState, useRef } from 'react'
import { ScrollView, View, Animated, PanResponder, Dimensions, Alert, Linking } from 'react-native'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, YStack, Text, Spinner, Circle, XStack, Card } from 'tamagui'
import { Lock, Unlock, LogOut, RefreshCw, ChevronLeft, ChevronRight, Home, MapPin} from '@tamagui/lucide-icons'
import { useAuth } from '../contexts/AuthContext'
import QRCode from 'react-native-qrcode-svg'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { AnimatedBackground } from '../components/AnimatedBackground'
import { AccessHistoryScreen } from './AccessHistoryScreen'
import { CommunityForumScreen } from './CommunityForumScreen'
import { SupportScreen } from './SupportScreen'
import { PaymentStatusScreen } from './PaymentStatusScreen'
import { AdminPanelScreen } from './AdminPanelScreen'
import { AdminPaymentReportScreen } from './AdminPaymentReportScreen'

interface GateState {
  [key: string]: 'OPEN' | 'CLOSED' | 'OPENING' | 'CLOSING' | 'UNKNOWN'
}

interface Colonia {
  id: string
  nombre: string
}

interface Gate {
  id: number
  name: string
  status: 'OPEN' | 'CLOSED' | 'OPENING' | 'CLOSING' | 'UNKNOWN'
  enabled: boolean
  type: string
  colonia_id: string | null
  colonia: Colonia | null
}

interface GatesResponse {
  gates: Gate[]
}

interface GateControlProps {
  apiUrl: string
  authToken: string
  onNavigateToPayment?: () => void
}

interface OpenGateResponse {
  success: boolean
  message: string
  gateId: number
  timestamp: string
}

// API Functions
const openGate = async (
  apiUrl: string,
  authToken: string,
  gateId: number,
  method?: 'APP' | 'QR'
): Promise<OpenGateResponse> => {
  const response = await fetch(`${apiUrl}/gate/open`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ gateId, ...(method ? { method } : {}) })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to open gate')
  }

  return response.json()
}

const closeGate = async (
  apiUrl: string,
  authToken: string,
  gateId: number
): Promise<OpenGateResponse> => {
  const response = await fetch(`${apiUrl}/gate/close`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ gateId })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to close gate')
  }

  return response.json()
}

const fetchGatesStatus = async (
  apiUrl: string,
  authToken: string
): Promise<GatesResponse> => {
  const response = await fetch(`${apiUrl}/gates`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error('Failed to fetch gates status')
  }

  return response.json()
}

interface GateCardProps {
  gateId: number
  gateName: string
  status: string
  apiUrl: string
  authToken: string
  onSuccess: () => void
}

const GateCard: React.FC<GateCardProps> = ({
  gateId,
  gateName,
  status,
  apiUrl,
  authToken,
  onSuccess
}) => {
  const { profile } = useAuth()
  const isRevoked = profile?.role === 'revoked' || (profile?.house?.adeudos_months ?? 0) > 0

  const effectiveStatus = status === 'UNKNOWN' ? 'CLOSED' : status
  const [buttonState, setButtonState] = useState<
    'idle' | 'sending' | 'counting'
  >('idle')
  const [countdown, setCountdown] = useState(5)

  const openMutation = useMutation({
    mutationFn: () => openGate(apiUrl, authToken, gateId),
    onMutate: () => setButtonState('sending'),
    onSuccess: () => {
      setButtonState('counting')
      setCountdown(5)
      onSuccess()
    },
    onError: () => setButtonState('idle')
  })

  // Efecto para la cuenta regresiva
  React.useEffect(() => {
    if (buttonState !== 'counting') return

    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      setButtonState('idle')
    }
  }, [buttonState, countdown])

  const getStatusColor = () => {
    switch (effectiveStatus) {
      case 'OPEN':
        return '$green10'
      case 'CLOSED':
        return '$blue10'
      default:
        return '$gray10'
    }
  }

  const getStatusText = () => {
    switch (effectiveStatus) {
      case 'OPEN':
        return 'Abierto'
      case 'CLOSED':
        return 'Cerrado'
      case 'OPENING':
        return 'Abriendo...'
      case 'CLOSING':
        return 'Cerrando...'
      default:
        return 'Cerrado'
    }
  }
    
  
  return (
    <Card
      elevate
      size='$4'
      bordered
      padding='$4'
      space='$3'
      flex={1}
      minHeight={200}
    >
      <YStack space='$3' flex={1} justifyContent='space-between'>
        <YStack space='$2' alignItems='center'>
          <Text fontSize='$6' fontWeight='bold'>
            {gateName}
          </Text>
          <Circle size={60} backgroundColor={getStatusColor()} elevate>
            {effectiveStatus === 'OPEN' ? (
              <Unlock size={32} color='white' />
            ) : (
              <Lock size={32} color='white' />
            )}
          </Circle>
          <Text fontSize='$4' color='$gray11'>
            {getStatusText()}
          </Text>
        </YStack>

        <XStack space='$2' width='100%'>
          <Button
            width='100%'
            size='$3'
            backgroundColor='white'
            borderWidth={1}
            borderColor='rgba(54, 158, 255, 0.35)'
            disabled={isRevoked || buttonState !== 'idle'}
            onPress={() => openMutation.mutate()}
          >
            {buttonState === 'sending' && (
              <Spinner size='small' color='#369eff' />
            )}
            {buttonState === 'idle' && (
              <Text color='#369eff' fontWeight='700'>
                Abrir
              </Text>
            )}
            {buttonState === 'counting' && (
              <Text color='#369eff' fontWeight='700'>
                {`Cerrando en ${countdown}...`}
              </Text>
            )}
          </Button>
        </XStack>
      </YStack>
    </Card>
  )
}

export const GateControl: React.FC<GateControlProps> = ({
  apiUrl,
  authToken,
  onNavigateToPayment
}) => {
  const { signOut, user, profile } = useAuth()
  const [showAccessHistory, setShowAccessHistory] = useState(false)
  const [showCommunityForum, setShowCommunityForum] = useState(false)
  const [showSupport, setShowSupport] = useState(false)
  const [showPaymentStatus, setShowPaymentStatus] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [showAdminPaymentReport, setShowAdminPaymentReport] = useState(false)
  const [qrValue, setQrValue] = useState<string | null>(null)
  const [qrExpiresAt, setQrExpiresAt] = useState<Date | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [currentScreen, setCurrentScreen] = useState(1) // 0: Payment Status, 1: Main Gates (default), 2: QR/Scanner
  const screenWidth = Dimensions.get('window').width
  const slideAnim = useRef(new Animated.Value(-screenWidth)).current

  const { data: gatesResponse, refetch: refetchGates, isLoading } = useQuery({
    queryKey: ['gatesStatus', authToken],
    queryFn: () => fetchGatesStatus(apiUrl, authToken),
    refetchInterval: 1000
  })

  // Query para obtener el estado de pago
  const { data: paymentStatus, refetch: refetchPaymentStatus } = useQuery({
    queryKey: ['paymentStatus', authToken],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/payment/status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch payment status')
      }

      return response.json()
    },
    refetchInterval: 60000 // Refetch cada minuto
  })

  const gates = gatesResponse?.gates || []
  const isAdmin = profile?.role === 'admin'

  // Debug: Log para ver los datos que llegan
  React.useEffect(() => {
    console.log('Gates recibidos del backend:', gates)
    gates.forEach(gate => {
      console.log(`Gate ${gate.id}: name=${gate.name}, type=${gate.type}`)
    })
  }, [gates])

  const handleGenerateQr = () => {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    // Código corto para máxima simplicidad de escaneo
    const shortCode = Math.random().toString(36).slice(2, 10).toUpperCase()

    // Payload ultraliviano: código y expiración
    const payload = {
      c: shortCode,
      e: expiresAt.toISOString()
    }

    setQrValue(JSON.stringify(payload))
    setQrExpiresAt(expiresAt)
  }

  const [permission, requestPermission] = useCameraPermissions()

  const handleStartScanDev = async () => {
    if (!__DEV__) {
      setScanError('El escaneo solo está habilitado en desarrollo')
      return
    }

    setScanError(null)
    if (!permission) {
      return
    }
    
    if (!permission.granted) {
      const { granted } = await requestPermission()
      if (!granted) {
        setScanError('Permiso de cámara denegado')
        return
      }
    }
    setIsScanning(true)
  }

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    setIsScanning(false)
    if (!qrValue) {
      setScanError('Primero genera un QR')
      return
    }
    const scan = { data }

    try {
      const expected = JSON.parse(qrValue)
      const parsed = JSON.parse(scan.data)
      if (parsed?.c && parsed.c === expected?.c) {
        // Abrir primer portón disponible
        if (gates.length > 0) {
          openGate(apiUrl, authToken, gates[0].id, 'QR')
            .then(() => refetchGates())
            .catch(() => setScanError('Error al abrir portón'))
        } else {
          setScanError('No hay portones disponibles')
        }
      } else {
        setScanError('QR no válido para visitantes')
      }
    } catch (error) {
      setScanError('QR no válido')
    }
  }

  const formatExpiry = (date: Date | null) => {
    if (!date) return ''

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')

    return `${year}-${month}-${day} ${hours}:${minutes}`
  }

  // Animar cambio de pantalla
  React.useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: -currentScreen * screenWidth,
      duration: 300,
      useNativeDriver: false
    }).start()
  }, [currentScreen, screenWidth, slideAnim])

  // Componente para pantalla principal de portones
  const GatesScreen = () => (
    <YStack padding='$4' space='$4'>
      <Card
        elevate
        bordered
        padding='$4'
        backgroundColor='rgba(0,0,0,0.35)'
        borderColor='rgba(255,255,255,0.14)'
      >
        <YStack space='$2'>
          <Text fontSize='$5' fontWeight='800' color='white'>
            {user?.email}
          </Text>

          {profile?.colonia?.nombre && (
            <XStack alignItems='center' gap='$2'>
              <MapPin size={16} color='rgba(120, 210, 255, 0.95)' />
              <Text fontSize='$3.5' color='rgba(180, 235, 255, 0.95)' fontWeight='700'>
                {profile.colonia.nombre}
              </Text>
            </XStack>
          )}

          {profile?.house && (
            <XStack alignItems='center' gap='$2'>
              <Home size={16} color='rgba(255,255,255,0.92)' />
              <Text fontSize='$3.5' color='rgba(255,255,255,0.92)'>
                {profile.house.street} {profile.house.external_number}
              </Text>
            </XStack>
          )}
        </YStack>
      </Card>

      {isLoading ? (
        <YStack flex={1} justifyContent='center' alignItems='center' paddingVertical='$10'>
          <Spinner size='large' color='$blue10' />
          <Text fontSize='$3' color='$gray11' marginTop='$3'>
            Cargando portones...
          </Text>
        </YStack>
      ) : gates.length === 0 ? (
        <YStack 
          flex={1} 
          justifyContent='center' 
          alignItems='center' 
          padding='$6'
          space='$4'
        >
          <Circle size={100} backgroundColor='$gray5' elevate>
            <Lock size={50} color='$gray10' />
          </Circle>
          <YStack space='$2' alignItems='center'>
            <Text fontSize='$6' fontWeight='bold' color='$gray12'>
              Sin Portones Disponibles
            </Text>
            <Text fontSize='$4' color='$gray11' textAlign='center'>
              No hay portones asignados a tu colonia o no tienes una colonia asignada.
            </Text>
            <Text fontSize='$3' color='$gray10' textAlign='center' marginTop='$2'>
              Contacta al administrador para obtener acceso.
            </Text>
          </YStack>
        </YStack>
      ) : (
        <YStack space='$4'>
          {(() => {
            // Agrupar portones por tipo
            const groupedGates = gates.reduce((acc: Record<string, typeof gates>, gate) => {
              const type = gate.type || 'ENTRADA'
              if (!acc[type]) {
                acc[type] = []
              }
              acc[type].push(gate)
              return acc
            }, {})

            // Definir el orden de tipos
            const types = ['ENTRADA', 'SALIDA']
            
            // Renderizar secciones por tipo con layout de 2 columnas
            return types.map((type) => {
              const typeGates = groupedGates[type] || []
              
              return (
                <YStack key={type} space='$3'>
                  <Text fontSize='$5' fontWeight='bold' color='$color'>
                    {type === 'ENTRADA' ? 'Entrada' : type === 'SALIDA' ? 'Salida' : type}
                  </Text>
                  <XStack space='$3' width='100%'>
                    {typeGates.map((gate, index) => (
                      <YStack key={gate.id} flex={1} minWidth='45%'>
                        <GateCard
                          gateId={gate.id}
                          gateName={gate.name}
                          status={gate.status}
                          apiUrl={apiUrl}
                          authToken={authToken}
                          onSuccess={refetchGates}
                        />
                      </YStack>
                    ))}
                  </XStack>
                </YStack>
              )
            })
          })()}
        </YStack>
      )}
    </YStack>
  )

  const MenuOptionsList = () => {
    const isPaid = paymentStatus?.isPaid ?? false

    const menuOptions = [
      {
        id: 'payment',
        title: 'Estado de Pago',
        description: 'Ver estado de cuota de mantenimiento',
        icon: '💳',
        color: '$blue10',
        badge: !isPaid ? 'Pendiente' : 'Al corriente',
        badgeColor: !isPaid ? '$red10' : '$green10',
      },
      {
        id: 'colonia',
        title: 'Comunidad',
        description: 'Eventos, mensajes y estados de cuenta de la colonia',
        icon: '💬',
        color: '$purple10',
      },
      {
        id: 'history',
        title: 'Historial de Accesos',
        description: 'Ver registro de aperturas del portón',
        icon: '📋',
        color: '$orange10',
      },
      ...(isAdmin
        ? [
            {
              id: 'admin',
              title: 'Panel Admin',
              description: 'Accesos y pagos de toda la privada',
              icon: '🛡️',
              color: '$red10',
            }
          ]
        : []),
      {
        id: 'notifications',
        title: 'Notificaciones',
        description: 'Configurar alertas y avisos',
        icon: '🔔',
        color: '$yellow10',
      },
      {
        id: 'support',
        title: 'Soporte',
        description: 'Ayuda y contacto',
        icon: '💬',
        color: '$gray10',
      },
    ]

    return (
      <YStack padding='$3.5' space='$3'>
        <YStack space='$1.5' marginBottom='$2'>
          <Text fontSize='$6' fontWeight='bold'>
            Funciones
          </Text>
          <Text fontSize='$3' color='$gray11'>
            Selecciona una opción para continuar
          </Text>
        </YStack>

        {/* Lista de opciones */}
        <YStack space='$2.5'>
          {menuOptions.map((option) => (
            <Card
              key={option.id}
              elevate
              size='$3.5'
              bordered
              padding='$3.5'
              pressStyle={{ scale: 0.97, opacity: 0.8 }}
              onPress={() => {
                if (option.id === 'payment') {
                  setShowPaymentStatus(true)
                } else if (option.id === 'history') {
                  setShowAccessHistory(true)
                } else if (option.id === 'colonia') {
                  setShowCommunityForum(true)
                } else if (option.id === 'admin') {
                  setShowAdminPanel(true)
                } else if (option.id === 'support') {
                  setShowSupport(true)
                } else {
                  Alert.alert(
                    option.title,
                    'Función en desarrollo'
                  )
                }
              }}
            >
              <XStack space='$3' alignItems='center'>
                <Circle size={50} backgroundColor={option.color} elevate>
                  <Text fontSize='$6'>{option.icon}</Text>
                </Circle>
                <YStack flex={1} space='$1'>
                  <XStack justifyContent='space-between' alignItems='center'>
                    <Text fontSize='$4' fontWeight='600'>
                      {option.title}
                    </Text>
                    {option.badge && (
                      <Card
                        size='$1'
                        backgroundColor={option.badgeColor}
                        paddingHorizontal='$2'
                        paddingVertical='$1'
                      >
                        <Text fontSize='$1.5' color='white' fontWeight='600'>
                          {option.badge}
                        </Text>
                      </Card>
                    )}
                  </XStack>
                  <Text fontSize='$2.5' color='$gray11'>
                    {option.description}
                  </Text>
                </YStack>
                <Text fontSize='$5' color='$gray10'>
                  →
                </Text>
              </XStack>
            </Card>
          ))}
        </YStack>
      </YStack>
    )
  }

  // Componente para pantalla de QR y escaneo
  const QRScreen = () => (
    <YStack padding='$4' space='$4'>
      <YStack space='$2'>
        <Text fontSize='$6' fontWeight='bold'>
          Códigos QR de Acceso
        </Text>
        <Text fontSize='$3' color='$gray11'>
          Comparte para dar acceso a visitantes
        </Text>
      </YStack>

      {qrValue && (
        <Card elevate size='$4' bordered padding='$4' space='$3'>
          <YStack space='$3' alignItems='center'>
            <Text fontSize='$5' fontWeight='bold'>
              QR temporal de acceso
            </Text>
            <QRCode
              value={qrValue}
              size={260}
              color='#000000'
              backgroundColor='#ffffff'
              quietZone={16}
              ecl='H'
            />
            {qrValue && (
              <Text fontSize='$4' fontWeight='600'>
                Código: {(() => {
                  try {
                    const parsed = JSON.parse(qrValue)
                    return parsed?.c ?? 'N/A'
                  } catch {
                    return 'N/A'
                  }
                })()}
              </Text>
            )}
            <Text fontSize='$3' color='$gray11'>
              Comparte este código para acceso rápido. Vence a las {qrExpiresAt ? formatExpiry(qrExpiresAt) : 'N/A'}.
            </Text>
          </YStack>
        </Card>
      )}

      <Button
        width='100%'
        size='$4'
        theme='blue'
        onPress={handleGenerateQr}
      >
        Generar Nuevo QR
      </Button>

      {__DEV__ && (
        <Button
          width='100%'
          size='$4'
          theme='purple'
          onPress={handleStartScanDev}
        >
          Escanear QR → Abrir Visitante Entrada
        </Button>
      )}
    </YStack>
  )

  if (showAccessHistory) {
    return (
      <AccessHistoryScreen
        apiUrl={apiUrl}
        onBack={() => setShowAccessHistory(false)}
      />
    )
  }

  if (showCommunityForum) {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || ''
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''
    
    return (
      <CommunityForumScreen
        apiUrl={apiUrl}
        authToken={authToken}
        onBack={() => setShowCommunityForum(false)}
        supabaseUrl={supabaseUrl}
        supabaseAnonKey={supabaseAnonKey}
      />
    )
  }

  if (showAdminPaymentReport && isAdmin) {
    return (
      <AdminPaymentReportScreen
        apiUrl={apiUrl}
        authToken={authToken}
        onBack={() => setShowAdminPaymentReport(false)}
      />
    )
  }

  if (showAdminPanel && isAdmin) {
    return (
      <AdminPanelScreen
        onBack={() => setShowAdminPanel(false)}
        onOpenAccessLog={() => {
          setShowAdminPanel(false)
          setShowAccessHistory(true)
        }}
        onOpenPaymentReport={() => {
          setShowAdminPanel(false)
          setShowAdminPaymentReport(true)
        }}
      />
    )
  }

  if (showSupport) {
    return (
      <SupportScreen onBack={() => setShowSupport(false)} />
    )
  }

  if (showPaymentStatus) {
    return (
      <PaymentStatusScreen
        paymentStatus={paymentStatus}
        onBack={() => setShowPaymentStatus(false)}
        onNavigateToPayment={onNavigateToPayment}
      />
    )
  }

  return (
    <YStack flex={1} backgroundColor={currentScreen === 1 ? '#000' : '$background'}>
      {/* Header (solo estilo especial en la pantalla central de Portones) */}
      {currentScreen === 1 ? (
        <View style={{ position: 'relative', overflow: 'hidden' }}>
          <AnimatedBackground
            bleed={0}
            showAurora={false}
            showOverlayGradient
            baseColor='#000'
            opacity={0}
          />
          <XStack
            
            justifyContent='space-between'
            alignItems='center'
            padding='$4'
            paddingTop='$8'
            paddingBottom='$7'
            backgroundColor='transparent'
            borderBottomWidth={1}
            borderBottomColor='rgba(255,255,255,0.10)'
          >
            <Text fontSize='$7' fontWeight='900' color='white'>
              Porton Inteligente
            </Text>
            <XStack space='$2'>
              <Button
                size='$3'
                icon={<RefreshCw size={18} color='white' />}
                onPress={() => refetchGates()}
                disabled={isLoading}
                chromeless
              />
              <Button
                size='$3'
                icon={<LogOut size={18} color='white' />}
                onPress={() => signOut()}
                chromeless
              />
            </XStack>
          </XStack>
        </View>
      ) : (
        <XStack
          justifyContent='space-between'
          alignItems='center'
          padding='$4'
          paddingTop='$8'
          backgroundColor='$background'
          borderBottomWidth={1}
          borderBottomColor='$gray5'
        >
          <YStack space='$1' flex={1}>
            <Text fontSize='$4' fontWeight='600' color='$color'>
              {user?.email}
            </Text>

            {profile?.colonia?.nombre && (
              <XStack alignItems='center' gap='$1'>
                <MapPin size={15} color='$blue10' />
                <Text fontSize='$3' color='$blue10' fontWeight='600'>
                  {profile.colonia.nombre}
                </Text>
              </XStack>
            )}

            {profile?.house && (
              <XStack alignItems='center' gap='$1.5'>
                <Home size={14} color='$color' />
                <Text fontSize='$3' color='$color'>
                  {profile.house.street} {profile.house.external_number}
                </Text>
              </XStack>
            )}
          </YStack>
          <XStack space='$2'>
            <Button
              size='$3'
              icon={<RefreshCw size={18} />}
              onPress={() => refetchGates()}
              disabled={isLoading}
              chromeless
            />
            <Button
              size='$3'
              icon={<LogOut size={18} />}
              onPress={() => signOut()}
              chromeless
            />
          </XStack>
        </XStack>
      )}

      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        {/* Main Content */}
        <YStack flex={1}>
          {/* Contenedor de pantallas deslizables */}
          <View style={{ flex: 1, overflow: 'hidden' }}>
            <Animated.View 
              style={{
                flex: 1,
                flexDirection: 'row',
                width: screenWidth * 3,
                transform: [{ translateX: slideAnim }]
              }}
            >
              {/* Pantalla 0: Estado de Pago */}
              <View style={{ width: screenWidth, flex: 1 }}>
                <MenuOptionsList />
              </View>

                {/* Pantalla 1: Control de Portones (Principal) */}
                <View style={{ width: screenWidth, flex: 1 }}>
                  <View style={{ flex: 1 }}>
                    <GatesScreen />
                  </View>
                </View>

                {/* Pantalla 2: QR y Escaneo */}
                <View style={{ width: screenWidth, flex: 1 }}>
                  <QRScreen />
                </View>
              </Animated.View>
            </View>

            {/* Indicadores de pantalla */}
            <XStack 
              justifyContent='center' 
              alignItems='center' 
              space='$2' 
              padding='$4'
              borderTopWidth={1}
              borderTopColor={currentScreen === 1 ? 'rgba(255,255,255,0.10)' : '$gray5'}
              backgroundColor={currentScreen === 1 ? '#000' : 'transparent'}
            >
              <YStack 
                width={8} 
                height={8} 
                borderRadius={4} 
                backgroundColor={currentScreen === 0 ? '$orange10' : '$gray5'}
              />
              <YStack 
                width={8} 
                height={8} 
                borderRadius={4} 
                backgroundColor={currentScreen === 1 ? '$blue10' : '$gray5'}
              />
              <YStack 
                width={8} 
                height={8} 
                borderRadius={4} 
                backgroundColor={currentScreen === 2 ? '$purple10' : '$gray5'}
              />
            </XStack>

            {/* Botones de navegación */}
            <XStack 
              justifyContent='space-between' 
              alignItems='center' 
              padding='$3'
              space='$2'
              backgroundColor={currentScreen === 1 ? '#000' : 'transparent'}
            >
              <Button
                size='$3'
                disabled={currentScreen === 0}
                onPress={() => setCurrentScreen(Math.max(0, currentScreen - 1))}
                flex={1}
                backgroundColor='#151515'
                borderWidth={1}
                borderColor='transparent'
                pressStyle={{ backgroundColor: '#1d1d1d', borderColor: 'transparent' }}
                hoverStyle={{ backgroundColor: '#1a1a1a', borderColor: 'transparent' }}
                focusStyle={{ borderColor: 'transparent' }}
                disabledStyle={{ opacity: 0.45, backgroundColor: '#151515', borderColor: 'transparent' }}
                icon={<ChevronLeft size={18} color='#369eff' />}
              >
                <Text color='#369eff' fontWeight='700'>
                  {currentScreen === 2 ? 'Portones' : 'Menú'}
                </Text>
              </Button>
              <Button
                size='$3'
                disabled={currentScreen === 2}
                onPress={() => setCurrentScreen(Math.min(2, currentScreen + 1))}
                flex={1}
                backgroundColor='#151515'
                borderWidth={1}
                borderColor='transparent'
                pressStyle={{ backgroundColor: '#1d1d1d', borderColor: 'transparent' }}
                hoverStyle={{ backgroundColor: '#1a1a1a', borderColor: 'transparent' }}
                focusStyle={{ borderColor: 'transparent' }}
                disabledStyle={{ opacity: 0.45, backgroundColor: '#151515', borderColor: 'transparent' }}
                icon={<ChevronRight size={18} color='#369eff' />}
              >
                <Text color='#369eff' fontWeight='700'>
                  {currentScreen === 0 ? 'Portones' : 'QR'}
                </Text>
              </Button>
            </XStack>
          </YStack>
      </ScrollView>
      {isScanning && (
        <YStack
          position='absolute'
          top={0}
          left={0}
          right={0}
          bottom={0}
          backgroundColor='rgba(0,0,0,0.9)'
          alignItems='center'
          justifyContent='center'
          padding='$4'
          space='$3'
        >
          <Text fontSize='$6' fontWeight='bold' color='white'>
            Escanea el QR generado
          </Text>
          <View style={{ width: '90%', height: 340, overflow: 'hidden', borderRadius: 16 }}>
            <CameraView
              onBarcodeScanned={handleBarCodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              style={{ width: '100%', height: '100%' }}
            />
          </View>
          <Button size='$4' theme='red' onPress={() => setIsScanning(false)}>
            Cancelar
          </Button>
          {scanError && (
            <Text fontSize='$4' color='$red10' textAlign='center'>
              {scanError}
            </Text>
          )}
        </YStack>
      )}
    </YStack>
  )
}
