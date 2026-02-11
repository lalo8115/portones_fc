import React, { useEffect, useState } from 'react'
import { YStack, XStack, Input, Button, Text, H2, Separator, Card, Select, Adapt, Sheet, Dialog } from 'tamagui'
import { useAuth } from '../contexts/AuthContext'

export const ColoniaCodeScreen: React.FC = () => {
  const { getColoniaStreets, updateApartmentUnit, signOut, profile, checkHouseAvailability } = useAuth()
  const [fullName, setFullName] = useState('')
  const [code, setCode] = useState('')
  const [streets, setStreets] = useState<string[]>([])
  const [selectedStreet, setSelectedStreet] = useState('')
  const [externalNumber, setExternalNumber] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [validatingColonia, setValidatingColonia] = useState(false)
  const [coloniaValidated, setColoniaValidated] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [dialogMessage, setDialogMessage] = useState('')
  const [dialogType, setDialogType] = useState<'success' | 'error'>('success')
  const [remainingSpots, setRemainingSpots] = useState(0)
  const displayName = profile?.full_name?.trim() || fullName.trim()

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

    try {
      const coloniaStreets = await getColoniaStreets(code.trim())
      setStreets(coloniaStreets)
      setColoniaValidated(true)
      
      if (coloniaStreets.length === 0) {
        setError('La colonia no tiene calles registradas aún')
      }
    } catch (err: any) {
      setError(err.message || 'No se pudo validar la colonia')
      setColoniaValidated(false)
    } finally {
      setValidatingColonia(false)
    }
  }

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
      justifyContent='center'
      padding='$6'
      space='$5'
      backgroundColor='$background'
    >
      <Card padding='$4' space='$4' elevate bordered>
        <YStack space='$2' alignItems='center'>
          <H2>Confirma tu colonia</H2>
          <Text textAlign='center' color='$gray11'>
            Ingresa el código de la colonia que te compartió la administración.
          </Text>
          {displayName ? (
            <Text fontSize='$3' color='$blue10'>
              {displayName}
            </Text>
          ) : null}
        </YStack>

        <YStack space='$3'>
          {/* Step 1: Validate Colonia Code */}
          <YStack space='$2'>
            <Text fontSize='$3' fontWeight='600' color='$gray12'>
              Paso 1: Validar Colonia
            </Text>
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
          </YStack>

          {/* Step 2: Select Street and External Number */}
          {coloniaValidated && streets.length > 0 && (
            <YStack space='$2'>
              <Text fontSize='$3' fontWeight='600' color='$gray12'>
                Paso 2: Domicilio
              </Text>

              <XStack space='$2' alignItems='flex-end'>
                <YStack flex={7} space='$2'>
                  <Text fontSize='$2' color='$gray11'>
                    Calle:
                  </Text>
                  <Select
                    value={selectedStreet}
                    onValueChange={setSelectedStreet}
                  >
                    <Select.Trigger width='100%' height='$4'>
                      <Select.Value placeholder='Selecciona una calle...' />
                    </Select.Trigger>

                    <Adapt when='sm' platform='touch'>
                      <Sheet
                        native={false}
                        modal
                        dismissOnSnapToBottom
                        animationConfig={{
                          type: 'spring',
                          damping: 20,
                          mass: 1.2,
                          stiffness: 260
                        }}
                      >
                        <Sheet.Frame>
                          <Sheet.ScrollView>
                            <Adapt.Contents />
                          </Sheet.ScrollView>
                        </Sheet.Frame>
                        <Sheet.Overlay />
                      </Sheet>
                    </Adapt>

                    <Select.Content zIndex={200000}>
                      <Select.Viewport>
                        <Select.Group>
                          {streets.map((street, index) => (
                            <Select.Item
                              key={`${street}-${index}`}
                              index={index}
                              value={street}
                            >
                              <Select.ItemText>{street}</Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Group>
                      </Select.Viewport>
                    </Select.Content>
                  </Select>
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

      {/* Dialog for messages */}
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

