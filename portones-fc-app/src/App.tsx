import React, { useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { TamaguiProvider } from 'tamagui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ColoniaCodeScreen } from './screens/ColoniaCodeScreen'
import { GateControl } from './screens/GateControl'
import { LoginScreen } from './screens/LoginScreen'
import { MaintenancePaymentScreen } from './screens/MaintenancePaymentScreen'
import tamaguiConfig from '../tamagui.config'

const queryClient = new QueryClient()

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'

type NavigationScreen = 'gateControl' | 'maintenancePayment'

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
