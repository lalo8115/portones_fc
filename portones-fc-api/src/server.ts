import Fastify from 'fastify'
import cors from '@fastify/cors'
import { createClient } from '@supabase/supabase-js'
import { config } from './config/env'
import { connectMQTT } from './plugins/mqtt'
import { getAllGatesStatus } from './state/gates'

// Initialize Fastify
const fastify = Fastify({
  logger: {
    level: 'error'
  }
})

// Register CORS plugin
await fastify.register(cors, {
  origin: true, // Allow all origins (development)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
})

// Initialize Supabase clients BEFORE hooks
// Anon client for JWT validation
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
)

// Service role client for database operations (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

// Authentication middleware - BEFORE route handlers
fastify.addHook('preHandler', async (request, reply) => {
  // Skip auth for health check and public endpoints
  const publicRoutes = [
    '/health',
    '/dev/test-mqtt',
    '/config/openpay-public-key',
    '/config/openpay-device-session',
    '/payment/tokenize'
  ]
  
  if (publicRoutes.includes(request.url)) {
    return
  }

  const authHeader = request.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header'
    })
    return
  }

  const token = authHeader.substring(7)

  try {
    const {
      data: { user },
      error
    } = await supabase.auth.getUser(token)

    if (error || !user) {
      reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      })
      return
    }

    // Attach user to request
    ;(request as any).user = user
  } catch (error) {
    fastify.log.error({ error }, 'Auth error')
    reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    })
  }
})

// NOW define routes after middleware is registered
fastify.get('/gates', async (request, reply) => {
  try {
    const user = (request as any).user

    // Get user profile to verify access and colonia
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, colonia_id')
      .eq('id', user.id)
      .single()

    // If profile doesn't exist, create it with 'user' role
    if (profileError && profileError.code === 'PGRST116') {
      // PGRST116 = no rows returned
      fastify.log.warn(`Profile for user ${user.id} not found, creating one`)
      const { error: createError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: user.id,
          role: 'user',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      if (createError) {
        fastify.log.error({ error: createError }, 'Failed to create profile')
        reply.status(403).send({
          error: 'Forbidden',
          message: 'Unable to verify user access'
        })
        return
      }
    } else if (profileError || !profile) {
      fastify.log.error({ error: profileError }, 'Error fetching profile')
      reply.status(403).send({
        error: 'Forbidden',
        message: 'User profile not found'
      })
      return
    }

    const userProfile = profile ?? { role: 'user', colonia_id: null }

    if (userProfile.role === 'revoked') {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'Access has been revoked'
      })
      return
    }

    // Get all gates status with colonia info
    const allGatesStatus = getAllGatesStatus()

    // Get gates info from database with colonia
    const { data: gatesDb, error: gatesError } = await supabaseAdmin
      .from('gates')
      .select('id, name, enabled, type, colonia_id, colonias(id, nombre)')

    if (gatesError) {
      fastify.log.error({ error: gatesError }, 'Error fetching gates')
    }


    // Filter gates by user's colonia if they have one
    const filteredGates = Object.entries(allGatesStatus)
      .map(([id, status]) => {
        const numericId = Number(id)
        const dbGate = gatesDb?.find((g: any) => g.id === numericId)

        // Only include gate if:
        // 1. User has no colonia (legacy/migration support)
        // 2. Gate has no colonia (public gates)
        // 3. User's colonia matches gate's colonia
        const hasAccess =
          !userProfile.colonia_id ||
          !dbGate?.colonia_id ||
          userProfile.colonia_id === dbGate?.colonia_id

        return {
          id: numericId,
          status,
          name: dbGate?.name || `Portón ${id}`,
          enabled: dbGate?.enabled ?? true,
          type: dbGate?.type || 'ENTRADA',
          colonia_id: dbGate?.colonia_id || null,
          colonia: dbGate?.colonias || null,
          hasAccess
        }
      })
      .filter((gate: any) => gate.hasAccess)

    return { gates: filteredGates }
  } catch (error) {
    fastify.log.error({ error }, 'Error in /gates')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Failed to get gates status'
    })
  }
})

// Get colonia details (streets)
fastify.get<{ Params: { coloniaId: string } }>('/colonias/:coloniaId', async (request, reply) => {
  try {
    const user = (request as any).user
    const { coloniaId } = request.params

    if (!coloniaId || !coloniaId.trim()) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'El ID de la colonia es requerido'
      })
      return
    }

    // Fetch colonia details including streets
    const { data: colonia, error: coloniaError } = await supabaseAdmin
      .from('colonias')
      .select('id, nombre, streets')
      .eq('id', coloniaId.trim())
      .single()

    if (coloniaError || !colonia) {
      reply.status(404).send({
        error: 'Not Found',
        message: 'Colonia no encontrada'
      })
      return
    }

    // Return colonia with streets
    reply.send({
      id: colonia.id,
      nombre: colonia.nombre,
      streets: colonia.streets || []
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /colonias/:coloniaId')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Failed to get colonia details'
    })
  }
})

