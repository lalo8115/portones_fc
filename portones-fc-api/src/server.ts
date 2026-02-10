import Fastify from 'fastify'
import cors from '@fastify/cors'
import { createClient } from '@supabase/supabase-js'
import { config } from './config/env'
import { connectMQTT } from './plugins/mqtt'
import { getAllGatesStatus } from './state/gates'

// Initialize Fastify
const fastify = Fastify({
  logger: {
    level: 'info'
  }
})

// Register CORS plugin
await fastify.register(cors, {
  origin: true, // Allow all origins (development)
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
  
  // Skip auth for OPTIONS requests (CORS preflight)
  if (request.method === 'OPTIONS' || publicRoutes.includes(request.url)) {
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
    fastify.log.info({ allGatesStatus, userProfile }, '🔍 Gates and user data')

    // Get gates info from database with colonia
    const { data: gatesDb, error: gatesError } = await supabaseAdmin
      .from('gates')
      .select('id, name, enabled, type, colonia_id, colonias(id, nombre)')

    fastify.log.info({ gatesDb, gatesError }, '🔍 Database gates query result')

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
    let houseQrIds: string[] = []
    
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

      // Obtener todos los QR codes de la misma casa
      const { data: houseQrs, error: qrError } = await supabaseAdmin
        .from('visitor_qr')
        .select('id')
        .eq('house_id', profile.house_id)

      if (qrError) {
        fastify.log.error({ error: qrError }, 'Error fetching house QR codes')
      } else {
        houseQrIds = (houseQrs || []).map((qr: any) => qr.id)
      }
    }

    let query = supabaseAdmin
      .from('access_logs')
      .select('id, user_id, qr_id, action, status, method, timestamp, gate_id', {
        count: 'exact'
      })
      .order('timestamp', { ascending: false })
      .limit(limit)

    if (profile.role !== 'admin') {
      // Filtrar por los usuarios de la misma casa O QR codes de la misma casa
      if (allowedUserIds.length > 0 || houseQrIds.length > 0) {
        // Construir filtro OR para incluir tanto user_id como qr_id
        const userFilter = allowedUserIds.length > 0 
          ? `user_id.in.(${allowedUserIds.join(',')})`
          : null
        const qrFilter = houseQrIds.length > 0
          ? `qr_id.in.(${houseQrIds.join(',')})`
          : null

        if (userFilter && qrFilter) {
          query = query.or(`${userFilter},${qrFilter}`)
        } else if (userFilter) {
          query = query.in('user_id', allowedUserIds)
        } else if (qrFilter) {
          query = query.in('qr_id', houseQrIds)
        }
      } else {
        // Si no hay usuarios ni QR codes en la casa, retornar vacío
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

    let profilesMap = new Map<string, { house_address: string | null; full_name: string | null }>()

    if (profile.role === 'admin') {
      const profileUserIds = Array.from(
        new Set((logs ?? []).map((log: any) => log.user_id).filter(Boolean))
      )

      if (profileUserIds.length) {
        const { data: profilesData, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('id, full_name, house_id, houses!fk_profiles_house(street, external_number)')
          .in('id', profileUserIds)

        if (profilesError) {
          throw profilesError
        }

        profilesData?.forEach((p: any) => {
          const house = p.houses as any
          const address = house ? `${house.street} ${house.external_number}` : null
          const fullName = typeof p.full_name === 'string' ? p.full_name : null
          profilesMap.set(p.id, { house_address: address, full_name: fullName })
        })
      }
    } else {
      // Para usuarios normales, obtener info de todos los usuarios de la casa
      if (allowedUserIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('id, full_name, house_id, houses!fk_profiles_house(street, external_number)')
          .in('id', allowedUserIds)

        if (profilesError) {
          throw profilesError
        }

        profilesData?.forEach((p: any) => {
          const house = p.houses as any
          const address = house ? `${house.street} ${house.external_number}` : null
          const fullName = typeof p.full_name === 'string' ? p.full_name : null
          profilesMap.set(p.id, { house_address: address, full_name: fullName })
        })
      }
    }

    // Obtener datos de visitor_qr para enriquecer los registros con qr_id
    const qrIds = (logs ?? []).map((log: any) => log.qr_id).filter(Boolean)
    let qrDataMap = new Map<string, { visitor_name: string; rubro: string; house_id: number }>()
    
    if (qrIds.length > 0) {
      const { data: qrData } = await supabaseAdmin
        .from('visitor_qr')
        .select('id, invitado, rubro, house_id')
        .in('id', qrIds)
      
      qrData?.forEach((qr: any) => {
        qrDataMap.set(qr.id, { 
          visitor_name: qr.invitado, 
          rubro: qr.rubro,
          house_id: qr.house_id
        })
      })
    }

    const gatesMap = new Map<number, { name?: string; type?: string }>()
    gatesData?.forEach((g: any) => {
      gatesMap.set(g.id, { name: g.name, type: g.type })
    })

    const records = (logs ?? []).map((log: any) => {
      const gateInfo = gatesMap.get(log.gate_id) || {}
      const profileInfo = profilesMap.get(log.user_id) || { house_address: null, full_name: null }
      const userName = profileInfo.full_name?.trim() || 'Usuario'
      const qrInfo = log.qr_id ? qrDataMap.get(log.qr_id) : null

      // Determinar nombre y tipo del acceso (usuario o visitante QR)
      const accessorName = log.user_id ? userName : (qrInfo ? qrInfo.visitor_name : null)
      const accessorType = log.user_id ? 'user' : 'visitor'

      return {
      id: log.id,
      gate_id: log.gate_id,
      gate_name: gateInfo.name || (log.gate_id ? `Portón ${log.gate_id}` : 'Portón'),
      gate_type: gateInfo.type || 'ENTRADA',
      user_id: log.user_id,
      user_name: userName,
      qr_id: log.qr_id,
      house_address: profileInfo.house_address ?? null,
      accessor_name: accessorName,
      accessor_type: accessorType,
      visitor_rubro: qrInfo?.rubro || null,
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

// Admin maintenance payment report
fastify.get('/admin/maintenance-report', async (request, reply) => {
  try {
    const user = (request as any).user
    const { month: monthRaw, year: yearRaw } = request.query as any

    const now = new Date()
    const parsedMonth = Number(monthRaw)
    const parsedYear = Number(yearRaw)
    const periodMonth = Number.isFinite(parsedMonth)
      ? Math.min(Math.max(parsedMonth, 1), 12)
      : now.getMonth() + 1
    const periodYear = Number.isFinite(parsedYear)
      ? Math.max(parsedYear, 2000)
      : now.getFullYear()

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, colonia_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'User profile not found'
      })
      return
    }

    if (profile.role !== 'admin') {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'Admin access required'
      })
      return
    }

    if (!profile.colonia_id) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'Admin must belong to a colonia'
      })
      return
    }

    const { data: houses, error: housesError } = await supabaseAdmin
      .from('houses')
      .select('id, street, external_number, adeudos_months')
      .eq('colonia_id', profile.colonia_id)

    if (housesError) {
      throw housesError
    }

    const { data: payments, error: paymentsError } = await supabaseAdmin
      .from('maintenance_payments')
      .select('id, house_id, amount, payment_date, period_month, period_year, status')
      .eq('colonia_id', profile.colonia_id)
      .eq('period_month', periodMonth)
      .eq('period_year', periodYear)
      .eq('status', 'completed')

    if (paymentsError) {
      throw paymentsError
    }

    const paymentsByHouse = new Map<string, { last_payment_date?: string; last_payment_amount?: number }>()
    payments?.forEach((payment: any) => {
      if (!payment.house_id) return
      const existing = paymentsByHouse.get(payment.house_id)
      if (!existing || (payment.payment_date && payment.payment_date > (existing.last_payment_date || ''))) {
        paymentsByHouse.set(payment.house_id, {
          last_payment_date: payment.payment_date,
          last_payment_amount: payment.amount
        })
      }
    })

    const paidSet = new Set(Array.from(paymentsByHouse.keys()))

    const paid = (houses ?? [])
      .filter((house: any) => paidSet.has(house.id))
      .map((house: any) => {
        const paymentInfo = paymentsByHouse.get(house.id) || {}
        return {
          house_id: house.id,
          address: `${house.street} ${house.external_number}`,
          adeudos_months: house.adeudos_months ?? 0,
          last_payment_date: paymentInfo.last_payment_date ?? null,
          last_payment_amount: paymentInfo.last_payment_amount ?? null
        }
      })

    const unpaid = (houses ?? [])
      .filter((house: any) => !paidSet.has(house.id))
      .map((house: any) => ({
        house_id: house.id,
        address: `${house.street} ${house.external_number}`,
        adeudos_months: house.adeudos_months ?? 0,
        last_payment_date: null,
        last_payment_amount: null
      }))

    reply.send({
      period: {
        month: periodMonth,
        year: periodYear
      },
      paid,
      unpaid,
      totals: {
        total: (houses ?? []).length,
        paid: paid.length,
        unpaid: unpaid.length
      }
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /admin/maintenance-report')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Failed to fetch maintenance report'
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
      .select('colonia_id, house_id, colonias!fk_profiles_colonia(id, nombre, maintenance_monthly_amount, payment_due_day), houses!fk_profiles_house(id, street, external_number)')
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

// Get payment history for current user
fastify.get('/payment/history', async (request, reply) => {
  try {
    const user = (request as any).user
    const { limit: limitRaw } = request.query as any

    const parsedLimit = Number(limitRaw)
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 100)
      : 20

    // Obtener colonia y casa del usuario
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('colonia_id, house_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return reply.status(404).send({
        error: 'Profile not found',
        message: 'Usuario no encontrado'
      })
    }

    if (!profile.colonia_id || !profile.house_id) {
      return reply.status(400).send({
        error: 'Invalid profile',
        message: 'Perfil incompleto - falta colonia o casa'
      })
    }

    // Obtener historial de pagos del usuario
    const { data: payments, error: paymentsError } = await supabaseAdmin
      .from('maintenance_payments')
      .select('id, amount, payment_date, period_month, period_year, status, payment_method')
      .eq('colonia_id', profile.colonia_id)
      .eq('house_id', profile.house_id)
      .order('payment_date', { ascending: false })
      .limit(limit)

    if (paymentsError) {
      fastify.log.error({ paymentsError }, 'Error fetching payment history')
      return reply.status(500).send({
        error: 'Server Error',
        message: 'Error al obtener historial de pagos'
      })
    }

    const history = (payments || []).map((payment: any) => ({
      id: payment.id,
      amount: payment.amount,
      date: payment.payment_date,
      status: payment.status === 'completed' ? 'Pagado' : 'Pendiente',
      method: getPaymentMethodName(payment.payment_method),
      period_month: payment.period_month,
      period_year: payment.period_year
    }))

    reply.send({
      payments: history,
      total: history.length
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /payment/history')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Error al obtener historial de pagos'
    })
  }
})

function getPaymentMethodName(method: string | null): string {
  const methodMap: Record<string, string> = {
    card: 'Tarjeta',
    bank_transfer: 'Transferencia',
    cash: 'Efectivo',
    check: 'Cheque'
  }
  return methodMap[method || 'card'] || 'Tarjeta'
}

// Get payment status for current user
fastify.get('/payment/status', async (request, reply) => {
  try {
    const user = (request as any).user

    // Obtener colonia y casa (house_id)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('colonia_id, house_id, colonias!fk_profiles_colonia(maintenance_monthly_amount, payment_due_day)')
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
    const dueDayRaw = (coloniaData?.payment_due_day as number | null | undefined)
    const dueDay = Number.isFinite(dueDayRaw)
      ? Math.min(Math.max(dueDayRaw as number, 1), 31)
      : null

    const currentDateStart = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate()
    )

    const buildDueDate = (year: number, monthIndex: number, day: number) => {
      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
      const safeDay = Math.min(day, daysInMonth)
      return new Date(year, monthIndex, safeDay)
    }

    let nextPaymentDate: Date
    if (dueDay) {
      const dueThisMonth = buildDueDate(currentDate.getFullYear(), currentDate.getMonth(), dueDay)
      nextPaymentDate = dueThisMonth < currentDateStart
        ? buildDueDate(currentDate.getFullYear(), currentDate.getMonth() + 1, dueDay)
        : dueThisMonth
    } else {
      // Fallback: día 1 del próximo mes
      nextPaymentDate = new Date(currentYear, currentMonth, 1)
    }


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
      .select('*, colonias!fk_profiles_colonia(id, nombre, maintenance_monthly_amount, payment_due_day), houses!fk_profiles_house(id, street, external_number, number_of_people)')
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
            .select('*, colonias!fk_profiles_colonia(id, nombre, maintenance_monthly_amount, payment_due_day), houses!fk_profiles_house(id, street, external_number, number_of_people)')
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
      full_name: profile.full_name || null,
      marketplace_sessions:profile.mps,
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
      .select('id, full_name, role, house_id, colonia_id, created_at, updated_at, colonias!fk_profiles_colonia(id, nombre)')
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
      full_name: updatedProfile.full_name || null,
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

// ==========================================
// QR CODE MANAGEMENT ENDPOINTS
// ==========================================

// Policy definitions
const QR_POLICIES = {
  delivery_app: {
    duration: 2 * 60 * 60 * 1000, // 2 horas
    maxUses: 2,  // 1 visita (entrada + salida)
    requiresId: false,
    requiresName: true,
    description: 'Repartidor de aplicación',
    maxQRsPerHouse: null // Sin límite
  },
  family: {
    duration: 365 * 24 * 60 * 60 * 1000, // 1 año
    maxUses: 500, // 250 visitas (entrada + salida)
    requiresId: true,
    requiresName: true,
    description: 'Familiar',
    maxQRsPerHouse: 4 // Máximo 4
  },
  friend: {
    duration: 24 * 60 * 60 * 1000, // 24 horas (default, se sobreescribe con customExpiration)
    maxUses: 4, // 2 visitas (entrada + salida)
    requiresId: false,
    requiresName: true,
    description: 'Amigo',
    maxQRsPerHouse: 8 // Máximo 8
  },
  parcel: {
    duration: 30 * 60 * 1000, // 30 minutos
    maxUses: 2, // 1 visita
    requiresId: false,
    requiresName: true,
    description: 'Paquetería',
    maxQRsPerHouse: null // Sin límite
  },
  service: {
    duration: 4 * 60 * 60 * 1000, // 4 horas (default, se sobreescribe con customExpiration)
    maxUses: 20, // 10 visitas (entrada + salida)
    requiresId: true,
    requiresName: true,
    description: 'Servicio (plomero, electricista, etc.)',
    maxQRsPerHouse: 2 // Máximo 2
  }
} as const

// Generate QR code
fastify.post('/qr/generate', async (request, reply) => {
  try {
    const user = (request as any).user
    const { 
      policyType, 
      visitorName, 
      idPhotoUrl
    } = request.body as any

    // Validate policy type
    if (!policyType || !QR_POLICIES[policyType as keyof typeof QR_POLICIES]) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid policy type. Valid types: ' + Object.keys(QR_POLICIES).join(', ')
      })
      return
    }

    const policy = QR_POLICIES[policyType as keyof typeof QR_POLICIES]

    // Get user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('house_id, colonia_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || !profile.house_id) {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'User must have a house assigned to generate QR codes'
      })
      return
    }

    // Validate required fields based on policy
    if (policy.requiresName && !visitorName) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'Visitor name is required for this policy'
      })
      return
    }

    if (policy.requiresId && !idPhotoUrl) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'ID photo is required for this policy'
      })
      return
    }

    // Validate QR limit per house for this policy type
    if (policy.maxQRsPerHouse !== null) {
      const { data: existingQRs, error: countError } = await supabaseAdmin
        .from('visitor_qr')
        .select('id', { count: 'exact', head: false })
        .eq('house_id', profile.house_id)
        .eq('rubro', policyType)
        .eq('status', 'active')

      if (countError) {
        fastify.log.error({ error: countError }, 'Error checking QR limit')
        reply.status(500).send({
          error: 'Server Error',
          message: 'Failed to validate QR limit'
        })
        return
      }

      const activeCount = existingQRs?.length || 0
      if (activeCount >= policy.maxQRsPerHouse) {
        reply.status(400).send({
          error: 'Limit Exceeded',
          message: `Ya tienes el máximo de ${policy.maxQRsPerHouse} QRs activos de tipo "${policy.description}". Elimina o espera a que expire alguno antes de crear uno nuevo.`,
          currentCount: activeCount,
          maxAllowed: policy.maxQRsPerHouse
        })
        return
      }
    }

    // Generate unique short code (6-digit number)
    const shortCode = Math.floor(100000 + Math.random() * 900000)

    // Extraer customExpiration y customValidFrom si se proporcionan
    const customExpiration = (request.body as any).customExpiration
    const customValidFrom = (request.body as any).customValidFrom

    // Calculate expiration
    let expiresAt: Date
    if (customExpiration) {
      expiresAt = new Date(customExpiration)
    } else {
      expiresAt = new Date(Date.now() + policy.duration)
    }

    // Calculate valid_from (start date)
    let validFrom: Date
    if (customValidFrom) {
      validFrom = new Date(customValidFrom)
    } else {
      // Por defecto, el QR es válido inmediatamente desde su creación
      validFrom = new Date()
    }

    // Insert QR code into database
    const { data: qrCode, error: qrError } = await supabaseAdmin
      .from('visitor_qr')
      .insert({
        short_code: shortCode,
        house_id: profile.house_id,
        valid_from: validFrom.toISOString(),
        expires_at: expiresAt.toISOString(),
        max_uses: policy.maxUses,
        uses: 0,
        status: 'active',
        rubro: policyType,
        invitado: visitorName || null,
        url_ine: idPhotoUrl || null
      })
      .select()
      .single()

    if (qrError) {
      fastify.log.error({ error: qrError }, 'Error creating QR code')
      reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to create QR code'
      })
      return
    }

    fastify.log.info(`QR code generated: ${shortCode} for user ${user.id}, policy: ${policyType}`)

    reply.send({
      success: true,
      qrCode: {
        id: qrCode.id,
        shortCode: qrCode.short_code,
        expiresAt: qrCode.expires_at,
        maxUses: qrCode.max_uses,
        policyType: qrCode.rubro,
        visitorName: qrCode.invitado,
        policyDescription: policy.description
      }
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /qr/generate')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Failed to generate QR code'
    })
  }
})

