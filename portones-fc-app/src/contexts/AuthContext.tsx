import React, { createContext, useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { createClient, Session } from '@supabase/supabase-js'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'

WebBrowser.maybeCompleteAuthSession()

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''

interface Colonia {
  id: string
  nombre: string
  maintenance_monthly_amount?: number | null
}

interface UserProfile {
  id: string
  email: string
  role: 'admin' | 'resident' | 'revoked'
  apartment_unit: string | null
  colonia_id: string | null
  colonia: Colonia | null
  created_at: string
  updated_at: string
}

interface AuthContextType {
  session: Session | null
  user: any
  profile: UserProfile | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  joinColonia: (coloniaCode: string) => Promise<UserProfile>
  signOut: () => Promise<void>
  loading: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [supabase] = useState(() => createClient(supabaseUrl, supabaseAnonKey))

  const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'

  const fetchProfile = async (userId: string, token: string) => {
    try {
      const response = await fetch(`${apiUrl}/profile`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const contentType = response.headers.get('content-type')
        let errorMessage = `HTTP ${response.status}`
        
        if (contentType?.includes('application/json')) {
          try {
            const errorData = await response.json()
            errorMessage = errorData.message || errorData.error || errorMessage
          } catch {
            errorMessage = `HTTP ${response.status}: Invalid JSON response`
          }
        } else {
          const text = await response.text()
          errorMessage = `HTTP ${response.status}: ${text.substring(0, 100)}`
        }
        
        console.error('Error fetching profile:', errorMessage)
        return null
      }

      const contentType = response.headers.get('content-type')
      if (!contentType?.includes('application/json')) {
        console.error('Error fetching profile: Response is not JSON', await response.text())
        return null
      }

      const data = await response.json()
      setProfile(data)
      return data
    } catch (error) {
      console.error('Error fetching profile:', error)
      return null
    }
  }

  const refreshProfile = async () => {
    if (session?.user?.id && session?.access_token) {
      await fetchProfile(session.user.id, session.access_token)
    }
  }

  // Retry fetching profile if it initially failed
  const retryProfileFetch = async () => {
    if (session?.user?.id && session?.access_token) {
      let retries = 0
      const maxRetries = 3
      
      while (retries < maxRetries && !profile) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (retries + 1)))
        const result = await fetchProfile(session.user.id, session.access_token)
        if (result) break
        retries++
      }
    }
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user?.id && session?.access_token) {
        fetchProfile(session.user.id, session.access_token)
          .catch((err) => {
            console.error('Failed to fetch initial profile:', err)
          })
          .finally(() => {
            setLoading(false)
          })
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user?.id && session?.access_token) {
        fetchProfile(session.user.id, session.access_token)
          .catch((err) => {
            console.error('Failed to fetch profile on auth change:', err)
            // Trigger retry mechanism on auth state change
            setTimeout(() => retryProfileFetch(), 2000)
          })
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Retry profile fetch periodically if it's null but session exists
  useEffect(() => {
    if (session?.user?.id && session?.access_token && !profile && !loading) {
      const timer = setTimeout(() => {
        retryProfileFetch()
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [session, profile, loading])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    if (error) throw error
  }

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password
    })
    if (error) throw error
  }

  const joinColonia = async (coloniaCode: string) => {
    if (!session?.access_token) {
      throw new Error('Sesión no encontrada, vuelve a iniciar sesión')
    }

    const response = await fetch(`${apiUrl}/profile/colonia`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ coloniaCode })
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null)
      throw new Error(errorBody?.message || 'No se pudo registrar la colonia')
    }

    const data = await response.json()
    setProfile(data)
    return data
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const signInWithGoogle = async () => {
    try {
      const isWeb = Platform.OS === 'web'
      
      if (isWeb) {
        // En web, usar el flujo directo sin WebBrowser
        console.log('Iniciando OAuth en web...')
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: `${window.location.origin}`,
            skipBrowserRedirect: false
          }
        })
        
        if (error) {
          console.error('Error en signInWithOAuth:', error)
          throw error
        }
      } else {
        // En mobile, usar WebBrowser
        const redirectTo = Linking.createURL('/auth/callback')
        
        console.log('Iniciando OAuth en mobile...')
        console.log('redirectTo:', redirectTo)
        
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            skipBrowserRedirect: true
          }
        })

        if (error) {
          console.error('Error en signInWithOAuth:', error)
          throw error
        }

        if (!data?.url) {
          throw new Error('No se obtuvo URL de autenticación')
        }

        console.log('Abriendo navegador para autenticación...')
        
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectTo,
          {
            showInRecents: true
          }
        )

        console.log('Resultado de autenticación:', result.type)

        if (result.type === 'success') {
          console.log('Autenticación exitosa')
          return
        }
        
        if (result.type === 'cancel') {
          throw new Error('Autenticación cancelada por el usuario')
        }

        if (result.type === 'dismiss') {
          throw new Error('Diálogo de autenticación cerrado')
        }
      }
    } catch (error: any) {
      console.error('Error en signInWithGoogle:', error.message || error)
      throw error
    }
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    signIn,
    signUp,
    signInWithGoogle,
    joinColonia,
    signOut,
    loading,
    refreshProfile
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
