import { config } from '@tamagui/config/v3'
import { createTamagui } from 'tamagui'

const tamaguiConfig = createTamagui({
  ...config,
  media: {
    ...config.media,
    heightSm: { maxHeight: 740 },
    heightMd: { minHeight: 741, maxHeight: 890 },
    heightLg: { minHeight: 891 }
  }
})

export default tamaguiConfig

export type Conf = typeof tamaguiConfig

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