// List user's QR codes
fastify.get('/qr/list', async (request, reply) => {
  try {
    const user = (request as any).user

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('house_id')
      .eq('id', user.id)
      .single()

    if (!profile || !profile.house_id) {
      reply.send({ qrCodes: [] })
      return
    }

    // Exclude revoked QR codes from listing (show active and expired)
    const { data: qrCodes, error } = await supabaseAdmin
      .from('visitor_qr')
      .select('*')
      .eq('house_id', profile.house_id)
      .neq('status', 'revoked')
      .order('created_at', { ascending: false })

    if (error) {
      fastify.log.error({ error }, 'Error fetching QR codes')
      reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to fetch QR codes'
      })
      return
    }

    // Enrich QR codes with additional info
    const enrichedQRs = qrCodes?.map((qr: any) => {
      const now = new Date()
      const expiresAt = new Date(qr.expires_at)
      const validFrom = qr.valid_from ? new Date(qr.valid_from) : null
      const isExpired = expiresAt < now
      const isFullyUsed = qr.uses >= qr.max_uses
      const isVisitorInside = qr.uses % 2 === 1
      const remainingVisits = Math.floor((qr.max_uses - qr.uses) / 2)
      const isScheduled = validFrom && validFrom > now
      
      // Determine effective status
      let effectiveStatus = qr.status
      if (qr.status === 'active') {
        if (isScheduled) {
          // QR programado que aún no inicia su período de validez
          effectiveStatus = 'scheduled'
        } else if (isFullyUsed) {
          // Priorizar "completado" sobre "expirado" cuando se agotaron las visitas
          effectiveStatus = 'completed'
        } else if (isExpired) {
          effectiveStatus = 'expired'
        }
      }

      // Get policy info
      const policyInfo = QR_POLICIES[qr.rubro as keyof typeof QR_POLICIES]

      return {
        ...qr,
        effectiveStatus,
        isVisitorInside,
        remainingVisits,
        totalVisits: Math.floor(qr.max_uses / 2),
        usedVisits: Math.floor(qr.uses / 2),
        policyDescription: policyInfo?.description || qr.rubro,
        isExpired,
        isFullyUsed,
        isScheduled
      }
    }) || []

    reply.send({ qrCodes: enrichedQRs })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /qr/list')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Failed to list QR codes'
    })
  }
})

