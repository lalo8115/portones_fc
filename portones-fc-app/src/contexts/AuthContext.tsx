import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { AuthRequest, Prompt, ResponseType } from 'expo-auth-session'
import { Platform } from 'react-native'
import { createClient, Session } from '@supabase/supabase-js'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import * as AuthSession from 'expo-auth-session'

WebBrowser.maybeCompleteAuthSession()

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''

interface Colonia {
  id: string
  nombre: string
  maintenance_monthly_amount?: number | null
  payment_due_day?: number | null
}

interface UserProfile {
  id: string
  email: string
  full_name?: string | null
  role: 'admin' | 'user' | 'revoked'
  house_id: string | null
  colonia_id: string | null
  colonia: Colonia | null
  house?: any | null
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
  updateApartmentUnit: (street: string, externalNumber: string, numberOfPeople?: number, fullName?: string) => Promise<UserProfile>
  signOut: () => Promise<void>
  loading: boolean
  refreshProfile: () => Promise<void>
  getToken: () => Promise<string | null>
  getColoniaStreets: (coloniaId: string) => Promise<string[]>
  checkHouseAvailability: (coloniaId: string, street: string, externalNumber: string) => Promise<{ available: boolean; remainingSpots: number; maxPeople: number }>
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
  const pendingGoogleSignIn = useRef<{
    resolve: () => void
    reject: (error: any) => void
  } | null>(null)

  // For development, use localhost. In production, use the deployed API URL
  const apiUrl = Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : (process.env.EXPO_PUBLIC_API_URL || 'https://portones-fc.onrender.com')
  
  console.log('API URL:', apiUrl, 'ENV:', process.env.EXPO_PUBLIC_API_URL)

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

  // Auto-refresh token before it expires
  useEffect(() => {
    if (!session) return

    // Calculate time until token expires (refresh 5 minutes before expiration)
    const expiresAt = session.expires_at
    if (!expiresAt) return

    const expiresIn = (expiresAt * 1000) - Date.now()
    const refreshTime = expiresIn - (5 * 60 * 1000) // 5 minutes before expiration

    if (refreshTime <= 0) {
      // Token already expired or about to expire, refresh immediately
      supabase.auth.refreshSession().catch((err) => {
        console.error('Failed to refresh session immediately:', err)
      })
      return
    }

    // Set timer to refresh before expiration
    const timer = setTimeout(async () => {
      try {
        const { error } = await supabase.auth.refreshSession()
        if (error) {
          console.error('Failed to refresh session:', error)
        }
      } catch (err) {
        console.error('Error refreshing session:', err)
      }
    }, refreshTime)

    return () => clearTimeout(timer)
  }, [session])

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

  const updateApartmentUnit = async (
    street: string,
    externalNumber: string,
    numberOfPeople: number = 1,
    fullName?: string
  ) => {
    if (!session?.access_token) {
      throw new Error('Sesión no encontrada, vuelve a iniciar sesión')
    }

    const payload: {
      street: string
      external_number: string
      number_of_people: number
      full_name?: string
    } = {
      street,
      external_number: externalNumber,
      number_of_people: numberOfPeople
    }

    if (fullName?.trim()) {
      payload.full_name = fullName.trim()
    }

    const response = await fetch(`${apiUrl}/profile/apartment-unit`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null)
      throw new Error(errorBody?.message || 'No se pudo actualizar el domicilio')
    }

