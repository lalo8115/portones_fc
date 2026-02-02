import React from 'react'
import { ScrollView, Linking, Alert } from 'react-native'
import { YStack, XStack, Text, Button, Card, Circle } from 'tamagui'
import { ChevronLeft, Mail, MessageCircle } from '@tamagui/lucide-icons'

interface SupportScreenProps {
  onBack: () => void
}

export const SupportScreen: React.FC<SupportScreenProps> = ({ onBack }) => {
  const supportEmail = 'soporte@portonesfc.com'
  const whatsapp = '+52 55 1234 5678'

  const handleEmail = async () => {
    const url = `mailto:${supportEmail}`
    const canOpen = await Linking.canOpenURL(url)
    if (!canOpen) {
      Alert.alert('Error', 'No se pudo abrir el correo')
      return
    }
    Linking.openURL(url)
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
          <Card elevate size='$3' bordered padding='$4'>
            <YStack space='$2'>
              <Text fontSize='$5' fontWeight='600'>
                ¿Necesitas ayuda?
              </Text>
              <Text fontSize='$3' color='$gray11'>
                Contáctanos por cualquiera de estos medios.
              </Text>
            </YStack>
          </Card>

          <Card elevate size='$3' bordered padding='$4'>
            <XStack space='$3' alignItems='center'>
              <Circle size={44} backgroundColor='$blue10' elevate>
                <Mail size={20} color='white' />
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

          <Card elevate size='$3' bordered padding='$4'>
            <XStack space='$3' alignItems='center'>
              <Circle size={44} backgroundColor='$purple10' elevate>
                <MessageCircle size={20} color='white' />
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