// Note: deactivate status is set automatically when QR reaches max_uses
// Users cannot manually deactivate, only delete

// Delete QR code (soft delete - keeps in DB but hidden)
fastify.post('/qr/delete', async (request, reply) => {
  try {
    const user = (request as any).user
    const { qrId } = request.body as any

    if (!qrId) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'qrId is required'
      })
      return
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('house_id')
      .eq('id', user.id)
      .single()

    if (!profile || !profile.house_id) {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'User must have a house assigned'
      })
      return
    }

    // Update QR status to revoked (soft delete - hidden from list but kept in DB)
    const { error } = await supabaseAdmin
      .from('visitor_qr')
      .update({ status: 'revoked' })
      .eq('id', qrId)
      .eq('house_id', profile.house_id)

    if (error) {
      fastify.log.error({ error }, 'Error deleting QR code')
      reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to delete QR code'
      })
      return
    }

    reply.send({
      success: true,
      message: 'QR code deleted successfully'
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /qr/delete')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Failed to delete QR code'
    })
  }
})

// Legacy endpoint for backward compatibility - redirects to delete
fastify.post('/qr/revoke', async (request, reply) => {
  try {
    const user = (request as any).user
    const { qrId } = request.body as any

    if (!qrId) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'qrId is required'
      })
      return
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('house_id')
      .eq('id', user.id)
      .single()

    if (!profile || !profile.house_id) {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'User must have a house assigned'
      })
      return
    }

    fastify.log.info({ qrId, userId: user.id, houseId: profile.house_id }, 'Deleting QR code via revoke endpoint')

    // Update QR status to revoked (soft delete)
    const { data, error } = await supabaseAdmin
      .from('visitor_qr')
      .update({ status: 'revoked' })
      .eq('id', qrId)
      .eq('house_id', profile.house_id)
      .select()

    if (error) {
      fastify.log.error({ error, qrId }, 'Error deleting QR code')
      reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to delete QR code'
      })
      return
    }

    if (!data || data.length === 0) {
      fastify.log.warn({ qrId, houseId: profile.house_id }, 'QR code not found or does not belong to user')
      reply.status(404).send({
        error: 'Not Found',
        message: 'QR code not found'
      })
      return
    }

    fastify.log.info({ qrId, data }, 'QR code successfully deleted')

    reply.send({
      success: true,
      message: 'QR code deleted successfully'
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /qr/revoke')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Failed to delete QR code'
    })
  }
})

