import React, { useState } from 'react'
import { YStack, XStack, Input, Button, Text, H2, Separator, Card, Select, Adapt, Sheet } from 'tamagui'
import { useAuth } from '../contexts/AuthContext'

export const ColoniaCodeScreen: React.FC = () => {
  const { getColoniaStreets, updateApartmentUnit, signOut, user, profile } = useAuth()
  const [code, setCode] = useState('')
  const [streets, setStreets] = useState<string[]>([])
  const [selectedStreet, setSelectedStreet] = useState('')
  const [externalNumber, setExternalNumber] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [validatingColonia, setValidatingColonia] = useState(false)
  const [coloniaValidated, setColoniaValidated] = useState(false)

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
      await updateApartmentUnit(selectedStreet, externalNumber, 1)
      setSuccess(true)
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
          {user?.email ? (
            <Text fontSize='$3' color='$blue10'>
              {user.email}
            </Text>
          ) : null}
        </YStack>

        <YStack space='$3'>
          {/* Step 1: Validate Colonia Code */}
          <YStack space='$2'>
            <Text fontSize='$3' fontWeight='600' color='$gray12'>
              Paso 1: Validar Colonia
            </Text>
            <XStack space='$2'>
              <Input
                flex={1}
                placeholder='Código de colonia'
                value={code}
                onChangeText={setCode}
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

              <YStack space='$2'>
                <Text fontSize='$2' color='$gray11'>
                  Selecciona tu calle:
                </Text>
                <Select
                  value={selectedStreet}
                  onValueChange={setSelectedStreet}
                >
                  <Select.Trigger width='100%' height='$4'>
                    <Select.Value
                      placeholder='Selecciona una calle...'
                      color={selectedStreet ? '$gray12' : '$gray10'}
                    />
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
                            {street}
                          </Select.Item>
                        ))}
                      </Select.Group>
                    </Select.Viewport>
                  </Select.Content>
                </Select>
              </YStack>

              <YStack space='$2'>
                <Text fontSize='$2' color='$gray11'>
                  Número exterior:
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

              <Button
                size='$4'
                theme='green'
                onPress={handleConfirmAddress}
                disabled={
                  loading ||
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
    </YStack>
  )
}

