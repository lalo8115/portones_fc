import React, { useMemo, useState, useEffect } from 'react'
import { Alert, ScrollView, TextInput, Modal, View, Image } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { YStack, XStack, Text, Button, Card, Circle, Spinner } from 'tamagui'
import { ChevronLeft, ShoppingBag, Tag, X, Upload, ChevronRight } from '@tamagui/lucide-icons'
import { createClient } from '@supabase/supabase-js'

interface MarketplaceScreenProps {
  apiUrl: string
  authToken: string
  onBack: () => void
}

// Initialize Supabase client
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
  const [selectedImages, setSelectedImages] = useState<ImagePicker.ImagePickerAsset[]>([])
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [coloniaId, setColoniaId] = useState<string | null>(null)
  const [itemImageIndices, setItemImageIndices] = useState<{ [itemId: number]: number }>({})

  // Decrement MPS on screen entry
  useEffect(() => {
    const decrementMps = async () => {
      try {
        // Get current profile to get MPS value and colonia_id
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
        const userColoniaId = profileData.colonia_id

        setCurrentMps(currentMpsValue)
        setColoniaId(userColoniaId)

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
      { id: 'furniture', label: 'Muebles', color: '#8B4513' },
      { id: 'vehicles', label: 'Vehículos', color: '$red10' },
      { id: 'clothing', label: 'Ropa', color: '$pink10' },
      { id: 'home', label: 'Hogar', color: '$purple10' },
      { id: 'services', label: 'Servicios', color: '$green10' },
      { id: 'food', label: 'Comida', color: '$orange10' },
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

  const handleSelectImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Se necesita acceso a la galería para seleccionar imágenes')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        selectionLimit: 0
      })

      if (!result.canceled) {
        setSelectedImages([...selectedImages, ...result.assets])
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo seleccionar las imágenes')
    }
  }

  const handleRemoveImage = (index: number) => {
    setSelectedImages(selectedImages.filter((_, i) => i !== index))
  }

  const uploadImagesToSupabase = async (itemId: number): Promise<string[]> => {
    if (selectedImages.length === 0) return []
    if (!coloniaId) throw new Error('No se pudo obtener la colonia del usuario')

    const imageUrls: string[] = []

    try {
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser()

      if (userError || !user) {
        throw new Error('No se pudo obtener el usuario actual')
      }

      // Upload all selected images
      for (let i = 0; i < selectedImages.length; i++) {
        const image = selectedImages[i]
        // Get extension from fileName if available, otherwise default to jpg
        const fileExtension = image.fileName 
          ? image.fileName.split('.').pop()?.toLowerCase() || 'jpg'
          : 'jpg'
        const fileName = `${i + 1}.${fileExtension}`
        const filePath = `${coloniaId}/${user.id}/${itemId}/${fileName}`

        const response = await fetch(image.uri)
        const blob = await response.blob()

        const { error: uploadError } = await supabase.storage
          .from('marketplace-files')
          .upload(filePath, blob, {
            contentType: 'image/jpeg',
            upsert: false
          })

        if (uploadError) {
          console.error(`Upload error for image ${i}:`, uploadError)
          continue // Continue uploading other images even if one fails
        }

        const { data: { publicUrl } } = supabase.storage
          .from('marketplace-files')
          .getPublicUrl(filePath)

        imageUrls.push(publicUrl)
      }

      return imageUrls
    } catch (error) {
      console.error('Error uploading images:', error)
      throw error
    }
  }

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

      // Create marketplace item first
      const createResponse = await fetch(`${apiUrl}/marketplace/items`, {
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
          contact_info: contactInfo.trim() || null
        })
      })

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}))
        throw new Error(errorData.message || 'No se pudo crear el artículo')
      }

      const newItem = await createResponse.json()

      // Upload images if any selected
      if (selectedImages.length > 0) {
        try {
          const imageUrls = await uploadImagesToSupabase(newItem.id)
          
          if (imageUrls.length > 0) {
            // Update item with image URLs
            const updateResponse = await fetch(`${apiUrl}/marketplace/items/${newItem.id}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`
              },
              body: JSON.stringify({ 
                image_url: imageUrls[0], // First image as main image
                image_urls: imageUrls // All images
              })
            })

            if (!updateResponse.ok) {
              console.error('Error updating image URLs, but item was created')
            }
          }
        } catch (error) {
          console.error('Error uploading images:', error)
          // Item was created, so don't fail completely
        }
      }

      return newItem
    },
    onSuccess: () => {
      setTitle('')
      setDescription('')
      setPrice('')
      setContactInfo('')
      setFormCategory('other')
      setSelectedImages([])
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
          {currentMps! > 0 && (
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
          )}

          <YStack space='$2'>
            <XStack justifyContent='space-between' alignItems='center'>
              <Text fontSize='$5' fontWeight='600'>
                Categorías
              </Text>
            </XStack>
            <XStack flexWrap='wrap' gap='$2'>
              {categories.map((category) => (
                <Button
                  key={category.id}
                  size='$2.5'
                  backgroundColor={selectedCategory === category.id ? category.color : 'transparent'}
                  borderColor={selectedCategory === category.id ? category.color : '$gray7'}
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

          <YStack space='$2'>
            <XStack justifyContent='space-between' alignItems='center'>
              <Text fontSize='$5' fontWeight='600'>
                Artículos
              </Text>
              <Button size='$2.5' theme='green' onPress={() => setShowCreateForm(true)}>
                Publicar
              </Button>
            </XStack>

            {isLoading ? (
              <XStack justifyContent='center' padding='$4'>
                <Spinner size='large' color='$green10' />
              </XStack>
            ) : (items && items.length > 0 ? (
              <YStack space='$3'>
                {items.map((item) => {
                  const imageArray = item.image_urls && item.image_urls.length > 0 ? item.image_urls : (item.image_url ? [item.image_url] : [])
                  const currentImageIdx = itemImageIndices[item.id] || 0
                  const currentImage = imageArray[currentImageIdx]

                  return (
                  <Card 
                    key={item.id} 
                    elevate 
                    size='$3.5' 
                    bordered 
                    padding='$4'
                    onPress={async () => {
                      // Fetch all images from storage for this item
                      try {
                        const imagesResponse = await fetch(`${apiUrl}/marketplace/items/${item.id}/images`, {
                          headers: {
                            Authorization: `Bearer ${authToken}`
                          }
                        })
                        if (imagesResponse.ok) {
                          const imagesData = await imagesResponse.json()
                          // Update the selected item with all images from storage
                          setSelectedItem({
                            ...item,
                            image_urls: imagesData.imageUrls.length > 0 ? imagesData.imageUrls : item.image_urls
                          })
                        } else {
                          setSelectedItem(item)
                        }
                      } catch (error) {
                        console.error('Error fetching images:', error)
                        setSelectedItem(item)
                      }
                      setCurrentImageIndex(0)
                    }}
                    pressStyle={{ scale: 0.98, opacity: 0.8 }}
                  >
                    <YStack space='$2'>
                      {currentImage && (
                        <YStack space='$2'>
                          <YStack position='relative'>
                            <Image
                              source={{ uri: currentImage }}
                              style={{ width: '100%', height: 200, borderRadius: 8, marginBottom: 8 }}
                            />
                            {imageArray.length > 1 && (
                              <Card 
                                position='absolute' 
                                top='$2' 
                                right='$2'
                                backgroundColor='$green10'
                                paddingHorizontal='$2'
                                paddingVertical='$1'
                                borderRadius='$2'
                              >
                                <Text fontSize='$2' color='white' fontWeight='600'>
                                  {imageArray.length} fotos
                                </Text>
                              </Card>
                            )}
                          </YStack>
                          
                          {imageArray.length > 1 && (
                            <XStack justifyContent='space-between' alignItems='center' space='$2' paddingVertical='$2'>
                              <Button
                                size='$3'
                                theme='green'
                                onPress={(e: any) => {
                                  e.stopPropagation?.()
                                  setItemImageIndices(prev => ({
                                    ...prev,
                                    [item.id]: prev[item.id] > 0 ? prev[item.id] - 1 : imageArray.length - 1
                                  }))
                                }}
                              >
                                <ChevronLeft size={18} />
                              </Button>
                              <Text fontSize='$3' color='$gray10' flex={1} textAlign='center' fontWeight='600'>
                                {currentImageIdx + 1} / {imageArray.length}
                              </Text>
                              <Button
                                size='$3'
                                theme='green'
                                onPress={(e: any) => {
                                  e.stopPropagation?.()
                                  setItemImageIndices(prev => ({
                                    ...prev,
                                    [item.id]: prev[item.id] < imageArray.length - 1 ? prev[item.id] + 1 : 0
                                  }))
                                }}
                              >
                                <ChevronRight size={18} />
                              </Button>
                            </XStack>
                          )}
                        </YStack>
                      )}
                      
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
                    </YStack>
                  </Card>
                  )
                })}
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

      {/* Modal de detalle del artículo */}
      <Modal
        visible={selectedItem !== null}
        animationType='fade'
        transparent={true}
        onRequestClose={() => {
          setSelectedItem(null)
          setCurrentImageIndex(0)
        }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <Card elevate size='$5' bordered padding='$4' width='90%' maxWidth={500}>
            <YStack space='$3'>
              <XStack justifyContent='space-between' alignItems='center'>
                <Text fontSize='$6' fontWeight='bold'>
                  {selectedItem?.title}
                </Text>
                <Button
                  size='$3'
                  chromeless
                  icon={<X size={20} />}
                  onPress={() => {
                    setSelectedItem(null)
                    setCurrentImageIndex(0)
                  }}
                />
              </XStack>

              <ScrollView scrollEnabled={true}>
                <YStack space='$4'>
                  {/* Imágenes */}
                  {(selectedItem?.image_urls && selectedItem.image_urls.length > 0) || selectedItem?.image_url ? (
                    <YStack space='$2'>
                      <Text fontSize='$4' fontWeight='600'>
                        Imágenes
                      </Text>
                      <YStack space='$2'>
                        {/* Imagen actual */}
                        <Image
                          source={{ 
                            uri: selectedItem?.image_urls 
                              ? selectedItem.image_urls[currentImageIndex] 
                              : selectedItem?.image_url 
                          }}
                          style={{ width: '100%', height: 300, borderRadius: 12 }}
                        />
                        
                        {/* Controles de navegación */}
                        {selectedItem?.image_urls && selectedItem.image_urls.length > 1 && (
                          <XStack justifyContent='space-between' alignItems='center' space='$2'>
                            <Button
                              size='$3'
                              theme='green'
                              onPress={() => setCurrentImageIndex((prev) => 
                                prev > 0 ? prev - 1 : selectedItem.image_urls!.length - 1
                              )}
                            >
                              <ChevronLeft size={20} />
                            </Button>
                            <Text fontSize='$2' color='$gray10' flex={1} textAlign='center'>
                              {currentImageIndex + 1} / {selectedItem.image_urls.length}
                            </Text>
                            <Button
                              size='$3'
                              theme='green'
                              onPress={() => setCurrentImageIndex((prev) => 
                                prev < selectedItem.image_urls!.length - 1 ? prev + 1 : 0
                              )}
                            >
                              <ChevronRight size={20} />
                            </Button>
                          </XStack>
                        )}
                      </YStack>
                    </YStack>
                  ) : null}

                  {/* Precio */}
                  <YStack space='$2'>
                    <Text fontSize='$3' color='$gray10'>
                      Precio
                    </Text>
                    <Text fontSize='$6' color='$green10' fontWeight='700'>
                      {formatPrice(Number(selectedItem?.price || 0))}
                    </Text>
                  </YStack>

                  {/* Descripción */}
                  <YStack space='$2'>
                    <Text fontSize='$4' fontWeight='600'>
                      Descripción
                    </Text>
                    <Text fontSize='$3' color='$gray11'>
                      {selectedItem?.description}
                    </Text>
                  </YStack>

                  {/* Información del vendedor */}
                  <Card elevate bordered padding='$3' backgroundColor='$blue2'>
                    <YStack space='$2'>
                      <Text fontSize='$4' fontWeight='600'>
                        Vendedor
                      </Text>
                      <Text fontSize='$3'>
                        {selectedItem?.seller_name}{selectedItem?.seller_unit ? ` · ${selectedItem.seller_unit}` : ''}
                      </Text>
                      <Text fontSize='$2' color='$gray10'>
                        Publicado: {formatDate(selectedItem?.created_at || '')}
                      </Text>
                    </YStack>
                  </Card>

                  {/* Información de contacto */}
                  {selectedItem?.contact_info && (
                    <Card elevate bordered padding='$3' backgroundColor='$green2'>
                      <YStack space='$2'>
                        <Text fontSize='$4' fontWeight='600'>
                          Contacto
                        </Text>
                        <Text fontSize='$3' selectable>
                          {selectedItem.contact_info}
                        </Text>
                      </YStack>
                    </Card>
                  )}

                  {/* Categoría */}
                  <YStack space='$2'>
                    <Text fontSize='$3' color='$gray10'>
                      Categoría
                    </Text>
                    <Text fontSize='$4' fontWeight='500'>
                      {categoryLabel(selectedItem?.category || 'other')}
                    </Text>
                  </YStack>
                </YStack>
              </ScrollView>

              <Button
                size='$3'
                theme='green'
                onPress={() => {
                  setSelectedItem(null)
                  setCurrentImageIndex(0)
                }}
              >
                <Text fontWeight='700'>Cerrar</Text>
              </Button>
            </YStack>
          </Card>
        </View>
      </Modal>

      <Modal
        visible={showCreateForm}
        animationType='fade'
        transparent={true}
        onRequestClose={() => setShowCreateForm(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <Card elevate size='$5' bordered padding='$4' width='100%'>
            <YStack space='$3'>
              <XStack justifyContent='space-between' alignItems='center'>
                <Text fontSize='$6' fontWeight='bold'>
                  Publicar artículo
                </Text>
                <Button
                  size='$3'
                  chromeless
                  icon={<X size={20} />}
                  onPress={() => setShowCreateForm(false)}
                />
              </XStack>

              <ScrollView scrollEnabled={true} >
                <YStack space='$3'>
                  <YStack space='$2'>
                    <XStack justifyContent='space-between' alignItems='center'>
                      <Text fontSize='$3' fontWeight='600'>
                        Imágenes (opcional)
                      </Text>
                      <Text fontSize='$2' color='$gray10'>
                        {selectedImages.length} seleccionadas
                      </Text>
                    </XStack>
                    {selectedImages.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={{ paddingVertical: 8 }}>
                        <XStack gap='$2' paddingHorizontal='$2' marginBottom='$2'>
                          {selectedImages.map((image, index) => (
                            <YStack key={index} space='$1'>
                              <Image
                                source={{ uri: image.uri }}
                                style={{ width: 100, height: 100, borderRadius: 8 }}
                              />
                              <Button
                                size='$1.5'
                                theme='red'
                                onPress={() => handleRemoveImage(index)}
                              >
                                <X size={14} />
                              </Button>
                            </YStack>
                          ))}
                        </XStack>
                      </ScrollView>
                    )}
                    <Button
                      size='$3'
                      borderColor='$gray7'
                      borderWidth={1}
                      backgroundColor='transparent'
                      onPress={handleSelectImage}
                    >
                      <XStack space='$2' alignItems='center'>
                        <Upload size={18} color='$blue10' />
                        <Text color='$blue10'>Agregar {selectedImages.length > 0 ? 'más ' : ''}imágenes</Text>
                      </XStack>
                    </Button>
                  </YStack>

                  <YStack space='$2'>
                    <Text fontSize='$3' fontWeight='600'>
                      Título
                    </Text>
                    <TextInput
                      placeholder='Ej. Bicicleta en buen estado'
                      placeholderTextColor='#ffffff4a'
                      value={title}
                      onChangeText={setTitle}
                      
                      
                      style={{
                        borderWidth: 1,
                        borderColor: '#171717',
                        borderRadius: 8,
                        padding: 12,
                        fontSize: 14,
                        fontFamily: 'System',
                        color: '#ffffff',
                        backgroundColor: '#0f0f0f'
                      }}
                    />
                  </YStack>

                  <YStack space='$2'>
                    <Text fontSize='$3' fontWeight='600'>
                      Descripción
                    </Text>
                    <TextInput
                      placeholder='Describe el artículo o servicio'
                      placeholderTextColor='#ffffff4a'
                      value={description}
                      onChangeText={setDescription}
                      multiline
                      numberOfLines={4}
                      style={{
                        borderWidth: 1,
                        borderColor: '#171717',
                        borderRadius: 8,
                        padding: 12,
                        fontSize: 14,
                        fontFamily: 'System',
                        color: '#ffffff',
                        backgroundColor: '#0f0f0f',
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
                        placeholderTextColor='#ffffff4a'
                        value={price}
                        onChangeText={setPrice}
                        keyboardType='numeric'
                        style={{
                          borderWidth: 1,
                          borderColor: '#171717',
                          borderRadius: 8,
                          padding: 12,
                          fontSize: 14,
                          fontFamily: 'System',
                          color: '#ffffff',
                          backgroundColor: '#0f0f0f'
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
                              backgroundColor={formCategory === category.id ? category.color : 'transparent'}
                              borderColor={formCategory === category.id ? category.color : '$gray7'}
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
                    <Text fontSize='$3' fontWeight='600' paddingBottom={'$2'}>
                      Contacto (opcional)
                    </Text>
                    <TextInput

                      placeholder='Teléfono, WhatsApp o correo'
                      placeholderTextColor='#ffffff4a'
                      value={contactInfo}
                      onChangeText={setContactInfo}
                      
                      style={{
                        borderWidth: 1,
                        borderColor: '#171717',
                        borderRadius: 8,
                        padding: 12,
                        fontSize: 14,
                        fontFamily: 'System',
                        color: '#ffffff',
                        backgroundColor: '#0f0f0f'
                        
                      }}
                    />
                  </YStack>
                </YStack>
              </ScrollView>
              <YStack paddingTop={'$2'}>
              <Button size='$3' theme='green'  onPress={handleCreateItem} disabled={createMutation.isPending}>
                {createMutation.isPending && <Spinner size='small' color='white' />}
                <Text fontWeight='700' marginLeft={createMutation.isPending ? '$2' : 0}>
                  {createMutation.isPending ? 'Publicando...' : 'Publicar'}
                </Text>
              </Button>
              </YStack>
            </YStack>
          </Card>
        </View>
      </Modal>
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
  image_urls?: string[]
  created_at: string
  seller_id: string
  seller_name: string
  seller_unit?: string
}