// Force exit for visitor still inside
fastify.post('/qr/force-exit', async (request, reply) => {
  try {
    const user = (request as any).user
    const { qrId } = request.body as any

    if (!qrId) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'qrId is required'
      })
      return
    }

    // Get user's house
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('house_id')
      .eq('id', user.id)
      .single()

    if (!profile || !profile.house_id) {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'User profile not found'
      })
      return
    }

    // Get QR code and verify ownership
    const { data: qrCode, error: qrError } = await supabaseAdmin
      .from('visitor_qr')
      .select('*')
      .eq('id', qrId)
      .eq('house_id', profile.house_id)
      .single()

    if (qrError || !qrCode) {
      reply.status(404).send({
        error: 'Not Found',
        message: 'QR code not found or does not belong to your house'
      })
      return
    }

    // Check if QR is in valid state
    if (qrCode.status !== 'active') {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'QR code is not active'
      })
      return
    }

    // Check if QR has started its validity period
    if (qrCode.valid_from && new Date(qrCode.valid_from) > new Date()) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'QR code is not yet valid'
      })
      return
    }

    // Check if visitor is actually inside (odd uses count)
    const isVisitorInside = qrCode.uses % 2 === 1

    if (!isVisitorInside) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'Visitor is not currently inside'
      })
      return
    }

    // Increment uses to force exit
    const newUses = qrCode.uses + 1
    const { error: updateError } = await supabaseAdmin
      .from('visitor_qr')
      .update({ uses: newUses })
      .eq('id', qrId)

    if (updateError) {
      fastify.log.error({ error: updateError }, 'Error forcing exit')
      reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to force exit'
      })
      return
    }

    // Log the forced exit in access_logs
    await supabaseAdmin
      .from('access_logs')
      .insert({
        gate_id: 1, // Default gate, can be updated if needed
        qr_id: qrId,
        action: 'CLOSE',
        method: 'APP',
        timestamp: new Date().toISOString()
      })

    reply.send({
      success: true,
      message: 'Visitor exit confirmed successfully'
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /qr/force-exit')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Failed to force exit'
    })
  }
})

