import React, { useState } from 'react'
import { ScrollView, Linking, Alert, TextInput } from 'react-native'
import { YStack, XStack, Text, Button, Card, Circle, Spinner } from 'tamagui'
import { ChevronLeft } from '@tamagui/lucide-icons'
import { useAuth } from '../contexts/AuthContext'

interface SupportScreenProps {
  onBack: () => void
}

export const SupportScreen: React.FC<SupportScreenProps> = ({ onBack }) => {
  const supportEmail = 'soporte@portonesfc.com'
  const whatsapp = '+52 55 1234 5678'
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { getToken } = useAuth()
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000'

  const handleEmail = async () => {
    const url = `mailto:${supportEmail}`
    const canOpen = await Linking.canOpenURL(url)
    if (!canOpen) {
      Alert.alert('Error', 'No se pudo abrir el correo')
      return
    }
    Linking.openURL(url)
  }

  const handleSendMessage = async () => {
    if (!message.trim()) {
      Alert.alert('Error', 'Por favor escribe un mensaje')
      return
    }

    setIsSubmitting(true)
    try {
      const token = await getToken()
      if (!token) {
        Alert.alert('Error', 'No estás autenticado')
        setIsSubmitting(false)
        return
      }

      const response = await fetch(`${apiUrl}/support/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ message: message.trim() })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Error al enviar el mensaje')
      }

      setMessage('')
      Alert.alert('Éxito', 'Tu mensaje ha sido enviado. Te responderemos pronto.')
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo enviar el mensaje')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleWhatsApp = async () => {
    const url = `https://wa.me/${whatsapp.replace(/\D/g, '')}`
    const canOpen = await Linking.canOpenURL(url)
    if (!canOpen) {
      Alert.alert('Error', 'No se pudo abrir WhatsApp')
      return
    }
    Linking.openURL(url)
  }

  return (
    <YStack flex={1} backgroundColor='$background'>
      <XStack
        justifyContent='space-between'
        alignItems='center'
        padding='$4'
        paddingTop='$8'
        backgroundColor='$background'
        borderBottomWidth={1}
        borderBottomColor='$gray5'
      >
        <XStack alignItems='center' space='$2' flex={1}>
          <Button
            size='$3'
            chromeless
            icon={<ChevronLeft size={20} />}
            onPress={onBack}
          />
          <Text fontSize='$6' fontWeight='bold'>
            Soporte
          </Text>
        </XStack>
      </XStack>

      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16 }}>
        <YStack space='$4'>
          <Card elevate size='$3.5' bordered padding='$4' backgroundColor='$blue2'>
            <YStack space='$3'>
              <Text fontSize='$5' fontWeight='600'>
                Envía una Queja
              </Text>
              <Text fontSize='$3' color='$gray11'>
                Escribe tu mensaje para que llegue directamente a nuestro equipo.
              </Text>
              <TextInput
                placeholder='Cuéntanos tu problema...'
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={5}
                style={{
                  borderWidth: 1,
                  borderColor: '#ccc',
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 14,
                  fontFamily: 'System',
                  color: '#333',
                  backgroundColor: '#fff',
                  textAlignVertical: 'top'
                }}
              />
              <Button
                width='100%'
                size='$3'
                theme='blue'
                onPress={handleSendMessage}
                disabled={isSubmitting || !message.trim()}
              >
                {isSubmitting && <Spinner size='small' color='white' />}
                <Text fontWeight='700' marginLeft={isSubmitting ? '$2' : 0}>
                  {isSubmitting ? 'Enviando...' : 'Enviar Mensaje'}
                </Text>
              </Button>
            </YStack>
          </Card>

          <Card elevate size='$3.5' bordered padding='$4'>
            <YStack space='$2'>
              <Text fontSize='$5' fontWeight='600'>
                ¿Necesitas ayuda?
              </Text>
              <Text fontSize='$3' color='$gray11'>
                Contáctanos por cualquiera de estos medios.
              </Text>
            </YStack>
          </Card>

          <Card elevate size='$3.5' bordered padding='$4'>
            <XStack space='$3' alignItems='center'>
              <Circle size={44} backgroundColor='$blue10' elevate>
                <Text fontSize='$5' color='white'>@</Text>
              </Circle>
              <YStack flex={1}>
                <Text fontSize='$4' fontWeight='600'>
                  Correo
                </Text>
                <Text fontSize='$3' color='$gray11'>
                  {supportEmail}
                </Text>
              </YStack>
              <Button size='$3' theme='blue' onPress={handleEmail}>
                Escribir
              </Button>
            </XStack>
          </Card>

          <Card elevate size='$3.5' bordered padding='$4'>
            <XStack space='$3' alignItems='center'>
              <Circle size={44} backgroundColor='$purple10' elevate>
                <Text fontSize='$5' color='white'>💬</Text>
              </Circle>
              <YStack flex={1}>
                <Text fontSize='$4' fontWeight='600'>
                  WhatsApp
                </Text>
                <Text fontSize='$3' color='$gray11'>
                  {whatsapp}
                </Text>
              </YStack>
              <Button size='$3' theme='purple' onPress={handleWhatsApp}>
                Abrir
              </Button>
            </XStack>
          </Card>
        </YStack>
      </ScrollView>
    </YStack>
  )
}
