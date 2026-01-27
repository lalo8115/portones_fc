import React, { useState, useEffect } from 'react'
import { ScrollView } from 'react-native'
import { Button, YStack, Text, XStack, Card, Input } from 'tamagui'
import { ArrowLeft, CreditCard, CheckCircle } from '@tamagui/lucide-icons'
import { useAuth } from '../contexts/AuthContext'

interface MaintenancePaymentScreenProps {
  apiUrl: string
  authToken: string
  onBack: () => void
}

interface PaymentStatus {
  status: 'idle' | 'loading' | 'success' | 'error'
  message: string
}

export const MaintenancePaymentScreen: React.FC<MaintenancePaymentScreenProps> = ({
  apiUrl,
  authToken,
  onBack
}) => {
  const { user, profile } = useAuth()
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>({
    status: 'idle',
    message: ''
  })
  const [cardholderName, setCardholderName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [cvv, setCvv] = useState('')
  const [openpayPublicKey, setOpenpayPublicKey] = useState<string | null>(null)

  const monthlyAmount = 500 // Fallback en caso de que no venga de la colonia
  const currency = 'MXN'
  const amountToPay = profile?.colonia?.maintenance_monthly_amount ?? monthlyAmount

  // Obtener Openpay public key del backend al cargar
  useEffect(() => {
    const fetchOpenpayKey = async () => {
      try {
        const response = await fetch(`${apiUrl}/config/openpay-public-key`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        })
        if (response.ok) {
          const data = await response.json()
          setOpenpayPublicKey(data.publicKey)
        }
      } catch (error) {
        console.error('Error fetching Openpay public key:', error)
      }
    }
    fetchOpenpayKey()
  }, [apiUrl])

  // Generar device_session_id via API
  const generateDeviceSessionId = async (): Promise<string> => {
    try {
      const response = await fetch(`${apiUrl}/config/openpay-device-session`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      if (response.ok) {
        const data = await response.json()
        return data.deviceSessionId
      }
    } catch (error) {
      console.error('Error generating device session:', error)
    }
    return ''
  }

  // Tokenizar tarjeta vía API
  const tokenizeCard = async (
    cardNumber: string,
    expiryDate: string,
    cvv: string,
    cardholderName: string
  ): Promise<string | null> => {
    try {
      const [monthStr, yearStr] = expiryDate.split('/')
      const expirationMonth = parseInt(monthStr, 10)
      // Openpay expects 2-digit year (01-99)
      const expirationYear = parseInt(yearStr, 10) % 100

      const response = await fetch(`${apiUrl}/payment/tokenize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          card_number: cardNumber.replace(/\s+/g, ''),
          holder_name: cardholderName,
          expiration_month: expirationMonth,
          expiration_year: expirationYear,
          cvv2: cvv
        })
      })

      if (response.ok) {
        const data = await response.json()
        return data.tokenId || data.id
      } else {
        const error = await response.json()
        throw new Error(error.message || 'Error al tokenizar tarjeta')
      }
    } catch (error) {
      throw error
    }
  }

  const handlePayment = async () => {
    if (!cardholderName || !cardNumber || !expiryDate || !cvv) {
      setPaymentStatus({
        status: 'error',
        message: 'Por favor completa todos los campos'
      })
      return
    }

    setPaymentStatus({
      status: 'loading',
      message: 'Procesando pago...'
    })

    try {
      // Paso 1: Generar device session ID
      const deviceSessionId = await generateDeviceSessionId()
      if (!deviceSessionId) {
        throw new Error('No se pudo generar sesión de dispositivo')
      }

      // Paso 2: Tokenizar tarjeta
      const tokenId = await tokenizeCard(
        cardNumber,
        expiryDate,
        cvv,
        cardholderName
      )
      if (!tokenId) {
        throw new Error('No se pudo tokenizar la tarjeta')
      }

      // Paso 3: Enviar al backend solo token + device session
      const response = await fetch(`${apiUrl}/payment/maintenance`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tokenId,
          deviceSessionId,
          cardholderName
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Error al procesar el pago')
      }

      setPaymentStatus({
        status: 'success',
        message: 'Pago realizado exitosamente'
      })

      // Limpiar campos
      setCardholderName('')
      setCardNumber('')
      setExpiryDate('')
      setCvv('')

      // Regresar después de 2 segundos
      setTimeout(() => {
        onBack()
      }, 2000)
    } catch (error) {
      setPaymentStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Error desconocido'
      })
    }
  }

  return (
    <YStack flex={1} backgroundColor='$background'>
      {/* Header */}
      <XStack
        justifyContent='flex-start'
        alignItems='center'
        padding='$4'
        paddingTop='$8'
        backgroundColor='$background'
        borderBottomWidth={1}
        borderBottomColor='$gray5'
        space='$3'
      >
        <Button
          size='$3'
          icon={<ArrowLeft size={18} />}
          onPress={onBack}
          chromeless
        />
        <Text fontSize='$5' fontWeight='bold'>
          Pago de Cuota Mensual
        </Text>
      </XStack>

      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <YStack padding='$4' space='$6' flex={1}>
          {/* User Info */}
          <Card elevate size='$4' bordered padding='$4' space='$3'>
            <YStack space='$2'>
              <Text fontSize='$3' color='$gray11'>
                Usuario
              </Text>
              <Text fontSize='$4' fontWeight='bold'>
                {user?.email}
              </Text>
              {profile?.apartment_unit && (
                <Text fontSize='$3' color='$gray11'>
                  Departamento: {profile.apartment_unit}
                </Text>
              )}
              {profile?.colonia?.nombre && (
                <Text fontSize='$3' color='$gray11'>
                  Colonia: {profile.colonia.nombre}
                </Text>
              )}
            </YStack>
          </Card>

          {/* Amount Summary */}
          <Card elevate size='$4' bordered padding='$4' backgroundColor='$blue2'>
            <YStack space='$2' alignItems='center'>
              <Text fontSize='$3' color='$gray11'>
                Cuota Mensual de Mantenimiento
              </Text>
              <Text fontSize='$8' fontWeight='bold' color='$blue11'>
                ${amountToPay.toFixed(2)}
              </Text>
              <Text fontSize='$2' color='$gray10'>
                {currency}
              </Text>
            </YStack>
          </Card>

          {/* Payment Form */}
          {paymentStatus.status !== 'success' && (
            <YStack space='$3'>
              <Text fontSize='$4' fontWeight='bold'>
                Información de Pago
              </Text>

              <YStack space='$2'>
                <Text fontSize='$3' color='$gray11'>
                  Nombre en la tarjeta
                </Text>
                <Input
                  placeholder='Nombre completo'
                  value={cardholderName}
                  onChangeText={setCardholderName}
                  editable={paymentStatus.status !== 'loading'}
                  placeholderTextColor='$gray8'
                />
              </YStack>

              <YStack space='$2'>
                <Text fontSize='$3' color='$gray11'>
                  Número de Tarjeta
                </Text>
                <Input
                  placeholder='1234 5678 9012 3456'
                  value={cardNumber}
                  onChangeText={setCardNumber}
                  keyboardType='numeric'
                  maxLength={19}
                  editable={paymentStatus.status !== 'loading'}
                  placeholderTextColor='$gray8'
                />
              </YStack>

              <XStack space='$3'>
                <YStack flex={1} space='$2'>
                  <Text fontSize='$3' color='$gray11'>
                    Vencimiento
                  </Text>
                  <Input
                    placeholder='MM/AA'
                    value={expiryDate}
                    onChangeText={setExpiryDate}
                    keyboardType='numeric'
                    maxLength={5}
                    editable={paymentStatus.status !== 'loading'}
                    placeholderTextColor='$gray8'
                  />
                </YStack>
                <YStack flex={1} space='$2'>
                  <Text fontSize='$3' color='$gray11'>
                    CVV
                  </Text>
                  <Input
                    placeholder='123'
                    value={cvv}
                    onChangeText={setCvv}
                    keyboardType='numeric'
                    maxLength={4}
                    editable={paymentStatus.status !== 'loading'}
                    placeholderTextColor='$gray8'
                  />
                </YStack>
              </XStack>

              <Button
                width='100%'
                size='$4'
                theme='green'
                onPress={handlePayment}
                disabled={paymentStatus.status === 'loading'}
                marginTop='$4'
              >
                {paymentStatus.status === 'loading' ? (
                  <Text>Procesando...</Text>
                ) : (
                  <>
                    <CreditCard size={20} />
                    <Text marginLeft='$2'>Realizar Pago</Text>
                  </>
                )}
              </Button>
            </YStack>
          )}

          {/* Status Messages */}
          {paymentStatus.status === 'success' && (
            <YStack
              flex={1}
              justifyContent='center'
              alignItems='center'
              space='$4'
            >
              <CheckCircle size={80} color='$green10' />
              <YStack space='$2' alignItems='center'>
                <Text fontSize='$6' fontWeight='bold' color='$green11'>
                  ¡Pago Exitoso!
                </Text>
                <Text fontSize='$4' color='$gray11' textAlign='center'>
                  Tu cuota de mantenimiento ha sido pagada correctamente
                </Text>
                <Text fontSize='$3' color='$gray10' textAlign='center' marginTop='$2'>
                  Redirigiendo...
                </Text>
              </YStack>
            </YStack>
          )}

          {paymentStatus.status === 'error' && (
            <Card elevate size='$4' bordered padding='$4' backgroundColor='$red2'>
              <YStack space='$2' alignItems='center'>
                <Text fontSize='$4' fontWeight='bold' color='$red11'>
                  Error en el Pago
                </Text>
                <Text fontSize='$3' color='$red10' textAlign='center'>
                  {paymentStatus.message}
                </Text>
                <Button
                  size='$3'
                  theme='red'
                  onPress={() =>
                    setPaymentStatus({
                      status: 'idle',
                      message: ''
                    })
                  }
                  marginTop='$3'
                >
                  Intentar Nuevamente
                </Button>
              </YStack>
            </Card>
          )}

          {/* Disclaimer */}
          <Card elevate size='$3' bordered padding='$3' backgroundColor='$gray2'>
            <Text fontSize='$2' color='$gray11' textAlign='center'>
              Tu información de pago es procesada de forma segura. Nunca compartimos tus datos de tarjeta con terceros.
            </Text>
          </Card>
        </YStack>
      </ScrollView>
    </YStack>
  )
}
