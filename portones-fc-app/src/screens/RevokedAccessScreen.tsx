import React from 'react'
import { ScrollView } from 'react-native'
import { YStack, Text, Circle, Button, XStack, Card } from 'tamagui'
import { Lock, LogOut, CreditCard, AlertCircle } from '@tamagui/lucide-icons'
import { useAuth } from '../contexts/AuthContext'
import { useQuery } from '@tanstack/react-query'

interface RevokedAccessScreenProps {
  apiUrl: string
  authToken: string
  onNavigateToPayment: () => void
}

export const RevokedAccessScreen: React.FC<RevokedAccessScreenProps> = ({
  apiUrl,
  authToken,
  onNavigateToPayment
}) => {
  const { signOut, user, profile } = useAuth()

  // Query para obtener el estado de pago
  const { data: paymentStatus } = useQuery({
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
    refetchInterval: 60000
  })

  const amountToPay = paymentStatus?.maintenanceAmount ?? profile?.colonia?.maintenance_monthly_amount ?? 500
  const isPaid = paymentStatus?.isPaid ?? false
  const daysUntilPayment = paymentStatus?.daysUntilDue ?? 0
  const adeudoMeses = profile?.house?.adeudos_months ?? 0
  const totalAdeudo = amountToPay * adeudoMeses
  const lastPaymentDate = paymentStatus?.lastPaymentDate 
    ? new Date(paymentStatus.lastPaymentDate) 
    : null
  const nextPaymentDate = paymentStatus?.nextPaymentDue 
    ? new Date(paymentStatus.nextPaymentDue) 
    : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)

  // Debug
  React.useEffect(() => {
    console.log('RevokedAccessScreen Debug:')
    console.log('- profile:', profile)
    console.log('- adeudoMeses:', adeudoMeses)
    console.log('- amountToPay:', amountToPay)
    console.log('- totalAdeudo:', totalAdeudo)
  }, [profile, adeudoMeses, amountToPay, totalAdeudo])

  return (
    <YStack flex={1} backgroundColor='$background'>
      {/* Header */}
      <YStack
        padding='$4'
        paddingTop='$8'
        backgroundColor='$background'
        borderBottomWidth={1}
        borderBottomColor='$gray5'
      >
        <YStack space='$1'>
          <Text fontSize='$4' fontWeight='600' color='$color'>
            {user?.email}
          </Text>
          {profile?.house && (
            <Text fontSize='$3' color='$gray11'>
              {profile.house.street} {profile.house.external_number}
            </Text>
          )}
          {profile?.colonia?.nombre && (
            <Text fontSize='$2' color='$blue10' fontWeight='600'>
              {profile.colonia.nombre}
            </Text>
          )}
        </YStack>
      </YStack>

      {/* Main Content */}
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <YStack padding='$4' space='$4'>
          {/* Alerta de Acceso Suspendido */}
          <Card 
            elevate 
            size='$4' 
            bordered 
            padding='$4' 
            backgroundColor='$red2'
            borderColor='$red7'
          >
            <YStack space='$3' alignItems='center'>
              <Circle size={80} backgroundColor='$red10' elevate>
                <Lock size={40} color='white' />
              </Circle>
              <YStack space='$2' alignItems='center'>
                <Text fontSize='$6' fontWeight='bold' color='$red11'>
                  Acceso Suspendido
                </Text>
                <Text fontSize='$4' color='$red11' textAlign='center'>
                  Tu cuenta ha sido suspendida temporalmente.
                </Text>
                <Text fontSize='$3' color='$gray11' textAlign='center'>
                  Realiza el pago pendiente para reactivar tu acceso.
                </Text>
              </YStack>
            </YStack>
          </Card>

          {/* Monto Total Adeudado */}
          <Card 
            elevate 
            size='$4' 
            bordered 
            padding='$4' 
            backgroundColor='$red3'
            borderColor='$red8'
          >
            <YStack space='$2' alignItems='center'>
              <Text fontSize='$3.5' color='$gray11' fontWeight='600'>
                Deuda Total
              </Text>
              <Text fontSize='$7' fontWeight='bold' color='$red11'>
                ${totalAdeudo.toFixed(2)}
              </Text>
              {adeudoMeses > 0 && (
                <Text fontSize='$3' color='$red10'>
                  {adeudoMeses} {adeudoMeses === 1 ? 'mes' : 'meses'} sin pagar
                </Text>
              )}
            </YStack>
          </Card>

          {/* Desglose de Adeudo */}
          {adeudoMeses > 0 && (
            <Card elevate size='$3' bordered padding='$3' backgroundColor='$gray2'>
              <YStack space='$2'>
                <XStack justifyContent='space-between'>
                  <Text fontSize='$3' color='$gray11'>
                    Cuota Mensual:
                  </Text>
                  <Text fontSize='$3' fontWeight='600' color='$gray12'>
                    ${amountToPay.toFixed(2)} MXN
                  </Text>
                </XStack>
                <XStack justifyContent='space-between'>
                  <Text fontSize='$3' color='$gray11'>
                    Meses adeudados:
                  </Text>
                  <Text fontSize='$3' fontWeight='600' color='$gray12'>
                    {adeudoMeses}
                  </Text>
                </XStack>
                <YStack height={1} backgroundColor='$gray5' width='100%' />
                <XStack justifyContent='space-between'>
                  <Text fontSize='$3.5' fontWeight='bold' color='$gray12'>
                    Total a pagar:
                  </Text>
                  <Text fontSize='$3.5' fontWeight='bold' color='$red11'>
                    ${totalAdeudo.toFixed(2)}
                  </Text>
                </XStack>
              </YStack>
            </Card>
          )}

          {/* Botón de pago */}
          <Button
            width='100%'
            size='$4'
            theme='green'
            onPress={onNavigateToPayment}
            icon={<CreditCard size={20} />}
          >
            Realizar Pago Ahora
          </Button>

          {/* Botón de cerrar sesión */}
          <Button
            width='100%'
            size='$3'
            theme='gray'
            onPress={() => signOut()}
            icon={<LogOut size={18} />}
            chromeless
          >
            Cerrar Sesión
          </Button>
        </YStack>
      </ScrollView>
    </YStack>
  )
}