// Open gate with QR code
fastify.post('/gate/open-with-qr', async (request, reply) => {
  try {
    const { shortCode } = request.body as any

    if (!shortCode) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'shortCode is required'
      })
      return
    }

    // Validate QR code first
    const { data: qrCode, error: qrError } = await supabaseAdmin
      .from('visitor_qr')
      .select('*, houses(colonia_id)')
      .eq('short_code', shortCode)
      .single()

    if (qrError || !qrCode) {
      reply.status(404).send({
        success: false,
        message: 'QR code not found'
      })
      return
    }

    // Check QR status - only 'active' QRs can be used
    if (qrCode.status === 'revoked') {
      reply.status(403).send({
        success: false,
        message: 'QR code has been revoked'
      })
      return
    }

    if (qrCode.status === 'expired') {
      reply.status(403).send({
        success: false,
        message: 'QR code has expired'
      })
      return
    }

    if (qrCode.status !== 'active') {
      reply.status(403).send({
        success: false,
        message: `QR code is ${qrCode.status}`
      })
      return
    }

    // Check if QR has started its validity period
    if (qrCode.valid_from && new Date(qrCode.valid_from) > new Date()) {
      reply.status(403).send({
        success: false,
        message: 'QR code is not yet valid. It will be active from ' + new Date(qrCode.valid_from).toLocaleString('es-MX')
      })
      return
    }

    // Check expiration
    if (new Date(qrCode.expires_at) < new Date()) {
      await supabaseAdmin
        .from('visitor_qr')
        .update({ status: 'expired' })
        .eq('id', qrCode.id)

      reply.status(403).send({
        success: false,
        message: 'QR code has expired'
      })
      return
    }

    // Check max uses and auto-expire if reached
    if (qrCode.uses >= qrCode.max_uses) {
      // Auto-expire QR when max uses reached (will still show in history)
      await supabaseAdmin
        .from('visitor_qr')
        .update({ status: 'expired' })
        .eq('id', qrCode.id)

      reply.status(403).send({
        success: false,
        message: 'QR code has reached maximum uses'
      })
      return
    }

    // ENTRY/EXIT LOGIC - Determine required gate type
    const isVisitorInside = qrCode.uses % 2 === 1
    const requiredGateType = isVisitorInside ? 'SALIDA' : 'ENTRADA'

    // Find appropriate gate based on visitor status and colonia
    const { data: availableGates, error: gatesError } = await supabaseAdmin
      .from('gates')
      .select('id, name, type, enabled, colonia_id')
      .eq('type', requiredGateType)
      .eq('enabled', true)

    if (gatesError || !availableGates || availableGates.length === 0) {
      reply.status(404).send({
        error: 'Not Found',
        message: `No enabled ${requiredGateType} gate found`
      })
      return
    }

    // Filter by colonia if QR has colonia
    let gate = availableGates.find(g => g.colonia_id === qrCode.houses?.colonia_id)
    
    // If no gate found for colonia, use any available gate of the right type
    if (!gate) {
      gate = availableGates[0]
    }

    // Final safety check (should never happen due to earlier validation)
    if (!gate) {
      reply.status(500).send({
        success: false,
        message: 'Gate selection failed unexpectedly'
      })
      return
    }

    const gateId = gate.id

    // Increment QR usage
    const newUses = qrCode.uses + 1
    await supabaseAdmin
      .from('visitor_qr')
      .update({ uses: newUses })
      .eq('id', qrCode.id)

    // Publish MQTT command
    const client = await connectMQTT()
    const payload = {
      action: 'OPEN',
      gateId,
      timestamp: new Date().toISOString(),
      qrCode: shortCode,
      visitorName: qrCode.invitado,
      accessType: requiredGateType
    }

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
            fastify.log.info('QR gate command published successfully')
            resolve()
          }
        }
      )
    })

    // Log successful QR access
    const insertData = {
      user_id: null, // QR access doesn't have a user_id
      qr_id: qrCode.id, // FK reference to visitor_qr table
      action: 'OPEN_GATE',
      status: 'SUCCESS',
      method: 'QR',
      gate_id: gateId,
      ip_address: request.ip
    }
    
    fastify.log.info({ insertData }, 'Attempting to insert QR access log')
    
    const { data: logData, error: logError } = await supabaseAdmin
      .from('access_logs')
      .insert(insertData)
    
    if (logError) {
      fastify.log.error({ logError, insertData }, 'Failed to insert QR access log')
    } else {
      fastify.log.info({ logData }, 'Successfully inserted QR access log')
    }

    const newStatus = newUses % 2 === 1 ? 'inside' : 'outside'

    fastify.log.info(`Gate ${gateId} opened with QR ${shortCode}. Visitor: ${qrCode.invitado}, Action: ${requiredGateType}, New status: ${newStatus}`)

    reply.send({
      success: true,
      message: `Gate opened for ${requiredGateType}`,
      gateId,
      gateName: gate.name,
      gateType: gate.type,
      visitor: {
        name: qrCode.invitado,
        action: requiredGateType,
        status: newStatus,
        uses: newUses,
        maxUses: qrCode.max_uses,
        remainingVisits: Math.floor((qrCode.max_uses - newUses) / 2)
      },
      timestamp: payload.timestamp
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /gate/open-with-qr')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Failed to open gate with QR'
    })
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
    const { street, external_number, number_of_people, full_name, fullName } = request.body as { 
      street?: string
      external_number?: string
      number_of_people?: number
      full_name?: string
      fullName?: string
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

    // First, check if the house already exists in the database
    const { data: existingHouse, error: findError } = await supabaseAdmin
      .from('houses')
      .select('*')
      .eq('colonia_id', userProfile.colonia_id)
      .eq('street', street.trim())
      .eq('external_number', external_number.trim())
      .single()

    let house
    if (existingHouse && !findError) {
      // House already exists, use it
      house = existingHouse
    } else {
      // House doesn't exist, create it
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

    const rawFullName = typeof full_name === 'string' ? full_name : fullName
    const trimmedFullName = typeof rawFullName === 'string' ? rawFullName.trim() : ''
    fastify.log.info({
      has_full_name: !!trimmedFullName,
      full_name_length: trimmedFullName.length
    }, 'Apartment unit update payload name summary')

    // Update profile with house_id
    const profileUpdates: Record<string, any> = {
      house_id: house.id,
      updated_at: new Date().toISOString()
    }

    if (trimmedFullName) {
      profileUpdates.full_name = trimmedFullName
    }

    const { data: updatedProfile, error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update(profileUpdates)
      .eq('id', user.id)
      .select('id, full_name, role, house_id, colonia_id, created_at, updated_at, colonias!fk_profiles_colonia(id, nombre)')
      .single()

    if (updateProfileError || !updatedProfile) {
      fastify.log.error({ error: updateProfileError }, 'Error updating profile with house_id')
      reply.status(500).send({
        error: 'Server Error',
        message: 'No se pudo actualizar el perfil'
      })
      return
    }

    fastify.log.info({
      saved_full_name: updatedProfile.full_name || null
    }, 'Apartment unit update saved name')

    reply.send({
      id: updatedProfile.id,
      email: user.email,
      full_name: updatedProfile.full_name || null,
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

// Update MPS (motion detection sensitivity) setting
fastify.put('/profile/mps', async (request, reply) => {
  try {
    const user = (request as any).user
    const { mps } = request.body as { mps?: number }

    // Validate input
    if (mps === undefined || mps === null) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'El valor de MPS es requerido'
      })
      return
    }

    if (typeof mps !== 'number' || mps < 0) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'El valor de MPS debe ser un número positivo'
      })
      return
    }

    // Update profile with new MPS value
    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ mps, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select('id, full_name, role, house_id, colonia_id, mps, created_at, updated_at')
      .single()

    if (updateError || !updatedProfile) {
      fastify.log.error({ error: updateError }, 'Error updating MPS value')
      reply.status(500).send({
        error: 'Server Error',
        message: 'No se pudo actualizar el valor de MPS'
      })
      return
    }

    reply.send({
      id: updatedProfile.id,
      email: user.email,
      full_name: updatedProfile.full_name || null,
      role: updatedProfile.role,
      house_id: updatedProfile.house_id,
      colonia_id: updatedProfile.colonia_id,
      mps: updatedProfile.mps,
      created_at: updatedProfile.created_at,
      updated_at: updatedProfile.updated_at
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /profile/mps')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Failed to update MPS value'
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
          full_name,
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

    // Format response
    const formattedPosts = posts?.map(post => {
      const profileData = (post as any).profiles
      const houseData = Array.isArray(profileData)
        ? profileData[0]?.houses
        : profileData?.houses
      const authorAddress = houseData
        ? `${houseData.street} ${houseData.external_number}`
        : 'Dirección no disponible'
      
      const fullName = Array.isArray(profileData)
        ? profileData[0]?.full_name
        : profileData?.full_name
      const authorName = typeof fullName === 'string' ? fullName.trim() : null

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
        author_name: authorName || 'Usuario',
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
      .select('colonia_id, house_id, role, full_name, houses!fk_profiles_house(street, external_number)')
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

    // Get author name from profile
    const authorName = profile.full_name || 'Usuario'
    
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

// Marketplace endpoints
// Get marketplace items by category
fastify.get('/marketplace/items', async (request, reply) => {
  try {
    const user = (request as any).user
    const { category } = request.query as { category?: string }

    // Get user profile to get colonia_id
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('colonia_id, role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      reply.status(404).send({
        error: 'Profile Not Found',
        message: 'Usuario no encontrado'
      })
      return
    }

    if (!profile.colonia_id) {
      reply.status(400).send({
        error: 'No Colonia',
        message: 'Debes estar asignado a una colonia para ver el marketplace'
      })
      return
    }

    // Build query
    let query = supabaseAdmin
      .from('marketplace_items')
      .select(`
        id,
        title,
        description,
        price,
        category,
        contact_info,
        image_url,
        created_at,
        seller_id,
        colonia_id
      `)
      .eq('colonia_id', profile.colonia_id)
      .order('created_at', { ascending: false })

    // Filter by category if provided
    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    const { data: items, error: itemsError } = await query

    if (itemsError) {
      fastify.log.error({ itemsError }, 'Error fetching marketplace items')
      reply.status(500).send({
        error: 'Database Error',
        message: 'Error al obtener artículos'
      })
      return
    }

    // Get seller information for all items
    const sellerIds = Array.from(new Set((items ?? []).map((item: any) => item.seller_id)))
    
    let sellersMap = new Map<string, { full_name: string; house_address?: string }>()

    if (sellerIds.length > 0) {
      // Get seller information from profiles
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, house_id, houses!fk_profiles_house(street, external_number)')
        .in('id', sellerIds)

      if (!profilesError && profiles) {
        profiles.forEach((p: any) => {
          sellersMap.set(p.id, {
            full_name: p.full_name || 'Usuario',
            house_address: p.houses ? `${p.houses.street} ${p.houses.external_number}` : undefined
          })
        })
      }
    }

    // Format response with seller info
    const formattedItems = (items ?? []).map((item: any) => {
      const seller = sellersMap.get(item.seller_id)
      return {
        id: item.id,
        title: item.title,
        description: item.description,
        price: item.price,
        category: item.category,
        contact_info: item.contact_info,
        image_url: item.image_url,
        created_at: item.created_at,
        seller_id: item.seller_id,
        seller_name: seller?.full_name || 'Usuario',
        seller_unit: seller?.house_address || undefined
      }
    })

    reply.send(formattedItems)
  } catch (error) {
    fastify.log.error({ error }, 'Error in /marketplace/items')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Error al obtener artículos del marketplace'
    })
  }
})

// Get all images for a marketplace item from storage
fastify.get<{ Params: { id: string } }>('/marketplace/items/:id/images', async (request, reply) => {
  try {
    const user = (request as any).user
    const itemId = request.params.id

    // Get user profile to get colonia_id
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('colonia_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.colonia_id) {
      reply.status(400).send({
        error: 'No Colonia',
        message: 'No se pudo obtener la colonia del usuario'
      })
      return
    }

    // Get the item to verify it exists and belongs to this colonia
    const { data: item, error: itemError } = await supabaseAdmin
      .from('marketplace_items')
      .select('seller_id, colonia_id')
      .eq('id', itemId)
      .eq('colonia_id', profile.colonia_id)
      .single()

    if (itemError || !item) {
      reply.status(404).send({
        error: 'Item Not Found',
        message: 'Artículo no encontrado'
      })
      return
    }

    // List all files in the folder: coloniaID/userID/itemID/
    const folderPath = `${profile.colonia_id}/${item.seller_id}/${itemId}`
    const { data: files, error: filesError } = await supabaseAdmin.storage
      .from('marketplace-files')
      .list(folderPath, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' }
      })

    if (filesError) {
      fastify.log.error({ filesError }, 'Error listing files from storage')
      reply.status(500).send({
        error: 'Storage Error',
        message: 'Error al obtener las imágenes'
      })
      return
    }

    // Filter only image files and get public URLs
    const imageUrls = (files ?? [])
      .filter((f: any) => f.name && /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name))
      .sort((a: any, b: any) => {
        // Sort by number extracted from filename (1.jpg, 2.jpg, etc.)
        const aNum = parseInt(a.name.split('.')[0]) || 0
        const bNum = parseInt(b.name.split('.')[0]) || 0
        return aNum - bNum
      })
      .map((f: any) => {
        const { data: { publicUrl } } = supabaseAdmin.storage
          .from('marketplace-files')
          .getPublicUrl(`${folderPath}/${f.name}`)
        return publicUrl
      })

    reply.send({
      itemId: parseInt(itemId),
      imageUrls: imageUrls,
      totalImages: imageUrls.length
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /marketplace/items/:id/images')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Error al obtener las imágenes'
    })
  }
})

