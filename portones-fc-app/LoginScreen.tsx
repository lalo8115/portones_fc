import React, { useState } from 'react'
import { YStack, Input, Button, Text, H1, Separator } from 'tamagui'
import { useAuth } from './AuthContext'

export const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, signUp } = useAuth()

  const handleSubmit = async () => {
    setError('')
    setLoading(true)

    try {
      if (isSignUp) {
        await signUp(email, password)
      } else {
        await signIn(email, password)
      }
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <YStack
      flex={1}
      justifyContent='center'
      padding='$6'
      space='$4'
      backgroundColor='$background'
    >
      <YStack space='$3' alignItems='center' marginBottom='$6'>
        <H1>Portones FC</H1>
        <Text color='$gray11'>
          {isSignUp ? 'Crea tu cuenta' : 'Inicia sesión para continuar'}
        </Text>
      </YStack>

      <YStack space='$3'>
        <Input
          placeholder='Email'
          value={email}
          onChangeText={setEmail}
          keyboardType='email-address'
          autoCapitalize='none'
          size='$4'
        />

        <Input
          placeholder='Contraseña'
          value={password}
          onChangeText={setPassword}
          secureTextEntry
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

        <Button
          size='$4'
          theme='blue'
          onPress={handleSubmit}
          disabled={loading || !email || !password}
        >
          {loading
            ? 'Cargando...'
            : isSignUp
            ? 'Registrarse'
            : 'Iniciar Sesión'}
        </Button>

        <Separator />

        <Button
          size='$3'
          variant='outlined'
          onPress={() => {
            setIsSignUp(!isSignUp)
            setError('')
          }}
        >
          {isSignUp
            ? '¿Ya tienes cuenta? Inicia sesión'
            : '¿No tienes cuenta? Regístrate'}
        </Button>
      </YStack>
    </YStack>
  )
}
