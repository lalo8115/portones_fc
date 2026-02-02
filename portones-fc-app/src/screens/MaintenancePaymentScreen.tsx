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
  const adeudoMeses = profile?.adeudo_meses ?? 0
  const totalAdeudo = amountToPay * adeudoMeses

  // Función para formatear número de tarjeta (xxxx xxxx xxxx xxxx)
  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\s+/g, '')
    const formatted = cleaned.replace(/(\d{4})(?=\d)/g, '$1 ')
    return formatted.slice(0, 19) // Máximo 16 dígitos + 3 espacios
  }

  // Función para formatear fecha de expiración (xx/xx)
  const formatExpiryDate = (value: string) => {
    const cleaned = value.replace(/\D/g, '')
    if (cleaned.length <= 2) {
      return cleaned
    }
    return cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4)
  }

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

      const payload = {
        card_number: cardNumber.replace(/\s+/g, ''),
        holder_name: cardholderName,
        expiration_month: expirationMonth,
        expiration_year: expirationYear,
        cvv2: cvv
      }

      console.log('Enviando payload a tokenize:', payload)

      const response = await fetch(`${apiUrl}/payment/tokenize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()
      console.log('Respuesta de tokenize:', data)

      if (response.ok) {
        return data.tokenId || data.id
      } else {
        throw new Error(data.message || 'Error al tokenizar tarjeta')
      }
    } catch (error) {
      console.error('Error en tokenizeCard:', error)
      throw error
    }
  }

  const handlePayment = async () => {
    // Validar que todos los campos estén completos
    if (!cardholderName || !cardholderName.trim()) {
      setPaymentStatus({
        status: 'error',
        message: 'Por favor ingresa el nombre en la tarjeta'
      })
      return
    }

    if (!cardNumber || cardNumber.replace(/\s+/g, '').length < 13) {
      setPaymentStatus({
        status: 'error',
        message: 'Por favor ingresa un número de tarjeta válido'
      })
      return
    }

    if (!expiryDate || !expiryDate.includes('/') || expiryDate.length < 5) {
      setPaymentStatus({
        status: 'error',
        message: 'Por favor ingresa la fecha de vencimiento en formato MM/AA'
      })
      return
    }

    if (!cvv || cvv.length < 3) {
      setPaymentStatus({
        status: 'error',
        message: 'Por favor ingresa un CVV válido'
      })
      return
    }

    setPaymentStatus({
      status: 'loading',
      message: 'Procesando pago...'
    })

    try {
      // Paso 1: Generar device session ID
      console.log('Paso 1: Generando device session ID')
      const deviceSessionId = await generateDeviceSessionId()
      if (!deviceSessionId) {
        throw new Error('No se pudo generar sesión de dispositivo')
      }
      console.log('Device session ID generado:', deviceSessionId)

      // Paso 2: Tokenizar tarjeta
      console.log('Paso 2: Tokenizando tarjeta')
      const tokenId = await tokenizeCard(
        cardNumber,
        expiryDate,
        cvv,
        cardholderName
      )
      if (!tokenId) {
        throw new Error('No se pudo tokenizar la tarjeta')
      }
      console.log('Token ID obtenido:', tokenId)

      // Paso 3: Enviar al backend solo token + device session + amount
      console.log('Paso 3: Enviando pago al backend')
      const response = await fetch(`${apiUrl}/payment/maintenance`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tokenId,
          deviceSessionId,
          cardholderName,
          amount: totalAdeudo
        })
      })

      if (!response.ok) {
        const error = await response.json()
        console.error('Error en respuesta de pago:', error)
        throw new Error(error.message || 'Error al procesar el pago')
      }

      const paymentResult = await response.json()
      console.log('Pago procesado exitosamente:', paymentResult)

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
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
      console.error('Error en handlePayment:', errorMessage, error)
      setPaymentStatus({
        status: 'error',
        message: errorMessage
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
          <Card elevate size='$4' bordered padding='$4' backgroundColor={adeudoMeses > 0 ? '$red2' : '$blue2'}>
            <YStack space='$2' alignItems='center'>
              <Text fontSize='$3' color='$gray11'>
                {adeudoMeses > 0 ? 'Monto a Pagar' : 'Cuota Mensual de Mantenimiento'}
              </Text>
              <Text fontSize='$8' fontWeight='bold' color={adeudoMeses > 0 ? '$red11' : '$blue11'}>
                ${totalAdeudo.toFixed(2)}
              </Text>
              {adeudoMeses > 0 && (
                <Text fontSize='$2' color='$gray10' marginTop='$2'>
                  {adeudoMeses} meses × ${amountToPay.toFixed(2)}
                </Text>
              )}
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
                  onChangeText={(value) => setCardNumber(formatCardNumber(value))}
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
                    onChangeText={(value) => setExpiryDate(formatExpiryDate(value))}
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