// Access history route
fastify.get('/access/history', async (request, reply) => {
  try {
    const user = (request as any).user
    const { limit: limitRaw } = request.query as any

    const parsedLimit = Number(limitRaw)
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 200)
      : 50

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, house_id, colonia_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'User profile not found'
      })
      return
    }

    // Obtener user_ids de usuarios de la misma casa y colonia
    let allowedUserIds: string[] = []
    
    if (profile.role !== 'admin') {
      // Validar que el usuario tenga house_id y colonia_id
      if (!profile.house_id || !profile.colonia_id) {
        reply.status(403).send({
          error: 'Forbidden',
          message: 'User must belong to a house and community'
        })
        return
      }

      // Obtener todos los usuarios de la misma casa
      const { data: householdUsers, error: householdError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('house_id', profile.house_id)
        .neq('role', 'revoked')

      if (householdError) {
        throw householdError
      }

      allowedUserIds = (householdUsers || []).map((u: any) => u.id)
    }

    let query = supabaseAdmin
      .from('access_logs')
      .select('id, user_id, action, status, method, timestamp, gate_id', {
        count: 'exact'
      })
      .order('timestamp', { ascending: false })
      .limit(limit)

    if (profile.role !== 'admin') {
      // Filtrar por los usuarios de la misma casa
      if (allowedUserIds.length > 0) {
        query = query.in('user_id', allowedUserIds)
      } else {
        // Si no hay usuarios en la casa, retornar vacío
        reply.send({
          records: [],
          total: 0
        })
        return
      }
    }

    const { data: logs, error: logsError, count } = await query

    if (logsError) {
      throw logsError
    }

    const gateIds = Array.from(
      new Set(
        (logs ?? [])
          .map((log: any) => log.gate_id)
          .filter((id: any) => typeof id === 'number')
      )
    )

    const { data: gatesData, error: gatesError } = gateIds.length
      ? await supabaseAdmin.from('gates').select('id, name, type').in('id', gateIds)
      : { data: [], error: null }

    if (gatesError) {
      throw gatesError
    }

    // Get user emails from auth.users
    const userIds = Array.from(
      new Set((logs ?? []).map((log: any) => log.user_id).filter(Boolean))
    )

    let emailsMap = new Map<string, string>()
    
    if (userIds.length > 0) {
      // Get emails from auth.users using admin client
      const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers()
      
      if (!usersError && usersData?.users) {
        usersData.users.forEach((authUser: any) => {
          if (userIds.includes(authUser.id)) {
            emailsMap.set(authUser.id, authUser.email || '')
          }
        })
      }
    }

    let profilesMap = new Map<string, { house_address: string | null }>()

    if (profile.role === 'admin') {
      const profileUserIds = Array.from(
        new Set((logs ?? []).map((log: any) => log.user_id).filter(Boolean))
      )

      if (profileUserIds.length) {
        const { data: profilesData, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('id, house_id, houses!fk_profiles_house(street, external_number)')
          .in('id', profileUserIds)

        if (profilesError) {
          throw profilesError
        }

        profilesData?.forEach((p: any) => {
          const house = p.houses as any
          const address = house ? `${house.street} ${house.external_number}` : null
          profilesMap.set(p.id, { house_address: address })
        })
      }
    } else {
      // Para usuarios normales, obtener info de todos los usuarios de la casa
      if (allowedUserIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('id, house_id, houses!fk_profiles_house(street, external_number)')
          .in('id', allowedUserIds)

        if (profilesError) {
          throw profilesError
        }

        profilesData?.forEach((p: any) => {
          const house = p.houses as any
          const address = house ? `${house.street} ${house.external_number}` : null
          profilesMap.set(p.id, { house_address: address })
        })
      }
    }

    const gatesMap = new Map<number, { name?: string; type?: string }>()
    gatesData?.forEach((g: any) => {
      gatesMap.set(g.id, { name: g.name, type: g.type })
    })

    const records = (logs ?? []).map((log: any) => {
      const gateInfo = gatesMap.get(log.gate_id) || {}
      const profileInfo = profilesMap.get(log.user_id) || { house_address: null }
      const userEmail = emailsMap.get(log.user_id) || null

      return {
      id: log.id,
      gate_id: log.gate_id,
      gate_name: gateInfo.name || (log.gate_id ? `Portón ${log.gate_id}` : 'Portón'),
      gate_type: gateInfo.type || 'ENTRADA',
      user_id: log.user_id,
      user_email: userEmail,
      house_address: profileInfo.house_address ?? null,
      action: log.action === 'OPEN_GATE' ? 'OPEN' : 'CLOSE',
      timestamp: log.timestamp,
      method: log.method || 'APP',
      status: log.status
    }
    })

    reply.send({
      records,
      total: count ?? records.length
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /access/history')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Failed to fetch access history'
    })
  }
})

// Ruta de prueba MQTT
fastify.post('/dev/test-mqtt', async (request, reply) => {
  try {
    const client = await connectMQTT();

    const payload = {
      action: 'OPEN',
      source: 'backend',
      timestamp: new Date().toISOString()
      
    };

    client.publish('portones/gate/command', JSON.stringify(payload), { qos: 1 });

    return { ok: true, payload };
  } catch (err) {
    console.error(err);
    reply.status(500).send({ ok: false, error: err });
  }
});

// Openpay API configuration
const openpayApiUrl = config.OPENPAY_PRODUCTION
  ? 'https://api.openpay.mx/v1'
  : 'https://sandbox-api.openpay.mx/v1'

const maintenanceAmount = config.MAINTENANCE_MONTHLY_AMOUNT
const maintenanceCurrency = 'MXN'

