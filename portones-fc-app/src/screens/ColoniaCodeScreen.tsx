import React, { useEffect, useState } from 'react'
import { YStack, XStack, Input, Button, Text, H2, Separator, Card, Dialog } from 'tamagui'
import { useAuth } from '../contexts/AuthContext'
import { AnimatedBackground } from '../components/AnimatedBackground'

export const ColoniaCodeScreen: React.FC = () => {
  const { getColoniaStreets, joinColonia, updateApartmentUnit, signOut, profile, checkHouseAvailability } = useAuth()
  const [fullName, setFullName] = useState('')
  const [code, setCode] = useState('')
  const [streets, setStreets] = useState<string[]>([])
  const [selectedStreet, setSelectedStreet] = useState('')
  const [streetQuery, setStreetQuery] = useState('')
  const [showStreetPicker, setShowStreetPicker] = useState(false)
  const [externalNumber, setExternalNumber] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [validatingColonia, setValidatingColonia] = useState(false)
  const [coloniaValidated, setColoniaValidated] = useState(false)
  const [pendingColoniaName, setPendingColoniaName] = useState('')
  const [pendingStreets, setPendingStreets] = useState<string[]>([])
  const [showColoniaConfirmDialog, setShowColoniaConfirmDialog] = useState(false)
  const [assigningColonia, setAssigningColonia] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [dialogMessage, setDialogMessage] = useState('')
  const [dialogType, setDialogType] = useState<'success' | 'error'>('success')
  const [remainingSpots, setRemainingSpots] = useState(0)
  const displayName = profile?.full_name?.trim() || fullName.trim()
  const currentStep = coloniaValidated ? 2 : 1

  const formatColoniaCode = (value: string) => {
    const raw = value.replace(/[^a-fA-F0-9]/g, '').slice(0, 32)
    const parts = [
      raw.slice(0, 8),
      raw.slice(8, 12),
      raw.slice(12, 16),
      raw.slice(16, 20),
      raw.slice(20, 32)
    ].filter(Boolean)
    return parts.join('-')
  }

  useEffect(() => {
    if (profile?.full_name && !fullName) {
      setFullName(profile.full_name)
    }
  }, [profile?.full_name, fullName])

  const handleValidateColonia = async () => {
    setError('')
    setSuccess(false)
    setValidatingColonia(true)
    setColoniaValidated(false)
    setStreets([])
    setSelectedStreet('')
    setPendingColoniaName('')
    setPendingStreets([])
    setShowStreetPicker(false)
    setShowColoniaConfirmDialog(false)

    try {
      const coloniaData = await getColoniaStreets(code.trim())
      setPendingColoniaName(coloniaData.nombre)
      setPendingStreets(coloniaData.streets)
      setShowColoniaConfirmDialog(true)
    } catch (err: any) {
      setError(err.message || 'No se pudo validar la colonia')
      setColoniaValidated(false)
    } finally {
      setValidatingColonia(false)
    }
  }

  const handleConfirmColonia = async () => {
    setError('')
    setAssigningColonia(true)

    try {
      await joinColonia(code.trim())
      setStreets(pendingStreets)
      setColoniaValidated(true)
      setStreetQuery('')
      setShowStreetPicker(false)
      setShowColoniaConfirmDialog(false)

      if (pendingStreets.length === 0) {
        setError('La colonia no tiene calles registradas aún')
      }
    } catch (err: any) {
      setError(err.message || 'No se pudo asignar la colonia')
      setColoniaValidated(false)
    } finally {
      setAssigningColonia(false)
    }
  }

  const handleRejectColonia = () => {
    setShowColoniaConfirmDialog(false)
    setPendingColoniaName('')
    setPendingStreets([])
    setColoniaValidated(false)
    setStreetQuery('')
    setShowStreetPicker(false)
  }

  const filteredStreets = streets.filter((street) =>
    street.toLowerCase().includes(streetQuery.trim().toLowerCase())
  )

  const handleConfirmAddress = async () => {
    setError('')
    setSuccess(false)
    setLoading(true)

    try {
      if (!fullName.trim()) {
        setError('El nombre es requerido')
        setLoading(false)
        return
      }

      // Primero verificar si hay espacios disponibles
      const availability = await checkHouseAvailability(code.trim(), selectedStreet, externalNumber)

      if (!availability.available) {
        setDialogType('error')
        setDialogMessage(
          `Esta casa ha alcanzado el límite de personas registradas (${availability.maxPeople} personas).\n\nPor favor, contacte a la administración de la privada o verifique el domicilio ingresado.`
        )
        setShowDialog(true)
        setLoading(false)
        return
      }

      // Si hay espacios disponibles, proceder con el registro
      await updateApartmentUnit(selectedStreet, externalNumber, 1, fullName.trim())
      setSuccess(true)
      setRemainingSpots(availability.remainingSpots - 1)
      setDialogType('success')
      setDialogMessage(
        `¡Acceso válido!\n\nQuedan ${availability.remainingSpots - 1} personas disponibles para registrar en este domicilio.`
      )
      setShowDialog(true)
    } catch (err: any) {
      setError(err.message || 'No se pudo actualizar el domicilio')
    } finally {
      setLoading(false)
    }
  }

  return (
    <YStack
      flex={1}
      backgroundColor='#06121f'
      position='relative'
      overflow='hidden'
    >
      <AnimatedBackground
        opacity={0.4}
        enableGyro
        showAurora
        showOverlayGradient
      />

      <YStack
        flex={1}
        justifyContent='center'
        padding='$5'
        space='$4'
      >
        <YStack space='$2'>
          <Text color='$blue9' fontSize='$2' fontWeight='700'>
            Registro de acceso
          </Text>
          <H2 color='white'>Confirma tu colonia</H2>
          <Text color='$gray9' maxWidth={520}>
            Completa este asistente para validar tu colonia y registrar tu domicilio.
          </Text>
          {displayName ? (
            <Text fontSize='$3' color='$blue8' fontWeight='600'>
              {displayName}
            </Text>
          ) : null}
        </YStack>

        <XStack space='$3'>
          <YStack
            flex={1}
            borderRadius='$5'
            padding='$3'
            borderWidth={1}
            borderColor={currentStep >= 1 ? '$blue7' : '$gray7'}
            backgroundColor={currentStep >= 1 ? '$blue3' : '$color2'}
          >
            <Text fontSize='$1' color={currentStep >= 1 ? '$blue10' : '$gray10'}>
              PASO 1
            </Text>
            <Text fontSize='$3' fontWeight='700' color={currentStep >= 1 ? '$blue11' : '$gray11'}>
              Validar colonia
            </Text>
          </YStack>

          <YStack
            flex={1}
            borderRadius='$5'
            padding='$3'
            borderWidth={1}
            borderColor={currentStep >= 2 ? '$green7' : '$gray7'}
            backgroundColor={currentStep >= 2 ? '$green3' : '$color2'}
          >
            <Text fontSize='$1' color={currentStep >= 2 ? '$green10' : '$gray10'}>
              PASO 2
            </Text>
            <Text fontSize='$3' fontWeight='700' color={currentStep >= 2 ? '$green11' : '$gray11'}>
              Confirmar domicilio
            </Text>
          </YStack>
        </XStack>

        <Card padding='$4' space='$4' elevate bordered>
          <YStack space='$3'>
            <XStack alignItems='center' space='$2'>
              <YStack
                width={28}
                height={28}
                borderRadius={999}
                alignItems='center'
                justifyContent='center'
                backgroundColor='$blue9'
              >
                <Text color='white' fontWeight='700'>
                  1
                </Text>
              </YStack>
              <Text fontSize='$4' fontWeight='700' color='$gray12'>
                Validación de colonia
              </Text>
            </XStack>

            <YStack space='$2'>
              <Text fontSize='$2' color='$gray11'>
                Nombre completo:
              </Text>
              <Input
                placeholder='Nombre de la persona'
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize='words'
                autoCorrect={false}
                size='$4'
              />
            </YStack>
            <XStack space='$2'>
              <Input
                flex={1}
                placeholder='Código de colonia'
                value={code}
                onChangeText={(value) => setCode(formatColoniaCode(value))}
                autoCapitalize='none'
                autoCorrect={false}
                size='$4'
                editable={!coloniaValidated}
              />
              <Button
                size='$4'
                theme='blue'
                onPress={handleValidateColonia}
                disabled={validatingColonia || !code.trim() || coloniaValidated}
              >
                {validatingColonia ? 'Validando...' : 'Validar'}
              </Button>
            </XStack>

          {coloniaValidated && streets.length > 0 && (
            <YStack space='$2'>
              <Separator marginVertical='$2' />

              <XStack alignItems='center' space='$2'>
                <YStack
                  width={28}
                  height={28}
                  borderRadius={999}
                  alignItems='center'
                  justifyContent='center'
                  backgroundColor='$green9'
                >
                  <Text color='white' fontWeight='700'>
                    2
                  </Text>
                </YStack>
                <Text fontSize='$4' fontWeight='700' color='$gray12'>
                  Datos del domicilio
                </Text>
              </XStack>

              <XStack space='$2' alignItems='flex-end'>
                <YStack flex={7} space='$2'>
                  <Text fontSize='$2' color='$gray11'>
                    Calle:
                  </Text>
                  <Button
                    size='$4'
                    variant='outlined'
                    justifyContent='space-between'
                    onPress={() => setShowStreetPicker((prev) => !prev)}
                  >
                    {selectedStreet || 'Seleccionar una calle'}
                  </Button>

                  {showStreetPicker && (
                    <YStack space='$2'>


                      <YStack
                        borderWidth={1}
                        borderColor='$gray6'
                        borderRadius='$4'
                        padding='$2'
                        backgroundColor='$color2'
                        maxHeight={200}
                        overflow='scroll'
                      >
                        {filteredStreets.length === 0 ? (
                          <Text color='$gray10' fontSize='$2' textAlign='center' padding='$2'>
                            No se encontraron calles
                          </Text>
                        ) : (
                          filteredStreets.map((street, index) => {
                            const isSelected = selectedStreet === street
                            return (
                              <Button
                                key={`${street}-${index}`}
                                justifyContent='flex-start'
                                marginBottom='$2'
                                theme={isSelected ? 'blue' : undefined}
                                variant={isSelected ? undefined : 'outlined'}
                                onPress={() => {
                                  setSelectedStreet(street)
                                  setShowStreetPicker(false)
                                }}
                              >
                                {street}
                              </Button>
                            )
                          })
                        )}
                      </YStack>
                    </YStack>
                  )}
                </YStack>

                <YStack flex={3} space='$2'>
                  <Text fontSize='$2' color='$gray11'>
                    Número ext:
                  </Text>
                  <Input
                    placeholder='Ej: 123'
                    value={externalNumber}
                    onChangeText={setExternalNumber}
                    autoCapitalize='none'
                    autoCorrect={false}
                    size='$4'
                  />
                </YStack>
              </XStack>

              <Button
                size='$4'
                theme='green'
                onPress={handleConfirmAddress}
                disabled={
                  loading ||
                  !fullName.trim() ||
                  !selectedStreet.trim() ||
                  !externalNumber.trim()
                }
              >
                {loading ? 'Guardando...' : 'Confirmar Domicilio'}
              </Button>
            </YStack>
          )}

          {!coloniaValidated && (
            <YStack
              backgroundColor='$blue2'
              padding='$3'
              borderRadius='$4'
              borderWidth={1}
              borderColor='$blue6'
            >
              <Text color='$blue11' fontSize='$2'>
                Completa el Paso 1 para desbloquear la selección de domicilio.
              </Text>
            </YStack>
          )}

          {/* Error Message */}
          {error ? (
            <YStack
              backgroundColor='$red4'
              padding='$3'
              borderRadius='$4'
              borderWidth={1}
              borderColor='$red8'
            >
              <Text color='$red11' fontSize='$2'>
                {error}
              </Text>
            </YStack>
          ) : null}

          {/* Success Message */}
          {success ? (
            <YStack
              backgroundColor='$green4'
              padding='$3'
              borderRadius='$4'
              borderWidth={1}
              borderColor='$green8'
            >
              <Text color='$green11' fontSize='$2'>
                ¡Listo! Ya puedes continuar.
              </Text>
            </YStack>
          ) : null}

          <Separator />

          <Button size='$3' variant='outlined' onPress={signOut}>
            Cerrar sesión
          </Button>
          </YStack>
        </Card>
      </YStack>

      {/* Dialog for messages */}
      <Dialog
        modal
        open={showColoniaConfirmDialog}
        onOpenChange={(open) => {
          setShowColoniaConfirmDialog(open)
          if (!open && !assigningColonia) {
            handleRejectColonia()
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            key='colonia-overlay'
            animation='quick'
            opacity={0.5}
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
          />
          <Dialog.Content
            bordered
            elevate
            key='colonia-content'
            animateOnly={['transform', 'opacity']}
            animation={[
              'quick',
              {
                opacity: {
                  overshootClamping: true,
                },
              },
            ]}
            enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
            exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
            space
            maxWidth={420}
          >
            <Dialog.Title color='$blue10' textAlign='center'>
              Confirmar colonia
            </Dialog.Title>
            <Dialog.Description>
              <YStack space='$3'>
                <Text textAlign='center' color='$gray11'>
                  Verifica que el nombre coincida con tu privada antes de continuar.
                </Text>

                <YStack
                  backgroundColor='$blue2'
                  borderColor='$blue6'
                  borderWidth={1}
                  borderRadius='$4'
                  padding='$3'
                  space='$1'
                >
                  <Text fontSize='$2' color='$blue10'>
                    Colonia encontrada
                  </Text>
                  <Text fontSize='$5' fontWeight='700' color='$blue11'>
                    {pendingColoniaName || 'Sin nombre'}
                  </Text>
                </YStack>

                <Text textAlign='center' color='$gray12' fontWeight='600'>
                  ¿Esta es tu colonia?
                </Text>
              </YStack>
            </Dialog.Description>

            <XStack alignSelf='stretch' gap='$3' marginTop='$2'>
              <Button
                flex={1}
                variant='outlined'
                onPress={handleRejectColonia}
                disabled={assigningColonia}
              >
                No
              </Button>
              <Button
                flex={1}
                theme='blue'
                onPress={handleConfirmColonia}
                disabled={assigningColonia}
              >
                {assigningColonia ? 'Asignando...' : 'Sí, continuar'}
              </Button>
            </XStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>

      <Dialog modal open={showDialog} onOpenChange={setShowDialog}>
        <Dialog.Portal>
          <Dialog.Overlay
            key='overlay'
            animation='quick'
            opacity={0.5}
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
          />
          <Dialog.Content
            bordered
            elevate
            key='content'
            animateOnly={['transform', 'opacity']}
            animation={[
              'quick',
              {
                opacity: {
                  overshootClamping: true,
                },
              },
            ]}
            enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
            exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
            space
            maxWidth={400}
          >
            <Dialog.Title
              color={dialogType === 'success' ? '$green10' : '$red10'}
            >
              {dialogType === 'success' ? '✓ Éxito' : '⚠ Atención'}
            </Dialog.Title>
            <Dialog.Description>
              <Text>{dialogMessage}</Text>
            </Dialog.Description>

            <XStack alignSelf='flex-end' gap='$3' marginTop='$4'>
              <Dialog.Close displayWhenAdapted asChild>
                <Button
                  theme={dialogType === 'success' ? 'green' : 'blue'}
                  aria-label='Close'
                >
                  Aceptar
                </Button>
              </Dialog.Close>
            </XStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </YStack>
  )
}

