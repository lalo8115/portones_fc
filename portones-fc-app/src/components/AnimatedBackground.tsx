import React from 'react'
import { Animated, Easing, Platform, StyleProp, View, ViewStyle } from 'react-native'
import { Gyroscope } from 'expo-sensors'
import { Blur, Canvas, LinearGradient, Paint, Rect, Shader, Skia, vec } from '@shopify/react-native-skia'

type AnimatedBackgroundProps = {
  style?: StyleProp<ViewStyle>
  opacity?: number
  enableGyro?: boolean
  bleed?: number
  showOverlayGradient?: boolean
  baseColor?: string
  showAurora?: boolean
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const sksl = `
uniform float2 iResolution;
uniform float iTime;
uniform float2 iTilt;

float hash(float2 p) {
  // Simple 2D hash
  p = float2(dot(p, float2(127.1, 311.7)), dot(p, float2(269.5, 183.3)));
  return fract(sin(p.x + p.y) * 43758.5453123);
}

float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float a = hash(i);
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(float2 p) {
  float v = 0.0;
  float a = 0.5;
  float2 shift = float2(100.0, 100.0);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.02 + shift;
    a *= 0.5;
  }
  return v;
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;

  // Centered coords with aspect correction
  float2 p = uv - 0.5;
  p.x *= iResolution.x / iResolution.y;

  // Subtle sensor tilt influence
  p += iTilt * 0.10;

  float t = iTime * 0.12;

  // Domain warping for liquid/smoke feel
  float2 q = float2(
    fbm(p * 1.5 + float2(0.0, t)),
    fbm(p * 1.5 + float2(4.2, -t))
  );

  float2 r = float2(
    fbm(p * 2.2 + 1.7 * q + float2(1.7, 9.2) + 0.15 * t),
    fbm(p * 2.2 + 1.7 * q + float2(8.3, 2.8) - 0.10 * t)
  );

  float n = fbm(p * 3.0 + 2.0 * r + float2(0.0, t));

  // Base palette (dark blue -> cyan)
  float3 c0 = float3(0.02, 0.06, 0.12);
  float3 c1 = float3(0.02, 0.16, 0.30);
  float3 c2 = float3(0.00, 0.55, 0.75);

  float glow = smoothstep(0.25, 0.95, n);
  float core = smoothstep(0.55, 1.00, n);

  float3 col = mix(c0, c1, glow);
  col = mix(col, c2, core * 0.75);

  // Soft vignetting
  float v = smoothstep(1.15, 0.20, length(p));
  col *= 0.55 + 0.45 * v;

  // Gentle highlights
  col += 0.08 * float3(0.2, 0.7, 0.9) * glow;

  return half4(half3(col), 1.0);
}
`

export const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({
  style,
  opacity = 0.55,
  enableGyro = true,
  bleed = 64,
  showOverlayGradient = true,
  baseColor = '#06121f',
  showAurora = true
}) => {
  // Skia RuntimeEffect no siempre está disponible en web (RN-web / expo export)
  // En ese caso, hacemos fallback a un fondo estático para evitar crashes.
  if (Platform.OS === 'web') {
    const t = React.useRef(new Animated.Value(0)).current

    React.useEffect(() => {
      if (!showAurora) return

      const loop = Animated.loop(
        Animated.timing(t, {
          toValue: 1,
          duration: 16000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      )
      loop.start()
      return () => loop.stop()
    }, [t, showAurora])

    const blob1 = {
      transform: [
        {
          translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-40, 60] })
        },
        {
          translateY: t.interpolate({ inputRange: [0, 1], outputRange: [-30, 40] })
        },
        {
          scale: t.interpolate({ inputRange: [0, 1], outputRange: [1.05, 1.18] })
        }
      ]
    } as const

    const blob2 = {
      transform: [
        {
          translateX: t.interpolate({ inputRange: [0, 1], outputRange: [70, -50] })
        },
        {
          translateY: t.interpolate({ inputRange: [0, 1], outputRange: [20, -60] })
        },
        {
          scale: t.interpolate({ inputRange: [0, 1], outputRange: [1.10, 0.98] })
        }
      ]
    } as const

    const blob3 = {
      transform: [
        {
          translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-10, 30] })
        },
        {
          translateY: t.interpolate({ inputRange: [0, 1], outputRange: [60, -10] })
        },
        {
          scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.12] })
        }
      ]
    } as const

    return (
      <View
        pointerEvents='none'
        style={[
          {
            position: 'absolute',
            left: -bleed,
            right: -bleed,
            top: -bleed,
            bottom: -bleed,
            backgroundColor: baseColor
          },
          style
        ]}
      >
        {showAurora && (
          <>
            {/* Aurora blobs (CSS-only on web via RN-web style passthrough) */}
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: '-20%',
                  top: '-15%',
                  width: '70%',
                  height: '70%',
                  borderRadius: 999,
                  opacity: 0.85 * opacity
                } as any,
                blob1,
                {
                  backgroundImage:
                    'radial-gradient(closest-side, rgba(0, 212, 255, 0.55) 0%, rgba(0, 212, 255, 0.18) 45%, rgba(0, 212, 255, 0) 72%)',
                  filter: 'blur(48px)'
                } as any
              ]}
            />
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  right: '-25%',
                  top: '-10%',
                  width: '75%',
                  height: '75%',
                  borderRadius: 999,
                  opacity: 0.80 * opacity
                } as any,
                blob2,
                {
                  backgroundImage:
                    'radial-gradient(closest-side, rgba(10, 76, 255, 0.50) 0%, rgba(10, 76, 255, 0.16) 48%, rgba(10, 76, 255, 0) 74%)',
                  filter: 'blur(54px)'
                } as any
              ]}
            />
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: '-10%',
                  bottom: '-25%',
                  width: '85%',
                  height: '85%',
                  borderRadius: 999,
                  opacity: 0.75 * opacity
                } as any,
                blob3,
                {
                  backgroundImage:
                    'radial-gradient(closest-side, rgba(2, 43, 92, 0.65) 0%, rgba(2, 43, 92, 0.20) 52%, rgba(2, 43, 92, 0) 78%)',
                  filter: 'blur(60px)'
                } as any
              ]}
            />
          </>
        )}

        {showOverlayGradient && (
          <>
            {/* Top-to-bottom gradient for header/content readability */}
            <View
              style={
                {
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  opacity: 0.85,
                  backgroundImage:
                    'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.18) 45%, rgba(0,0,0,0.12) 100%)'
                } as any
              }
            />
            {/* Vignette */}
            <View
              style={
                {
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  opacity: 0.60,
                  backgroundImage:
                    'radial-gradient(circle at 50% 40%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.60) 100%)'
                } as any
              }
            />
          </>
        )}
      </View>
    )
  }

  const [size, setSize] = React.useState({ width: 0, height: 0 })
  const [time, setTime] = React.useState(0)
  const tiltRef = React.useRef({ x: 0, y: 0 })
  const [tilt, setTilt] = React.useState({ x: 0, y: 0 })

  const runtimeEffect = React.useMemo(() => {
    if (!showAurora) {
      return null
    }

    const make = Skia?.RuntimeEffect?.Make
    if (!make) {
      return null
    }

    const effect = make(sksl)
    return effect
  }, [])

  // Time-driven animation without Reanimated
  React.useEffect(() => {
    if (!showAurora) {
      return
    }

    let rafId: number | null = null
    const start = Date.now()
    let lastCommit = 0

    const tick = () => {
      const now = Date.now()
      const t = (now - start) / 1000
      // ~30fps state updates to reduce React churn
      if (now - lastCommit > 33) {
        lastCommit = now
        setTime(t)
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      if (rafId != null) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [])

  // Sensor-driven subtle motion (optional)
  React.useEffect(() => {
    if (!showAurora || !enableGyro) {
      return
    }

    Gyroscope.setUpdateInterval(50)

    const sub = Gyroscope.addListener(({ x, y }) => {
      // Map gyro to a small [-1, 1] range and smooth it
      const targetX = clamp((y ?? 0) / 3, -1, 1)
      const targetY = clamp((x ?? 0) / 3, -1, 1)

      const alpha = 0.08
      tiltRef.current = {
        x: tiltRef.current.x + (targetX - tiltRef.current.x) * alpha,
        y: tiltRef.current.y + (targetY - tiltRef.current.y) * alpha
      }

      // Commit at a lower rate; time tick already re-renders
      setTilt(tiltRef.current)
    })

    return () => {
      sub.remove()
    }
  }, [enableGyro])

  return (
    <View
      style={[
        { flex: 1, position: 'absolute', left: -bleed, right: -bleed, top: -bleed, bottom: -bleed },
        style
      ]}
      pointerEvents='none'
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        if (width !== size.width || height !== size.height) {
          setSize({ width, height })
        }
      }}
    >
      {size.width > 0 && size.height > 0 && (
        <Canvas style={{ flex: 1 }}>
          {/* Base para evitar transparencia/lineas negras en bordes */}
          <Rect x={0} y={0} width={size.width} height={size.height} color={baseColor} />

          {/* Aurora */}
          {showAurora && runtimeEffect && (
            <Rect x={0} y={0} width={size.width} height={size.height}>
              <Paint opacity={opacity}>
                <Shader
                  source={runtimeEffect}
                  uniforms={{
                    iResolution: vec(size.width, size.height),
                    iTime: time,
                    iTilt: vec(tilt.x, tilt.y)
                  }}
                />
                <Blur blur={14} mode='decal' />
              </Paint>
            </Rect>
          )}

          {/* Overlay degradado/vignette para legibilidad */}
          {showOverlayGradient && (
            <Rect x={0} y={0} width={size.width} height={size.height}>
              <Paint opacity={0.85}>
                <LinearGradient
                  start={vec(0, 0)}
                  end={vec(0, size.height)}
                  colors={[
                    'rgba(0,0,0,0.55)',
                    'rgba(0,0,0,0.18)',
                    'rgba(0,0,0,0.12)'
                  ]}
                />
              </Paint>
            </Rect>
          )}
        </Canvas>
      )}
    </View>
  )
}
