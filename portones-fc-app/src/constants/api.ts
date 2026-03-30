const LOCAL_API_URL = process.env.EXPO_PUBLIC_LOCAL_API_URL || 'http://localhost:3000'
const PRODUCTION_API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://portones-fc.onrender.com'

const apiTarget =
  process.env.EXPO_PUBLIC_API_TARGET === 'local' ? 'local' : 'production'

export const API_URL = (
  apiTarget === 'local' ? LOCAL_API_URL : PRODUCTION_API_URL
).replace(/\/$/, '')

export const API_TARGET = apiTarget