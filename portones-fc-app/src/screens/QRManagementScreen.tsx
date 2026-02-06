import React, { useState } from 'react'
import { ScrollView, RefreshControl } from 'react-native'
import { YStack, Text, Button, Card, XStack, Circle, Spinner, Dialog } from 'tamagui'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Users, Clock, CheckCircle, AlertCircle, Ban, Trash2 } from '@tamagui/lucide-icons'

interface QRManagementScreenProps {
  apiUrl: string
  authToken: string
  onBack: () => void
}

export const QRManagementScreen: React.FC<QRManagementScreenProps> = ({
  apiUrl,
  authToken,
  onBack
}) => {
  const queryClient = useQueryClient()

  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showResultDialog, setShowResultDialog] = useState(false)
  const [selectedQR, setSelectedQR] = useState<{ id: string; name: string } | null>(null)
  const [resultMessage, setResultMessage] = useState({ success: true, message: '' })

  // Fetch QR codes list
  const { data, isLoading, refetch, isRefetching } = useQuery({
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
        throw new Error('Failed to fetch QR codes')
      }

      return response.json()
    }
  })

  // Revoke mutation (now deletes from history)
  const revokeMutation = useMutation({
    mutationFn: async (qrId: string) => {
      console.log('🔍 Deleting QR:', { qrId, apiUrl, hasToken: !!authToken })
      
      const response = await fetch(`${apiUrl}/qr/revoke`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ qrId })
      })
      
      console.log('📡 Response status:', response.status)

      if (!response.ok) {
        const error = await response.json()
        console.error('❌ Delete failed:', error)
        throw new Error(error.message || 'Failed to delete QR code')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qrCodes'] })
      setResultMessage({ success: true, message: 'QR borrado correctamente del historial' })
      setShowResultDialog(true)
      setShowDeleteDialog(false)
    },
    onError: (error: Error) => {
      setResultMessage({ success: false, message: error.message || 'No se pudo borrar el QR' })
      setShowResultDialog(true)
      setShowDeleteDialog(false)
    }
  })

  const handleDelete = (qrId: string, visitorName: string) => {
    setSelectedQR({ id: qrId, name: visitorName })
    setShowDeleteDialog(true)
  }

  const confirmDelete = () => {
    if (selectedQR) {
      revokeMutation.mutate(selectedQR.id)
    }
  }

  const qrCodes = data?.qrCodes || []

  // Group QRs by status
  const activeQRs = qrCodes.filter((qr: any) => qr.effectiveStatus === 'active')
  const expiredQRs = qrCodes.filter((qr: any) => 
    qr.effectiveStatus === 'expired' || qr.effectiveStatus === 'completed'
  )
  const revokedQRs = qrCodes.filter((qr: any) => qr.effectiveStatus === 'revoked')

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '$green10'
      case 'expired': return '$orange10'
      case 'completed': return '$blue10'
      case 'revoked': return '$red10'
      default: return '$gray10'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle size={20} color='white' />
      case 'expired': return <Clock size={20} color='white' />
      case 'completed': return <CheckCircle size={20} color='white' />
      case 'revoked': return <Ban size={20} color='white' />
      default: return <AlertCircle size={20} color='white' />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Activo'
      case 'expired': return 'Expirado'
      case 'completed': return 'Completado'
      case 'revoked': return 'Revocado'
      default: return status
    }
  }

  const renderQRCard = (qr: any) => {
    const isActive = qr.effectiveStatus === 'active'
    
    return (
      <Card
        key={qr.id}
        elevate
        size='$4'
        bordered
        padding='$4'
        marginBottom='$3'
        opacity={isActive ? 1 : 0.7}
      >
        <YStack space='$3'>
          {/* Header */}
          <XStack justifyContent='space-between' alignItems='center'>
            <YStack flex={1}>
              <Text fontSize='$5' fontWeight='bold'>
                {qr.invitado || 'Sin nombre'}
              </Text>
              <Text fontSize='$2' color='$gray11'>
                {qr.policyDescription}
              </Text>
            </YStack>
            <Circle size={40} backgroundColor={getStatusColor(qr.effectiveStatus)} elevate>
              {getStatusIcon(qr.effectiveStatus)}
            </Circle>
          </XStack>

          {/* QR Code */}
          <Card backgroundColor='$gray3' padding='$3'>
            <XStack justifyContent='space-between' alignItems='center'>
              <YStack>
                <Text fontSize='$2' color='$gray11'>Código QR</Text>
                <Text fontSize='$6' fontWeight='bold' letterSpacing={2}>
                  {qr.short_code}
                </Text>
              </YStack>
              <Card 
                size='$2' 
                backgroundColor={getStatusColor(qr.effectiveStatus)} 
                paddingHorizontal='$2' 
                paddingVertical='$1'
              >
                <Text fontSize='$2' color='white' fontWeight='600'>
                  {getStatusText(qr.effectiveStatus)}
                </Text>
              </Card>
            </XStack>
          </Card>

          {/* Stats */}
          <XStack space='$2'>
            <Card flex={1} backgroundColor='$gray2' padding='$2' alignItems='center'>
              <Text fontSize='$1' color='$gray11'>Visitas usadas</Text>
              <Text fontSize='$4' fontWeight='bold'>
                {qr.usedVisits} / {qr.totalVisits}
              </Text>
            </Card>
            <Card flex={1} backgroundColor='$gray2' padding='$2' alignItems='center'>
              <Text fontSize='$1' color='$gray11'>Restantes</Text>
              <Text fontSize='$4' fontWeight='bold' color={qr.remainingVisits > 0 ? '$green10' : '$gray10'}>
                {qr.remainingVisits}
              </Text>
            </Card>
            {qr.isVisitorInside && isActive && (
              <Card flex={1} backgroundColor='$orange2' padding='$2' alignItems='center'>
                <Text fontSize='$1' color='$orange11'>Estado</Text>
                <Text fontSize='$3' fontWeight='bold' color='$orange11'>
                  ADENTRO
                </Text>
              </Card>
            )}
          </XStack>

          {/* Expiration */}
          <XStack justifyContent='space-between' alignItems='center'>
            <YStack>
              <Text fontSize='$2' color='$gray11'>
                Expira: {new Date(qr.expires_at).toLocaleString('es-MX', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Text>
              <Text fontSize='$1' color='$gray10'>
                Creado: {new Date(qr.created_at).toLocaleString('es-MX', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Text>
            </YStack>
          </XStack>

          {/* Actions */}
          {isActive && (
            <Button
              size='$3'
              theme='red'
              onPress={() => handleDelete(qr.id, qr.invitado)}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? (
                <Spinner size='small' color='white' />
              ) : (
                <>
                  <Trash2 size={16} />
                  <Text color='white' marginLeft='$2'>Remover Acceso</Text>
                </>
              )}
            </Button>
          )}
        </YStack>
      </Card>
    )
  }

  return (
    <YStack flex={1} backgroundColor='$background'>
      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && (
        <YStack
          position='absolute'
          top={0}
          left={0}
          right={0}
          bottom={0}
          backgroundColor='rgba(0,0,0,0.5)'
          zIndex={1000}
          justifyContent='center'
          alignItems='center'
          padding='$4'
        >
          <Card
            elevate
            size='$4'
            bordered
            padding='$4'
            space='$3'
            width='90%'
            maxWidth={400}
            backgroundColor='$background'
            animation='quick'
            scale={0.95}
            opacity={showDeleteDialog ? 1 : 0}
          >
            <YStack space='$3'>
              <XStack space='$2' alignItems='center'>
                <Circle size={40} backgroundColor='$red9'>
                  <Trash2 size={20} color='white' />
                </Circle>
                <YStack flex={1}>
                  <Text fontSize='$6' fontWeight='bold'>Borrar QR</Text>
                  <Text fontSize='$3' color='$gray11'>Esta acción no se puede deshacer</Text>
                </YStack>
              </XStack>

              <Text fontSize='$4'>
                ¿Estás seguro de borrar el acceso de{' '}
                <Text fontWeight='bold'>{selectedQR?.name || 'este visitante'}</Text>?
              </Text>

              <Text fontSize='$3' color='$yellow10'>
                El QR desaparecerá del historial y ya no funcionará en la caseta.
              </Text>

              <XStack space='$2' marginTop='$2'>
                <Button
                  flex={1}
                  size='$4'
                  onPress={() => setShowDeleteDialog(false)}
                  disabled={revokeMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  flex={1}
                  size='$4'
                  theme='red'
                  onPress={confirmDelete}
                  disabled={revokeMutation.isPending}
                >
                  {revokeMutation.isPending ? (
                    <Spinner size='small' color='white' />
                  ) : (
                    'Borrar'
                  )}
                </Button>
              </XStack>
            </YStack>
          </Card>
        </YStack>
      )}

      {/* Result Dialog */}
      {showResultDialog && (
        <YStack
          position='absolute'
          top={0}
          left={0}
          right={0}
          bottom={0}
          backgroundColor='rgba(0,0,0,0.5)'
          zIndex={1000}
          justifyContent='center'
          alignItems='center'
          padding='$4'
        >
          <Card
            elevate
            size='$4'
            bordered
            padding='$4'
            space='$3'
            width='90%'
            maxWidth={400}
            backgroundColor='$background'
            animation='quick'
            scale={0.95}
            opacity={showResultDialog ? 1 : 0}
          >
            <YStack space='$3' alignItems='center'>
              <Circle
                size={60}
                backgroundColor={resultMessage.success ? '$green9' : '$red9'}
              >
                {resultMessage.success ? (
                  <CheckCircle size={32} color='white' />
                ) : (
                  <X size={32} color='white' />
                )}
              </Circle>

              <Text fontSize='$6' fontWeight='bold' textAlign='center'>
                {resultMessage.success ? '¡Éxito!' : 'Error'}
              </Text>

              <Text fontSize='$4' textAlign='center' color='$gray11'>
                {resultMessage.message}
              </Text>

              <Button
                size='$4'
                width='100%'
                onPress={() => setShowResultDialog(false)}
                marginTop='$2'
              >
                Cerrar
              </Button>
            </YStack>
          </Card>
        </YStack>
      )}
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
            Gestión de QRs
          </Text>
          <Text fontSize='$3' color='$gray11'>
            {qrCodes.length} {qrCodes.length === 1 ? 'código generado' : 'códigos generados'}
          </Text>
        </YStack>
        <Button
          size='$3'
          chromeless
          icon={<X size={24} />}
          onPress={onBack}
        />
      </XStack>

      {/* Content */}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        {isLoading ? (
          <YStack flex={1} justifyContent='center' alignItems='center' paddingVertical='$10'>
            <Spinner size='large' color='$blue10' />
            <Text fontSize='$3' color='$gray11' marginTop='$3'>
              Cargando QRs...
            </Text>
          </YStack>
        ) : qrCodes.length === 0 ? (
          <YStack alignItems='center' justifyContent='center' paddingVertical='$10' space='$3'>
            <Circle size={80} backgroundColor='$gray5' elevate>
              <Users size={40} color='$gray10' />
            </Circle>
            <Text fontSize='$5' fontWeight='bold' color='$gray12'>
              Sin QRs generados
            </Text>
            <Text fontSize='$3' color='$gray11' textAlign='center'>
              Aún no has generado códigos QR para visitantes
            </Text>
          </YStack>
        ) : (
          <YStack space='$4'>
            {/* Active QRs */}
            {activeQRs.length > 0 && (
              <YStack space='$2'>
                <XStack alignItems='center' space='$2'>
                  <Circle size={8} backgroundColor='$green10' />
                  <Text fontSize='$4' fontWeight='bold'>
                    Activos ({activeQRs.length})
                  </Text>
                </XStack>
                {activeQRs.map(renderQRCard)}
              </YStack>
            )}

            {/* Expired/Completed QRs */}
            {expiredQRs.length > 0 && (
              <YStack space='$2'>
                <XStack alignItems='center' space='$2'>
                  <Circle size={8} backgroundColor='$orange10' />
                  <Text fontSize='$4' fontWeight='bold'>
                    Finalizados ({expiredQRs.length})
                  </Text>
                </XStack>
                {expiredQRs.map(renderQRCard)}
              </YStack>
            )}

            {/* Revoked QRs */}
            {revokedQRs.length > 0 && (
              <YStack space='$2'>
                <XStack alignItems='center' space='$2'>
                  <Circle size={8} backgroundColor='$red10' />
                  <Text fontSize='$4' fontWeight='bold'>
                    Revocados ({revokedQRs.length})
                  </Text>
                </XStack>
                {revokedQRs.map(renderQRCard)}
              </YStack>
            )}
          </YStack>
        )}
      </ScrollView>
    </YStack>
  )
}
