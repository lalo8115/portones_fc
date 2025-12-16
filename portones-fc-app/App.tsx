import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { TamaguiProvider } from 'tamagui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './AuthContext'
import { GateControl } from './GateControl'
import { LoginScreen } from './LoginScreen'
import tamaguiConfig from './tamagui.config'

const queryClient = new QueryClient()

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'

const AppContent: React.FC = () => {
  const { session, loading } = useAuth()

  if (loading) {
    return null // O un componente de carga
  }

  if (!session) {
    return <LoginScreen />
  }

  return <GateControl apiUrl={API_URL} authToken={session.access_token} />
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
