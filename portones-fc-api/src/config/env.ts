import dotenv from 'dotenv'

dotenv.config()

/**
 * Validación de variables de entorno requeridas
 */
interface EnvConfig {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  MQTT_HOST: string
  MQTT_PORT: number
  MQTT_USERNAME: string
  MQTT_PASSWORD: string
  MQTT_USE_TLS: boolean
  PORT: number
  NODE_ENV: 'development' | 'production' | 'test'
  OPENPAY_MERCHANT_ID: string
  OPENPAY_PRIVATE_KEY: string
  OPENPAY_PUBLIC_KEY: string
  OPENPAY_PRODUCTION: boolean
  MAINTENANCE_MONTHLY_AMOUNT: number
}

const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'MQTT_HOST',
  'MQTT_PORT',
  'MQTT_USERNAME',
  'MQTT_PASSWORD',
  'OPENPAY_MERCHANT_ID',
  'OPENPAY_PRIVATE_KEY',
  'OPENPAY_PUBLIC_KEY'
]

const missingEnvVars = requiredEnvVars.filter(
  (envVar) => !process.env[envVar]
)

if (missingEnvVars.length > 0) {
  console.error(
    '❌ Error: Variables de entorno faltantes:',
    missingEnvVars.join(', ')
  )
  console.error('⚠️  Asegúrate de que .env tenga todas las variables requeridas')
  process.exit(1)
}

export const config: EnvConfig = {
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  MQTT_HOST: process.env.MQTT_HOST || '',
  MQTT_PORT: parseInt(process.env.MQTT_PORT || '8883', 10),
  MQTT_USERNAME: process.env.MQTT_USERNAME || '',
  MQTT_PASSWORD: process.env.MQTT_PASSWORD || '',
  MQTT_USE_TLS: process.env.MQTT_USE_TLS === 'true',
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: (process.env.NODE_ENV as any) || 'development',
  OPENPAY_MERCHANT_ID: process.env.OPENPAY_MERCHANT_ID || '',
  OPENPAY_PRIVATE_KEY: process.env.OPENPAY_PRIVATE_KEY || '',
  OPENPAY_PUBLIC_KEY: process.env.OPENPAY_PUBLIC_KEY || '',
  OPENPAY_PRODUCTION: process.env.OPENPAY_PRODUCTION === 'true',
  MAINTENANCE_MONTHLY_AMOUNT: parseFloat(
    process.env.MAINTENANCE_MONTHLY_AMOUNT || '500'
  )
}

// Validar que MQTT_PORT es válido
if (isNaN(config.MQTT_PORT) || config.MQTT_PORT < 1 || config.MQTT_PORT > 65535) {
  console.error('❌ Error: MQTT_PORT debe ser un número entre 1 y 65535')
  process.exit(1)
}

// Validar que PORT es válido
if (isNaN(config.PORT) || config.PORT < 1 || config.PORT > 65535) {
  console.error('❌ Error: PORT debe ser un número entre 1 y 65535')
  process.exit(1)
}

// Log de configuración cargada (sin valores sensibles)
console.log('✅ Configuración cargada:')
console.log(`   - Supabase URL: ${config.SUPABASE_URL.substring(0, 30)}...`)
console.log(`   - MQTT Host: ${config.MQTT_HOST}:${config.MQTT_PORT}`)
console.log(`   - Puerto del servidor: ${config.PORT}`)
console.log(`   - Entorno: ${config.NODE_ENV}`)
console.log(
  `   - Openpay Merchant: ${config.OPENPAY_MERCHANT_ID.substring(0, 6)}...`
)
