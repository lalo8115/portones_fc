import React, { useMemo, useState } from 'react'
import { ScrollView, RefreshControl } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { YStack, XStack, Text, Spinner, Card, Circle, Button } from 'tamagui'
import { ChevronLeft, CreditCard, AlertCircle, CheckCircle2 } from '@tamagui/lucide-icons'

interface AdminPaymentReportScreenProps {
  apiUrl: string
  authToken: string
  onBack: () => void
}

interface PaymentHouseRecord {
  house_id: string
  address: string
  adeudos_months: number
  last_payment_date?: string | null
  last_payment_amount?: number | null
}

interface MaintenanceReportResponse {
  period: {
    month: number
    year: number
  }
  paid: PaymentHouseRecord[]
  unpaid: PaymentHouseRecord[]
  totals: {
    total: number
    paid: number
    unpaid: number
  }
}

const fetchMaintenanceReport = async (
  apiUrl: string,
  authToken: string
): Promise<MaintenanceReportResponse> => {
  const response = await fetch(`${apiUrl}/admin/maintenance-report`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error('Failed to fetch maintenance report')
  }

  return response.json()
}

export const AdminPaymentReportScreen: React.FC<AdminPaymentReportScreenProps> = ({
  apiUrl,
  authToken,
  onBack
}) => {
  const [refreshing, setRefreshing] = useState(false)
  const [view, setView] = useState<'paid' | 'unpaid'>('unpaid')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['maintenanceReport'],
    queryFn: () => fetchMaintenanceReport(apiUrl, authToken),
    refetchInterval: 60000
  })

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  const periodLabel = useMemo(() => {
    if (!data?.period) return ''
    const date = new Date(data.period.year, data.period.month - 1, 1)
    return date.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
  }, [data?.period])

  const records = view === 'paid' ? data?.paid ?? [] : data?.unpaid ?? []

  const formatDate = (value?: string | null) => {
    if (!value) return 'Sin fecha'
    return new Date(value).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  return (
    <YStack flex={1} backgroundColor='$background'>
      <XStack
        alignItems='center'
        space='$3'
        padding='$4'
        paddingTop='$8'
        backgroundColor='$background'
        borderBottomWidth={1}
        borderBottomColor='$gray5'
      >
        <Button
          size='$3'
          chromeless
          icon={<ChevronLeft size={24} />}
          onPress={onBack}
        />
        <YStack flex={1}>
          <Text fontSize='$6' fontWeight='bold'>
            Estado de mantenimiento
          </Text>
          {periodLabel && (
            <Text fontSize='$3' color='$gray11'>
              {periodLabel}
            </Text>
          )}
        </YStack>
      </XStack>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {isLoading ? (
          <YStack flex={1} justifyContent='center' alignItems='center' paddingVertical='$10'>
            <Spinner size='large' color='$blue10' />
            <Text fontSize='$3' color='$gray11' marginTop='$3'>
              Cargando reporte...
            </Text>
          </YStack>
        ) : (
          <YStack space='$4'>
            <XStack space='$3'>
              <Card elevate size='$3' bordered padding='$3' flex={1} backgroundColor='$blue2'>
                <YStack space='$1'>
                  <Text fontSize='$2' color='$gray11'>
                    Total casas
                  </Text>
                  <Text fontSize='$5' fontWeight='800'>
                    {data?.totals.total ?? 0}
                  </Text>
                </YStack>
              </Card>
              <Card elevate size='$3' bordered padding='$3' flex={1} backgroundColor='$green2'>
                <YStack space='$1'>
                  <Text fontSize='$2' color='$gray11'>
                    Pagadas
                  </Text>
                  <Text fontSize='$5' fontWeight='800' color='$green11'>
                    {data?.totals.paid ?? 0}
                  </Text>
                </YStack>
              </Card>
              <Card elevate size='$3' bordered padding='$3' flex={1} backgroundColor='$red2'>
                <YStack space='$1'>
                  <Text fontSize='$2' color='$gray11'>
                    Pendientes
                  </Text>
                  <Text fontSize='$5' fontWeight='800' color='$red11'>
                    {data?.totals.unpaid ?? 0}
                  </Text>
                </YStack>
              </Card>
            </XStack>

            <XStack space='$2'>
              <Button
                size='$3'
                flex={1}
                theme={view === 'unpaid' ? 'red' : undefined}
                variant={view === 'unpaid' ? undefined : 'outlined'}
                onPress={() => setView('unpaid')}
              >
                Pendientes
              </Button>
              <Button
                size='$3'
                flex={1}
                theme={view === 'paid' ? 'green' : undefined}
                variant={view === 'paid' ? undefined : 'outlined'}
                onPress={() => setView('paid')}
              >
                Pagadas
              </Button>
            </XStack>

            {records.length === 0 ? (
              <YStack flex={1} justifyContent='center' alignItems='center' padding='$6' space='$3'>
                <Circle size={90} backgroundColor='$gray5' elevate>
                  {view === 'paid' ? (
                    <CheckCircle2 size={40} color='$gray10' />
                  ) : (
                    <AlertCircle size={40} color='$gray10' />
                  )}
                </Circle>
                <Text fontSize='$5' fontWeight='bold' color='$gray12'>
                  Sin registros
                </Text>
                <Text fontSize='$3' color='$gray10' textAlign='center'>
                  {view === 'paid'
                    ? 'No hay pagos registrados en este periodo.'
                    : 'No hay casas pendientes en este periodo.'}
                </Text>
              </YStack>
            ) : (
              <YStack space='$3'>
                {records.map((house) => (
                  <Card
                    key={house.house_id}
                    elevate
                    size='$4'
                    bordered
                    padding='$4'
                    backgroundColor={view === 'paid' ? '$green2' : '$red2'}
                    borderColor={view === 'paid' ? '$green7' : '$red7'}
                  >
                    <XStack space='$3' alignItems='center'>
                      <Circle size={48} backgroundColor={view === 'paid' ? '$green10' : '$red10'}>
                        {view === 'paid' ? (
                          <CheckCircle2 size={22} color='white' />
                        ) : (
                          <AlertCircle size={22} color='white' />
                        )}
                      </Circle>
                      <YStack flex={1} space='$1'>
                        <Text fontSize='$4' fontWeight='700'>
                          {house.address}
                        </Text>
                        {view === 'paid' ? (
                          <XStack space='$2' alignItems='center'>
                            <CreditCard size={16} color='$green11' />
                            <Text fontSize='$2.5' color='$green11'>
                              {house.last_payment_amount
                                ? `$${house.last_payment_amount.toFixed(2)} · ${formatDate(house.last_payment_date)}`
                                : `Pago registrado · ${formatDate(house.last_payment_date)}`}
                            </Text>
                          </XStack>
                        ) : (
                          <Text fontSize='$2.5' color='$red11'>
                            {house.adeudos_months > 0
                              ? `${house.adeudos_months} mes(es) de adeudo`
                              : 'Pendiente del periodo actual'}
                          </Text>
                        )}
                      </YStack>
                    </XStack>
                  </Card>
                ))}
              </YStack>
            )}
          </YStack>
        )}
      </ScrollView>
    </YStack>
  )
}
