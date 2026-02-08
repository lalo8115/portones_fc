import React, { useMemo, useState, useEffect } from 'react'
import { Alert, ScrollView, TextInput } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { YStack, XStack, Text, Button, Card, Circle, Spinner } from 'tamagui'
import { ChevronLeft, ShoppingBag, Tag } from '@tamagui/lucide-icons'

interface MarketplaceScreenProps {
  apiUrl: string
  authToken: string
  onBack: () => void
}

export const MarketplaceScreen: React.FC<MarketplaceScreenProps> = ({ onBack, apiUrl, authToken }) => {
  const queryClient = useQueryClient()
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [formCategory, setFormCategory] = useState<string>('other')
  const [currentMps, setCurrentMps] = useState<number | null>(null)
  const [isDecrementingMps, setIsDecrementingMps] = useState(true)

  // Decrement MPS on screen entry
  useEffect(() => {
    const decrementMps = async () => {
      try {
        // Get current profile to get MPS value
        const profileResponse = await fetch(`${apiUrl}/profile`, {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        })

        if (!profileResponse.ok) {
          throw new Error('No se pudo obtener el perfil')
        }

        const profileData: any = await profileResponse.json()
        const currentMpsValue = profileData.marketplace_sessions || 0

        setCurrentMps(currentMpsValue)

        // Check if MPS is 0 or less
        if (currentMpsValue <= 0) {
          Alert.alert(
            'Acceso limitado',
            'Has alcanzado tu límite de sesiones del marketplace. Vuelve más tarde o contacta al administrador.',
            [{ text: 'OK', onPress: onBack }]
          )
          return
        }

        // Decrement MPS
        const newMpsValue = currentMpsValue - 1
        const decrementResponse = await fetch(`${apiUrl}/profile/mps`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`
          },
          body: JSON.stringify({ mps: newMpsValue })
        })

        if (!decrementResponse.ok) {
          throw new Error('No se pudo actualizar el contador de sesiones')
        }

        setCurrentMps(newMpsValue)
      } catch (error) {
        console.error('Error decrementing MPS:', error)
        Alert.alert('Error', 'Hubo un problema al acceder al marketplace')
      } finally {
        setIsDecrementingMps(false)
      }
    }

    decrementMps()
  }, [])

  const categories = useMemo(
    () => [
      { id: 'all', label: 'Todo', color: '$gray10' },
      { id: 'electronics', label: 'Electrónica', color: '$blue10' },
      { id: 'furniture', label: 'Muebles', color: '$orange10' },
      { id: 'vehicles', label: 'Vehículos', color: '$red10' },
      { id: 'clothing', label: 'Ropa', color: '$pink10' },
      { id: 'home', label: 'Hogar', color: '$purple10' },
      { id: 'services', label: 'Servicios', color: '$green10' },
      { id: 'other', label: 'Otros', color: '$gray10' }
    ],
    []
  )

  const formatPrice = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 2
    }).format(value)
  }

  const formatDate = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const categoryLabel = (id: string) => categories.find((c) => c.id === id)?.label || 'Otros'

  const fetchItems = async () => {
    const url = `${apiUrl}/marketplace/items${selectedCategory !== 'all' ? `?category=${selectedCategory}` : ''}`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || 'No se pudieron cargar los artículos')
    }

    return response.json() as Promise<MarketplaceItem[]>
  }

  const { data: items, isLoading, isFetching } = useQuery({
    queryKey: ['marketplace-items', selectedCategory],
    queryFn: fetchItems
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const priceNumber = Number.parseFloat(price)
      if (Number.isNaN(priceNumber)) {
        throw new Error('El precio debe ser un número válido')
      }

      const response = await fetch(`${apiUrl}/marketplace/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          price: priceNumber,
          category: formCategory,
          contact_info: contactInfo.trim() || undefined
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'No se pudo crear el artículo')
      }

      return response.json()
    },
    onSuccess: () => {
      setTitle('')
      setDescription('')
      setPrice('')
      setContactInfo('')
      setFormCategory('other')
      setShowCreateForm(false)
      queryClient.invalidateQueries({ queryKey: ['marketplace-items'] })
    },
    onError: (error) => {
      Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo crear el artículo')
    }
  })

  const handleCreateItem = () => {
    if (!title.trim()) {
      Alert.alert('Error', 'El título es requerido')
      return
    }

    if (!description.trim()) {
      Alert.alert('Error', 'La descripción es requerida')
      return
    }

    if (!price.trim()) {
      Alert.alert('Error', 'El precio es requerido')
      return
    }

    createMutation.mutate()
  }

  return (
    <YStack flex={1} backgroundColor='$background'>
      <XStack
        justifyContent='space-between'
        alignItems='center'
        padding='$4'
        paddingTop='$8'
        backgroundColor='$background'
        borderBottomWidth={1}
        borderBottomColor='$gray5'
      >
        <XStack alignItems='center' space='$2' flex={1}>
          <Button size='$3' chromeless icon={<ChevronLeft size={20} />} onPress={onBack} />
          <Text fontSize='$6' fontWeight='bold'>
            Marketplace
          </Text>
        </XStack>
      </XStack>

      {isDecrementingMps ? (
        <XStack flex={1} justifyContent='center' alignItems='center'>
          <Spinner size='large' color='$green10' />
        </XStack>
      ) : (
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16 }}>
        <YStack space='$4'>
          <Card elevate size='$3.5' bordered padding='$4' backgroundColor='$green2'>
            <XStack space='$3' alignItems='center'>
              <Circle size={44} backgroundColor='$green10' elevate>
                <ShoppingBag size={22} color='white' />
              </Circle>
              <YStack flex={1} space='$1'>
                <Text fontSize='$5' fontWeight='600'>
                  Compra y vende entre vecinos
                </Text>
                <Text fontSize='$3' color='$gray11'>
                  Publica artículos, servicios o encuentra lo que necesitas.
                </Text>
              </YStack>
            </XStack>
          </Card>

          <YStack space='$2'>
            <XStack justifyContent='space-between' alignItems='center'>
              <Text fontSize='$5' fontWeight='600'>
                Categorías
              </Text>
              <Button size='$2.5' theme='green' onPress={() => setShowCreateForm((prev) => !prev)}>
                {showCreateForm ? 'Cerrar' : 'Publicar'}
              </Button>
            </XStack>
            <XStack flexWrap='wrap' gap='$2'>
              {categories.map((category) => (
                <Button
                  key={category.id}
                  size='$2.5'
                  backgroundColor={selectedCategory === category.id ? '$green10' : 'transparent'}
                  borderColor={selectedCategory === category.id ? '$green10' : '$gray7'}
                  borderWidth={1}
                  onPress={() => setSelectedCategory(category.id)}
                >
                  <XStack space='$2' alignItems='center'>
                    <Tag size={14} color={selectedCategory === category.id ? 'white' : '#999'} />
                    <Text color={selectedCategory === category.id ? 'white' : '$gray11'}>
                      {category.label}
                    </Text>
                  </XStack>
                </Button>
              ))}
            </XStack>
          </YStack>

          {showCreateForm && (
            <Card elevate size='$3.5' bordered padding='$4'>
              <YStack space='$3'>
                <Text fontSize='$5' fontWeight='600'>
                  Publicar artículo
                </Text>

                <YStack space='$2'>
                  <Text fontSize='$3' fontWeight='600'>
                    Título
                  </Text>
                  <TextInput
                    placeholder='Ej. Bicicleta en buen estado'
                    value={title}
                    onChangeText={setTitle}
                    style={{
                      borderWidth: 1,
                      borderColor: '#ccc',
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 14,
                      fontFamily: 'System',
                      color: '#333',
                      backgroundColor: '#fff'
                    }}
                  />
                </YStack>

                <YStack space='$2'>
                  <Text fontSize='$3' fontWeight='600'>
                    Descripción
                  </Text>
                  <TextInput
                    placeholder='Describe el artículo o servicio'
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={4}
                    style={{
                      borderWidth: 1,
                      borderColor: '#ccc',
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 14,
                      fontFamily: 'System',
                      color: '#333',
                      backgroundColor: '#fff',
                      textAlignVertical: 'top'
                    }}
                  />
                </YStack>

                <XStack space='$3'>
                  <YStack flex={1} space='$2'>
                    <Text fontSize='$3' fontWeight='600'>
                      Precio
                    </Text>
                    <TextInput
                      placeholder='Ej. 1200'
                      value={price}
                      onChangeText={setPrice}
                      keyboardType='numeric'
                      style={{
                        borderWidth: 1,
                        borderColor: '#ccc',
                        borderRadius: 8,
                        padding: 12,
                        fontSize: 14,
                        fontFamily: 'System',
                        color: '#333',
                        backgroundColor: '#fff'
                      }}
                    />
                  </YStack>
                  <YStack flex={1} space='$2'>
                    <Text fontSize='$3' fontWeight='600'>
                      Categoría
                    </Text>
                    <XStack flexWrap='wrap' gap='$2'>
                      {categories
                        .filter((category) => category.id !== 'all')
                        .map((category) => (
                          <Button
                            key={category.id}
                            size='$2.5'
                            backgroundColor={formCategory === category.id ? '$green10' : 'transparent'}
                            borderColor={formCategory === category.id ? '$green10' : '$gray7'}
                            borderWidth={1}
                            onPress={() => setFormCategory(category.id)}
                          >
                            <Text color={formCategory === category.id ? 'white' : '$gray11'}>
                              {category.label}
                            </Text>
                          </Button>
                        ))}
                    </XStack>
                  </YStack>
                </XStack>

                <YStack space='$2'>
                  <Text fontSize='$3' fontWeight='600'>
                    Contacto (opcional)
                  </Text>
                  <TextInput
                    placeholder='Teléfono, WhatsApp o correo'
                    value={contactInfo}
                    onChangeText={setContactInfo}
                    style={{
                      borderWidth: 1,
                      borderColor: '#ccc',
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 14,
                      fontFamily: 'System',
                      color: '#333',
                      backgroundColor: '#fff'
                    }}
                  />
                </YStack>

                <Button size='$3' theme='green' onPress={handleCreateItem} disabled={createMutation.isPending}>
                  {createMutation.isPending && <Spinner size='small' color='white' />}
                  <Text fontWeight='700' marginLeft={createMutation.isPending ? '$2' : 0}>
                    {createMutation.isPending ? 'Publicando...' : 'Publicar'}
                  </Text>
                </Button>
              </YStack>
            </Card>
          )}

          <YStack space='$2'>
            <XStack justifyContent='space-between' alignItems='center'>
              <Text fontSize='$5' fontWeight='600'>
                Artículos
              </Text>
              <Button
                size='$2.5'
                variant='outlined'
                onPress={() => queryClient.invalidateQueries({ queryKey: ['marketplace-items'] })}
                disabled={isFetching}
              >
                {isFetching ? 'Actualizando...' : 'Actualizar'}
              </Button>
            </XStack>

            {isLoading ? (
              <XStack justifyContent='center' padding='$4'>
                <Spinner size='large' color='$green10' />
              </XStack>
            ) : (items && items.length > 0 ? (
              <YStack space='$3'>
                {items.map((item) => (
                  <Card key={item.id} elevate size='$3.5' bordered padding='$4'>
                    <YStack space='$2'>
                      <XStack justifyContent='space-between' alignItems='center'>
                        <Text fontSize='$5' fontWeight='600'>
                          {item.title}
                        </Text>
                        <Text fontSize='$4' color='$green10' fontWeight='700'>
                          {formatPrice(Number(item.price))}
                        </Text>
                      </XStack>

                      <Text fontSize='$3' color='$gray11'>
                        {item.description}
                      </Text>

                      <XStack justifyContent='space-between' alignItems='center'>
                        <Text fontSize='$2' color='$gray10'>
                          {categoryLabel(item.category)} · {formatDate(item.created_at)}
                        </Text>
                        <Text fontSize='$2' color='$gray10'>
                          {item.seller_name}{item.seller_unit ? ` · ${item.seller_unit}` : ''}
                        </Text>
                      </XStack>

                      {item.contact_info && (
                        <Card bordered padding='$3' backgroundColor='$gray2'>
                          <YStack space='$1'>
                            <Text fontSize='$3' fontWeight='600'>
                              Contacto
                            </Text>
                            <Text fontSize='$3' color='$gray11'>
                              {item.contact_info}
                            </Text>
                          </YStack>
                        </Card>
                      )}
                    </YStack>
                  </Card>
                ))}
              </YStack>
            ) : (
              <Card elevate size='$3.5' bordered padding='$4'>
                <YStack space='$2' alignItems='center'>
                  <Text fontSize='$5' fontWeight='600'>
                    Sin publicaciones
                  </Text>
                  <Text fontSize='$3' color='$gray11' textAlign='center'>
                    No hay artículos en esta categoría. Sé el primero en publicar algo.
                  </Text>
                </YStack>
              </Card>
            ))}
          </YStack>
        </YStack>
        </ScrollView>
      )}
    </YStack>
  )
}

interface MarketplaceItem {
  id: number
  title: string
  description: string
  price: number
  category: string
  contact_info?: string
  image_url?: string
  created_at: string
  seller_id: string
  seller_name: string
  seller_unit?: string
}
