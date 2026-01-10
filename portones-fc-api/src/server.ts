import Fastify from 'fastify'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { connectMQTT } from './plugins/mqtt'

dotenv.config()

// Initialize Fastify
const fastify = Fastify({
  logger: true
})

import { getAllGatesStatus } from './state/gates'

fastify.get('/gates', async () => {
  return getAllGatesStatus()
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
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
)

// Service role client for database operations (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
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

// Gate control route
fastify.post('/gate/open', async (request, reply) => {
  try {
    const user = (request as any).user

    fastify.log.info(`User ${user.id} requested to open gate`)

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

      // Log the denied attempt
      await supabaseAdmin.from('access_logs').insert({
        user_id: user.id,
        action: 'OPEN_GATE',
        status: 'DENIED_REVOKED',
        ip_address: request.ip
      })

      reply.status(403).send({
        error: 'Forbidden',
        message: 'Access has been revoked. Contact administration.'
      })
      return
    }

    // Connect to MQTT if not already connected
    const client = await connectMQTT()

    // Prepare payload
    const payload = {
      action: 'OPEN',
      timestamp: new Date().toISOString(),
      userId: user.id
    }

    // Publish to MQTT topic
    return new Promise((resolve, reject) => {
      client.publish(
        'portones/gate/command',
        JSON.stringify(payload),
        { qos: 1 },
        (error) => {
          if (error) {
            fastify.log.error({ error }, 'MQTT publish error')
            reply.status(500).send({
              error: 'MQTT Error',
              message: 'Failed to send command to gate'
            })
            reject(error)
          } else {
            fastify.log.info('Command published successfully')

            // 3. Log successful access
            supabaseAdmin
              .from('access_logs')
              .insert({
                user_id: user.id,
                action: 'OPEN_GATE',
                status: 'SUCCESS',
                ip_address: request.ip
              })
              .then(({ error: logError }) => {
                if (logError) {
                  fastify.log.error({ error: logError }, 'Failed to log access')
                }
              })

            reply.send({
              success: true,
              message: 'Gate opening command sent',
              timestamp: payload.timestamp
            })
            resolve(null)
          }
        }
      )
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

// Graceful shutdown
const gracefulShutdown = async () => {
  fastify.log.info('Shutting down gracefully...')


  await fastify.close()
  process.exit(0)
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

// Start server
const start = async () => {
  try {
    // Initialize MQTT connection on startup
    await connectMQTT()

    const port = parseInt(process.env.PORT || '3000')
    await fastify.listen({ port, host: '0.0.0.0' })

    fastify.log.info(`Server listening on port ${port}`)
  } catch (error) {
    fastify.log.error(error)
    process.exit(1)
  }
}

start()
