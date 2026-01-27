import React, { useState } from 'react'
import { YStack, Input, Button, Text, H2, Separator, Card } from 'tamagui'
import { useAuth } from '../contexts/AuthContext'

export const ColoniaCodeScreen: React.FC = () => {
  const { joinColonia, signOut, user } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setError('')
    setSuccess(false)
    setLoading(true)

    try {
      await joinColonia(code.trim())
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'No se pudo registrar la colonia')
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
          <Input
            placeholder='Código de colonia'
            value={code}
            onChangeText={setCode}
            autoCapitalize='none'
            autoCorrect={false}
            size='$4'
          />

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

          <Button
            size='$4'
            theme='blue'
            onPress={handleSubmit}
            disabled={loading || !code.trim()}
          >
            {loading ? 'Verificando...' : 'Unirme a la colonia'}
          </Button>

          <Separator />

          <Button size='$3' variant='outlined' onPress={signOut}>
            Cerrar sesión
          </Button>
        </YStack>
      </Card>
    </YStack>
  )
}