// Helper to make authenticated requests to Openpay API
const openpayRequest = async (
  method: string,
  endpoint: string,
  body?: any
): Promise<any> => {
  const url = `${openpayApiUrl}/${config.OPENPAY_MERCHANT_ID}${endpoint}`
  const auth = Buffer.from(`${config.OPENPAY_PRIVATE_KEY}:`).toString('base64')

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`
    },
    body: body ? JSON.stringify(body) : undefined
  })

  const data: any = await response.json()

  if (!response.ok) {
    const errorMsg = (data?.description as string) || (data?.message as string) || 'Openpay API error'
    throw new Error(errorMsg)
  }

  return data
}

// Health check route
fastify.get('/health', async (request, reply) => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    mqtt: 'unknown'
  }
})

// Config routes - no auth required
fastify.get('/config/openpay-public-key', async (request, reply) => {
  reply.send({
    publicKey: config.OPENPAY_PUBLIC_KEY
  })
})

fastify.get('/config/openpay-device-session', async (request, reply) => {
  try {
    // Generate a mock device session ID for development
    // In production, this should be generated by Openpay JavaScript on the client
    const deviceSessionId = 'dev_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    
    reply.send({
      deviceSessionId
    })
  } catch (error: any) {
    fastify.log.error({ error }, 'Error generating device session')
    reply.status(500).send({
      error: 'Server Error',
      message: error?.message || 'Error generating device session'
    })
  }
})

// Tokenize card endpoint - no auth required, called from client
fastify.post('/payment/tokenize', async (request, reply) => {
  try {
    const {
      card_number,
      holder_name,
      expiration_month,
      expiration_year,
      cvv2
    } = request.body as {
      card_number?: string
      holder_name?: string
      expiration_month?: number
      expiration_year?: number
      cvv2?: string
    }

    // Log para debugging
    fastify.log.info({ card_number, holder_name, expiration_month, expiration_year, cvv2 }, 'Datos recibidos en tokenize')

    if (!card_number || !expiration_month || !expiration_year || !cvv2) {
      fastify.log.warn('Faltan datos de tarjeta. card_number: ' + !!card_number + ', expiration_month: ' + !!expiration_month + ', expiration_year: ' + !!expiration_year + ', cvv2: ' + !!cvv2)
      reply.status(400).send({
        error: 'Bad Request',
        message: 'Faltan datos de tarjeta: card_number=' + !!card_number + ', expiration_month=' + !!expiration_month + ', expiration_year=' + !!expiration_year + ', cvv2=' + !!cvv2
      })
      return
    }

    // Create token via Openpay API
    const token = await openpayRequest('POST', '/tokens', {
      card_number,
      holder_name: holder_name || 'Usuario',
      expiration_month,
      expiration_year,
      cvv2
    })

    reply.send({
      tokenId: token.id,
      id: token.id
    })
  } catch (error: any) {
    fastify.log.error({ error }, 'Error tokenizing card')
    reply.status(400).send({
      error: 'Tokenization Error',
      message: error?.message || 'Error al tokenizar tarjeta'
    })
  }
})

// Payment route - maintenance fee (now accepts tokenId instead of card data)
fastify.post('/payment/maintenance', async (request, reply) => {
  try {
    const user = (request as any).user

    // Obtener colonia y monto de mantenimiento
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('colonia_id, house_id, colonias!fk_profiles_colonia(id, nombre, maintenance_monthly_amount), houses!fk_profiles_house(id, street, external_number)')
      .eq('id', user.id)
      .single() as any

    if (profileError) {
      fastify.log.error({ error: profileError, userId: user.id }, 'Error obteniendo perfil en /payment/maintenance')
      reply.status(400).send({
        error: 'Bad Request',
        message: 'No se pudo obtener el perfil del usuario',
        details: profileError.message || profileError.code
      })
      return
    }

    const coloniaData = (profile?.colonias as any) || {}
    const coloniaAmount = coloniaData?.maintenance_monthly_amount as number | undefined
    const coloniaId = profile?.colonia_id || null
    const houseId = profile?.house_id || null

    if (!coloniaId || !houseId) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'No hay colonia o casa asignada al usuario'
      })
      return
    }
    const amountToCharge =
      typeof coloniaAmount === 'number' && !Number.isNaN(coloniaAmount)
        ? coloniaAmount
        : maintenanceAmount

    if (!amountToCharge || amountToCharge <= 0) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'Monto de mantenimiento no configurado'
      })
      return
    }

    // Now expects tokenId and deviceSessionId (no card data)
    const {
      tokenId,
      deviceSessionId,
      cardholderName,
      amount
    } = request.body as {
      tokenId?: string
      deviceSessionId?: string
      cardholderName?: string
      amount?: number
    }

    if (!tokenId) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'Token de tarjeta requerido'
      })
      return
    }

    // Usar el amount del frontend si viene, sino usar amountToCharge calculado
    const finalAmount = amount && amount > 0 ? amount : amountToCharge

    // Create charge via Openpay API using tokenId
    const chargePayload = {
      source_id: tokenId,
      method: 'card',
      amount: finalAmount,
      currency: maintenanceCurrency,
      description: 'Pago de mantenimiento mensual',
      device_session_id: deviceSessionId || undefined,
      customer: {
        name: cardholderName || user?.email || 'Usuario',
        email: user?.email
      }
    }

    const charge = await openpayRequest('POST', '/charges', chargePayload)

    // Log para debugging
    fastify.log.info({ charge }, 'Respuesta de Openpay al crear charge')

    // Guardar el pago en la base de datos
    const currentDate = new Date()
    const { error: paymentError } = await supabaseAdmin
      .from('maintenance_payments')
      .insert({
        user_id: user.id,
        colonia_id: coloniaId,
        house_id: houseId,
        amount: finalAmount,
        payment_date: currentDate.toISOString(),
        period_month: currentDate.getMonth() + 1,
        period_year: currentDate.getFullYear(),
        transaction_id: charge.id,
        status: charge.status === 'completed' ? 'completed' : 'pending',
        payment_method: 'card'
      })

    if (paymentError) {
      fastify.log.error({ error: paymentError }, 'Error al guardar el pago en la base de datos')
    }

    // Actualizar perfil y casa: resetear adeudos_months a 0 y cambiar role a 'user'
    // Openpay puede devolver 'completed' o 'success', vamos a aceptar ambos
    const chargeSuccessful = charge.status === 'completed' || charge.status === 'success' || !charge.error
    
    fastify.log.info('Verificando si pago fue exitoso. Status: ' + charge.status + ', Successful: ' + chargeSuccessful)
    
    if (chargeSuccessful) {
      fastify.log.info('Pago completado para usuario ' + user.id + '. Actualizando perfil y casa...')
      const { data: updateData, error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          role: 'user',
          updated_at: currentDate.toISOString()
        })
        .eq('id', user.id)
        .select()

      if (updateError) {
        fastify.log.error({ error: updateError }, 'Error al actualizar el perfil después del pago')
      } else {
        fastify.log.info({ data: updateData }, 'Perfil actualizado exitosamente para usuario ' + user.id)
      }

      // Actualizar la casa para resetear adeudos_months a 0
      if (houseId) {
        const { error: houseUpdateError } = await supabaseAdmin
          .from('houses')
          .update({
            adeudos_months: 0,
            updated_at: currentDate.toISOString()
          })
          .eq('id', houseId)

        if (houseUpdateError) {
          fastify.log.error({ error: houseUpdateError }, 'Error al actualizar la casa después del pago')
        } else {
          fastify.log.info('Casa actualizada exitosamente para user ' + user.id)
        }
      }
    } else {
      fastify.log.warn('Pago pendiente o fallido para usuario ' + user.id + ' (status: ' + charge.status + ')')
    }

    reply.send({
      ok: true,
      chargeId: charge.id,
      status: charge.status,
      amount: finalAmount,
      currency: maintenanceCurrency,
      colonia_id: profile?.colonia_id || null,
      colonia_nombre: coloniaData?.nombre || null
    })
  } catch (error: any) {
    fastify.log.error({ error }, 'Error procesando pago de mantenimiento')

    const message = error?.message || 'Error al procesar el pago'

    reply.status(400).send({
      error: 'Payment Error',
      message
    })
  }
})

// Get payment status for current user
fastify.get('/payment/status', async (request, reply) => {
  try {
    const user = (request as any).user

    // Obtener colonia y casa (house_id)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('colonia_id, house_id, colonias!fk_profiles_colonia(maintenance_monthly_amount)')
      .eq('id', user.id)
      .single() as any

    if (profileError) {
      fastify.log.warn({ error: profileError }, 'No se pudo obtener el perfil del usuario')
      reply.send({
        lastPaymentDate: null,
        lastPaymentAmount: null,
        nextPaymentDue: null,
        isPaid: false,
        daysUntilDue: null,
        currentPeriod: {
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear()
        },
        maintenanceAmount: null,
        reason: 'profile_not_found'
      })
      return
    }

    const coloniaData = (profile?.colonias as any) || {}
    const maintenanceAmount = coloniaData?.maintenance_monthly_amount || 500
    const coloniaId = profile?.colonia_id || null
    const houseId = profile?.house_id || null

    if (!coloniaId || !houseId) {
      reply.send({
        lastPaymentDate: null,
        lastPaymentAmount: null,
        nextPaymentDue: null,
        isPaid: false,
        daysUntilDue: null,
        currentPeriod: {
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear()
        },
        maintenanceAmount,
        reason: 'missing_colonia_or_apartment'
      })
      return
    }

    // Obtener el último pago del usuario
    const { data: lastPayment, error: paymentError } = await supabaseAdmin
      .from('maintenance_payments')
      .select('*')
      .eq('colonia_id', coloniaId)
      .eq('house_id', houseId)
      .eq('status', 'completed')
      .order('payment_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (paymentError) {
      reply.status(500).send({
        error: 'Server Error',
        message: 'Error al obtener el último pago'
      })
      return
    }

    // Calcular fechas
    const currentDate = new Date()
    const currentMonth = currentDate.getMonth() + 1
    const currentYear = currentDate.getFullYear()
    
    // Próximo pago es el día 1 del próximo mes
    const nextPaymentDate = new Date(currentYear, currentMonth, 1)
    const daysUntilPayment = Math.ceil((nextPaymentDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))

    // Verificar si ya pagó este mes
    const isPaid = lastPayment && 
                   lastPayment.period_month === currentMonth && 
                   lastPayment.period_year === currentYear

    reply.send({
      lastPaymentDate: lastPayment?.payment_date || null,
      lastPaymentAmount: lastPayment?.amount || null,
      nextPaymentDue: nextPaymentDate.toISOString(),
      isPaid: !!isPaid,
      daysUntilDue: daysUntilPayment,
      currentPeriod: {
        month: currentMonth,
        year: currentYear
      },
      maintenanceAmount
    })
  } catch (error: any) {
    fastify.log.error({ error }, 'Error obteniendo estado de pago')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Error al obtener el estado de pago'
    })
  }
})

// Profile route - returns authenticated user's profile
fastify.get('/profile', async (request, reply) => {
  try {
    const user = (request as any).user

    // Get user profile
    let { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*, colonias!fk_profiles_colonia(id, nombre, maintenance_monthly_amount), houses!fk_profiles_house(id, street, external_number, number_of_people)')
      .eq('id', user.id)
      .single()

    // If profile doesn't exist, create it with 'user' role
    if (!profile) {
      if (profileError && profileError.code !== 'PGRST116') {
        fastify.log.warn({ error: profileError }, 'Profile lookup returned error, attempting auto-create')
      }

      fastify.log.info(`Profile for user ${user.id} not found, creating one`)
      const { data: newProfile, error: createError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: user.id,
          role: 'user',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (createError) {
        if ((createError as any)?.code === '23505') {
          // Profile was created by another request; re-fetch it
          const { data: existingProfile, error: fetchError } = await supabaseAdmin
            .from('profiles')
            .select('*, colonias!fk_profiles_colonia(id, nombre, maintenance_monthly_amount), houses!fk_profiles_house(id, street, external_number, number_of_people)')
            .eq('id', user.id)
            .single()

          if (fetchError || !existingProfile) {
            fastify.log.error({ error: fetchError }, 'Failed to fetch profile after duplicate insert')
            reply.status(500).send({
              error: 'Server Error',
              message: 'Failed to fetch user profile'
            })
            return
          }

          profile = existingProfile
        } else {
          fastify.log.error({ error: createError }, 'Failed to create profile')
          reply.status(500).send({
            error: 'Server Error',
            message: 'Failed to create user profile'
          })
          return
        }
      } else {
        profile = newProfile
      }
    }

    reply.send({
      id: profile.id,
      email: user.email,
      role: profile.role,
      house_id: profile.house_id,
      colonia_id: profile.colonia_id,
      colonia: profile.colonias || null,
      house: profile.houses || null,
      created_at: profile.created_at,
      updated_at: profile.updated_at
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /profile')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Failed to fetch profile'
    })
  }
})

// Asigna colonia al perfil usando un código proporcionado
fastify.post('/profile/colonia', async (request, reply) => {
  try {
    const user = (request as any).user
    const { coloniaCode } = request.body as { coloniaCode?: string }

    if (!coloniaCode || typeof coloniaCode !== 'string' || !coloniaCode.trim()) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'El código de colonia es requerido'
      })
      return
    }

    const trimmedCode = coloniaCode.trim()

    const { data: colonia, error: coloniaError } = await supabaseAdmin
      .from('colonias')
      .select('id, nombre')
      .eq('id', trimmedCode)
      .single()

    if (coloniaError || !colonia) {
      reply.status(404).send({
        error: 'Not Found',
        message: 'Código de colonia inválido'
      })
      return
    }

    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ colonia_id: colonia.id, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select('id, role, house_id, colonia_id, created_at, updated_at, colonias!fk_profiles_colonia(id, nombre)')
      .single()

    if (updateError || !updatedProfile) {
      fastify.log.error({ error: updateError }, 'Error updating colonia_id')
      reply.status(500).send({
        error: 'Server Error',
        message: 'No se pudo actualizar la colonia'
      })
      return
    }

    reply.send({
      id: updatedProfile.id,
      email: user.email,
      role: updatedProfile.role,
      house_id: updatedProfile.house_id,
      colonia_id: updatedProfile.colonia_id,
      colonia: updatedProfile.colonias || null,
      created_at: updatedProfile.created_at,
      updated_at: updatedProfile.updated_at
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /profile/colonia')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Failed to update colonia'
    })
  }
})

// Gate control route
fastify.post('/gate/open', async (request, reply) => {
  try {
    const user = (request as any).user
    const { gateId, method } = request.body as any

    const accessMethod = (() => {
      const raw = typeof method === 'string' ? method.trim().toUpperCase() : ''
      return raw === 'QR' ? 'QR' : 'APP'
    })()

    // Validate gateId
    if (!gateId || typeof gateId !== 'number' || gateId < 1 || gateId > 4) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'gateId must be a number between 1 and 4'
      })
      return
    }

    fastify.log.info(`User ${user.id} requested to open gate ${gateId}`)

    // 1. Get user profile and validate role
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, house_id, colonia_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      fastify.log.error({ error: profileError }, 'Profile not found')
      reply.status(403).send({
        error: 'Forbidden',
        message: 'User profile not found'
      })
      return
    }

    // 2. Check if user has access (not revoked)
    if (profile.role === 'revoked') {
      fastify.log.warn(`User ${user.id} access revoked`)

      await supabaseAdmin.from('access_logs').insert({
        user_id: user.id,
        action: 'OPEN_GATE',
        status: 'DENIED_REVOKED',
        method: accessMethod,
        gate_id: gateId,
        ip_address: request.ip
      })

      reply.status(403).send({
        error: 'Forbidden',
        message: 'Access has been revoked. Contact administration.'
      })
      return
    }

    // 3. Validate gate exists and is enabled
    const { data: gate, error: gateError } = await supabaseAdmin
      .from('gates')
      .select('id, enabled, colonia_id')
      .eq('id', gateId)
      .single()

    if (gateError || !gate) {
      fastify.log.warn(`Gate ${gateId} not found`)
      await supabaseAdmin.from('access_logs').insert({
        user_id: user.id,
        action: 'OPEN_GATE',
        status: 'DENIED_NO_ACCESS',
        method: accessMethod,
        gate_id: gateId,
        ip_address: request.ip
      })

      reply.status(404).send({
        error: 'Not Found',
        message: 'Gate not found'
      })
      return
    }

    if (!gate.enabled) {
      fastify.log.warn(`Gate ${gateId} is disabled`)
      await supabaseAdmin.from('access_logs').insert({
        user_id: user.id,
        action: 'OPEN_GATE',
        status: 'DENIED_NO_ACCESS',
        method: accessMethod,
        gate_id: gateId,
        ip_address: request.ip
      })

      reply.status(403).send({
        error: 'Forbidden',
        message: 'Gate is disabled'
      })
      return
    }

    // 4. Validate user belongs to the same colonia as the gate
    if (gate.colonia_id && profile.colonia_id !== gate.colonia_id) {
      fastify.log.warn(`User ${user.id} tried to access gate ${gateId} from different colonia`)
      await supabaseAdmin.from('access_logs').insert({
        user_id: user.id,
        action: 'OPEN_GATE',
        status: 'DENIED_NO_ACCESS',
        method: accessMethod,
        gate_id: gateId,
        ip_address: request.ip
      })

      reply.status(403).send({
        error: 'Forbidden',
        message: 'You do not have access to this gate. Different colonia.'
      })
      return
    }

    // Connect to MQTT if not already connected
    const client = await connectMQTT()

    // Prepare payload
    const payload = {
      action: 'OPEN',
      gateId,
      timestamp: new Date().toISOString(),
      userId: user.id
    }

    // Publish to MQTT topic with callback
    await new Promise<void>((resolve, reject) => {
      client.publish(
        'portones/gate/command',
        JSON.stringify(payload),
        { qos: 1 },
        (error) => {
          if (error) {
            fastify.log.error({ error }, 'MQTT publish error')
            reject(error)
          } else {
            fastify.log.info('Command published successfully')
            resolve()
          }
        }
      )
    })

    // Log successful access
    await supabaseAdmin.from('access_logs').insert({
      user_id: user.id,
      action: 'OPEN_GATE',
      status: 'SUCCESS',
      method: accessMethod,
      gate_id: gateId,
      ip_address: request.ip
    })

    reply.send({
      success: true,
      message: 'Gate opening command sent',
      gateId,
      timestamp: payload.timestamp
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /gate/open')

    if (error instanceof Error) {
      reply.status(500).send({
        error: 'Server Error',
        message: error.message
      })
    } else {
      reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to process gate open request'
      })
    }
  }
})

// Gate close route
fastify.post('/gate/close', async (request, reply) => {
  try {
    const user = (request as any).user
    const { gateId, method } = request.body as any

    const accessMethod = (() => {
      const raw = typeof method === 'string' ? method.trim().toUpperCase() : ''
      return raw === 'QR' ? 'QR' : 'APP'
    })()

    // Validate gateId
    if (!gateId || typeof gateId !== 'number' || gateId < 1 || gateId > 4) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'gateId must be a number between 1 and 4'
      })
      return
    }

    fastify.log.info(`User ${user.id} requested to close gate ${gateId}`)

    // 1. Get user profile and validate role
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, house_id, colonia_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      fastify.log.error({ error: profileError }, 'Profile not found')
      reply.status(403).send({
        error: 'Forbidden',
        message: 'User profile not found'
      })
      return
    }

    // 2. Check if user has access (not revoked)
    if (profile.role === 'revoked') {
      fastify.log.warn(`User ${user.id} access revoked`)

      await supabaseAdmin.from('access_logs').insert({
        user_id: user.id,
        action: 'CLOSE_GATE',
        status: 'DENIED_REVOKED',
        method: accessMethod,
        gate_id: gateId,
        ip_address: request.ip
      })

      reply.status(403).send({
        error: 'Forbidden',
        message: 'Access has been revoked. Contact administration.'
      })
      return
    }

    // 3. Validate gate exists and is enabled
    const { data: gate, error: gateError } = await supabaseAdmin
      .from('gates')
      .select('id, enabled, colonia_id')
      .eq('id', gateId)
      .single()

    if (gateError || !gate) {
      fastify.log.warn(`Gate ${gateId} not found`)
      await supabaseAdmin.from('access_logs').insert({
        user_id: user.id,
        action: 'CLOSE_GATE',
        status: 'DENIED_NO_ACCESS',
        method: accessMethod,
        gate_id: gateId,
        ip_address: request.ip
      })

      reply.status(404).send({
        error: 'Not Found',
        message: 'Gate not found'
      })
      return
    }

    if (!gate.enabled) {
      fastify.log.warn(`Gate ${gateId} is disabled`)
      await supabaseAdmin.from('access_logs').insert({
        user_id: user.id,
        action: 'CLOSE_GATE',
        status: 'DENIED_NO_ACCESS',
        method: accessMethod,
        gate_id: gateId,
        ip_address: request.ip
      })

      reply.status(403).send({
        error: 'Forbidden',
        message: 'Gate is disabled'
      })
      return
    }

    // 4. Validate user belongs to the same colonia as the gate
    if (gate.colonia_id && profile.colonia_id !== gate.colonia_id) {
      fastify.log.warn(`User ${user.id} tried to access gate ${gateId} from different colonia`)
      await supabaseAdmin.from('access_logs').insert({
        user_id: user.id,
        action: 'CLOSE_GATE',
        status: 'DENIED_NO_ACCESS',
        method: accessMethod,
        gate_id: gateId,
        ip_address: request.ip
      })

      reply.status(403).send({
        error: 'Forbidden',
        message: 'You do not have access to this gate. Different colonia.'
      })
      return
    }

    // Connect to MQTT if not already connected
    const client = await connectMQTT()

    // Prepare payload
    const payload = {
      action: 'CLOSE',
      gateId,
      timestamp: new Date().toISOString(),
      userId: user.id
    }

    // Publish to MQTT topic with callback
    await new Promise<void>((resolve, reject) => {
      client.publish(
        'portones/gate/command',
        JSON.stringify(payload),
        { qos: 1 },
        (error) => {
          if (error) {
            fastify.log.error({ error }, 'MQTT publish error')
            reject(error)
          } else {
            fastify.log.info('Close command published successfully')
            resolve()
          }
        }
      )
    })

    // Log successful access
    await supabaseAdmin.from('access_logs').insert({
      user_id: user.id,
      action: 'CLOSE_GATE',
      status: 'SUCCESS',
      method: accessMethod,
      gate_id: gateId,
      ip_address: request.ip
    })

    reply.send({
      success: true,
      message: 'Gate closing command sent',
      gateId,
      timestamp: payload.timestamp
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /gate/close')

    if (error instanceof Error) {
      reply.status(500).send({
        error: 'Server Error',
        message: error.message
      })
    } else {
      reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to process gate close request'
      })
    }
  }
})

// Update apartment unit route
// Check house availability
fastify.post('/profile/check-house-availability', async (request, reply) => {
  try {
    const user = (request as any).user
    const { colonia_id, street, external_number } = request.body as {
      colonia_id?: string
      street?: string
      external_number?: string
    }

    if (!colonia_id || !street || !external_number) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'colonia_id, street y external_number son requeridos'
      })
      return
    }

    // Find the house
    const { data: house, error: houseError } = await supabaseAdmin
      .from('houses')
      .select('id, number_of_people')
      .eq('colonia_id', colonia_id)
      .eq('street', street.trim())
      .eq('external_number', external_number.trim())
      .single()

    if (houseError || !house) {
      reply.status(404).send({
        error: 'Not Found',
        message: 'No se encontró la casa con ese domicilio'
      })
      return
    }

    // Count current occupants (excluding revoked users)
    const { count, error: countError } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('house_id', house.id)
      .neq('role', 'revoked')

    if (countError) {
      fastify.log.error({ error: countError }, 'Error counting house occupants')
      reply.status(500).send({
        error: 'Server Error',
        message: 'Error al verificar los espacios disponibles'
      })
      return
    }

    const currentOccupants = count || 0
    const maxPeople = house.number_of_people || 0
    const remainingSpots = maxPeople - currentOccupants

    reply.send({
      available: remainingSpots > 0,
      remainingSpots: Math.max(0, remainingSpots),
      maxPeople,
      currentOccupants
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /profile/check-house-availability')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Failed to check house availability'
    })
  }
})

fastify.put('/profile/apartment-unit', async (request, reply) => {
  try {
    const user = (request as any).user
    const { street, external_number, number_of_people } = request.body as { 
      street?: string
      external_number?: string
      number_of_people?: number
    }

    // Validate inputs
    if (!street || typeof street !== 'string' || !street.trim()) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'La calle es requerida'
      })
      return
    }

    if (!external_number || typeof external_number !== 'string' || !external_number.trim()) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'El número exterior es requerido'
      })
      return
    }

    // Get user's current profile to get colonia_id
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('colonia_id, house_id')
      .eq('id', user.id)
      .single()

    if (profileError || !userProfile) {
      fastify.log.error({ error: profileError }, 'Error fetching user profile')
      reply.status(404).send({
        error: 'Not Found',
        message: 'Perfil de usuario no encontrado'
      })
      return
    }

    if (!userProfile.colonia_id) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'El usuario debe estar registrado en una colonia primero'
      })
      return
    }

    // Create or update house
    let house
    if (userProfile.house_id) {
      // Update existing house
      const { data: updatedHouse, error: updateError } = await supabaseAdmin
        .from('houses')
        .update({
          street: street.trim(),
          external_number: external_number.trim(),
          number_of_people: number_of_people || 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', userProfile.house_id)
        .select('*')
        .single()

      if (updateError || !updatedHouse) {
        fastify.log.error({ error: updateError }, 'Error updating house')
        reply.status(500).send({
          error: 'Server Error',
          message: 'No se pudo actualizar la casa'
        })
        return
      }
      house = updatedHouse
    } else {
      // Create new house
      const { data: newHouse, error: createError } = await supabaseAdmin
        .from('houses')
        .insert({
          colonia_id: userProfile.colonia_id,
          street: street.trim(),
          external_number: external_number.trim(),
          number_of_people: number_of_people || 1
        })
        .select('*')
        .single()

      if (createError || !newHouse) {
        fastify.log.error({ error: createError }, 'Error creating house')
        reply.status(500).send({
          error: 'Server Error',
          message: 'No se pudo crear la casa'
        })
        return
      }
      house = newHouse
    }

    // Update profile with house_id
    const { data: updatedProfile, error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update({ house_id: house.id, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select('id, role, house_id, colonia_id, created_at, updated_at, colonias!fk_profiles_colonia(id, nombre)')
      .single()

    if (updateProfileError || !updatedProfile) {
      fastify.log.error({ error: updateProfileError }, 'Error updating profile with house_id')
      reply.status(500).send({
        error: 'Server Error',
        message: 'No se pudo actualizar el perfil'
      })
      return
    }

    reply.send({
      id: updatedProfile.id,
      email: user.email,
      role: updatedProfile.role,
      house_id: updatedProfile.house_id,
      colonia_id: updatedProfile.colonia_id,
      colonia: updatedProfile.colonias || null,
      house: house || null,
      created_at: updatedProfile.created_at,
      updated_at: updatedProfile.updated_at
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /profile/apartment-unit')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Failed to update house information'
    })
  }
})

// Get forum posts by category
fastify.get('/forum/posts', async (request, reply) => {
  try {
    const user = (request as any).user
    const { category } = request.query as { category?: string }

    // Validate category
    const validCategories = ['events', 'messages', 'statements']
    if (!category || !validCategories.includes(category)) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid or missing category parameter. Must be: events, messages, or statements'
      })
      return
    }

    // Get user profile to verify colonia
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('colonia_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || !profile.colonia_id) {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'Debes estar asignado a una colonia para ver el foro'
      })
      return
    }

    // Get posts from the same colonia
    const { data: posts, error: postsError } = await supabaseAdmin
      .from('forum_posts')
      .select(`
        id,
        title,
        content,
        category,
        event_date,
        event_time,
        event_duration,
        file_url,
        file_month,
        created_at,
        author_id,
        profiles:author_id (
          id,
          house_id,
          houses:house_id (
            street,
            external_number
          )
        )
      `)
      .eq('colonia_id', profile.colonia_id)
      .eq('category', category)
      .order('created_at', { ascending: false })
      .limit(50)

    if (postsError) {
      fastify.log.error({ error: postsError }, 'Error fetching forum posts')
      reply.status(500).send({
        error: 'Server Error',
        message: 'No se pudieron obtener las publicaciones'
      })
      return
    }

    // Get author names from auth.users
    const authorIds = posts?.map(p => p.author_id) || []
    const uniqueAuthorIds = [...new Set(authorIds)]

    const authorNames: Record<string, string> = {}
    
    for (const authorId of uniqueAuthorIds) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(authorId)
      const email = userData?.user?.email
      if (email) {
        authorNames[authorId] = String(email.split('@')[0] || email)
      }
    }

    // Format response
    const formattedPosts = posts?.map(post => {
      const profileData = (post as any).profiles
      const houseData = Array.isArray(profileData)
        ? profileData[0]?.houses
        : profileData?.houses
      const authorAddress = houseData
        ? `${houseData.street} ${houseData.external_number}`
        : 'Dirección no disponible'

      return {
        id: post.id,
        title: post.title,
        content: post.content,
        category: post.category,
        event_date: (post as any).event_date || null,
        event_time: (post as any).event_time || null,
        event_duration: (post as any).event_duration || null,
        file_url: (post as any).file_url || null,
        file_month: (post as any).file_month || null,
        created_at: post.created_at,
        author_name: authorNames[post.author_id] || 'Usuario',
        author_address: authorAddress,
        replies_count: 0 // For future implementation
      }
    }) || []

    reply.send(formattedPosts)
  } catch (error) {
    fastify.log.error({ error }, 'Error in /forum/posts GET')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Failed to fetch forum posts'
    })
  }
})

// Create new forum post
fastify.post('/forum/posts', async (request, reply) => {
  try {
    const user = (request as any).user
    const { title, content, category, event_date, event_time, event_duration, file_url, file_month } = request.body as {
      title?: string
      content?: string
      category?: string
      event_date?: string
      event_time?: string
      event_duration?: string
      file_url?: string
      file_month?: string
    }

    // Validate input
    if (!title || !content || !category) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'Faltan campos requeridos: title, content, category'
      })
      return
    }

    const validCategories = ['events', 'messages', 'statements']
    if (!validCategories.includes(category)) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'Categoría inválida. Debe ser: events, messages, o statements'
      })
      return
    }

    // Validate length
    if (title.length > 100) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'El título no puede exceder 100 caracteres'
      })
      return
    }

    if (content.length > 1000) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'El contenido no puede exceder 1000 caracteres'
      })
      return
    }

    // Get user profile to verify colonia
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('colonia_id, house_id, role, houses!fk_profiles_house(street, external_number)')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || !profile.colonia_id) {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'Debes estar asignado a una colonia para publicar en el foro'
      })
      return
    }

    // Validate that only admins can create statements
    if (category === 'statements' && (profile as any).role !== 'admin') {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'Solo los administradores pueden publicar estados de cuenta'
      })
      return
    }

    // Create post
    const { data: newPost, error: insertError } = await supabaseAdmin
      .from('forum_posts')
      .insert({
        title: title.trim(),
        content: content.trim(),
        category,
        colonia_id: profile.colonia_id,
        author_id: user.id,
        event_date: category === 'events' ? event_date : null,
        event_time: category === 'events' ? event_time : null,
        event_duration: category === 'events' ? event_duration : null,
        file_url: category === 'statements' ? file_url : null,
        file_month: category === 'statements' ? file_month : null
      })
      .select('id, title, content, category, event_date, event_time, event_duration, file_url, file_month, created_at, author_id')
      .single()

    if (insertError || !newPost) {
      fastify.log.error({ error: insertError }, 'Error creating forum post')
      reply.status(500).send({
        error: 'Server Error',
        message: 'No se pudo crear la publicación'
      })
      return
    }

    // Get author name
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(user.id)
    const authorName = userData?.user?.email?.split('@')[0] || 'Usuario'
    
    // Format house address
    const houseData = (profile as any).houses
    const authorAddress = houseData
      ? `${houseData.street} ${houseData.external_number}`
      : 'Dirección no disponible'

    reply.status(201).send({
      id: newPost.id,
      title: newPost.title,
      content: newPost.content,
      category: newPost.category,
      event_date: (newPost as any).event_date || null,
      event_time: (newPost as any).event_time || null,
      event_duration: (newPost as any).event_duration || null,
      file_url: (newPost as any).file_url || null,
      file_month: (newPost as any).file_month || null,
      created_at: newPost.created_at,
      author_name: authorName,
      author_address: authorAddress,
      replies_count: 0
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /forum/posts POST')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Failed to create forum post'
    })
  }
})

// Support endpoint - Send support message
fastify.post('/support/send', async (request, reply) => {
  try {
    const user = (request as any).user
    const { message } = request.body as { message: string }

    if (!message || !message.trim()) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'Message is required'
      })
      return
    }

    // Get user profile and house info
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('colonia_id, house_id, houses!fk_profiles_house(street, external_number)')
      .eq('id', user.id)
      .single()

    // Format house address
    const houseData = (profile as any)?.houses
    const apartmentUnit = houseData
      ? `${houseData.street} ${houseData.external_number}`
      : null

    // Save message to database (creates a support_messages table)
    const { data: supportMessage, error: insertError } = await supabaseAdmin
      .from('support_messages')
      .insert({
        user_id: user.id,
        user_email: user.email,
        apartment_unit: apartmentUnit,
        colonia_id: profile?.colonia_id || null,
        message: message.trim(),
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (insertError) {
      fastify.log.error({ error: insertError }, 'Error saving support message')
      reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to send support message'
      })
      return
    }

    reply.status(201).send({
      success: true,
      message: 'Tu mensaje ha sido enviado exitosamente',
      id: supportMessage.id
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /support/send POST')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Failed to send support message'
    })
  }
})

// Graceful shutdown
const gracefulShutdown = async () => {
  fastify.log.info('Shutting down gracefully...')

  // Close Fastify server
  await fastify.close()
  
  // Close MQTT connection if exists
  if (global.mqttClient) {
    global.mqttClient.end()
    fastify.log.info('MQTT connection closed')
  }

  process.exit(0)
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

// Start server
const start = async () => {
  try {
    // Initialize MQTT connection on startup
    await connectMQTT()

    const port = config.PORT
    await fastify.listen({ port, host: '0.0.0.0' })

    fastify.log.info(`✅ Server listening on port ${port}`)
    fastify.log.info(`🚀 Ready to accept connections`)
  } catch (error) {
    fastify.log.error(error)
    process.exit(1)
  }
}

start()