    const data = await response.json()
    setProfile(data)
    return data
  }

  const checkHouseAvailability = async (coloniaId: string, street: string, externalNumber: string) => {
    if (!session?.access_token) {
      throw new Error('Sesión no encontrada, vuelve a iniciar sesión')
    }

    const response = await fetch(`${apiUrl}/profile/check-house-availability`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        colonia_id: coloniaId,
        street,
        external_number: externalNumber
      })
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null)
      throw new Error(errorBody?.message || 'No se pudo verificar la disponibilidad')
    }

    const data = await response.json()
    return {
      available: data.available,
      remainingSpots: data.remainingSpots,
      maxPeople: data.maxPeople
    }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const signInWithGoogleIdToken = async (): Promise<void> => {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || ''
    const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || ''
    const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || ''
    const expoClientId = process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID || ''

    const clientId =
      Platform.OS === 'web'
        ? webClientId
        : Platform.OS === 'ios'
          ? iosClientId
          : Platform.OS === 'android'
            ? androidClientId
            : expoClientId

    if (!clientId) {
      throw new Error(
        'Faltan Client IDs de Google. Define EXPO_PUBLIC_GOOGLE_*_CLIENT_ID para usar el flujo por token.'
      )
    }

    // En web necesitamos un redirect_uri 100% determinístico para configurar Google Cloud Console.
    // `makeRedirectUri()` en web puede incluir paths internos y causar redirect_uri_mismatch.
    const redirectUri =
      Platform.OS === 'web' ? window.location.origin : AuthSession.makeRedirectUri({ path: 'auth/callback' })

    if (Platform.OS === 'web') {
      console.log('Google OAuth redirectUri (web):', redirectUri)
    }

    // --- FIX: Restauramos la generación y envío del Nonce ---
    // Google REQUIERE nonce para response_type=id_token.
    // Usamos un nonce simple alfanumérico.
    const rawNonce = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
    const nonce = rawNonce
    const state = `${Date.now()}-${Math.random().toString(36).slice(2)}`

    const request = new AuthRequest({
      clientId,
      redirectUri,
      responseType: ResponseType.IdToken,
      scopes: ['openid', 'email', 'profile'],
      state,
      usePKCE: false,
      prompt: Prompt.SelectAccount,
      extraParams: { nonce } // RESTAURADO: Necesario para Google
    })

    if (Platform.OS === 'web') {
      try {
        const authUrl = await request.makeAuthUrlAsync({
          authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth'
        })
        console.log('Google OAuth authUrl (web):', authUrl)
      } catch (e) {
        console.warn('No se pudo construir authUrl para debug:', e)
      }
    }

    const result = await request.promptAsync({
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth'
    })

    if (result.type !== 'success') {
      if (result.type === 'cancel' || result.type === 'dismiss') {
        throw new Error('Autenticación cancelada por el usuario')
      }
      throw new Error('No se completó la autenticación con Google')
    }

    const idToken = (result.params as any)?.id_token
    if (!idToken) {
      throw new Error('Google no devolvió id_token (revisa client_id/redirect_uri)')
    }

    // Decodificación simple para verificar nonce si es necesario (opcional ahora que "Skip check" está activo)
    const decodeJwtPayload = (jwt: string): any | null => {
      try {
        const parts = jwt.split('.')
        if (parts.length < 2) return null
        const base64Url = parts[1]
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
        const json = decodeURIComponent(
          atob(padded).split('').map((c) => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`).join('')
        )
        return JSON.parse(json)
      } catch {
        return null
      }
    }

    const tokenPayload = decodeJwtPayload(idToken)
    const tokenNonce: string | undefined = tokenPayload?.nonce

    // Usamos el nonce del token si existe, sino el generado
    const nonceForSupabase = tokenNonce || nonce

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
      nonce: nonceForSupabase
    })

    if (error) throw error
  }

  const signInWithGoogle = async () => {
    try {
      const isWeb = Platform.OS === 'web'

      // Opción 2: en web, NO usar el OAuth hospedado por Supabase (para que Google muestre tu dominio).
      // En su lugar, obtener id_token directo de Google y crear sesión en Supabase con signInWithIdToken.
      if (isWeb) {
        if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
          throw new Error(
            'Falta EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID. Configúralo para login con Google en web (id_token).'
          )
        }

        // Asegura que llamadas concurrentes no se mezclen.
        if (pendingGoogleSignIn.current) {
          throw new Error('Ya hay un inicio de sesión en progreso')
        }

        return await new Promise<void>(async (resolve, reject) => {
          pendingGoogleSignIn.current = { resolve, reject }
          try {
            await signInWithGoogleIdToken()
            pendingGoogleSignIn.current?.resolve()
          } catch (e) {
            pendingGoogleSignIn.current?.reject(e)
          } finally {
            pendingGoogleSignIn.current = null
          }
        })
      }

      {
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
          console.log('Autenticación exitosa, intercambiando code por sesión...')
          const url = (result as any).url
          if (!url) {
            throw new Error('No se recibió URL de retorno para completar la sesión')
          }

          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(url)
          if (exchangeError) {
            console.error('Error en exchangeCodeForSession:', exchangeError)
            throw exchangeError
          }
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

  const getToken = async (): Promise<string | null> => {
    // Check if we have a session
    if (!session) {
      return null
    }

    // Check if token is about to expire (within 1 minute)
    const expiresAt = session.expires_at
    if (expiresAt) {
      const expiresIn = (expiresAt * 1000) - Date.now()
      if (expiresIn < 60 * 1000) {
        // Token about to expire, refresh it
        try {
          const { data, error } = await supabase.auth.refreshSession()
          if (error) throw error
          return data.session?.access_token || null
        } catch (err) {
          console.error('Failed to refresh token:', err)
          return session.access_token
        }
      }
    }

    return session.access_token
  }

  const getColoniaStreets = async (coloniaId: string): Promise<string[]> => {
    if (!session?.access_token) {
      throw new Error('Sesión no encontrada, vuelve a iniciar sesión')
    }

    // First validate colonia and get streets
    const response = await fetch(`${apiUrl}/colonias/${coloniaId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null)
      throw new Error(errorBody?.message || 'No se pudo obtener las calles de la colonia')
    }

    const data = await response.json()

    // Now update profile with colonia_id using joinColonia
    try {
      const updatedProfile = await joinColonia(coloniaId)
      setProfile(updatedProfile)
    } catch (err) {
      // Log error but don't fail - we still have the streets
      console.error('Error updating colonia_id:', err)
    }

    return data.streets || []
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    signIn,
    signUp,
    signInWithGoogle,
    joinColonia,
    updateApartmentUnit,
    signOut,
    loading,
    refreshProfile,
    getToken,
    getColoniaStreets,
    checkHouseAvailability
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