// Create new marketplace item
fastify.post('/marketplace/items', async (request, reply) => {
  try {
    const user = (request as any).user
    const { title, description, price, category, contact_info, image_url, pdf_url } = request.body as {
      title?: string
      description?: string
      price?: number
      category?: string
      contact_info?: string
      image_url?: string
      pdf_url?: string
    }

    // Validate inputs
    if (!title || typeof title !== 'string' || !title.trim()) {
      reply.status(400).send({
        error: 'Validation Error',
        message: 'El título es requerido'
      })
      return
    }

    if (!description || typeof description !== 'string' || !description.trim()) {
      reply.status(400).send({
        error: 'Validation Error',
        message: 'La descripción es requerida'
      })
      return
    }

    if (typeof price !== 'number' || price < 0) {
      reply.status(400).send({
        error: 'Validation Error',
        message: 'El precio debe ser un número válido'
      })
      return
    }

    if (!category || typeof category !== 'string') {
      reply.status(400).send({
        error: 'Validation Error',
        message: 'La categoría es requerida'
      })
      return
    }

    const validCategories = ['electronics', 'furniture', 'vehicles', 'clothing', 'home', 'services', 'other']
    if (!validCategories.includes(category)) {
      reply.status(400).send({
        error: 'Validation Error',
        message: 'Categoría inválida'
      })
      return
    }

    // Get user profile to get colonia_id
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('colonia_id, house_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      reply.status(404).send({
        error: 'Profile Not Found',
        message: 'Usuario no encontrado'
      })
      return
    }

    if (!profile.colonia_id) {
      reply.status(400).send({
        error: 'No Colonia',
        message: 'Debes estar asignado a una colonia para publicar en el marketplace'
      })
      return
    }

    // Create marketplace item
    const { data: newItem, error: insertError } = await supabaseAdmin
      .from('marketplace_items')
      .insert({
        title: title.trim(),
        description: description.trim(),
        price: price,
        category: category,
        contact_info: contact_info?.trim() || null,
        image_url: image_url || null,
        pdf_url: pdf_url || null,
        seller_id: user.id,
        colonia_id: profile.colonia_id,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (insertError || !newItem) {
      fastify.log.error({ insertError }, 'Error creating marketplace item')
      reply.status(500).send({
        error: 'Database Error',
        message: 'Error al crear el artículo'
      })
      return
    }

    // Get seller info for response
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(user.id)
    const sellerName = authUser?.user?.email?.split('@')[0] || 'Usuario'

    let sellerUnit = undefined
    if (profile.house_id) {
      const { data: house } = await supabaseAdmin
        .from('houses')
        .select('street, external_number')
        .eq('id', profile.house_id)
        .single()
      
      if (house) {
        sellerUnit = `${house.street} ${house.external_number}`
      }
    }

    reply.status(201).send({
      id: newItem.id,
      title: newItem.title,
      description: newItem.description,
      price: newItem.price,
      category: newItem.category,
      contact_info: newItem.contact_info,
      created_at: newItem.created_at,
      seller_id: user.id,
      seller_name: sellerName,
      seller_unit: sellerUnit
    })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /marketplace/items POST')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Error al crear el artículo'
    })
  }
})

