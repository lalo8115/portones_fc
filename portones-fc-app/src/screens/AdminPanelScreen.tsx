import React from 'react'
import { ScrollView, Alert } from 'react-native'
import { Button, YStack, Text, XStack, Card, Circle } from 'tamagui'
import { ArrowLeft, FileText, Home, CreditCard } from '@tamagui/lucide-icons'
import { useAuth } from '../contexts/AuthContext'

interface AdminPanelScreenProps {
  onBack: () => void
  onOpenAccessLog?: () => void
  onOpenPaymentReport?: () => void
}

export const AdminPanelScreen: React.FC<AdminPanelScreenProps> = ({
  onBack,
  onOpenAccessLog,
  onOpenPaymentReport
}) => {
  const { profile } = useAuth()

  const handleAccessLog = () => {
    if (onOpenAccessLog) {
      onOpenAccessLog()
      return
    }
    Alert.alert('Registro de accesos', 'Función en desarrollo')
  }

  const handlePaymentReport = () => {
    if (onOpenPaymentReport) {
      onOpenPaymentReport()
      return
    }
    Alert.alert('Registro de pagos', 'Función en desarrollo')
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
        <Button
          size='$3'
          icon={<ArrowLeft size={18} />}
          onPress={onBack}
          chromeless
        >
          Volver
        </Button>
        <Text fontSize='$6' fontWeight='bold'>
          Panel Admin
        </Text>
        <YStack width={40} />
      </XStack>

      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <YStack padding='$4' space='$4'>
          <YStack space='$1'>
            <Text fontSize='$4' fontWeight='600'>
              Herramientas de administración
            </Text>
            <Text fontSize='$3' color='$gray11'>
              {profile?.colonia?.nombre
                ? `Privada: ${profile.colonia.nombre}`
                : 'Privada actual'}
            </Text>
          </YStack>

          <Card
            elevate
            size='$4'
            bordered
            padding='$4'
            pressStyle={{ scale: 0.98, opacity: 0.9 }}
            onPress={handleAccessLog}
          >
            <XStack space='$3' alignItems='center'>
              <Circle size={52} backgroundColor='$blue10' elevate>
                <FileText size={24} color='white' />
              </Circle>
              <YStack flex={1} space='$1'>
                <Text fontSize='$4' fontWeight='700'>
                  Registro de accesos
                </Text>
                <Text fontSize='$2.5' color='$gray11'>
                  Accesos de toda la privada
                </Text>
              </YStack>
            </XStack>
          </Card>

          <Card
            elevate
            size='$4'
            bordered
            padding='$4'
            pressStyle={{ scale: 0.98, opacity: 0.9 }}
            onPress={handlePaymentReport}
          >
            <XStack space='$3' alignItems='center'>
              <Circle size={52} backgroundColor='$green10' elevate>
                <CreditCard size={24} color='white' />
              </Circle>
              <YStack flex={1} space='$1'>
                <Text fontSize='$4' fontWeight='700'>
                  Estado de mantenimiento
                </Text>
                <Text fontSize='$2.5' color='$gray11'>
                  Casas al corriente y con adeudo
                </Text>
              </YStack>
            </XStack>
          </Card>

          <Card
            elevate
            size='$3'
            bordered
            padding='$3'
            backgroundColor='$gray2'
            borderColor='$gray6'
          >
            <XStack space='$2' alignItems='center'>
              <Home size={18} color='$gray11' />
              <Text fontSize='$2.5' color='$gray11'>
                Visible solo para administradores
              </Text>
            </XStack>
          </Card>
        </YStack>
      </ScrollView>
    </YStack>
  )
}
