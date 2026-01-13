import React, { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, YStack, Text, Spinner, Circle, XStack, Grid, Card } from 'tamagui'
import { Check, Lock, Unlock, LogOut, RefreshCw } from '@tamagui/lucide-icons'
import { useAuth } from './AuthContext'

interface GateState {
  [key: string]: 'OPEN' | 'CLOSED' | 'OPENING' | 'CLOSING' | 'UNKNOWN'
}

interface GateControlProps {
  apiUrl: string
  authToken: string
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
  gateId: number
): Promise<OpenGateResponse> => {
  const response = await fetch(`${apiUrl}/gate/open`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ gateId })
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
): Promise<GateState> => {
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
  status: string
  apiUrl: string
  authToken: string
  isRevoked: boolean
  onSuccess: () => void
}

const GateCard: React.FC<GateCardProps> = ({
  gateId,
  status,
  apiUrl,
  authToken,
  isRevoked,
  onSuccess
}) => {
  const [optimisticState, setOptimisticState] = useState<
    'idle' | 'loading' | 'success'
  >('idle')

  const openMutation = useMutation({
    mutationFn: () => openGate(apiUrl, authToken, gateId),
    onMutate: () => setOptimisticState('loading'),
    onSuccess: () => {
      setOptimisticState('success')
      onSuccess()
      setTimeout(() => setOptimisticState('idle'), 3000)
    },
    onError: () => setOptimisticState('idle')
  })

  const closeMutation = useMutation({
    mutationFn: () => closeGate(apiUrl, authToken, gateId),
    onMutate: () => setOptimisticState('loading'),
    onSuccess: () => {
      setOptimisticState('success')
      onSuccess()
      setTimeout(() => setOptimisticState('idle'), 3000)
    },
    onError: () => setOptimisticState('idle')
  })

  const getStatusColor = () => {
    switch (status) {
      case 'OPEN':
        return '$green10'
      case 'CLOSED':
        return '$blue10'
      default:
        return '$gray10'
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'OPEN':
        return 'Abierto'
      case 'CLOSED':
        return 'Cerrado'
      case 'OPENING':
        return 'Abriendo...'
      case 'CLOSING':
        return 'Cerrando...'
      default:
        return 'Desconocido'
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
            Portón {gateId}
          </Text>
          <Circle size={60} backgroundColor={getStatusColor()} elevate>
            {status === 'OPEN' ? (
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
            flex={1}
            size='$3'
            theme='green'
            disabled={isRevoked || optimisticState === 'loading'}
            onPress={() => openMutation.mutate()}
          >
            {optimisticState === 'loading' ? (
              <Spinner size='small' color='white' />
            ) : (
              'Abrir'
            )}
          </Button>
          <Button
            flex={1}
            size='$3'
            theme='red'
            disabled={isRevoked || optimisticState === 'loading'}
            onPress={() => closeMutation.mutate()}
          >
            {optimisticState === 'loading' ? (
              <Spinner size='small' color='white' />
            ) : (
              'Cerrar'
            )}
          </Button>
        </XStack>
      </YStack>
    </Card>
  )
}

export const GateControl: React.FC<GateControlProps> = ({
  apiUrl,
  authToken
}) => {
  const { signOut, user, profile } = useAuth()
  const isRevoked = profile?.role === 'revoked'

  const { data: gatesStatus, refetch: refetchGates, isLoading } = useQuery({
    queryKey: ['gatesStatus', authToken],
    queryFn: () => fetchGatesStatus(apiUrl, authToken),
    refetchInterval: 5000 // Refetch every 5 seconds
  })

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
        <YStack space='$1' flex={1}>
          <Text fontSize='$4' fontWeight='600' color='$color'>
            {user?.email}
          </Text>
          {profile?.apartment_unit && (
            <Text fontSize='$3' color='$gray11'>
              {profile.apartment_unit}
            </Text>
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

      {/* Main Content */}
      {isRevoked ? (
        <YStack
          flex={1}
          justifyContent='center'
          alignItems='center'
          padding='$6'
          space='$4'
        >
          <Circle size={100} backgroundColor='$red10' elevate>
            <Lock size={50} color='white' />
          </Circle>
          <YStack space='$2' alignItems='center'>
            <Text fontSize='$6' fontWeight='bold' color='$red11'>
              Acceso Denegado
            </Text>
            <Text fontSize='$4' color='$gray11' textAlign='center'>
              Tu cuenta ha sido suspendida. Contacta al administrador del
              edificio.
            </Text>
          </YStack>
        </YStack>
      ) : (
        <YStack flex={1} padding='$4' space='$4'>
          <Text fontSize='$6' fontWeight='bold' marginBottom='$2'>
            Control de Portones
          </Text>

          {isLoading ? (
            <YStack flex={1} justifyContent='center' alignItems='center'>
              <Spinner size='large' color='$blue10' />
            </YStack>
          ) : (
            <Grid
              columns={2}
              space='$3'
              padding='$2'
              flex={1}
              marginBottom='$4'
            >
              {gatesStatus &&
                Object.entries(gatesStatus).map(([gateId, status]) => (
                  <GateCard
                    key={gateId}
                    gateId={parseInt(gateId)}
                    status={status}
                    apiUrl={apiUrl}
                    authToken={authToken}
                    isRevoked={isRevoked}
                    onSuccess={() => refetchGates()}
                  />
                ))}
            </Grid>
          )}
        </YStack>
      )}
    </YStack>
  )
}
