import Fastify from 'fastify'
import cors from '@fastify/cors'
import { createClient } from '@supabase/supabase-js'
import { config } from './config/env'
import { connectMQTT } from './plugins/mqtt'
import { getAllGatesStatus } from './state/gates'

// Initialize Fastify
const fastify = Fastify({
  logger: false
})

// Register CORS plugin
await fastify.register(cors, {
  origin: true, // Allow all origins (development)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
})

fastify.get('/gates', async (request, reply) => {
  try {
    const user = (request as any).user

    // Get user profile to verify access
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
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

    if (profile?.role === 'revoked') {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'Access has been revoked'
      })
      return
    }

    return getAllGatesStatus()
  } catch (error) {
    fastify.log.error({ error }, 'Error in /gates')
    reply.status(500).send({
      error: 'Server Error',
      message: 'Failed to get gates status'
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

// Initialize Supabase clients
// Anon client for JWT validation
const supabase = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_ANON_KEY
)

// Service role client for database operations (bypasses RLS)
const supabaseAdmin = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY
)

// MQTT client configuration



// Authentication middleware
fastify.addHook('preHandler', async (request, reply) => {
  // Skip auth for health check
  if (request.url === '/health' || request.url === '/dev/test-mqtt')  {
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

// Health check route
fastify.get('/health', async (request, reply) => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    mqtt: 'unknown'
  }
})

// Profile route - returns authenticated user's profile
fastify.get('/profile', async (request, reply) => {
  try {
    const user = (request as any).user

    // Get user profile
    let { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    // If profile doesn't exist, create it with 'user' role
    if (profileError && profileError.code === 'PGRST116') {
      // PGRST116 = no rows returned
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
        fastify.log.error({ error: createError }, 'Failed to create profile')
        reply.status(500).send({
          error: 'Server Error',
          message: 'Failed to create user profile'
        })
        return
      }

      profile = newProfile
    } else if (profileError || !profile) {
      fastify.log.error({ error: profileError }, 'Profile not found')
      reply.status(404).send({
        error: 'Not Found',
        message: 'User profile not found'
      })
      return
    }

    reply.send({
      id: profile.id,
      email: user.email,
      role: profile.role,
      apartment_unit: profile.apartment_unit,
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

// Gate control route
fastify.post('/gate/open', async (request, reply) => {
  try {
    const user = (request as any).user
    const { gateId } = request.body as any

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
      .select('role, apartment_unit')
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
      .select('id, enabled')
      .eq('id', gateId)
      .single()

    if (gateError || !gate) {
      fastify.log.warn(`Gate ${gateId} not found`)
      await supabaseAdmin.from('access_logs').insert({
        user_id: user.id,
        action: 'OPEN_GATE',
        status: 'DENIED_NO_ACCESS',
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
        gate_id: gateId,
        ip_address: request.ip
      })

      reply.status(403).send({
        error: 'Forbidden',
        message: 'Gate is disabled'
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
    const { gateId } = request.body as any

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
      .select('role, apartment_unit')
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
      .select('id, enabled')
      .eq('id', gateId)
      .single()

    if (gateError || !gate) {
      fastify.log.warn(`Gate ${gateId} not found`)
      await supabaseAdmin.from('access_logs').insert({
        user_id: user.id,
        action: 'CLOSE_GATE',
        status: 'DENIED_NO_ACCESS',
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
        gate_id: gateId,
        ip_address: request.ip
      })

      reply.status(403).send({
        error: 'Forbidden',
        message: 'Gate is disabled'
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