// Update marketplace item
fastify.patch('/marketplace/items/:id', async (request, reply) => {
  try {
    const user = (request as any).user
    const { id } = request.params as { id: string }

    if (!user) {
      fastify.log.warn('PATCH /marketplace/items/:id - No user found in request')
      reply.status(401).send({
        error: 'Unauthorized',
        message: 'Usuario no autenticado'
      })
      return
    }

    const itemId = parseInt(id, 10)

    if (isNaN(itemId)) {
      fastify.log.warn({ id }, 'PATCH /marketplace/items/:id - Invalid item ID')
      reply.status(400).send({
        error: 'Bad Request',
        message: 'ID inválido'
      })
      return
    }

    const { title, description, price, category, contact_info, image_url, pdf_url } = request.body as {
      title?: string
      description?: string
      price?: number
      category?: string
      contact_info?: string
      image_url?: string
      pdf_url?: string
    }

    fastify.log.info({ userId: user.id, itemId }, 'PATCH request received for marketplace item')

    // Get existing item to check ownership
    const { data: existingItem, error: fetchError } = await supabaseAdmin
      .from('marketplace_items')
      .select('seller_id')
      .eq('id', itemId)
      .single()

    if (fetchError) {
      fastify.log.warn({ fetchError, itemId }, 'Item not found for update')
      reply.status(404).send({
        error: 'Not Found',
        message: 'Artículo no encontrado'
      })
      return
    }

    if (!existingItem) {
      fastify.log.warn({ itemId }, 'Item is null after fetch')
      reply.status(404).send({
        error: 'Not Found',
        message: 'Artículo no encontrado'
      })
      return
    }

    // Check if user is the owner
    if (existingItem.seller_id !== user.id) {
      fastify.log.warn({ userId: user.id, sellerId: existingItem.seller_id }, 'User not authorized to update item')
      reply.status(403).send({
        error: 'Forbidden',
        message: 'No tienes permiso para editar este artículo'
      })
      return
    }

    // Build update object
    const updateData: any = { updated_at: new Date().toISOString() }
    
    if (title !== undefined) {
      if (!title.trim()) {
        reply.status(400).send({
          error: 'Validation Error',
          message: 'El título no puede estar vacío'
        })
        return
      }
      updateData.title = title.trim()
    }

    if (description !== undefined) {
      if (!description.trim()) {
        reply.status(400).send({
          error: 'Validation Error',
          message: 'La descripción no puede estar vacía'
        })
        return
      }
      updateData.description = description.trim()
    }

    if (price !== undefined) {
      if (typeof price !== 'number' || price < 0) {
        reply.status(400).send({
          error: 'Validation Error',
          message: 'El precio debe ser un número válido'
        })
        return
      }
      updateData.price = price
    }

    if (category !== undefined) {
      const validCategories = ['electronics', 'furniture', 'vehicles', 'clothing', 'home', 'services', 'other']
      if (!validCategories.includes(category)) {
        reply.status(400).send({
          error: 'Validation Error',
          message: 'Categoría inválida'
        })
        return
      }
      updateData.category = category
    }

    if (contact_info !== undefined) {
      updateData.contact_info = contact_info?.trim() || null
    }

    if (image_url !== undefined) {
      updateData.image_url = image_url || null
    }

    if (pdf_url !== undefined) {
      updateData.pdf_url = pdf_url || null
    }

    // Update item
    const { data: updatedItem, error: updateError } = await supabaseAdmin
      .from('marketplace_items')
      .update(updateData)
      .eq('id', itemId)
      .select()
      .single()

    if (updateError || !updatedItem) {
      fastify.log.error({ updateError }, 'Error updating marketplace item')
      reply.status(500).send({
        error: 'Database Error',
        message: 'Error al actualizar el artículo'
      })
      return
    }

    reply.send(updatedItem)
  } catch (error) {
    fastify.log.error({ error }, 'Error in /marketplace/items/:id PATCH')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Error al actualizar el artículo'
    })
  }
})

