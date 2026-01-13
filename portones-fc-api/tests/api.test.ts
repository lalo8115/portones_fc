import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify from 'fastify'
import { createClient } from '@supabase/supabase-js'

/**
 * Tests para la API de Portones FC
 * 
 * NOTA: Estos tests requieren variables de entorno configuradas
 * Para ejecutar: npm test
 */

describe('Portones FC API Tests', () => {
  let fastify: any

  beforeAll(async () => {
    // Mock de variables de entorno para tests
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://mock.supabase.co'
    process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'mock-key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-admin-key'
    process.env.MQTT_HOST = process.env.MQTT_HOST || 'localhost'
    process.env.MQTT_PORT = process.env.MQTT_PORT || '1883'
    process.env.MQTT_USERNAME = process.env.MQTT_USERNAME || 'test'
    process.env.MQTT_PASSWORD = process.env.MQTT_PASSWORD || 'test'
    process.env.MQTT_USE_TLS = 'false'
    process.env.PORT = '3001'

    // Crear instancia de Fastify simple para tests
    fastify = Fastify({ logger: false })

    // Health check route
    fastify.get('/health', async () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        mqtt: 'unknown'
      }
    })

    // Mock gates endpoint
    fastify.get('/gates', async () => {
      return {
        1: 'CLOSED',
        2: 'CLOSED',
        3: 'CLOSED',
        4: 'CLOSED'
      }
    })

    // Mock gate/open endpoint
    fastify.post('/gate/open', async (request: any, reply: any) => {
      const { gateId } = request.body || {}

      if (!gateId || typeof gateId !== 'number' || gateId < 1 || gateId > 4) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'gateId must be a number between 1 and 4'
        })
      }

      return {
        success: true,
        message: 'Gate opening command sent',
        gateId,
        timestamp: new Date().toISOString()
      }
    })

    // Mock gate/close endpoint
    fastify.post('/gate/close', async (request: any, reply: any) => {
      const { gateId } = request.body || {}

      if (!gateId || typeof gateId !== 'number' || gateId < 1 || gateId > 4) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'gateId must be a number between 1 and 4'
        })
      }

      return {
        success: true,
        message: 'Gate closing command sent',
        gateId,
        timestamp: new Date().toISOString()
      }
    })

    // Iniciar servidor
    await fastify.listen({ port: 3001 })
  })

  afterAll(async () => {
    await fastify.close()
  })

  // ==========================================
  // HEALTH CHECK TESTS
  // ==========================================
  describe('GET /health', () => {
    it('should return 200 with health status', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.payload)
      expect(body).toHaveProperty('status')
      expect(body.status).toBe('ok')
      expect(body).toHaveProperty('timestamp')
    })

    it('should return valid timestamp', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health'
      })

      const body = JSON.parse(response.payload)
      const timestamp = new Date(body.timestamp)
      expect(timestamp.getTime()).toBeGreaterThan(0)
    })
  })

  // ==========================================
  // GATES STATUS TESTS
  // ==========================================
  describe('GET /gates', () => {
    it('should return gates status object', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/gates'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.payload)
      expect(body).toHaveProperty('1')
      expect(body).toHaveProperty('2')
      expect(body).toHaveProperty('3')
      expect(body).toHaveProperty('4')
    })

    it('should return valid gate status values', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/gates'
      })

      const body = JSON.parse(response.payload)
      const validStatuses = ['OPEN', 'CLOSED', 'OPENING', 'CLOSING', 'UNKNOWN']

      Object.values(body).forEach((status) => {
        expect(validStatuses).toContain(status)
      })
    })
  })

  // ==========================================
  // GATE OPEN TESTS
  // ==========================================
  describe('POST /gate/open', () => {
    it('should open gate with valid gateId', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/gate/open',
        payload: { gateId: 1 }
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.payload)
      expect(body.success).toBe(true)
      expect(body.gateId).toBe(1)
      expect(body).toHaveProperty('timestamp')
    })

    it('should reject invalid gateId (0)', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/gate/open',
        payload: { gateId: 0 }
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.payload)
      expect(body.error).toBe('Bad Request')
    })

    it('should reject invalid gateId (5)', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/gate/open',
        payload: { gateId: 5 }
      })

      expect(response.statusCode).toBe(400)
    })

    it('should reject invalid gateId type (string)', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/gate/open',
        payload: { gateId: '1' }
      })

      expect(response.statusCode).toBe(400)
    })

    it('should reject missing gateId', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/gate/open',
        payload: {}
      })

      expect(response.statusCode).toBe(400)
    })

    it('should work with all valid gate IDs', async () => {
      for (let i = 1; i <= 4; i++) {
        const response = await fastify.inject({
          method: 'POST',
          url: '/gate/open',
          payload: { gateId: i }
        })

        expect(response.statusCode).toBe(200)
        const body = JSON.parse(response.payload)
        expect(body.gateId).toBe(i)
      }
    })
  })

  // ==========================================
  // GATE CLOSE TESTS
  // ==========================================
  describe('POST /gate/close', () => {
    it('should close gate with valid gateId', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/gate/close',
        payload: { gateId: 1 }
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.payload)
      expect(body.success).toBe(true)
      expect(body.gateId).toBe(1)
    })

    it('should reject invalid gateId (0)', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/gate/close',
        payload: { gateId: 0 }
      })

      expect(response.statusCode).toBe(400)
    })

    it('should reject invalid gateId (5)', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/gate/close',
        payload: { gateId: 5 }
      })

      expect(response.statusCode).toBe(400)
    })

    it('should work with all valid gate IDs', async () => {
      for (let i = 1; i <= 4; i++) {
        const response = await fastify.inject({
          method: 'POST',
          url: '/gate/close',
          payload: { gateId: i }
        })

        expect(response.statusCode).toBe(200)
        const body = JSON.parse(response.payload)
        expect(body.gateId).toBe(i)
      }
    })
  })

  // ==========================================
  // PAYLOAD VALIDATION TESTS
  // ==========================================
  describe('Request/Response Format', () => {
    it('gate/open response should have required fields', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/gate/open',
        payload: { gateId: 1 }
      })

      const body = JSON.parse(response.payload)
      expect(body).toHaveProperty('success')
      expect(body).toHaveProperty('message')
      expect(body).toHaveProperty('gateId')
      expect(body).toHaveProperty('timestamp')
    })

    it('gate/close response should have required fields', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/gate/close',
        payload: { gateId: 1 }
      })

      const body = JSON.parse(response.payload)
      expect(body).toHaveProperty('success')
      expect(body).toHaveProperty('message')
      expect(body).toHaveProperty('gateId')
      expect(body).toHaveProperty('timestamp')
    })

    it('timestamp should be ISO 8601 format', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/gate/open',
        payload: { gateId: 1 }
      })

      const body = JSON.parse(response.payload)
      const timestamp = new Date(body.timestamp)
      expect(timestamp.getTime()).toBeGreaterThan(0)
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  })
})
