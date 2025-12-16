import React, { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, YStack, Text, Spinner, Circle, XStack } from 'tamagui'
import { Check, Lock, Unlock, LogOut } from '@tamagui/lucide-icons'
import { useAuth } from './AuthContext'

interface GateControlProps {
  apiUrl: string
  authToken: string
}

interface OpenGateResponse {
  success: boolean
  message: string
  timestamp: string
}

const openGate = async (
  apiUrl: string,
  authToken: string
): Promise<OpenGateResponse> => {
  const response = await fetch(`${apiUrl}/gate/open`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to open gate')
  }

  return response.json()
}

export const GateControl: React.FC<GateControlProps> = ({
  apiUrl,
  authToken
}) => {
  const { signOut, user, profile } = useAuth()
  const [optimisticState, setOptimisticState] = useState<
    'idle' | 'opening' | 'success'
  >('idle')

  // Check if user is revoked
  const isRevoked = profile?.role === 'revoked'

  const mutation = useMutation({
    mutationFn: () => openGate(apiUrl, authToken),
    onMutate: () => {
      // Optimistic UI: Immediately show opening state
      setOptimisticState('opening')
    },
    onSuccess: (data) => {
      // Show success state
      setOptimisticState('success')

      // Reset to idle after 3 seconds
      setTimeout(() => {
        setOptimisticState('idle')
      }, 3000)
    },
    onError: (error) => {
      // Revert to idle state on error
      setOptimisticState('idle')
      console.error('Failed to open gate:', error)
    }
  })

  const handlePress = () => {
    if (optimisticState === 'idle' && !isRevoked) {
      mutation.mutate()
    }
  }

  const getButtonText = () => {
    switch (optimisticState) {
      case 'opening':
        return 'Abriendo...'
      case 'success':
        return '¡Portón Abierto!'
      default:
        return 'Abrir Portón'
    }
  }

  const getButtonIcon = () => {
    switch (optimisticState) {
      case 'opening':
        return <Spinner size='large' color='white' />
      case 'success':
        return <Check size={32} color='white' />
      default:
        return <Unlock size={32} color='white' />
    }
  }

  const getButtonTheme = () => {
    switch (optimisticState) {
      case 'success':
        return 'green'
      case 'opening':
        return 'blue'
      default:
        return 'active'
    }
  }

  return (
    <YStack flex={1} backgroundColor='$background'>
      {/* Header con Logout */}
      <XStack
        justifyContent='space-between'
        alignItems='center'
        padding='$4'
        paddingTop='$8'
        backgroundColor='$background'
      >
        <YStack space='$1'>
          <Text fontSize='$4' fontWeight='600' color='$color'>
            {user?.email}
          </Text>
          {profile?.apartment_unit && (
            <Text fontSize='$3' color='$gray11'>
              {profile.apartment_unit}
            </Text>
          )}
          <Text fontSize='$2' color='$gray10' textTransform='capitalize'>
            {profile?.role || 'resident'}
          </Text>
        </YStack>
        <Button
          size='$3'
          icon={<LogOut size={18} />}
          onPress={() => signOut()}
          chromeless
        >
          Salir
        </Button>
      </XStack>

      {/* Main Content */}
      <YStack
        flex={1}
        justifyContent='center'
        alignItems='center'
        padding='$6'
        space='$4'
      >
        <YStack space='$3' alignItems='center' marginBottom='$6'>
          <Circle size={80} backgroundColor='$blue10' elevate>
            <Lock size={40} color='white' />
          </Circle>
          <Text fontSize='$8' fontWeight='bold' color='$color'>
            Control de Portón
          </Text>
          <Text fontSize='$4' color='$gray11' textAlign='center'>
            {isRevoked
              ? 'Tu acceso ha sido revocado. Contacta a administración.'
              : 'Presiona el botón para abrir el portón'}
          </Text>
        </YStack>

        {isRevoked ? (
          <YStack
            backgroundColor='$red4'
            padding='$6'
            borderRadius='$6'
            borderWidth={2}
            borderColor='$red8'
            maxWidth={320}
            space='$2'
          >
            <Text
              color='$red11'
              fontSize='$5'
              fontWeight='bold'
              textAlign='center'
            >
              Acceso Denegado
            </Text>
            <Text color='$red11' fontSize='$3' textAlign='center'>
              Tu cuenta ha sido suspendida. Por favor, contacta al administrador
              del edificio.
            </Text>
          </YStack>
        ) : (
          <>
            <Button
              size='$6'
              width={280}
              height={100}
              theme={getButtonTheme()}
              disabled={optimisticState !== 'idle'}
              onPress={handlePress}
              pressStyle={{ scale: 0.95 }}
              animation='bouncy'
              borderRadius='$6'
              elevate
              icon={getButtonIcon()}
              fontSize='$6'
              fontWeight='bold'
              opacity={optimisticState !== 'idle' ? 0.8 : 1}
            >
              {getButtonText()}
            </Button>

            {mutation.isError && (
              <YStack
                backgroundColor='$red4'
                padding='$3'
                borderRadius='$4'
                borderWidth={1}
                borderColor='$red8'
                maxWidth={320}
              >
                <Text color='$red11' fontSize='$3' textAlign='center'>
                  Error:{' '}
                  {mutation.error?.message || 'No se pudo abrir el portón'}
                </Text>
              </YStack>
            )}

            {optimisticState === 'success' && (
              <YStack
                backgroundColor='$green4'
                padding='$3'
                borderRadius='$4'
                borderWidth={1}
                borderColor='$green8'
                maxWidth={320}
              >
                <Text color='$green11' fontSize='$3' textAlign='center'>
                  Comando enviado exitosamente
                </Text>
              </YStack>
            )}
          </>
        )}
      </YStack>
    </YStack>
  )
}
