import React, { useState } from 'react'
import { ScrollView, RefreshControl } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { YStack, XStack, Text, Spinner, Card, Circle, Button } from 'tamagui'
import { Clock, ChevronLeft, LogIn, LogOut as LogOutIcon, Calendar } from '@tamagui/lucide-icons'
import { useAuth } from '../contexts/AuthContext'

interface AccessRecord {
  id: string
  gate_id: number
  gate_name: string
  gate_type: string
  user_id: string
  user_email: string | null
  apartment_unit: string | null
  action: 'OPEN' | 'CLOSE'
  timestamp: string
  method: 'APP' | 'QR' | 'MANUAL' | 'AUTOMATIC' | string
  status?: string
}

interface AccessHistoryResponse {
  records: AccessRecord[]
  total: number
}

interface AccessHistoryScreenProps {
  apiUrl: string
  onBack: () => void
}

const fetchAccessHistory = async (
  apiUrl: string,
  getToken: () => Promise<string | null>,
  limit: number = 50
): Promise<AccessHistoryResponse> => {
  const authToken = await getToken()
  if (!authToken) {
    throw new Error('No authentication token available')
  }

  const response = await fetch(`${apiUrl}/access/history?limit=${limit}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error('Failed to fetch access history')
  }

  return response.json()
}

export const AccessHistoryScreen: React.FC<AccessHistoryScreenProps> = ({
  apiUrl,
  onBack
}) => {
  const [refreshing, setRefreshing] = useState(false)
  const { getToken } = useAuth()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['accessHistory'],
    queryFn: () => fetchAccessHistory(apiUrl, getToken),
    refetchInterval: 30000 // Refetch cada 30 segundos
  })

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (seconds < 60) {
      return 'Hace un momento'
    } else if (minutes < 60) {
      return `Hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`
    } else if (hours < 24) {
      return `Hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`
    } else if (days < 7) {
      return `Hace ${days} ${days === 1 ? 'día' : 'días'}`
    } else {
      return date.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  }

  const formatFullDate = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString('es-MX', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const getActionColor = (action: string) => {
    return action === 'OPEN' ? '$green10' : '$red10'
  }

  const getActionIcon = (action: string) => {
    return action === 'OPEN' ? LogIn : LogOutIcon
  }

  const getActionText = (action: string) => {
    return action === 'OPEN' ? 'Abierto' : 'Cerrado'
  }

  const getMethodText = (method?: string) => {
    if (!method) return '📱 App'
    switch (method) {
      case 'APP':
        return '📱 App'
      case 'QR':
        return '🔲 QR Code'
      case 'MANUAL':
        return '🔧 Manual'
      case 'AUTOMATIC':
        return '⚙️ Automático'
      default:
        return method
    }
  }

  const getGateTypeText = (type: string) => {
    switch (type) {
      case 'ENTRADA':
        return 'Entrada'
      case 'SALIDA':
        return 'Salida'
      default:
        return type
    }
  }

  // Agrupar registros por fecha
  const groupedRecords = React.useMemo(() => {
    if (!data?.records) return {}

    return data.records.reduce((acc: Record<string, AccessRecord[]>, record) => {
      const date = new Date(record.timestamp).toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      })
      
      if (!acc[date]) {
        acc[date] = []
      }
      
      acc[date].push(record)
      return acc
    }, {})
  }, [data?.records])

  return (
    <YStack flex={1} backgroundColor='$background'>
      {/* Header */}
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
            Historial de Accesos
          </Text>
          {data?.total !== undefined && (
            <Text fontSize='$3' color='$gray11'>
              {data.total} {data.total === 1 ? 'registro' : 'registros'}
            </Text>
          )}
        </YStack>
      </XStack>

      {/* Content */}
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
              Cargando historial...
            </Text>
          </YStack>
        ) : !data?.records || data.records.length === 0 ? (
          <YStack 
            flex={1} 
            justifyContent='center' 
            alignItems='center' 
            padding='$6'
            space='$4'
          >
            <Circle size={100} backgroundColor='$gray5' elevate>
              <Clock size={50} color='$gray10' />
            </Circle>
            <YStack space='$2' alignItems='center'>
              <Text fontSize='$6' fontWeight='bold' color='$gray12'>
                Sin Historial
              </Text>
              <Text fontSize='$4' color='$gray11' textAlign='center'>
                No hay registros de acceso disponibles
              </Text>
              <Text fontSize='$3' color='$gray10' textAlign='center' marginTop='$2'>
                Los accesos a los portones aparecerán aquí
              </Text>
            </YStack>
          </YStack>
        ) : (
          <YStack space='$4'>
            {Object.entries(groupedRecords).map(([date, records]) => (
              <YStack key={date} space='$2'>
                {/* Separador de fecha */}
                <XStack alignItems='center' space='$2' paddingVertical='$2'>
                  <Calendar size={16} color='$gray11' />
                  <Text fontSize='$3' fontWeight='600' color='$gray11'>
                    {date}
                  </Text>
                  <YStack flex={1} height={1} backgroundColor='$gray5' />
                </XStack>

                {/* Registros del día */}
                {records.map((record) => {
                  const ActionIcon = getActionIcon(record.action)
                  
                  return (
                    <Card
                      key={record.id}
                      elevate
                      size='$3'
                      bordered
                      padding='$3'
                    >
                      <XStack space='$3' alignItems='center'>
                        {/* Icono de acción */}
                        <Circle 
                          size={45} 
                          backgroundColor={getActionColor(record.action)} 
                          elevate
                        >
                          <ActionIcon size={22} color='white' />
                        </Circle>

                        {/* Información del registro */}
                        <YStack flex={1} space='$1'>
                          <XStack justifyContent='space-between' alignItems='center'>
                            <Text fontSize='$4' fontWeight='600'>
                              {record.gate_name}
                            </Text>
                            <Text 
                              fontSize='$2' 
                              color={getActionColor(record.action)}
                              fontWeight='600'
                            >
                              {getActionText(record.action)}
                            </Text>
                          </XStack>

                          <Text fontSize='$2' color='$gray11'>
                            {getGateTypeText(record.gate_type)} • {getMethodText(record.method)}
                          </Text>

                          {record.apartment_unit && (
                            <Text fontSize='$2' color='$gray10'>
                              Depto. {record.apartment_unit}
                            </Text>
                          )}

                          <XStack alignItems='center' space='$1' marginTop='$1'>
                            <Clock size={12} color='$gray10' />
                            <Text fontSize='$2' color='$gray10'>
                              {formatDate(record.timestamp)}
                            </Text>
                          </XStack>
                        </YStack>
                      </XStack>
                    </Card>
                  )
                })}
              </YStack>
            ))}
          </YStack>
        )}
      </ScrollView>
    </YStack>
  )
}
