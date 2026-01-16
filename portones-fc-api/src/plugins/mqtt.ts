import mqtt from 'mqtt'
import { setGateStatus } from '../state/gates'

let mqttClient: mqtt.MqttClient | null = null

// Hacer el cliente disponible globalmente para shutdown
declare global {
  var mqttClient: mqtt.MqttClient | null
}

export const connectMQTT = (): Promise<mqtt.MqttClient> => {
  return new Promise((resolve, reject) => {
    if (mqttClient && mqttClient.connected) {
      return resolve(mqttClient)
    }

    const options: mqtt.IClientOptions = {
      host: process.env.MQTT_HOST || 'localhost',
      port: parseInt(process.env.MQTT_PORT || '1883'),
      username: process.env.MQTT_USERNAME || '',
      password: process.env.MQTT_PASSWORD || '',
      protocol: process.env.MQTT_USE_TLS === 'true' ? 'mqtts' : 'mqtt',
      reconnectPeriod: 5000,
      connectTimeout: 30000
    }

    mqttClient = mqtt.connect(options)
    global.mqttClient = mqttClient

    mqttClient.on('connect', () => {
      console.info('✅ Connected to MQTT broker')
      mqttClient!.subscribe('portones/gate/status', (err) => {
        if (err) {
          console.error('Failed to subscribe to status topic', err)
        } else {
          console.info('✅ Subscribed to portones/gate/status')
        }
      })
      resolve(mqttClient!)
    })
    
    mqttClient.on('error', (error) => {
      console.error({ error }, 'MQTT connection error')
      reject(error)
    })
    
    mqttClient.on('offline', () => {
      console.warn('⚠️  MQTT client is offline')
    })
    
    mqttClient.on('reconnect', () => {
      console.info('🔄 Reconnecting to MQTT broker...')
    })

    mqttClient.on('message', (topic, message) => {
      const payload = message.toString()
      //console.log('📨 MQTT message received:', { topic, payload })

      if (topic === 'portones/gate/status') {
        try {
          const data = JSON.parse(payload)

          const gateId = Number(data.gateId)
          const status = data.status
          if (!gateId || !status) {
            console.warn('Invalid gate status payload', data)
            return
          }

          setGateStatus(gateId, status)

          console.info(`✅ Gate ${gateId} status updated to ${status}`)
        } catch (err) {
          console.error('Invalid MQTT status message', err)
        }
      }
    })
  })
}


