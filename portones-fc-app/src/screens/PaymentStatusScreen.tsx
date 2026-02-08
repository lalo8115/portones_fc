import React, { useState, useEffect } from 'react'
import { ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { Button, Card, Circle, Text, XStack, YStack } from 'tamagui'
import { CreditCard, ChevronDown, ChevronUp } from '@tamagui/lucide-icons'
import { useAuth } from '../contexts/AuthContext'

interface PaymentHistory {
  id: string
  amount: number
  date: string
  status: string
  method: string
  period_month?: number
  period_year?: number
}

interface PaymentStatusData {
  maintenanceAmount?: number
  isPaid?: boolean
  daysUntilDue?: number
  lastPaymentDate?: string
  nextPaymentDue?: string
}

interface PaymentStatusScreenProps {
  paymentStatus?: PaymentStatusData
  onBack: () => void
  onNavigateToPayment?: () => void
}

export const PaymentStatusScreen: React.FC<PaymentStatusScreenProps> = ({
  paymentStatus,
  onBack,
  onNavigateToPayment
}) => {
  const { profile, token } = useAuth()
  const [isExpanded, setIsExpanded] = useState(false)
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistory[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  useEffect(() => {
    if (isExpanded) {
      fetchPaymentHistory()
    }
  }, [isExpanded])

  const fetchPaymentHistory = async () => {
    try {
      setIsLoadingHistory(true)
      // Ajusta la URL según tu configuración (puede ser localhost:3000, tu dominio en producción, etc.)
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3000'
      const response = await fetch(`${apiUrl}/payment/history?limit=20`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        console.error('Error fetching payment history:', response.statusText)
        setPaymentHistory([])
        return
      }

      const data = await response.json()
      setPaymentHistory(data.payments || [])
    } catch (error) {
      console.error('Error fetching payment history:', error)
      setPaymentHistory([])
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const amountToPay =
    paymentStatus?.maintenanceAmount ??
    profile?.colonia?.maintenance_monthly_amount ??
    500
  const isPaid = paymentStatus?.isPaid ?? false
  const daysUntilPayment = paymentStatus?.daysUntilDue ?? 0
  const lastPaymentDate = paymentStatus?.lastPaymentDate
    ? new Date(paymentStatus.lastPaymentDate)
    : null
  const nextPaymentDate = paymentStatus?.nextPaymentDue
    ? new Date(paymentStatus.nextPaymentDue)
    : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack padding='$4' paddingBottom='$6' space='$4' flex={1}>
        <XStack alignItems='center' space='$2' marginBottom='$2'>
        <Button
          size='$3'
          chromeless
          icon={<Text fontSize='$5'>←</Text>}
          onPress={onBack}
        />
        <Text fontSize='$7' fontWeight='bold'>
          Estado de Pago
        </Text>
        </XStack>

        <Pressable onPress={() => setIsExpanded(!isExpanded)}>
          <Card
            elevate
            size='$3.5'
            bordered
            padding='$3.5'
            backgroundColor={!isPaid ? '$red2' : '$green2'}
          >
            <YStack space='$4.5' alignItems='center'>
              <Circle
                size={80}
                backgroundColor={!isPaid ? '$red10' : '$green10'}
                elevate
              >
                <Text fontSize='$10' color='white'>
                {!isPaid ? '!' : '✓'}
              </Text>
            </Circle>
            <Text
              fontSize='$8'
              fontWeight='bold'
              color={!isPaid ? '$red11' : '$green11'}
            >
              {!isPaid ? 'Pago Pendiente' : 'Pago al Corriente'}
            </Text>
            <Text fontSize='$6' color='$gray11' textAlign='center'>
              {!isPaid
                ? 'Tu pago mensual está pendiente'
                : 'Haz click para ver los estados de cuenta'}
            </Text>
            <XStack marginTop='$2' alignItems='center' space='$2'>
              <Text fontSize='$4' color='$gray10'>
                {isExpanded ? 'Ocultar' : 'Ver'} historial de pagos
              </Text>
              {isExpanded ? (
                <ChevronUp size={20} color='$gray10' />
              ) : (
                <ChevronDown size={20} color='$gray10' />
              )}
            </XStack>
          </YStack>
        </Card>
        </Pressable>

        {isExpanded && (
          <Card elevate size='$3.5' bordered padding='$3.5' backgroundColor='$gray1'>
            <YStack space='$3'>
              <Text fontSize='$6' fontWeight='bold'>
                Historial de Pagos
              </Text>
              {isLoadingHistory ? (
                <YStack alignItems='center' justifyContent='center' padding='$4'>
                  <ActivityIndicator size='large' />
                  <Text marginTop='$2' color='$gray11'>
                    Cargando historial...
                  </Text>
                </YStack>
              ) : paymentHistory.length > 0 ? (
                paymentHistory.map((payment, index) => {
                  const paymentDate = new Date(payment.date)
                  return (
                    <YStack
                      key={payment.id}
                      space='$2'
                      paddingVertical='$2.5'
                      borderBottomWidth={
                        index < paymentHistory.length - 1 ? 1 : 0
                      }
                      borderColor='$gray4'
                    >
                      <XStack justifyContent='space-between' alignItems='center'>
                        <YStack space='$1' flex={1}>
                          <Text fontSize='$4' fontWeight='600'>
                            ${payment.amount.toFixed(2)} MXN
                          </Text>
                          <Text fontSize='$3' color='$gray11'>
                            {payment.method}
                          </Text>
                        </YStack>
                        <YStack space='$1' alignItems='flex-end'>
                          <Text fontSize='$3' color='$green11' fontWeight='600'>
                            {payment.status}
                          </Text>
                          <Text fontSize='$3' color='$gray10'>
                            {paymentDate.toLocaleDateString('es-MX', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </Text>
                        </YStack>
                      </XStack>
                    </YStack>
                  )
                })
              ) : (
                <Text fontSize='$4' color='$gray10' textAlign='center' padding='$4'>
                  No hay pagos registrados
                </Text>
              )}
            </YStack>
          </Card>
        )}

        <Card elevate size='$3.5' bordered padding='$3.5' backgroundColor='$blue2'>
          <YStack space='$2.5'>
            <YStack space='$1'>
              <Text fontSize='$3' color='$gray11'>
              Cuota Mensual
            </Text>
            <Text fontSize='$7' fontWeight='bold' color='$blue11'>
              ${amountToPay.toFixed(2)} MXN
            </Text>
          </YStack>
          <YStack height={1} backgroundColor='$gray5' width='100%' />
          <XStack justifyContent='space-between'>
            <YStack space='$1'>
              <Text fontSize='$3' color='$gray10'>
                Último Pago
              </Text>
              <Text fontSize='$3.5' fontWeight='600' color='$gray12'>
                {lastPaymentDate
                  ? lastPaymentDate.toLocaleDateString('es-MX', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    })
                  : 'Sin pagos'}
              </Text>
            </YStack>
            <YStack space='$1' alignItems='flex-end'>
              <Text fontSize='$3' color='$gray10'>
                Próximo Pago
              </Text>
              <Text fontSize='$3.5' fontWeight='600' color='$gray12'>
                {nextPaymentDate.toLocaleDateString('es-MX', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                })}
              </Text>
            </YStack>
          </XStack>
        </YStack>
      </Card>

        <Card elevate size='$3.5' bordered padding='$3.5'>
          <XStack space='$2.5' alignItems='center'>
            <Circle size={55} backgroundColor='$orange10' elevate>
              <Text fontSize='$5' fontWeight='bold' color='white'>
              {daysUntilPayment}
            </Text>
          </Circle>
          <YStack flex={1}>
            <Text fontSize='$4' fontWeight='600'>
              {daysUntilPayment === 1 ? 'Día restante' : 'Días restantes'}
            </Text>
            <Text fontSize='$3' color='$gray11'>
              Hasta el próximo periodo de pago
            </Text>
          </YStack>
        </XStack>
      </Card>

        {profile?.colonia?.nombre && (
          <Card elevate size='$2.5' bordered padding='$2.5' backgroundColor='$gray2'>
            <XStack space='$3' justifyContent='space-between'>
              <YStack space='$1' flex={1}>
                <Text fontSize='$3' color='$gray11'>
                Colonia
              </Text>
                <Text fontSize='$4' fontWeight='600'>
                {profile.colonia.nombre}
              </Text>
            </YStack>
            {profile?.house && (
              <YStack space='$1' alignItems='flex-end'>
                <Text fontSize='$3' color='$gray11'>
                  Domicilio
                </Text>
                <Text fontSize='$4' fontWeight='600'>
                  {profile.house.street} {profile.house.external_number}
                </Text>
              </YStack>
            )}
          </XStack>
        </Card>
      )}

        {!isPaid && (
          <Button width='100%' size='$3.5' theme='green' onPress={onNavigateToPayment}>
            <CreditCard size={19} />
            <Text marginLeft='$2'>Realizar Pago Ahora</Text>
          </Button>
        )}
      </YStack>
    </ScrollView>
  )
}
