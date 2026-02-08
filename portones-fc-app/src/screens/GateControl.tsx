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
import { MarketplaceScreen } from './MarketplaceScreen'
import { SupportScreen } from './SupportScreen'
import { QRManagementScreen } from './QRManagementScreen'
import { QR_POLICIES } from '../constants/qrPolicies'
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
  console.log('🔑 authToken en GateControl:', authToken ? `${authToken.substring(0, 20)}...` : 'UNDEFINED')
  console.log('🌐 apiUrl en GateControl:', apiUrl)
  
  const { signOut, user, profile } = useAuth()
  const [showAccessHistory, setShowAccessHistory] = useState(false)
  const [showCommunityForum, setShowCommunityForum] = useState(false)
  const [showMarketplace, setShowMarketplace] = useState(false)
  const [showSupport, setShowSupport] = useState(false)
  const [showQRManagement, setShowQRManagement] = useState(false)
  const [showQRScanner, setShowQRScanner] = useState(false)
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

  // Query para obtener QRs activos y contar por tipo
  const { data: qrCodesData } = useQuery({
    queryKey: ['qrCodes', authToken],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/qr/list`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        return { qrCodes: [] }
      }

      return response.json()
    },
    refetchInterval: 5000 // Refetch cada 5 segundos
  })

  // Función para contar QRs activos por tipo
  const getActiveQRCount = (policyType: string): number => {
    if (!qrCodesData?.qrCodes) return 0
    return qrCodesData.qrCodes.filter(
      (qr: any) => qr.rubro === policyType && qr.status === 'active'
    ).length
  }

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
        id: 'marketplace',
        title: 'Marketplace',
        description: 'Compra y vende entre vecinos',
        icon: '🛒',
        color: '$green10',
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
                } else if (option.id === 'marketplace') {
                  setShowMarketplace(true)
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

  // Componente para escanear QR de visitantes
  const QRScannerScreen = () => {
    const [permission, requestPermission] = useCameraPermissions()
    const [isProcessing, setIsProcessing] = useState(false)
    const [resultMessage, setResultMessage] = useState<string | null>(null)
    const [showResultDialog, setShowResultDialog] = useState(false)

    if (!permission) {
      return (
        <YStack flex={1} justifyContent='center' alignItems='center' padding='$4'>
          <Spinner size='large' />
          <Text marginTop='$4'>Cargando cámara...</Text>
        </YStack>
      )
    }

    if (!permission.granted) {
      return (
        <YStack flex={1} justifyContent='center' alignItems='center' padding='$4' space='$4'>
          <Text fontSize='$6' fontWeight='bold' textAlign='center'>
            Permisos de Cámara
          </Text>
          <Text fontSize='$3' color='$gray11' textAlign='center'>
            Necesitamos acceso a la cámara para escanear códigos QR de visitantes
          </Text>
          <Button size='$4' onPress={requestPermission}>
            <Text fontWeight='600'>Permitir Acceso a Cámara</Text>
          </Button>
          <Button size='$3' theme='gray' onPress={() => setShowQRScanner(false)}>
            <Text>Cancelar</Text>
          </Button>
        </YStack>
      )
    }

    const handleBarCodeScanned = async ({ data }: { data: string }) => {
      if (isProcessing) return

      setIsProcessing(true)

      try {
        // Parse QR data
        let qrData
        try {
          qrData = JSON.parse(data)
        } catch {
          qrData = { code: data }
        }

        const shortCode = qrData.code || data
        
        // Llamar directamente sin seleccionar portón
        await openGateWithQR(shortCode)
      } catch (error) {
        setResultMessage('❌ Código QR inválido')
        setShowResultDialog(true)
        setIsProcessing(false)
      }
    }

    const openGateWithQR = async (shortCode: string) => {
      try {
        const response = await fetch(`${apiUrl}/gate/open-with-qr`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ shortCode })
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.message || 'Error al abrir portón')
        }

        setResultMessage(
          `✅ Portón Abierto\n\n${data.gateName || 'Portón'}\n${data.visitor?.name || 'Visitante'}\n${data.visitor?.action || ''}\n\nEstado: ${data.visitor?.status === 'inside' ? 'Dentro' : 'Fuera'}\nVisitas restantes: ${data.visitor?.remainingVisits}`
        )
        setShowResultDialog(true)
      } catch (error) {
        setResultMessage(
          `❌ Error\n\n${error instanceof Error ? error.message : 'No se pudo abrir el portón'}`
        )
        setShowResultDialog(true)
      }
    }

    const handleResultDialogClose = () => {
      setShowResultDialog(false)
      setResultMessage(null)
      setIsProcessing(false)
      setShowQRScanner(false)
    }

    return (
      <YStack flex={1} backgroundColor='$background'>
        {/* Header */}
        <XStack
          justifyContent='space-between'
          alignItems='center'
          padding='$4'
          paddingTop='$8'
          backgroundColor='$background'
          borderBottomWidth={1}
          borderBottomColor='$gray5'
        >
          <YStack flex={1}>
            <Text fontSize='$6' fontWeight='bold'>
              Escanear QR de Visitante
            </Text>
            <Text fontSize='$3' color='$gray11'>
              Apunta la cámara al código QR
            </Text>
          </YStack>
          <Button
            size='$3'
            chromeless
            onPress={() => setShowQRScanner(false)}
          >
            <Text fontSize='$4'>✕</Text>
          </Button>
        </XStack>

        {/* Camera View */}
        <YStack flex={1} position='relative'>
          <CameraView
            style={{ flex: 1 }}
            facing='back'
            onBarcodeScanned={isProcessing ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['qr']
            }}
          />

          {/* Overlay con guía de escaneo */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              justifyContent: 'center',
              alignItems: 'center'
            }}
          >
            <View
              style={{
                width: 250,
                height: 250,
                borderWidth: 2,
                borderColor: 'rgba(255, 255, 255, 0.5)',
                borderRadius: 16,
                backgroundColor: 'transparent'
              }}
            />
          </View>

          {isProcessing && (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: 'rgba(0, 0, 0, 0.7)'
              }}
            >
              <Spinner size='large' color='white' />
              <Text color='white' marginTop='$4'>
                Procesando...
              </Text>
            </View>
          )}
        </YStack>

        {/* Diálogo de resultado */}
        {showResultDialog && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.7)'
            }}
          >
            <Card
              elevate
              size='$4'
              bordered
              padding='$4'
              space='$3'
              width={300}
              backgroundColor='$background'
            >
              <YStack space='$3'>
                <Text fontSize='$4' textAlign='center' style={{ whiteSpace: 'pre-line' }}>
                  {resultMessage}
                </Text>
                
                <Button
                  size='$4'
                  onPress={handleResultDialogClose}
                >
                  <Text fontWeight='600'>OK</Text>
                </Button>
              </YStack>
            </Card>
          </View>
        )}

        {/* Footer con instrucciones */}
        <YStack padding='$4' backgroundColor='$background' space='$2'>
          <Text fontSize='$3' textAlign='center' color='$gray11'>
            Coloca el código QR dentro del marco
          </Text>
          <Text fontSize='$2' textAlign='center' color='$gray10'>
            El escaneo es automático
          </Text>
        </YStack>
      </YStack>
    )
  }

  // Componente para pantalla de QR y escaneo
  const QRScreen = () => {
    const [selectedPolicy, setSelectedPolicy] = useState<string | null>(null)
    const [visitorName, setVisitorName] = useState('')
    const [idPhotoUrl, setIdPhotoUrl] = useState<string | null>(null)
    const [generatedQR, setGeneratedQR] = useState<any>(null)
    const [isGenerating, setIsGenerating] = useState(false)
    
    // Nuevos estados para formularios específicos
    const [companyName, setCompanyName] = useState('') // Para servicios
    const [appName, setAppName] = useState('') // Para delivery y paquetería
    const [deliveryDateStart, setDeliveryDateStart] = useState<Date>(new Date())
    const [deliveryDateEnd, setDeliveryDateEnd] = useState<Date>(new Date())
    const [serviceDate, setServiceDate] = useState<Date>(new Date())
    const [serviceDuration, setServiceDuration] = useState(4) // Horas (1-12)
    const [friendVisitDate, setFriendVisitDate] = useState<Date>(new Date())

    // Políticas de QR (importadas desde configuración centralizada)
    const qrPolicies = QR_POLICIES

    const handleGenerateQR = async () => {
      if (!selectedPolicy) return

      const policy = qrPolicies.find(p => p.id === selectedPolicy)
      if (!policy) return

      // Validaciones específicas por tipo
      if (policy.id === 'family') {
        if (!visitorName.trim()) {
          Alert.alert('Campo requerido', 'Por favor ingresa el nombre del familiar')
          return
        }
        if (!idPhotoUrl) {
          Alert.alert('ID requerido', 'Por favor carga una foto de la identificación')
          return
        }
      }

      if (policy.id === 'friend') {
        if (!visitorName.trim()) {
          Alert.alert('Campo requerido', 'Por favor ingresa el nombre del amigo')
          return
        }
      }

      if (policy.id === 'delivery_app') {
        if (!appName.trim()) {
          Alert.alert('Campo requerido', 'Por favor ingresa el nombre de la aplicación')
          return
        }
      }

      if (policy.id === 'parcel') {
        if (!appName.trim()) {
          Alert.alert('Campo requerido', 'Por favor ingresa el nombre de la paquetería')
          return
        }
        if (deliveryDateEnd < deliveryDateStart) {
          Alert.alert('Fechas inválidas', 'La fecha de fin debe ser posterior a la fecha de inicio')
          return
        }
      }

      if (policy.id === 'service') {
        if (!companyName.trim() || !visitorName.trim()) {
          Alert.alert('Campos requeridos', 'Por favor ingresa el nombre de la empresa y del visitante')
          return
        }
        if (!idPhotoUrl) {
          Alert.alert('ID requerido', 'Por favor carga una foto de la identificación')
          return
        }
        if (serviceDuration < 1 || serviceDuration > 12) {
          Alert.alert('Duración inválida', 'La duración debe ser entre 1 y 12 horas')
          return
        }
      }

      setIsGenerating(true)

      try {
        // Preparar datos según tipo
        let requestData: any = {
          policyType: selectedPolicy
        }

        if (policy.id === 'family') {
          requestData.visitorName = visitorName.trim()
          requestData.idPhotoUrl = idPhotoUrl
        } else if (policy.id === 'friend') {
          requestData.visitorName = visitorName.trim()
          // Calcular expiración: fecha seleccionada a las 23:59 (usar componentes de fecha directamente)
          const dateStr = friendVisitDate.toISOString().split('T')[0]
          const expirationDate = new Date(dateStr + 'T23:59:59')
          requestData.customExpiration = expirationDate.toISOString()
        } else if (policy.id === 'delivery_app') {
          requestData.visitorName = appName.trim()
        } else if (policy.id === 'parcel') {
          requestData.visitorName = appName.trim()
          // Fecha de inicio: 00:00 del día de inicio (usar componentes de fecha directamente)
          const startDateStr = deliveryDateStart.toISOString().split('T')[0]
          const validFromDate = new Date(startDateStr + 'T00:00:00')
          requestData.customValidFrom = validFromDate.toISOString()
          // Fecha de fin: 23:59 del día final (usar componentes de fecha directamente)
          const endDateStr = deliveryDateEnd.toISOString().split('T')[0]
          const expirationDate = new Date(endDateStr + 'T23:59:59')
          requestData.customExpiration = expirationDate.toISOString()
        } else if (policy.id === 'service') {
          requestData.visitorName = `${companyName.trim()} - ${visitorName.trim()}`
          requestData.idPhotoUrl = idPhotoUrl
          // Fecha de inicio: la fecha/hora seleccionada
          requestData.customValidFrom = serviceDate.toISOString()
          // Calcular expiración basada en fecha + horas
          const expirationDate = new Date(serviceDate.getTime() + serviceDuration * 60 * 60 * 1000)
          requestData.customExpiration = expirationDate.toISOString()
        }

        const response = await fetch(`${apiUrl}/qr/generate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestData)
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.message || 'Error al generar QR')
        }

        const data = await response.json()
        setGeneratedQR(data.qrCode)

        // Limpiar formulario
        setVisitorName('')
        setIdPhotoUrl(null)
        setCompanyName('')
        setAppName('')
        setServiceDuration(4)
      } catch (error) {
        Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo generar el QR')
      } finally {
        setIsGenerating(false)
      }
    }

    // Vista de selección de política
    if (!selectedPolicy) {
      return (
        <ScrollView>
          <YStack padding='$4' space='$4'>
            <YStack space='$2'>
              <Text fontSize='$7' fontWeight='bold'>
                Generar QR de Acceso
              </Text>
              <Text fontSize='$3' color='$gray11'>
                Selecciona el tipo de visitante
              </Text>
            </YStack>

            <YStack space='$2'>
              {qrPolicies.map((policy) => (
                <Card
                  key={policy.id}
                  elevate
                  bordered
                  padding='$3'
                  pressStyle={{ scale: 0.98, opacity: 0.8, backgroundColor: '$gray2' }}
                  onPress={() => setSelectedPolicy(policy.id)}
                >
                  <XStack space='$3' alignItems='center'>
                    {/* Icono */}
                    <Circle size={50} backgroundColor={policy.color} elevate>
                      <Text fontSize='$7'>{policy.icon}</Text>
                    </Circle>
                    
                    {/* Contenido */}
                    <YStack flex={1} space='$1'>
                      <Text fontSize='$5' fontWeight='bold'>
                        {policy.title}
                      </Text>
                      <Text fontSize='$2' color='$gray11' numberOfLines={1}>
                        {policy.description}
                      </Text>
                      <XStack space='$2' alignItems='center' flexWrap='wrap'>
                        <XStack space='$1' alignItems='center'>
                          <Circle size={4} backgroundColor='$blue10' />
                          <Text fontSize='$2' color='$gray11'>{policy.duration}</Text>
                        </XStack>
                        <XStack space='$1' alignItems='center'>
                          <Circle size={4} backgroundColor='$green10' />
                          <Text fontSize='$2' color='$gray11'>{policy.visits} {policy.visits === 1 ? 'visita' : 'visitas'}</Text>
                        </XStack>
                        {policy.maxQRsPerHouse !== null && (
                          <XStack space='$1' alignItems='center'>
                            <Circle size={4} backgroundColor='$orange10' />
                            <Text fontSize='$2' color='$gray11'>
                              {getActiveQRCount(policy.id)}/{policy.maxQRsPerHouse} disponibles
                            </Text>
                          </XStack>
                        )}
                      </XStack>
                    </YStack>
                    
                    {/* Flecha */}
                    <ChevronRight size={24} color='$gray10' />
                  </XStack>
                </Card>
              ))}
            </YStack>

            {/* Botón para ver gestión de QRs */}
            <Button
              size='$4'
              theme='gray'
              onPress={() => setShowQRManagement(true)}
            >
              <Text fontWeight='600'>Ver Mis QRs Generados</Text>
            </Button>

            {/* Botón de escanear QR - Solo para desarrollo */}
            {__DEV__ && (
              <Button
                size='$4'
                theme='blue'
                onPress={() => setShowQRScanner(true)}
              >
                <Text fontWeight='600'>📷 Escanear QR (Dev)</Text>
              </Button>
            )}
          </YStack>
        </ScrollView>
      )
    }

    const policy = qrPolicies.find(p => p.id === selectedPolicy)!

    // Vista del formulario y QR generado
    return (
      <ScrollView>
        <YStack padding='$4' space='$4'>
          <XStack alignItems='center' space='$2'>
            <Button
              size='$3'
              chromeless
              icon={<Text fontSize='$5'>←</Text>}
              onPress={() => {
                setSelectedPolicy(null)
                setGeneratedQR(null)
                setVisitorName('')
                setIdPhotoUrl(null)
              }}
            />
            <YStack flex={1}>
              <Text fontSize='$6' fontWeight='bold'>
                {policy.title}
              </Text>
              <Text fontSize='$3' color='$gray11'>
                {policy.description}
              </Text>
            </YStack>
          </XStack>

          {/* QR Generado */}
          {generatedQR && (
            <Card elevate size='$4' bordered padding='$4' space='$3' backgroundColor='$green2'>
              <YStack space='$3' alignItems='center'>
                <Circle size={60} backgroundColor={policy.color} elevate>
                  <Text fontSize='$8'>{policy.icon}</Text>
                </Circle>
                <Text fontSize='$5' fontWeight='bold' color='$green11'>
                  ¡{policy.id === 'delivery_app' || policy.id === 'parcel' ? 'Código Generado' : 'QR Generado'}!
                </Text>
                
                {/* Mostrar QR visual O short code según tipo */}
                {(policy.id === 'delivery_app' || policy.id === 'parcel') ? (
                  // Solo mostrar short code para repartidores y paquetería
                  <YStack space='$3' alignItems='center'>
                    <Text fontSize='$4' color='$gray11' textAlign='center'>
                      Código de acceso para {policy.id === 'delivery_app' ? 'repartidor' : 'paquetería'}
                    </Text>
                    <Card size='$4' backgroundColor='white' paddingHorizontal='$6' paddingVertical='$4' bordered>
                      <Text fontSize='$9' fontWeight='bold' letterSpacing={4} color='black'>
                        {generatedQR.shortCode}
                      </Text>
                    </Card>
                    <Text fontSize='$3' color='$gray11' textAlign='center'>
                      El repartidor debe ingresar este código en el teclado numérico
                    </Text>
                  </YStack>
                ) : (
                  // Mostrar QR visual para familia, amigos y servicios
                  <YStack space='$3' alignItems='center'>
                    <QRCode
                      value={JSON.stringify({ code: generatedQR.shortCode })}
                      size={240}
                      color='#000000'
                      backgroundColor='#ffffff'
                      quietZone={16}
                      ecl='H'
                    />
                    <Card size='$3' backgroundColor='white' paddingHorizontal='$4' paddingVertical='$2' bordered>
                      <Text fontSize='$7' fontWeight='bold' letterSpacing={2} color='black'>
                        {generatedQR.shortCode}
                      </Text>
                    </Card>
                  </YStack>
                )}
                
                {generatedQR.visitorName && (
                  <Text fontSize='$4' fontWeight='600'>
                    {generatedQR.visitorName}
                  </Text>
                )}
                <Text fontSize='$3' color='$gray11' textAlign='center'>
                  Válido hasta: {new Date(generatedQR.expiresAt).toLocaleString('es-MX')}
                </Text>
                <Text fontSize='$3' color='$gray11'>
                  {Math.floor(generatedQR.maxUses / 2)} {Math.floor(generatedQR.maxUses / 2) === 1 ? 'visita disponible' : 'visitas disponibles'}
                </Text>
              </YStack>
            </Card>
          )}

          {/* Formulario */}
          {!generatedQR && (
            <Card elevate size='$4' bordered padding='$4' space='$3'>
              <YStack space='$3'>
                <YStack space='$2'>
                  <Text fontSize='$4' fontWeight='600'>
                    Información del Visitante
                  </Text>
                  <Text fontSize='$2' color='$gray11'>
                    Completa los datos requeridos
                  </Text>
                </YStack>

                {/* FORMULARIO FAMILIAR */}
                {policy.id === 'family' && (
                  <YStack space='$3'>
                    <YStack space='$2'>
                      <Text fontSize='$3' fontWeight='600'>
                        Nombre del Familiar <Text color='$red10'>*</Text>
                      </Text>
                      <Card bordered padding='$3'>
                        <input
                          type="text"
                          value={visitorName}
                          onChange={(e: any) => setVisitorName(e.target.value)}
                          placeholder="Ej: Juan Pérez García"
                          style={{
                            border: 'none',
                            outline: 'none',
                            fontSize: '16px',
                            width: '100%',
                            background: 'transparent',
                            color: 'white'
                          }}
                        />
                      </Card>
                    </YStack>

                    <YStack space='$2'>
                      <Text fontSize='$3' fontWeight='600'>
                        Foto de Identificación <Text color='$red10'>*</Text>
                      </Text>
                      <Button
                        size='$4'
                        theme={idPhotoUrl ? 'green' : 'gray'}
                        onPress={() => {
                          Alert.alert('Carga de ID', 'Funcionalidad de carga de foto pendiente de implementar')
                        }}
                      >
                        <Text fontWeight='600'>
                          {idPhotoUrl ? '✓ ID Cargado' : '📷 Cargar Foto de ID'}
                        </Text>
                      </Button>
                      <Text fontSize='$2' color='$gray11'>
                        Se requiere INE, pasaporte o identificación oficial
                      </Text>
                    </YStack>
                  </YStack>
                )}

                {/* FORMULARIO AMIGO */}
                {policy.id === 'friend' && (
                  <YStack space='$3'>
                    <YStack space='$2'>
                      <Text fontSize='$3' fontWeight='600'>
                        Nombre del Amigo <Text color='$red10'>*</Text>
                      </Text>
                      <Card bordered padding='$3'>
                        <input
                          type="text"
                          value={visitorName}
                          onChange={(e: any) => setVisitorName(e.target.value)}
                          placeholder="Ej: María López"
                          style={{
                            border: 'none',
                            outline: 'none',
                            fontSize: '16px',
                            width: '100%',
                            background: 'transparent',
                            color: 'white'
                          }}
                        />
                      </Card>
                    </YStack>

                    <YStack space='$2'>
                      <Text fontSize='$3' fontWeight='600'>
                        Fin de visita <Text color='$red10'>*</Text>
                      </Text>
                      <Card bordered padding='$3'>
                        <input
                          type="date"
                          value={friendVisitDate.toISOString().split('T')[0]}
                          onChange={(e: any) => setFriendVisitDate(new Date(e.target.value))}
                          style={{
                            border: 'none',
                            outline: 'none',
                            fontSize: '16px',
                            width: '100%',
                            background: 'transparent',
                            color: 'white'
                          }}
                        />
                      </Card>
                      <Text fontSize='$2' color='$gray11'>
                        El QR será válido desde ahora hasta las 23:59 del día seleccionado. Máximo 2 visitas.
                      </Text>
                    </YStack>
                  </YStack>
                )}

                {/* FORMULARIO REPARTIDOR APP */}
                {policy.id === 'delivery_app' && (
                  <YStack space='$3'>
                    <YStack space='$2'>
                      <Text fontSize='$3' fontWeight='600'>
                        Nombre de la Aplicación <Text color='$red10'>*</Text>
                      </Text>
                      <Card bordered padding='$3'>
                        <input
                          type="text"
                          value={appName}
                          onChange={(e: any) => setAppName(e.target.value)}
                          placeholder="Ej: Uber Eats, Rappi, DiDi Food"
                          style={{
                            border: 'none',
                            outline: 'none',
                            fontSize: '16px',
                            width: '100%',
                            background: 'transparent',
                            color: 'white'
                          }}
                        />
                      </Card>
                    </YStack>
                    <Card backgroundColor='$blue3' padding='$3'>
                      <Text fontSize='$2' color='$blue11' textAlign='center'>
                        Se generará un código numérico que el repartidor deberá ingresar en el teclado
                      </Text>
                    </Card>
                  </YStack>
                )}

                {/* FORMULARIO PAQUETERÍA */}
                {policy.id === 'parcel' && (
                  <YStack space='$3'>
                    <YStack space='$2'>
                      <Text fontSize='$3' fontWeight='600'>
                        Nombre de Paquetería <Text color='$red10'>*</Text>
                      </Text>
                      <Card bordered padding='$3'>
                        <input
                          type="text"
                          value={appName}
                          onChange={(e: any) => setAppName(e.target.value)}
                          placeholder="Ej: DHL, FedEx, Estafeta"
                          style={{
                            border: 'none',
                            outline: 'none',
                            fontSize: '16px',
                            width: '100%',
                            background: 'transparent',
                            color: 'white'
                          }}
                        />
                      </Card>
                    </YStack>

                    <YStack space='$2'>
                      <Text fontSize='$3' fontWeight='600'>
                        Rango de Entrega <Text color='$red10'>*</Text>
                      </Text>
                      <XStack space='$2'>
                        <YStack flex={1} space='$1'>
                          <Text fontSize='$2' color='$gray11'>Desde</Text>
                          <Card bordered padding='$3'>
                            <input
                              type="date"
                              value={deliveryDateStart.toISOString().split('T')[0]}
                              onChange={(e: any) => setDeliveryDateStart(new Date(e.target.value))}
                              style={{
                                border: 'none',
                                outline: 'none',
                                fontSize: '14px',
                                width: '100%',
                                background: 'transparent',
                                color: 'white'
                              }}
                            />
                          </Card>
                        </YStack>
                        <YStack flex={1} space='$1'>
                          <Text fontSize='$2' color='$gray11'>Hasta</Text>
                          <Card bordered padding='$3'>
                            <input
                              type="date"
                              value={deliveryDateEnd.toISOString().split('T')[0]}
                              onChange={(e: any) => setDeliveryDateEnd(new Date(e.target.value))}
                              style={{
                                border: 'none',
                                outline: 'none',
                                fontSize: '14px',
                                width: '100%',
                                background: 'transparent',
                                color: 'white'
                              }}
                            />
                          </Card>
                        </YStack>
                      </XStack>
                      <Text fontSize='$2' color='$gray11'>
                        El código expirará el {deliveryDateEnd.toLocaleDateString('es-MX')}
                      </Text>
                    </YStack>

                    <Card backgroundColor='$purple3' padding='$3'>
                      <Text fontSize='$2' color='$purple11' textAlign='center'>
                        Se generará un código numérico para la paquetería
                      </Text>
                    </Card>
                  </YStack>
                )}

                {/* FORMULARIO SERVICIO */}
                {policy.id === 'service' && (
                  <YStack space='$3'>
                    <YStack space='$2'>
                      <Text fontSize='$3' fontWeight='600'>
                        Nombre de la Empresa <Text color='$red10'>*</Text>
                      </Text>
                      <Card bordered padding='$3'>
                        <input
                          type="text"
                          value={companyName}
                          onChange={(e: any) => setCompanyName(e.target.value)}
                          placeholder="Ej: Plomería González"
                          style={{
                            border: 'none',
                            outline: 'none',
                            fontSize: '16px',
                            width: '100%',
                            background: 'transparent',
                            color: 'white'
                          }}
                        />
                      </Card>
                    </YStack>

                    <YStack space='$2'>
                      <Text fontSize='$3' fontWeight='600'>
                        Nombre del Visitante <Text color='$red10'>*</Text>
                      </Text>
                      <Card bordered padding='$3'>
                        <input
                          type="text"
                          value={visitorName}
                          onChange={(e: any) => setVisitorName(e.target.value)}
                          placeholder="Ej: Carlos Hernández"
                          style={{
                            border: 'none',
                            outline: 'none',
                            fontSize: '16px',
                            width: '100%',
                            background: 'transparent',
                            color: 'white'
                          }}
                        />
                      </Card>
                    </YStack>

                    <YStack space='$2'>
                      <Text fontSize='$3' fontWeight='600'>
                        Foto de Identificación <Text color='$red10'>*</Text>
                      </Text>
                      <Button
                        size='$4'
                        theme={idPhotoUrl ? 'green' : 'gray'}
                        onPress={() => {
                          Alert.alert('Carga de ID', 'Funcionalidad de carga de foto pendiente de implementar')
                        }}
                      >
                        <Text fontWeight='600'>
                          {idPhotoUrl ? '✓ ID Cargado' : '📷 Cargar Foto de ID'}
                        </Text>
                      </Button>
                      <Text fontSize='$2' color='$gray11'>
                        Se requiere INE, pasaporte o identificación oficial
                      </Text>
                    </YStack>

                    <YStack space='$2'>
                      <Text fontSize='$3' fontWeight='600'>
                        Fecha y Hora de Inicio <Text color='$red10'>*</Text>
                      </Text>
                      <Card bordered padding='$3'>
                        <input
                          type="datetime-local"
                          value={serviceDate.toISOString().slice(0, 16)}
                          onChange={(e: any) => setServiceDate(new Date(e.target.value))}
                          style={{
                            border: 'none',
                            outline: 'none',
                            fontSize: '16px',
                            width: '100%',
                            background: 'transparent',
                            color: 'white'
                          }}
                        />
                      </Card>
                    </YStack>

                    <YStack space='$2'>
                      <Text fontSize='$3' fontWeight='600'>
                        Duración del Servicio <Text color='$red10'>*</Text>
                      </Text>
                      <XStack space='$2' alignItems='center'>
                        <Card bordered padding='$3' flex={1}>
                          <input
                            type="number"
                            min="1"
                            max="12"
                            value={serviceDuration}
                            onChange={(e: any) => setServiceDuration(parseInt(e.target.value) || 1)}
                            style={{
                              border: 'none',
                              outline: 'none',
                              fontSize: '16px',
                              width: '100%',
                              background: 'transparent',
                              color: 'white'
                            }}
                          />
                        </Card>
                        <Text fontSize='$3' color='$gray11'>horas</Text>
                      </XStack>
                      <Text fontSize='$2' color='$gray11'>
                        Máximo 12 horas. El código expirará a las {
                          new Date(serviceDate.getTime() + serviceDuration * 60 * 60 * 1000).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                        }
                      </Text>
                    </YStack>

                    <Card backgroundColor='$yellow3' padding='$3'>
                      <Text fontSize='$2' color='$yellow11' textAlign='center'>
                        Se guardará como: {companyName || 'Empresa'} - {visitorName || 'Visitante'}
                      </Text>
                    </Card>
                  </YStack>
                )}

                <Card size='$2' backgroundColor='$gray2' padding='$3' space='$2'>
                  <XStack justifyContent='space-between'>
                    <Text fontSize='$2' color='$gray11'>Duración:</Text>
                    <Text fontSize='$2' fontWeight='600'>{policy.duration}</Text>
                  </XStack>
                  <XStack justifyContent='space-between'>
                    <Text fontSize='$2' color='$gray11'>Visitas:</Text>
                    <Text fontSize='$2' fontWeight='600'>{policy.visits}</Text>
                  </XStack>
                  <XStack justifyContent='space-between'>
                    <Text fontSize='$2' color='$gray11'>Sistema:</Text>
                    <Text fontSize='$2' fontWeight='600'>Entrada + Salida</Text>
                  </XStack>
                </Card>
              </YStack>
            </Card>
          )}

          {/* Botones de acción */}
          {!generatedQR && (
            <Button
              size='$4'
              backgroundColor={policy.color}
              onPress={handleGenerateQR}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Spinner size='small' color='white' />
              ) : (
                <Text color='white' fontWeight='700'>
                  Generar {policy.id === 'delivery_app' || policy.id === 'parcel' ? 'Código' : 'QR'}
                </Text>
              )}
            </Button>
          )}

          {generatedQR && (
            <Button
              size='$4'
              theme='blue'
              onPress={() => {
                setGeneratedQR(null)
                setVisitorName('')
                setIdPhotoUrl(null)
              }}
            >
              Generar Otro QR
            </Button>
          )}
        </YStack>
      </ScrollView>
    )
  }

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

  if (showMarketplace) {
    return (
      <MarketplaceScreen
        apiUrl={apiUrl}
        authToken={authToken}
        onBack={() => setShowMarketplace(false)}
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

  if (showQRScanner) {
    return <QRScannerScreen />
  }

  if (showQRManagement) {
    return (
      <QRManagementScreen
        apiUrl={apiUrl}
        authToken={authToken}
        onBack={() => setShowQRManagement(false)}
      />
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
