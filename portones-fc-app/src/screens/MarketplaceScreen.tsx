import React, { useState } from 'react'
import { 
  YStack, 
  XStack, 
  Text, 
  Button, 
  Card, 
  Circle, 
  ScrollView,
  Spinner,
} from 'tamagui'
import { 
  ChevronLeft, 
  Plus, 
  ShoppingBag,
  Home as HomeIcon,
  Wrench,
  Car,
  Sofa,
  Smartphone,
  Shirt,
  Package,
  ChevronDown,
  Edit3,
  Trash2,
} from '@tamagui/lucide-icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, Modal, TouchableOpacity, Platform, RefreshControl } from 'react-native'
import { useAuth } from '../contexts/AuthContext'

interface MarketplaceScreenProps {
  apiUrl: string
  authToken: string
  onBack: () => void
}

interface MarketplaceItem {
  id: number
  title: string
  description: string
  price: number
  seller_id: string
  seller_name: string
  seller_unit?: string
  created_at: string
  category: 'electronics' | 'furniture' | 'vehicles' | 'clothing' | 'home' | 'services' | 'other'
  image_url?: string
  contact_info?: string
}

interface CreateItemData {
  title: string
  description: string
  price: number
  category: 'electronics' | 'furniture' | 'vehicles' | 'clothing' | 'home' | 'services' | 'other'
  contact_info?: string
}

const fetchItems = async (
  apiUrl: string,
  authToken: string,
  category: string
): Promise<MarketplaceItem[]> => {
  const response = await fetch(`${apiUrl}/marketplace/items?category=${category}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error('Failed to fetch items')
  }

  return response.json()
}

const createItem = async (
  apiUrl: string,
  authToken: string,
  data: CreateItemData
): Promise<MarketplaceItem> => {
  const response = await fetch(`${apiUrl}/marketplace/items`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to create item')
  }

  return response.json()
}

const updateItem = async (
  apiUrl: string,
  authToken: string,
  id: number,
  data: Partial<CreateItemData>
): Promise<MarketplaceItem> => {
  const response = await fetch(`${apiUrl}/marketplace/items/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to update item')
  }

  return response.json()
}

