import React, { useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { TamaguiProvider } from 'tamagui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ColoniaCodeScreen } from './screens/ColoniaCodeScreen'
import { GateControl } from './screens/GateControl'
import { LoginScreen } from './screens/LoginScreen'
import { MaintenancePaymentScreen } from './screens/MaintenancePaymentScreen'
import { RevokedAccessScreen } from './screens/RevokedAccessScreen'
import tamaguiConfig from '../tamagui.config'

const queryClient = new QueryClient()

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://portones-fc.onrender.com'

type NavigationScreen = 'gateControl' | 'maintenancePayment' | 'revokedAccess' | 'revokedPayment'

const AppContent: React.FC = () => {
  const { session, loading, profile } = useAuth()
  const [currentScreen, setCurrentScreen] = useState<NavigationScreen>('gateControl')

  if (loading) {
    return null // O un componente de carga
  }

  if (!session) {
    return <LoginScreen />
  }

  if (!profile?.colonia_id) {
    return <ColoniaCodeScreen />
  }

  if (profile?.role === 'revoked') {
    return (
      <>
        {(currentScreen === 'gateControl' || currentScreen === 'revokedAccess') && (
          <RevokedAccessScreen
            apiUrl={API_URL}
            authToken={session.access_token}
            onNavigateToPayment={() => setCurrentScreen('revokedPayment')}
          />
        )}
        {currentScreen === 'revokedPayment' && (
          <MaintenancePaymentScreen
            apiUrl={API_URL}
            authToken={session.access_token}
            onBack={() => setCurrentScreen('revokedAccess')}
            onSuccess={() => setCurrentScreen('gateControl')}
          />
        )}
      </>
    )
  }

  return (
    <>
      {currentScreen === 'gateControl' && (
        <GateControl 
          apiUrl={API_URL} 
          authToken={session.access_token}
          onNavigateToPayment={() => setCurrentScreen('maintenancePayment')}
        />
      )}
      {currentScreen === 'maintenancePayment' && (
        <MaintenancePaymentScreen
          apiUrl={API_URL}
          authToken={session.access_token}
          onBack={() => setCurrentScreen('gateControl')}
        />
      )}
    </>
  )
}

export default function App() {
  return (
    <TamaguiProvider config={tamaguiConfig}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppContent />
          <StatusBar style='auto' />
        </AuthProvider>
      </QueryClientProvider>
    </TamaguiProvider>
  )
}
