import React, { useState } from 'react'
import { ScrollView, RefreshControl, Image } from 'react-native'
import { YStack, Text, Button, Card, XStack, Circle, Spinner, Dialog, Sheet, Separator } from 'tamagui'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Users, Clock, CheckCircle, AlertCircle, Ban, Trash2, QrCode, Eye, LogOut, ChevronDown, ChevronUp, IdCard, Calendar } from '@tamagui/lucide-icons'
import QRCode from 'react-native-qrcode-svg'
import { getRubroIcon, getRubroColor } from '../constants/qrPolicies'

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
  const [showInsideDialog, setShowInsideDialog] = useState(false)
  const [selectedQR, setSelectedQR] = useState<{ id: string; name: string } | null>(null)
  const [resultMessage, setResultMessage] = useState({ success: true, message: '' })
  
  // QR Code visualization
  const [showQRSheet, setShowQRSheet] = useState(false)
  const [selectedQRCode, setSelectedQRCode] = useState<any>(null)
  
  // INE visualization
  const [showINESheet, setShowINESheet] = useState(false)
  const [selectedINEUrl, setSelectedINEUrl] = useState<string | null>(null)
  
  // Collapse states
  const [isActiveCollapsed, setIsActiveCollapsed] = useState(false)
  const [isFinishedCollapsed, setIsFinishedCollapsed] = useState(true)
  const [isRevokedCollapsed, setIsRevokedCollapsed] = useState(true)

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

  // Force exit mutation
  const forceExitMutation = useMutation({
    mutationFn: async (qrId: string) => {
      const response = await fetch(`${apiUrl}/qr/force-exit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ qrId })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to force exit')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qrCodes'] })
      setResultMessage({ success: true, message: 'Salida confirmada correctamente' })
      setShowResultDialog(true)
      setShowInsideDialog(false)
    },
    onError: (error: Error) => {
      setResultMessage({ success: false, message: error.message || 'No se pudo confirmar la salida' })
      setShowResultDialog(true)
      setShowInsideDialog(false)
    }
  })

  const handleForceExit = (qrId: string, visitorName: string) => {
    setSelectedQR({ id: qrId, name: visitorName })
    setShowInsideDialog(true)
  }

  const confirmForceExit = () => {
    if (selectedQR) {
      forceExitMutation.mutate(selectedQR.id)
    }
  }

  const qrCodes = data?.qrCodes || []

  // Group QRs by status
  const activeQRs = qrCodes
    .filter((qr: any) => 
      qr.effectiveStatus === 'active' || qr.effectiveStatus === 'scheduled'
    )
    .sort((a: any, b: any) => {
      // Primero: ordenar por estado (active antes que scheduled)
      if (a.effectiveStatus === 'active' && b.effectiveStatus === 'scheduled') return -1
      if (a.effectiveStatus === 'scheduled' && b.effectiveStatus === 'active') return 1
      
      // Segundo: dentro del mismo estado, ordenar por fecha de creación (más recientes primero)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  
  const expiredQRs = qrCodes.filter((qr: any) => 
    qr.effectiveStatus === 'expired' || qr.effectiveStatus === 'completed'
  )
  const revokedQRs = qrCodes.filter((qr: any) => qr.effectiveStatus === 'revoked')

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '$green10'
      case 'scheduled': return '$purple10'
      case 'expired': return '$orange10'
      case 'completed': return '$blue10'
      case 'revoked': return '$red10'
      default: return '$gray10'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle size={14} color='white' />
      case 'scheduled': return <Calendar size={14} color='white' />
      case 'expired': return <Clock size={14} color='white' />
      case 'completed': return <CheckCircle size={14} color='white' />
      case 'revoked': return <Ban size={14} color='white' />
      default: return <AlertCircle size={14} color='white' />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Activo'
      case 'scheduled': return 'Programado'
      case 'expired': return 'Expirado'
      case 'completed': return 'Completado'
      case 'revoked': return 'Revocado'
      default: return status
    }
  }

  const handleViewQR = (qr: any) => {
    console.log('📱 QR seleccionado para visualizar:', qr)
    console.log('📱 short_code:', qr.short_code, 'tipo:', typeof qr.short_code)
    setSelectedQRCode(qr)
    setShowQRSheet(true)
  }

  const renderQRCard = (qr: any) => {
    const isActive = qr.effectiveStatus === 'active'
    const isScheduled = qr.effectiveStatus === 'scheduled'
    const canDelete = isActive || isScheduled
    
    return (
      <Card
        key={qr.id}
        elevate
        size='$2'
        bordered
        padding='$3'
        marginBottom='$2'
        opacity={isActive ? 1 : 0.65}
      >
        <YStack space='$2.5'>
          {/* Header: Icono circular + Nombre + Badge de estado */}
          <XStack space='$3' alignItems='center'>
            {/* Icono circular con emoji */}
            <Circle 
              size={44}
              backgroundColor={getRubroColor(qr.rubro)}
              justifyContent='center'
              alignItems='center'
              elevate
            >
              <Text fontSize={20} textAlign='center'>{getRubroIcon(qr.rubro)}</Text>
            </Circle>

            {/* Información y badge */}
            <XStack flex={1} justifyContent='space-between' alignItems='center'>
              <YStack flex={1} marginRight='$2'>
                <Text fontSize='$4' fontWeight='bold' numberOfLines={1}>
                  {qr.invitado || 'Sin nombre'}
                </Text>
                <Text fontSize='$1' color='$gray10' numberOfLines={1}>
                  {qr.policyDescription}
                </Text>
              </YStack>
              
              {/* Badge de estado */}
              <XStack 
                paddingHorizontal='$2.5' 
                paddingVertical='$1.5' 
                backgroundColor={getStatusColor(qr.effectiveStatus)}
                borderRadius='$3'
                space='$1.5'
                alignItems='center'
              >
                {getStatusIcon(qr.effectiveStatus)}
                <Text fontSize='$2' color='white' fontWeight='700'>
                  {getStatusText(qr.effectiveStatus)}
                </Text>
              </XStack>
            </XStack>
          </XStack>

          {/* Stats compactos */}
          <XStack space='$2' alignItems='center'>
            <XStack flex={1} space='$1.5' alignItems='center'>
              <Text fontSize='$2' color='$gray11'>Visitas:</Text>
              <Text fontSize='$3' fontWeight='bold'>
                {qr.usedVisits}/{qr.totalVisits}
              </Text>
              <Text fontSize='$2' color={qr.remainingVisits > 0 ? '$green10' : '$gray10'} fontWeight='600'>
                ({qr.remainingVisits} rest.)
              </Text>
            </XStack>
            {qr.isVisitorInside && isActive && (
              <Card
                paddingHorizontal='$2.5' 
                paddingVertical='$1.5' 
                backgroundColor='$blue10'
                borderRadius='$3'
                pressStyle={{ scale: 0.95, opacity: 0.8 }}
                onPress={() => handleForceExit(qr.id, qr.invitado)}
              >
                <Text fontSize='$2' color='white' fontWeight='700'>
                  ADENTRO
                </Text>
              </Card>
            )}
          </XStack>

          {/* Fecha de expiración */}
          <XStack alignItems='center' space='$1.5'>
            <Clock size={12} color='$gray10' />
            <Text fontSize='$2' color='$gray10'>
              Expira: {new Date(qr.expires_at).toLocaleString('es-MX', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </Text>
          </XStack>

          {/* Periodo de validez para Paquetera y Servicio */}
          {(qr.rubro === 'parcel' || qr.rubro === 'service') && (
            <Card backgroundColor='$blue2' padding='$2' borderRadius='$2'>
              <XStack alignItems='center' space='$1.5'>
                <Calendar size={12} color='$blue11' />
                <YStack flex={1}>
                  <Text fontSize='$1' color='$blue11' fontWeight='600'>
                    Período de validez
                  </Text>
                  <Text fontSize='$2' color='$gray12'>
                    {new Date(qr.valid_from || qr.created_at).toLocaleString('es-MX', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    })} - {new Date(qr.expires_at).toLocaleString('es-MX', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    })}
                  </Text>
                </YStack>
              </XStack>
            </Card>
          )}

          {/* Actions */}
          <XStack space='$2'>
            <Button
              flex={1}
              size='$2'
              theme='blue'
              onPress={() => handleViewQR(qr)}
              icon={<Eye size={14} />}
            >
              Ver QR
            </Button>
            {qr.url_ine && (qr.rubro === 'family' || qr.rubro === 'service') && (
              <Button
                size='$2'
                theme='green'
                onPress={() => {
                  setSelectedINEUrl(qr.url_ine)
                  setShowINESheet(true)
                }}
                icon={<IdCard size={14} />}
                paddingHorizontal='$3'
              />
            )}
            {canDelete && (
              <Button
                flex={qr.url_ine && (qr.rubro === 'family' || qr.rubro === 'service') ? undefined : 1}
                size='$2'
                theme='red'
                onPress={() => handleDelete(qr.id, qr.invitado)}
                disabled={revokeMutation.isPending}
                icon={<Trash2 size={14} />}
              >
                {revokeMutation.isPending ? 'Borrando...' : 'Remover'}
              </Button>
            )}
          </XStack>
        </YStack>
      </Card>
    )
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
          <YStack flex={1} space='$4'>
            {/* Active QRs */}
            {activeQRs.length > 0 && (
              <YStack flex={isActiveCollapsed ? undefined : 1} space='$2'>
                <Card
                  paddingHorizontal='$3'
                  paddingVertical='$2'
                  backgroundColor='$green3'
                  pressStyle={{ opacity: 0.8 }}
                  onPress={() => setIsActiveCollapsed(!isActiveCollapsed)}
                >
                  <XStack alignItems='center' justifyContent='space-between'>
                    <XStack alignItems='center' space='$2'>
                      <Circle size={8} backgroundColor='$green10' />
                      <Text fontSize='$4' fontWeight='bold'>
                        Activos ({activeQRs.length})
                      </Text>
                    </XStack>
                    {isActiveCollapsed ? (
                      <ChevronDown size={20} color='$green10' />
                    ) : (
                      <ChevronUp size={20} color='$green10' />
                    )}
                  </XStack>
                </Card>
                {!isActiveCollapsed && (
                  <ScrollView style={{ flex: 1 }} nestedScrollEnabled>
                    <YStack>
                      {activeQRs.map(renderQRCard)}
                    </YStack>
                  </ScrollView>
                )}
              </YStack>
            )}

            {/* Expired/Completed QRs */}
            {expiredQRs.length > 0 && (
              <YStack flex={isFinishedCollapsed ? undefined : 1} space='$2'>
                <Card
                  paddingHorizontal='$3'
                  paddingVertical='$2'
                  backgroundColor='$orange3'
                  pressStyle={{ opacity: 0.8 }}
                  onPress={() => setIsFinishedCollapsed(!isFinishedCollapsed)}
                >
                  <XStack alignItems='center' justifyContent='space-between'>
                    <XStack alignItems='center' space='$2'>
                      <Circle size={8} backgroundColor='$orange10' />
                      <Text fontSize='$4' fontWeight='bold'>
                        Finalizados ({expiredQRs.length})
                      </Text>
                    </XStack>
                    {isFinishedCollapsed ? (
                      <ChevronDown size={20} color='$orange10' />
                    ) : (
                      <ChevronUp size={20} color='$orange10' />
                    )}
                  </XStack>
                </Card>
                {!isFinishedCollapsed && (
                  <ScrollView style={{ flex: 1 }} nestedScrollEnabled>
                    <YStack>
                      {expiredQRs.map(renderQRCard)}
                    </YStack>
                  </ScrollView>
                )}
              </YStack>
            )}

            {/* Revoked QRs */}
            {revokedQRs.length > 0 && (
              <YStack flex={isRevokedCollapsed ? undefined : 1} space='$2'>
                <Card
                  paddingHorizontal='$3'
                  paddingVertical='$2'
                  backgroundColor='$red3'
                  pressStyle={{ opacity: 0.8 }}
                  onPress={() => setIsRevokedCollapsed(!isRevokedCollapsed)}
                >
                  <XStack alignItems='center' justifyContent='space-between'>
                    <XStack alignItems='center' space='$2'>
                      <Circle size={8} backgroundColor='$red10' />
                      <Text fontSize='$4' fontWeight='bold'>
                        Revocados ({revokedQRs.length})
                      </Text>
                    </XStack>
                    {isRevokedCollapsed ? (
                      <ChevronDown size={20} color='$red10' />
                    ) : (
                      <ChevronUp size={20} color='$red10' />
                    )}
                  </XStack>
                </Card>
                {!isRevokedCollapsed && (
                  <ScrollView style={{ flex: 1 }} nestedScrollEnabled>
                    <YStack>
                      {revokedQRs.map(renderQRCard)}
                    </YStack>
                  </ScrollView>
                )}
              </YStack>
            )}
          </YStack>
        )}
      </ScrollView>

      {/* QR Code Visualization Sheet */}
      <Sheet
        modal
        open={showQRSheet}
        onOpenChange={setShowQRSheet}
        snapPoints={[85]}
        dismissOnSnapToBottom
      >
        <Sheet.Overlay backgroundColor='rgba(0,0,0,0.5)' />
        <Sheet.Frame padding='$4' backgroundColor='$background'>
          <Sheet.Handle />
          {selectedQRCode ? (
            <YStack space='$4' alignItems='center' paddingTop='$4'>
              {/* Header */}
              <YStack space='$2' alignItems='center'>
                <Circle size={60} backgroundColor={getStatusColor(selectedQRCode?.effectiveStatus)} elevate>
                  <QrCode size={32} color='white' />
                </Circle>
                <Text fontSize='$7' fontWeight='bold' textAlign='center'>
                  {selectedQRCode?.invitado || 'Sin nombre'}
                </Text>
                <Text fontSize='$3' color='$gray11' textAlign='center'>
                  {selectedQRCode?.policyDescription}
                </Text>
              </YStack>

              {/* QR Code */}
              <Card
                elevate
                padding='$5'
                backgroundColor='$background'
                borderRadius='$6'
                alignItems='center'
              >
                {selectedQRCode && selectedQRCode.short_code ? (
                  <QRCode
                    value={String(selectedQRCode.short_code)}
                    size={220}
                    backgroundColor='white'
                    color='black'
                  />
                ) : (
                  <YStack alignItems='center' justifyContent='center' width={220} height={220}>
                    <Text color='$gray11'>Código no disponible</Text>
                  </YStack>
                )}
              </Card>

              {/* Código numérico */}
              <YStack space='$2' alignItems='center'>
                <Text fontSize='$2' color='$gray11'>Código numérico</Text>
                <Text fontSize='$8' fontWeight='bold' letterSpacing={3}>
                  {selectedQRCode?.short_code || 'N/A'}
                </Text>
              </YStack>

              {/* Stats */}
              <XStack space='$3' width='100%'>
                <Card flex={1} backgroundColor='$gray2' padding='$3' alignItems='center'>
                  <Text fontSize='$2' color='$gray11'>Usadas</Text>
                  <Text fontSize='$6' fontWeight='bold'>
                    {selectedQRCode?.usedVisits || 0}
                  </Text>
                </Card>
                <Card flex={1} backgroundColor='$gray2' padding='$3' alignItems='center'>
                  <Text fontSize='$2' color='$gray11'>Total</Text>
                  <Text fontSize='$6' fontWeight='bold'>
                    {selectedQRCode?.totalVisits || 0}
                  </Text>
                </Card>
                <Card flex={1} backgroundColor='$green2' padding='$3' alignItems='center'>
                  <Text fontSize='$2' color='$green11'>Restantes</Text>
                  <Text fontSize='$6' fontWeight='bold' color='$green11'>
                    {selectedQRCode?.remainingVisits || 0}
                  </Text>
                </Card>
              </XStack>

              {/* Expiration info */}
              <Card width='100%' backgroundColor='$blue2' padding='$3' borderRadius='$4'>
                <YStack space='$1'>
                  <Text fontSize='$2' color='$blue11' fontWeight='600'>Información de validez</Text>
                  <Text fontSize='$3' color='$gray12' fontWeight='600'>
                    Válido desde: {selectedQRCode?.valid_from ? new Date(selectedQRCode.valid_from).toLocaleString('es-MX', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    }) : (selectedQRCode?.created_at ? new Date(selectedQRCode.created_at).toLocaleString('es-MX', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    }) : 'N/A')}
                  </Text>
                  <Text fontSize='$3' color='$gray12'>
                    Expira: {selectedQRCode?.expires_at ? new Date(selectedQRCode.expires_at).toLocaleString('es-MX', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    }) : 'N/A'}
                  </Text>
                </YStack>
              </Card>

              {/* Botón para ver INE si existe */}
              {selectedQRCode?.url_ine && (selectedQRCode?.rubro === 'family' || selectedQRCode?.rubro === 'service') && (
                <Button
                  size='$4'
                  width='100%'
                  theme='green'
                  onPress={() => {
                    setSelectedINEUrl(selectedQRCode.url_ine)
                    setShowINESheet(true)
                  }}
                  icon={<IdCard size={16} />}
                >
                  Ver Identificación
                </Button>
              )}

              {/* Close button */}
              <Button
                size='$4'
                width='100%'
                onPress={() => setShowQRSheet(false)}
                marginTop='$2'
              >
                Cerrar
              </Button>
            </YStack>
          ) : (
            <YStack alignItems='center' justifyContent='center' padding='$10'>
              <Text fontSize='$4' color='$gray11'>No hay datos para mostrar</Text>
            </YStack>
          )}
        </Sheet.Frame>
      </Sheet>

      {/* INE/ID Photo Sheet */}
      <Sheet
        modal
        open={showINESheet}
        onOpenChange={setShowINESheet}
        snapPoints={[90]}
        dismissOnSnapToBottom
      >
        <Sheet.Overlay backgroundColor='rgba(0, 0, 0, 0.5)' />
        <Sheet.Frame padding='$4' backgroundColor='$background'>
          {selectedINEUrl ? (
            <YStack flex={1} space='$4' alignItems='center'>
              {/* Header */}
              <XStack width='100%' justifyContent='space-between' alignItems='center'>
                <Text fontSize='$6' fontWeight='bold' color='$color'>
                  Identificación
                </Text>
                <Button
                  size='$3'
                  circular
                  icon={<X size={20} />}
                  onPress={() => setShowINESheet(false)}
                />
              </XStack>

              <Separator width='100%' />

              {/* ID Photo */}
              <YStack flex={1} width='100%' alignItems='center' justifyContent='center'>
                <Image
                  source={{ uri: selectedINEUrl }}
                  style={{
                    width: '100%',
                    height: '100%',
                    resizeMode: 'contain'
                  }}
                />
              </YStack>

              {/* Close button */}
              <Button
                size='$4'
                width='100%'
                onPress={() => setShowINESheet(false)}
                marginTop='$2'
              >
                Cerrar
              </Button>
            </YStack>
          ) : (
            <YStack alignItems='center' justifyContent='center' padding='$10'>
              <Text fontSize='$4' color='$gray11'>No se pudo cargar la identificación</Text>
            </YStack>
          )}
        </Sheet.Frame>
      </Sheet>

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

      {/* Force Exit Dialog */}
      {showInsideDialog && (
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
            opacity={showInsideDialog ? 1 : 0}
          >
            <YStack space='$3'>
              <XStack space='$2' alignItems='center'>
                <Circle size={40} backgroundColor='$blue10'>
                  <LogOut size={20} color='white' />
                </Circle>
                <YStack flex={1}>
                  <Text fontSize='$6' fontWeight='bold'>Confirmar Salida</Text>
                  <Text fontSize='$3' color='$gray11'>Forzar registro de salida</Text>
                </YStack>
              </XStack>

              <Text fontSize='$4'>
                El invitado <Text fontWeight='bold'>{selectedQR?.name || 'este visitante'}</Text> aparece como{' '}
                <Text fontWeight='bold' color='$blue10'>Adentro</Text> porque no se escaneó su QR al salir.
              </Text>

              <Text fontSize='$3' color='$gray11'>
                Si ya abandonó el fraccionamiento, confirma aquí para cerrar la visita.
              </Text>

              <XStack space='$2' marginTop='$2'>
                <Button
                  flex={1}
                  size='$4'
                  onPress={() => setShowInsideDialog(false)}
                  disabled={forceExitMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  flex={1}
                  size='$4'
                  theme='blue'
                  onPress={confirmForceExit}
                  disabled={forceExitMutation.isPending}
                >
                  {forceExitMutation.isPending ? (
                    <Spinner size='small' color='white' />
                  ) : (
                    'Confirmar Salida'
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
    </YStack>
  )
}

export default QRManagementScreen