const deleteItem = async (
  apiUrl: string,
  authToken: string,
  id: number
): Promise<void> => {
  const response = await fetch(`${apiUrl}/marketplace/items/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to delete item')
  }
}

export const MarketplaceScreen: React.FC<MarketplaceScreenProps> = ({
  apiUrl,
  authToken,
  onBack
}) => {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [selectedCategory, setSelectedCategory] = useState<'electronics' | 'furniture' | 'vehicles' | 'clothing' | 'home' | 'services' | 'other'>('electronics')
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [showCreateItem, setShowCreateItem] = useState(false)
  const [newItemTitle, setNewItemTitle] = useState('')
  const [newItemDescription, setNewItemDescription] = useState('')
  const [newItemPrice, setNewItemPrice] = useState('')
  const [newItemContact, setNewItemContact] = useState('')
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null)
  const [showItemDetail, setShowItemDetail] = useState(false)
  const [isEditingItem, setIsEditingItem] = useState(false)
  const [editItemTitle, setEditItemTitle] = useState('')
  const [editItemDescription, setEditItemDescription] = useState('')
  const [editItemPrice, setEditItemPrice] = useState('')
  const [editItemContact, setEditItemContact] = useState('')
  const [editItemCategory, setEditItemCategory] = useState<'electronics' | 'furniture' | 'vehicles' | 'clothing' | 'home' | 'services' | 'other'>('electronics')

  const { data: items, isLoading, refetch } = useQuery({
    queryKey: ['marketplaceItems', selectedCategory],
    queryFn: () => fetchItems(apiUrl, authToken, selectedCategory),
    refetchInterval: 30000
  })

  const createItemMutation = useMutation({
    mutationFn: (data: CreateItemData) => createItem(apiUrl, authToken, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplaceItems'] })
      setShowCreateItem(false)
      setNewItemTitle('')
      setNewItemDescription('')
      setNewItemPrice('')
      setNewItemContact('')
      Alert.alert('Éxito', 'Artículo publicado correctamente')
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message)
    }
  })

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateItemData> }) => 
      updateItem(apiUrl, authToken, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplaceItems'] })
      setIsEditingItem(false)
      setShowItemDetail(false)
      Alert.alert('Éxito', 'Artículo actualizado correctamente')
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message)
    }
  })

  const deleteItemMutation = useMutation({
    mutationFn: (id: number) => deleteItem(apiUrl, authToken, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplaceItems'] })
      setShowItemDetail(false)
      Alert.alert('Éxito', 'Artículo eliminado correctamente')
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message)
    }
  })

  const categories = [
    {
      id: 'electronics' as const,
      title: 'Electrónicos',
      icon: Smartphone,
      color: '$blue10',
      description: 'Celulares, tablets, computadoras'
    },
    {
      id: 'furniture' as const,
      title: 'Muebles',
      icon: Sofa,
      color: '$orange10',
      description: 'Muebles para el hogar'
    },
    {
      id: 'vehicles' as const,
      title: 'Vehículos',
      icon: Car,
      color: '$red10',
      description: 'Autos, motos, bicicletas'
    },
    {
      id: 'clothing' as const,
      title: 'Ropa',
      icon: Shirt,
      color: '$purple10',
      description: 'Ropa y accesorios'
    },
    {
      id: 'home' as const,
      title: 'Hogar',
      icon: HomeIcon,
      color: '$green10',
      description: 'Artículos para el hogar'
    },
    {
      id: 'services' as const,
      title: 'Servicios',
      icon: Wrench,
      color: '$yellow10',
      description: 'Servicios profesionales'
    },
    {
      id: 'other' as const,
      title: 'Otros',
      icon: Package,
      color: '$gray10',
      description: 'Otros artículos'
    }
  ]

  const selectedCategoryData = categories.find(c => c.id === selectedCategory)
  
  const isFormValid = !!newItemTitle.trim() && !!newItemDescription.trim() && !!newItemPrice.trim()
  const isEditFormValid = !!editItemTitle.trim() && !!editItemDescription.trim() && !!editItemPrice.trim()

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Hace un momento'
    if (diffMins < 60) return `Hace ${diffMins} min`
    if (diffHours < 24) return `Hace ${diffHours} h`
    if (diffDays < 7) return `Hace ${diffDays} d`
    
    return date.toLocaleDateString('es-MX', { 
      day: '2-digit', 
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(price)
  }

  const handleItemPress = (item: MarketplaceItem) => {
    setSelectedItem(item)
    setShowItemDetail(true)
    setIsEditingItem(false)
  }

  const handleEditItem = () => {
    if (!selectedItem) return
    setEditItemTitle(selectedItem.title)
    setEditItemDescription(selectedItem.description)
    setEditItemPrice(selectedItem.price.toString())
    setEditItemContact(selectedItem.contact_info || '')
    setEditItemCategory(selectedItem.category)
    setIsEditingItem(true)
  }

  const handleSaveEdit = async () => {
    if (!selectedItem) return
    
    if (!editItemTitle.trim() || !editItemDescription.trim() || !editItemPrice.trim()) {
      Alert.alert('Error', 'Por favor completa todos los campos requeridos')
      return
    }

    const price = parseFloat(editItemPrice)
    if (isNaN(price) || price < 0) {
      Alert.alert('Error', 'Por favor ingresa un precio válido')
      return
    }

    const updateData: Partial<CreateItemData> = {
      title: editItemTitle,
      description: editItemDescription,
      price: price,
      category: editItemCategory,
      contact_info: editItemContact.trim() || undefined
    }

    updateItemMutation.mutate({ id: selectedItem.id, data: updateData })
  }

  const handleDeleteItem = () => {
    if (!selectedItem) return
    
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('¿Estás seguro de que deseas eliminar este artículo?')
      if (confirmed) {
        deleteItemMutation.mutate(selectedItem.id)
      }
    } else {
      Alert.alert(
        'Eliminar artículo',
        '¿Estás seguro de que deseas eliminar este artículo?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { 
            text: 'Eliminar', 
            style: 'destructive',
            onPress: () => deleteItemMutation.mutate(selectedItem.id)
          }
        ]
      )
    }
  }

  const handleCreateItem = async () => {
    if (!newItemTitle.trim() || !newItemDescription.trim() || !newItemPrice.trim()) {
      Alert.alert('Error', 'Por favor completa todos los campos requeridos')
      return
    }

    const price = parseFloat(newItemPrice)
    if (isNaN(price) || price < 0) {
      Alert.alert('Error', 'Por favor ingresa un precio válido')
      return
    }

    const itemData: CreateItemData = {
      title: newItemTitle,
      description: newItemDescription,
      price: price,
      category: selectedCategory,
      contact_info: newItemContact.trim() || undefined
    }

    createItemMutation.mutate(itemData)
  }

  const Icon = selectedCategoryData?.icon || Package

  // Modal de categorías (compartido entre ambas vistas)
  const CategoryModal = (
    <Modal
      visible={showCategoryDropdown}
      animationType="fade"
      transparent
      onRequestClose={() => setShowCategoryDropdown(false)}
    >
      <TouchableOpacity
        style={{ flex: 1 }}
        activeOpacity={1}
        onPress={() => setShowCategoryDropdown(false)}
      >
        <YStack
          position="absolute"
          top={140}
          left={16}
          right={16}
          borderRadius={12}
          borderWidth={1}
          borderColor="$gray5"
          overflow="hidden"
          backgroundColor="$background"
          shadowColor="$shadowColor"
          shadowOffset={{ width: 0, height: 4 }}
          shadowOpacity={0.3}
          shadowRadius={8}
          elevation={8}
        >
          {categories.map((cat, index) => {
            const CatIcon = cat.icon
            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() => {
                  if (isEditingItem) {
                    setEditItemCategory(cat.id)
                  } else {
                    setSelectedCategory(cat.id)
                  }
                  setShowCategoryDropdown(false)
                }}
              >
                <XStack
                  padding="$3.5"
                  alignItems="center"
                  space="$3"
                  backgroundColor={(isEditingItem ? editItemCategory : selectedCategory) === cat.id ? '$gray3' : '$background'}
                  borderBottomWidth={index < categories.length - 1 ? 1 : 0}
                  borderBottomColor="$gray5"
                  hoverStyle={{ backgroundColor: '$gray3' }}
                >
                  <Circle size={40} backgroundColor={cat.color}>
                    <CatIcon size={20} color='white' />
                  </Circle>
                  <YStack flex={1}>
                    <Text fontSize="$4" fontWeight="600">{cat.title}</Text>
                    <Text fontSize="$2" color="$gray11">{cat.description}</Text>
                  </YStack>
                  {(isEditingItem ? editItemCategory : selectedCategory) === cat.id && (
                    <Circle size={8} backgroundColor={cat.color} />
                  )}
                </XStack>
              </TouchableOpacity>
            )
          })}
        </YStack>
      </TouchableOpacity>
    </Modal>
  )

  if (showCreateItem) {
    return (
      <>
        <YStack flex={1} backgroundColor='$background'>
          {/* Header */}
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
              <Button
                size='$3'
                chromeless
                icon={<ChevronLeft size={20} />}
                onPress={() => setShowCreateItem(false)}
              />
              <Text fontSize='$6' fontWeight='bold'>
                Publicar Artículo
              </Text>
            </XStack>
          </XStack>

          <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
            <YStack padding='$4' space='$4'>
              {/* Selector de categoría */}
              <YStack space='$2'>
                <Text fontSize='$3' fontWeight='600' color='$gray12'>
                  Categoría *
                </Text>
                <Button
                  size='$4'
                  width='100%'
                  justifyContent='space-between'
                  backgroundColor={selectedCategoryData?.color}
                  borderRadius='$2'
                  onPress={() => setShowCategoryDropdown(true)}
                >
                  <XStack space='$2' alignItems='center' flex={1}>
                    <Icon size={18} color='white' />
                    <YStack flex={1} alignItems='flex-start'>
                      <Text color='white' fontWeight='600' textAlign='left'>
                        {selectedCategoryData?.title}
                      </Text>
                      <Text color='rgba(255,255,255,0.8)' fontSize='$2' textAlign='left'>
                        {selectedCategoryData?.description}
                      </Text>
                    </YStack>
                  </XStack>
                  <ChevronDown size={18} color='white' />
                </Button>
              </YStack>

            {/* Formulario */}
            <YStack space='$3'>
              {/* Título */}
              <YStack space='$2'>
                <Text fontSize='$3' fontWeight='600' color='$gray12'>
                  Título *
                </Text>
                <Card
                  elevate
                  size='$3'
                  bordered
                  padding='$3'
                  backgroundColor='$background'
                >
                  <input
                    style={{
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      fontSize: '16px',
                      width: '100%',
                      fontFamily: 'inherit',
                      color: 'white'
                    }}
                    placeholder="Nombre del artículo"
                    value={newItemTitle}
                    onChange={(e) => setNewItemTitle(e.target.value)}
                    maxLength={100}
                  />
                </Card>
              </YStack>

              {/* Precio */}
              <YStack space='$2'>
                <Text fontSize='$3' fontWeight='600' color='$gray12'>
                  Precio *
                </Text>
                <Card
                  elevate
                  size='$3'
                  bordered
                  padding='$3'
                  backgroundColor='$background'
                >
                  <XStack space='$2' alignItems='center'>
                    <Text fontSize='$4' fontWeight='bold' color='$gray11'>$</Text>
                    <input
                      style={{
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: '16px',
                        width: '100%',
                        fontFamily: 'inherit',
                        color: 'white'
                      }}
                      placeholder="0.00"
                      value={newItemPrice}
                      onChange={(e) => {
                        const value = e.target.value
                        // Solo permitir números y punto decimal
                        if (/^\d*\.?\d*$/.test(value)) {
                          setNewItemPrice(value)
                        }
                      }}
                      inputMode="decimal"
                    />
                  </XStack>
                </Card>
              </YStack>

              {/* Descripción */}
              <YStack space='$2'>
                <Text fontSize='$3' fontWeight='600' color='$gray12'>
                  Descripción *
                </Text>
                <Card
                  elevate
                  size='$3'
                  bordered
                  padding='$3'
                  backgroundColor='$background'
                >
                  <textarea
                    style={{
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      fontSize: '16px',
                      width: '100%',
                      minHeight: '120px',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      color: 'white'
                    }}
                    placeholder="Describe el artículo, condición, etc."
                    value={newItemDescription}
                    onChange={(e) => setNewItemDescription(e.target.value)}
                    maxLength={500}
                  />
                </Card>
                <Text fontSize='$2' color='$gray10' textAlign='right'>
                  {newItemDescription.length}/500
                </Text>
              </YStack>

              {/* Información de contacto */}
              <YStack space='$2'>
                <Text fontSize='$3' fontWeight='600' color='$gray12'>
                  Información de contacto (opcional)
                </Text>
                <Card
                  elevate
                  size='$3'
                  bordered
                  padding='$3'
                  backgroundColor='$background'
                >
                  <input
                    style={{
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      fontSize: '16px',
                      width: '100%',
                      fontFamily: 'inherit',
                      color: 'white'
                    }}
                    placeholder="Teléfono o correo electrónico"
                    value={newItemContact}
                    onChange={(e) => setNewItemContact(e.target.value)}
                    maxLength={100}
                  />
                </Card>
                <Text fontSize='$2' color='$gray10'>
                  Si no proporcionas contacto, se usará tu información de perfil
                </Text>
              </YStack>

              {/* Botón publicar */}
              <Button
                size='$5'
                theme='blue'
                marginTop='$4'
                disabled={!isFormValid || createItemMutation.isPending}
                onPress={handleCreateItem}
              >
                {createItemMutation.isPending ? 'Publicando...' : 'Publicar Artículo'}
              </Button>
            </YStack>
          </YStack>
        </ScrollView>
      </YStack>
      {CategoryModal}
      </>
    )
  }

  return (
    <>
      <YStack flex={1} backgroundColor='$background'>
      {/* Header */}
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
          <Button
            size='$3'
            chromeless
            icon={<ChevronLeft size={20} />}
            onPress={onBack}
          />
          <YStack flex={1}>
            <Text fontSize='$6' fontWeight='bold'>
              Marketplace
            </Text>
            {profile?.colonia?.nombre && (
              <Text fontSize='$2' color='$gray11'>
                {profile.colonia.nombre}
              </Text>
            )}
          </YStack>
        </XStack>
        <Button
          size='$3'
          theme='blue'
          icon={<Plus size={18} />}
          onPress={() => setShowCreateItem(true)}
        >
          Vender
        </Button>
      </XStack>

      {/* Categorías - Dropdown superpuesto */}
      <YStack padding='$4' paddingTop='$3' paddingBottom='$3' borderBottomWidth={1} borderBottomColor='$gray5'>
        <Text fontSize='$2' fontWeight='600' color='$gray11' marginBottom='$2'>
          Categoría
        </Text>
        
        <Button
          size='$4'
          width='100%'
          justifyContent='space-between'
          backgroundColor={selectedCategoryData?.color}
          borderRadius='$2'
          onPress={() => setShowCategoryDropdown(true)}
        >
          <XStack space='$2' alignItems='center' flex={1}>
            {selectedCategoryData && <selectedCategoryData.icon size={18} color='white' />}
            <Text color='white' fontWeight='600' flex={1} textAlign='left'>
              {selectedCategoryData?.title}
            </Text>
          </XStack>
          <ChevronDown size={18} color='white' style={{ transform: [{ rotate: showCategoryDropdown ? '180deg' : '0deg' }] }} />
        </Button>
      </YStack>

      {/* Lista de artículos */}
      <ScrollView 
        contentContainerStyle={{ flexGrow: 1, padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
        }
      >
        {isLoading ? (
          <YStack flex={1} justifyContent='center' alignItems='center' paddingVertical='$10'>
            <Spinner size='large' color='$blue10' />
            <Text fontSize='$3' color='$gray11' marginTop='$3'>
              Cargando artículos...
            </Text>
          </YStack>
        ) : !items || items.length === 0 ? (
          <YStack flex={1} justifyContent='center' alignItems='center' padding='$6' space='$4'>
            <Circle size={80} backgroundColor='$gray5' elevate>
              <ShoppingBag size={40} color='$gray10' />
            </Circle>
            <YStack space='$2' alignItems='center'>
              <Text fontSize='$6' fontWeight='bold' color='$gray12'>
                No hay artículos
              </Text>
              <Text fontSize='$4' color='$gray11' textAlign='center'>
                Sé el primero en publicar algo en esta categoría
              </Text>
            </YStack>
            <Button
              size='$3'
              theme='blue'
              icon={<Plus size={18} />}
              onPress={() => setShowCreateItem(true)}
            >
              Publicar Artículo
            </Button>
          </YStack>
        ) : (
          <YStack space='$3'>
            {items.map((item) => (
              <Card
                key={item.id}
                elevate
                size='$4'
                bordered
                padding='$4'
                pressStyle={{ scale: 0.98, opacity: 0.9 }}
                onPress={() => handleItemPress(item)}
              >
                <YStack space='$3'>
                  <XStack justifyContent='space-between' alignItems='flex-start'>
                    <YStack flex={1} space='$1'>
                      <XStack alignItems='center' space='$2'>
                        <Text fontSize='$5' fontWeight='bold' color='$color'>
                          {item.title}
                        </Text>
                        {profile?.id === item.seller_id && (
                          <Card size='$1' backgroundColor='$blue10' paddingHorizontal='$2' paddingVertical='$1'>
                            <Text fontSize='$1' color='white' fontWeight='bold'>
                              TU PUBLICACIÓN
                            </Text>
                          </Card>
                        )}
                      </XStack>
                      <Text fontSize='$6' fontWeight='800' color='$blue10'>
                        {formatPrice(item.price)}
                      </Text>
                    </YStack>
                  </XStack>

                  <Text fontSize='$3' color='$gray11' numberOfLines={2}>
                    {item.description}
                  </Text>

                  <XStack justifyContent='space-between' alignItems='center' marginTop='$2'>
                    <YStack space='$0.5'>
                      <Text fontSize='$2' fontWeight='600' color='$gray12'>
                        {item.seller_name}
                      </Text>
                      {item.seller_unit && (
                        <Text fontSize='$2' color='$gray10'>
                          Unidad {item.seller_unit}
                        </Text>
                      )}
                    </YStack>
                    <Text fontSize='$2' color='$gray10'>
                      {formatDate(item.created_at)}
                    </Text>
                  </XStack>
                </YStack>
              </Card>
            ))}
          </YStack>
        )}
      </ScrollView>

      {/* Modal para ver detalles del artículo */}
      <Modal
        visible={showItemDetail}
        animationType="fade"
        transparent
        onRequestClose={() => setShowItemDetail(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
          activeOpacity={1}
          onPress={() => setShowItemDetail(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{ width: '100%', maxWidth: 500, maxHeight: '85%' }}
            onPress={(e) => e.stopPropagation()}
          >
            <Card
              elevate
              padding='$5'
              backgroundColor='$background'
              borderRadius='$4'
              borderWidth={1}
              borderColor='$gray5'
              maxHeight='100%'
            >
              <ScrollView showsVerticalScrollIndicator={false}>
                <YStack space='$4'>
                  {/* Header */}
                  <XStack justifyContent='space-between' alignItems='flex-start'>
                    <YStack flex={1} space='$1'>
                      {!isEditingItem ? (
                        <>
                          <XStack alignItems='center' space='$2'>
                            <Text fontSize='$6' fontWeight='bold' color='$color'>
                              {selectedItem?.title}
                            </Text>
                            {profile?.id === selectedItem?.seller_id && (
                              <Card size='$1' backgroundColor='$blue10' paddingHorizontal='$2' paddingVertical='$1'>
                                <Text fontSize='$1' color='white' fontWeight='bold'>
                                  TU PUBLICACIÓN
                                </Text>
                              </Card>
                            )}
                          </XStack>
                          <Text fontSize='$8' fontWeight='900' color='$blue10'>
                            {selectedItem && formatPrice(selectedItem.price)}
                          </Text>
                        </>
                      ) : (
                        <Text fontSize='$6' fontWeight='bold' color='$color'>
                          Editar Artículo
                        </Text>
                      )}
                    </YStack>
                    <Button
                      size='$3'
                      chromeless
                      icon={<ChevronLeft size={20} />}
                      onPress={() => {
                        setShowItemDetail(false)
                        setIsEditingItem(false)
                      }}
                      style={{ transform: [{ rotate: '180deg' }] }}
                    />
                  </XStack>

                  {isEditingItem ? (
                    /* Formulario de edición */
                    <YStack space='$3'>
                      {/* Categoría */}
                      <YStack space='$2'>
                        <Text fontSize='$3' fontWeight='600' color='$gray12'>
                          Categoría *
                        </Text>
                        <Button
                          size='$4'
                          width='100%'
                          justifyContent='space-between'
                          backgroundColor={categories.find(c => c.id === editItemCategory)?.color}
                          borderRadius='$2'
                          onPress={() => setShowCategoryDropdown(true)}
                        >
                          <XStack space='$2' alignItems='center' flex={1}>
                            {(() => {
                              const cat = categories.find(c => c.id === editItemCategory)
                              const Icon = cat?.icon || Package
                              return <Icon size={18} color='white' />
                            })()}
                            <Text color='white' fontWeight='600' flex={1} textAlign='left'>
                              {categories.find(c => c.id === editItemCategory)?.title}
                            </Text>
                          </XStack>
                          <ChevronDown size={18} color='white' />
                        </Button>
                      </YStack>

                      {/* Título */}
                      <YStack space='$2'>
                        <Text fontSize='$3' fontWeight='600' color='$gray12'>
                          Título *
                        </Text>
                        <Card elevate size='$3' bordered padding='$3' backgroundColor='$background'>
                          <input
                            style={{
                              border: 'none',
                              outline: 'none',
                              background: 'transparent',
                              fontSize: '16px',
                              width: '100%',
                              fontFamily: 'inherit',
                              color: 'white'
                            }}
                            placeholder="Nombre del artículo"
                            value={editItemTitle}
                            onChange={(e) => setEditItemTitle(e.target.value)}
                            maxLength={100}
                          />
                        </Card>
                      </YStack>

                      {/* Precio */}
                      <YStack space='$2'>
                        <Text fontSize='$3' fontWeight='600' color='$gray12'>
                          Precio *
                        </Text>
                        <Card elevate size='$3' bordered padding='$3' backgroundColor='$background'>
                          <XStack space='$2' alignItems='center'>
                            <Text fontSize='$4' fontWeight='bold' color='$gray11'>$</Text>
                            <input
                              style={{
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                fontSize: '16px',
                                width: '100%',
                                fontFamily: 'inherit',
                                color: 'white'
                              }}
                              placeholder="0.00"
                              value={editItemPrice}
                              onChange={(e) => {
                                const value = e.target.value
                                if (/^\d*\.?\d*$/.test(value)) {
                                  setEditItemPrice(value)
                                }
                              }}
                              inputMode="decimal"
                            />
                          </XStack>
                        </Card>
                      </YStack>

                      {/* Descripción */}
                      <YStack space='$2'>
                        <Text fontSize='$3' fontWeight='600' color='$gray12'>
                          Descripción *
                        </Text>
                        <Card elevate size='$3' bordered padding='$3' backgroundColor='$background'>
                          <textarea
                            style={{
                              border: 'none',
                              outline: 'none',
                              background: 'transparent',
                              fontSize: '16px',
                              width: '100%',
                              minHeight: '120px',
                              resize: 'vertical',
                              fontFamily: 'inherit',
                              color: 'white'
                            }}
                            placeholder="Describe el artículo, condición, etc."
                            value={editItemDescription}
                            onChange={(e) => setEditItemDescription(e.target.value)}
                            maxLength={500}
                          />
                        </Card>
                      </YStack>

                      {/* Contacto */}
                      <YStack space='$2'>
                        <Text fontSize='$3' fontWeight='600' color='$gray12'>
                          Información de contacto (opcional)
                        </Text>
                        <Card elevate size='$3' bordered padding='$3' backgroundColor='$background'>
                          <input
                            style={{
                              border: 'none',
                              outline: 'none',
                              background: 'transparent',
                              fontSize: '16px',
                              width: '100%',
                              fontFamily: 'inherit',
                              color: 'white'
                            }}
                            placeholder="Teléfono o correo electrónico"
                            value={editItemContact}
                            onChange={(e) => setEditItemContact(e.target.value)}
                            maxLength={100}
                          />
                        </Card>
                      </YStack>

                      {/* Botones */}
                      <XStack space='$2' marginTop='$2'>
                        <Button
                          flex={1}
                          size='$4'
                          onPress={() => setIsEditingItem(false)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          flex={1}
                          size='$4'
                          theme='blue'
                          disabled={!isEditFormValid || updateItemMutation.isPending}
                          onPress={handleSaveEdit}
                        >
                          {updateItemMutation.isPending ? 'Guardando...' : 'Guardar'}
                        </Button>
                      </XStack>
                    </YStack>
                  ) : (
                    <>
                      {/* Descripción */}
                      <YStack space='$2'>
                        <Text fontSize='$4' fontWeight='600' color='$gray12'>
                          Descripción
                        </Text>
                        <Text fontSize='$3' color='$gray11' lineHeight='$3'>
                          {selectedItem?.description}
                        </Text>
                      </YStack>

                      {/* Información del vendedor */}
                      <Card bordered padding='$3' backgroundColor='$gray2'>
                        <YStack space='$2'>
                          <Text fontSize='$4' fontWeight='600' color='$gray12'>
                            Vendedor
                          </Text>
                          <XStack space='$2' alignItems='center'>
                            <Circle size={40} backgroundColor='$blue10'>
                              <Text fontSize='$4' color='white' fontWeight='bold'>
                                {selectedItem?.seller_name.charAt(0).toUpperCase()}
                              </Text>
                            </Circle>
                            <YStack flex={1}>
                              <Text fontSize='$4' fontWeight='600' color='$gray12'>
                                {selectedItem?.seller_name}
                              </Text>
                              {selectedItem?.seller_unit && (
                                <Text fontSize='$3' color='$gray10'>
                                  Unidad {selectedItem.seller_unit}
                                </Text>
                              )}
                            </YStack>
                          </XStack>
                          {selectedItem?.contact_info && (
                            <YStack marginTop='$2' space='$1'>
                              <Text fontSize='$3' fontWeight='600' color='$gray12'>
                                Contacto
                              </Text>
                              <Text fontSize='$3' color='$blue10'>
                                {selectedItem.contact_info}
                              </Text>
                            </YStack>
                          )}
                        </YStack>
                      </Card>

                      {/* Fecha de publicación */}
                      <Text fontSize='$2' color='$gray10' textAlign='center'>
                        Publicado {selectedItem && formatDate(selectedItem.created_at)}
                      </Text>

                      {/* Botones según si es tu publicación o no */}
                      {profile?.id === selectedItem?.seller_id ? (
                        <XStack space='$2'>
                          <Button
                            flex={1}
                            size='$5'
                            icon={<Edit3 size={18} />}
                            onPress={handleEditItem}
                          >
                            Editar
                          </Button>
                          <Button
                            flex={1}
                            size='$5'
                            theme='red'
                            icon={<Trash2 size={18} />}
                            onPress={handleDeleteItem}
                            disabled={deleteItemMutation.isPending}
                          >
                            {deleteItemMutation.isPending ? 'Eliminando...' : 'Eliminar'}
                          </Button>
                        </XStack>
                      ) : (
                        <Button
                          size='$5'
                          theme='blue'
                          onPress={() => {
                            if (selectedItem?.contact_info) {
                              Alert.alert(
                                'Contactar Vendedor',
                                `Contacto: ${selectedItem.contact_info}`,
                                [{ text: 'OK' }]
                              )
                            } else {
                              Alert.alert(
                                'Contactar Vendedor',
                                'Puedes contactar al vendedor directamente en la privada',
                                [{ text: 'OK' }]
                              )
                            }
                          }}
                        >
                          Contactar Vendedor
                        </Button>
                      )}
                    </>
                  )}
                </YStack>
              </ScrollView>
            </Card>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      </YStack>
      {CategoryModal}
    </>
  )
}