// Add explicit OPTIONS handler for marketplace items
fastify.options('/marketplace/items/:id', async (request, reply) => {
  reply.status(200).send()
})

// Delete marketplace item
fastify.post<{ Params: { id: string } }>('/marketplace/items/:id/delete', async (request, reply) => {
  try {
    const user = (request as any).user
    const { id } = request.params as { id: string }

    if (!user) {
      fastify.log.warn('DELETE /marketplace/items/:id - No user found in request')
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Usuario no autenticado'
      })
    }

    const itemId = parseInt(id, 10)

    if (isNaN(itemId)) {
      fastify.log.warn({ id }, 'DELETE /marketplace/items/:id - Invalid item ID')
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'ID inválido'
      })
    }

    fastify.log.info({ userId: user.id, itemId }, 'DELETE request received for marketplace item')

    // Get existing item to check ownership
    const { data: existingItem, error: fetchError } = await supabaseAdmin
      .from('marketplace_items')
      .select('seller_id')
      .eq('id', itemId)
      .single()

    if (fetchError || !existingItem) {
      fastify.log.warn({ fetchError, itemId }, 'Item not found for deletion')
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Artículo no encontrado'
      })
    }

    // Check if user is the owner
    if (existingItem.seller_id !== user.id) {
      fastify.log.warn({ userId: user.id, sellerId: existingItem.seller_id }, 'User not authorized to delete item')
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'No tienes permiso para eliminar este artículo'
      })
    }

    // Delete item
    const { error: deleteError } = await supabaseAdmin
      .from('marketplace_items')
      .delete()
      .eq('id', itemId)

    if (deleteError) {
      fastify.log.error({ deleteError }, 'Error deleting marketplace item')
      return reply.status(500).send({
        error: 'Database Error',
        message: 'Error al eliminar el artículo'
      })
    }

    fastify.log.info({ itemId }, 'Item deleted successfully')
    return reply.status(200).send({ success: true })
  } catch (error) {
    fastify.log.error({ error }, 'Error in /marketplace/items/:id DELETE')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Error al eliminar el artículo'
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
