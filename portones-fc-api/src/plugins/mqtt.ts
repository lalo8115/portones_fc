import mqtt from 'mqtt'
let mqttClient: mqtt.MqttClient | null = null

export const connectMQTT = (): Promise<mqtt.MqttClient> => {
  return new Promise((resolve, reject) => {
    if (mqttClient && mqttClient.connected) {
      return resolve(mqttClient)
    }

    const options: mqtt.IClientOptions = {
      host: process.env.MQTT_HOST || 'localhost',
      port: parseInt(process.env.MQTT_PORT || '8883'),
      username: process.env.MQTT_USERNAME || '',
      password: process.env.MQTT_PASSWORD || '',
      protocol: process.env.MQTT_USE_TLS === 'true' ? 'mqtts' : 'mqtt',
      reconnectPeriod: 5000,
      connectTimeout: 30000
    }

    mqttClient = mqtt.connect(options)

    mqttClient.on('connect', () => {
      console.info('Connected to MQTT broker')
      resolve(mqttClient!)
    })

    mqttClient.on('error', (error) => {
      console.error({ error }, 'MQTT connection error')
      reject(error)
    })

    mqttClient.on('offline', () => {
      console.warn('MQTT client is offline')
    })

    mqttClient.on('reconnect', () => {
      console.info('Reconnecting to MQTT broker...')
    })
  })
}
