import React, { useState } from 'react'
import { ScrollView, Alert, RefreshControl, Platform, TouchableOpacity, Modal, Linking } from 'react-native'
import { YStack, XStack, Text, Button, Card, Input, TextArea, Spinner, Circle, Sheet } from 'tamagui'
import { ChevronLeft, Plus, MessageCircle, Calendar as CalendarIcon, FileText, Send, ChevronDown, Clock } from '@tamagui/lucide-icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import DateTimePicker from '@react-native-community/datetimepicker'

interface CommunityForumScreenProps {
  apiUrl: string
  authToken: string
  onBack: () => void
}

interface ForumPost {
  id: number
  title: string
  content: string
  author_name: string
  author_unit?: string
  created_at: string
  category: 'events' | 'messages' | 'statements'
  replies_count?: number
  event_date?: string
  event_time?: string
  event_duration?: string
  file_url?: string
  file_month?: string
}

interface CreatePostData {
  title: string
  content: string
  category: 'events' | 'messages' | 'statements'
  event_date?: string
  event_time?: string
  event_duration?: string
  file_url?: string
  file_month?: string
}

const fetchPosts = async (
  apiUrl: string,
  authToken: string,
  category: string
): Promise<ForumPost[]> => {
  const response = await fetch(`${apiUrl}/forum/posts?category=${category}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error('Failed to fetch posts')
  }

  return response.json()
}

const createPost = async (
  apiUrl: string,
  authToken: string,
  data: CreatePostData
): Promise<ForumPost> => {
  const response = await fetch(`${apiUrl}/forum/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to create post')
  }

  return response.json()
}

export const CommunityForumScreen: React.FC<CommunityForumScreenProps> = ({
  apiUrl,
  authToken,
  onBack
}) => {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [selectedCategory, setSelectedCategory] = useState<'events' | 'messages' | 'statements'>('events')
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [showCreatePost, setShowCreatePost] = useState(false)
  const [newPostTitle, setNewPostTitle] = useState('')
  const [newPostContent, setNewPostContent] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [eventDuration, setEventDuration] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [showDurationPicker, setShowDurationPicker] = useState(false)
  const [datePickerValue, setDatePickerValue] = useState(new Date())
  const [timePickerValue, setTimePickerValue] = useState(new Date())
  const [selectedMonth, setSelectedMonth] = useState('')
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [selectedPdfUrl, setSelectedPdfUrl] = useState<string | null>(null)
  const [showPdfViewer, setShowPdfViewer] = useState(false)
  
  const isAdmin = profile?.role === 'admin'

  const { data: posts, isLoading, refetch } = useQuery({
    queryKey: ['forumPosts', selectedCategory],
    queryFn: () => fetchPosts(apiUrl, authToken, selectedCategory),
    refetchInterval: 30000
  })

  const createPostMutation = useMutation({
    mutationFn: (data: CreatePostData) => createPost(apiUrl, authToken, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forumPosts'] })
      setShowCreatePost(false)
      setNewPostTitle('')
      setNewPostContent('')
      setEventDate('')
      setEventTime('')
      setEventDuration('')
      setSelectedMonth('')
      Alert.alert('Éxito', 'Publicación creada correctamente')
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message)
    }
  })

  const categories = [
    {
      id: 'events' as const,
      title: 'Eventos',
      icon: CalendarIcon,
      color: '$blue10',
      description: 'Eventos de la colonia'
    },
    {
      id: 'messages' as const,
      title: 'Mensajes',
      icon: MessageCircle,
      color: '$green10',
      description: 'Avisos y mensajes generales'
    },
    {
      id: 'statements' as const,
      title: 'Estados de Cuenta',
      icon: FileText,
      color: '$orange10',
      description: 'Estados de cuenta mensuales (Solo admin)'
    }
  ]

  const selectedCategoryData = categories.find(c => c.id === selectedCategory)
  const isFormValid = !!newPostTitle.trim() && !!newPostContent.trim()

  // Agrupar estados de cuenta por mes
  const groupStatementsByMonth = () => {
    if (selectedCategory !== 'statements' || !posts) return {}
    
    const grouped: { [key: string]: ForumPost[] } = {}
    posts.forEach(post => {
      const month = post.file_month || 'Sin mes'
      if (!grouped[month]) {
        grouped[month] = []
      }
      grouped[month].push(post)
    })
    return grouped
  }

  const statementsByMonth = selectedCategory === 'statements' ? groupStatementsByMonth() : {}
  const months = Object.keys(statementsByMonth).sort().reverse()

  const monthNames: { [key: string]: string } = {
    '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
    '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
    '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
  }

  const formatMonthDisplay = (monthStr: string) => {
    // Formato esperado: YYYY-MM
    const [year, month] = monthStr.split('-')
    return `${monthNames[month] || month} ${year}`
  }

  const openPdf = (url: string) => {
    setSelectedPdfUrl(url)
    setShowPdfViewer(true)
  }

  const durationOptions = [
    { label: '15 minutos', value: '15 minutos' },
    { label: '30 minutos', value: '30 minutos' },
    { label: '45 minutos', value: '45 minutos' },
    { label: '1 hora', value: '1 hora' },
    { label: '1.5 horas', value: '1.5 horas' },
    { label: '2 horas', value: '2 horas' },
    { label: '2.5 horas', value: '2.5 horas' },
    { label: '3 horas', value: '3 horas' },
    { label: '4 horas', value: '4 horas' },
    { label: '5 horas', value: '5 horas' },
    { label: '6 horas', value: '6 horas' },
    { label: 'Todo el día', value: 'Todo el día' }
  ]

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false)
    }
    if (selectedDate) {
      setDatePickerValue(selectedDate)
      const formatted = selectedDate.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
      setEventDate(formatted)
    }
  }

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false)
    }
    if (selectedTime) {
      setTimePickerValue(selectedTime)
      const formatted = selectedTime.toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
      setEventTime(formatted)
    }
  }

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

  const handleCreatePost = () => {
    if (!newPostTitle.trim() || !newPostContent.trim()) {
      Alert.alert('Error', 'Por favor completa todos los campos')
      return
    }

    // Validaciones específicas para estados de cuenta
    if (selectedCategory === 'statements') {
      if (!selectedMonth) {
        Alert.alert('Error', 'Por favor selecciona el mes del estado de cuenta')
        return
      }
      if (!newPostContent.trim().startsWith('http')) {
        Alert.alert('Error', 'Por favor ingresa una URL válida para el PDF')
        return
      }
    }

    const postData: CreatePostData = {
      title: newPostTitle,
      content: newPostContent,
      category: selectedCategory
    }

    // Agregar campos de evento si existen
    if (selectedCategory === 'events') {
      if (eventDate) postData.event_date = eventDate
      if (eventTime) postData.event_time = eventTime
      if (eventDuration) postData.event_duration = eventDuration
    }

    // Agregar campos de estado de cuenta si existen
    if (selectedCategory === 'statements') {
      postData.file_url = newPostContent
      postData.file_month = selectedMonth
    }

    createPostMutation.mutate(postData)
  }

  if (showCreatePost) {
    const Icon = selectedCategoryData?.icon || MessageCircle
    
    return (
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
              onPress={() => setShowCreatePost(false)}
            />
            <Text fontSize='$6' fontWeight='bold'>
              Nueva Publicación
            </Text>
          </XStack>
        </XStack>

        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <YStack padding='$4' space='$4'>
            {/* Categoría seleccionada */}
            <Card elevate size='$3' bordered padding='$3' backgroundColor={selectedCategoryData?.color}>
              <XStack space='$2' alignItems='center'>
                <Circle size={40} backgroundColor='white' elevate>
                  <Icon size={20} color={selectedCategoryData?.color} />
                </Circle>
                <YStack flex={1}>
                  <Text fontSize='$4' fontWeight='bold' color='white'>
                    {selectedCategoryData?.title}
                  </Text>
                  <Text fontSize='$2' color='white' opacity={0.9}>
                    {selectedCategoryData?.description}
                  </Text>
                </YStack>
              </XStack>
            </Card>

            {/* Formulario */}
            <YStack space='$3'>
              <YStack space='$2'>
                <Text fontSize='$3' fontWeight='600'>
                  Título
                </Text>
                <Input
                  size='$4'
                  placeholder='Título de tu publicación'
                  value={newPostTitle}
                  onChangeText={setNewPostTitle}
                  maxLength={100}
                />
              </YStack>

              {/* Campos específicos para estados de cuenta */}
              {selectedCategory === 'statements' && (
                <>
                  <YStack space='$2'>
                    <Text fontSize='$3' fontWeight='600'>
                      Mes del Estado de Cuenta *
                    </Text>
                    <Button
                      size='$4'
                      backgroundColor='$background'
                      borderWidth={1}
                      borderColor='$gray7'
                      color='$color'
                      justifyContent='space-between'
                      icon={<CalendarIcon size={18} color='$gray11' />}
                      onPress={() => setShowMonthPicker(true)}
                    >
                      <Text color={selectedMonth ? '$color' : '$gray11'}>
                        {selectedMonth ? formatMonthDisplay(selectedMonth) : 'Seleccionar mes'}
                      </Text>
                      <ChevronDown size={16} color='$gray11' />
                    </Button>
                  </YStack>

                  {/* Month Picker Sheet */}
                  <Sheet
                    modal
                    open={showMonthPicker}
                    onOpenChange={setShowMonthPicker}
                    snapPoints={[60]}
                    dismissOnSnapToBottom
                  >
                    <Sheet.Overlay />
                    <Sheet.Frame padding='$4' backgroundColor='$background'>
                      <Sheet.Handle />
                      <YStack space='$3' paddingTop='$3'>
                        <Text fontSize='$5' fontWeight='bold' textAlign='center'>
                          Seleccionar Mes
                        </Text>
                        <ScrollView style={{ maxHeight: 400 }}>
                          <YStack space='$2'>
                            {(() => {
                              const currentYear = new Date().getFullYear()
                              const months = []
                              // Generar los últimos 12 meses
                              for (let i = 0; i < 12; i++) {
                                const date = new Date()
                                date.setMonth(date.getMonth() - i)
                                const year = date.getFullYear()
                                const month = String(date.getMonth() + 1).padStart(2, '0')
                                const value = `${year}-${month}`
                                months.push(value)
                              }
                              return months.map((monthValue) => (
                                <Button
                                  key={monthValue}
                                  size='$4'
                                  backgroundColor={selectedMonth === monthValue ? '$orange4' : '$background'}
                                  borderWidth={1}
                                  borderColor={selectedMonth === monthValue ? '$orange10' : '$gray7'}
                                  onPress={() => {
                                    setSelectedMonth(monthValue)
                                    setShowMonthPicker(false)
                                  }}
                                >
                                  <Text
                                    color={selectedMonth === monthValue ? '$orange10' : '$color'}
                                    fontWeight={selectedMonth === monthValue ? 'bold' : 'normal'}
                                  >
                                    {formatMonthDisplay(monthValue)}
                                  </Text>
                                </Button>
                              ))
                            })()}
                          </YStack>
                        </ScrollView>
                      </YStack>
                    </Sheet.Frame>
                  </Sheet>

                  <YStack space='$2'>
                    <Text fontSize='$3' fontWeight='600'>
                      URL del PDF *
                    </Text>
                    <Input
                      size='$4'
                      placeholder='https://ejemplo.com/estado-cuenta.pdf'
                      value={newPostContent}
                      onChangeText={setNewPostContent}
                    />
                    <Text fontSize='$2' color='$gray10'>
                      Ingresa la URL del archivo PDF del estado de cuenta
                    </Text>
                  </YStack>
                </>
              )}

              {/* Campos específicos para eventos */}
              {selectedCategory === 'events' && (
                <>
                  <YStack space='$2'>
                    <Text fontSize='$3' fontWeight='600'>
                      Fecha del Evento
                    </Text>
                    <Button
                      size='$4'
                      backgroundColor='$background'
                      borderWidth={1}
                      borderColor='$gray7'
                      color='$color'
                      justifyContent='flex-start'
                      icon={<CalendarIcon size={18} color='$gray11' />}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <Text color={eventDate ? '$color' : '$gray11'}>
                        {eventDate || 'Seleccionar fecha'}
                      </Text>
                    </Button>
                    {showDatePicker && (
                      <DateTimePicker
                        value={datePickerValue}
                        mode='date'
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={handleDateChange}
                        minimumDate={new Date()}
                      />
                    )}
                    {Platform.OS === 'ios' && showDatePicker && (
                      <Button
                        size='$3'
                        theme='blue'
                        marginTop='$2'
                        onPress={() => setShowDatePicker(false)}
                      >
                        Confirmar
                      </Button>
                    )}
                    {!eventDate && (
                      <Text fontSize='$2' color='$gray10'>
                        Opcional
                      </Text>
                    )}
                  </YStack>

                  <XStack space='$3'>
                    <YStack flex={1} space='$2'>
                      <Text fontSize='$3' fontWeight='600'>
                        Hora
                      </Text>
                      <Button
                        size='$4'
                        backgroundColor='$background'
                        borderWidth={1}
                        borderColor='$gray7'
                        color='$color'
                        justifyContent='flex-start'
                        icon={<Clock size={18} color='$gray11' />}
                        onPress={() => setShowTimePicker(true)}
                      >
                        <Text color={eventTime ? '$color' : '$gray11'}>
                          {eventTime || 'HH:MM'}
                        </Text>
                      </Button>
                      {showTimePicker && (
                        <DateTimePicker
                          value={timePickerValue}
                          mode='time'
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          onChange={handleTimeChange}
                          is24Hour={true}
                        />
                      )}
                      {Platform.OS === 'ios' && showTimePicker && (
                        <Button
                          size='$2'
                          theme='blue'
                          marginTop='$2'
                          onPress={() => setShowTimePicker(false)}
                        >
                          OK
                        </Button>
                      )}
                      {!eventTime && (
                        <Text fontSize='$2' color='$gray10'>
                          Opcional
                        </Text>
                      )}
                    </YStack>

                    <YStack flex={1} space='$2'>
                      <Text fontSize='$3' fontWeight='600'>
                        Duración
                      </Text>
                      <Button
                        size='$4'
                        backgroundColor='$background'
                        borderWidth={1}
                        borderColor='$gray7'
                        color='$color'
                        justifyContent='space-between'
                        onPress={() => setShowDurationPicker(true)}
                      >
                        <Text color={eventDuration ? '$color' : '$gray11'}>
                          {eventDuration || 'Seleccionar'}
                        </Text>
                        <ChevronDown size={16} color='$gray11' />
                      </Button>
                      {!eventDuration && (
                        <Text fontSize='$2' color='$gray10'>
                          Opcional
                        </Text>
                      )}
                    </YStack>
                  </XStack>

                  {/* Duration Picker Modal */}
                  <Sheet
                    modal
                    open={showDurationPicker}
                    onOpenChange={setShowDurationPicker}
                    snapPoints={[50]}
                    dismissOnSnapToBottom
                  >
                    <Sheet.Overlay />
                    <Sheet.Frame padding='$4' backgroundColor='$background'>
                      <Sheet.Handle />
                      <YStack space='$3' paddingTop='$3'>
                        <Text fontSize='$5' fontWeight='bold' textAlign='center'>
                          Seleccionar Duración
                        </Text>
                        <ScrollView style={{ maxHeight: 300 }}>
                          <YStack space='$2'>
                            {durationOptions.map((option) => (
                              <Button
                                key={option.value}
                                size='$4'
                                backgroundColor={eventDuration === option.value ? '$blue4' : '$background'}
                                borderWidth={1}
                                borderColor={eventDuration === option.value ? '$blue10' : '$gray7'}
                                onPress={() => {
                                  setEventDuration(option.value)
                                  setShowDurationPicker(false)
                                }}
                              >
                                <Text
                                  color={eventDuration === option.value ? '$blue10' : '$color'}
                                  fontWeight={eventDuration === option.value ? 'bold' : 'normal'}
                                >
                                  {option.label}
                                </Text>
                              </Button>
                            ))}
                          </YStack>
                        </ScrollView>
                      </YStack>
                    </Sheet.Frame>
                  </Sheet>
                </>
              )}

              {selectedCategory !== 'statements' && (
                <YStack space='$2'>
                  <Text fontSize='$3' fontWeight='600'>
                    Contenido
                  </Text>
                  <TextArea
                    size='$4'
                    placeholder='Escribe el contenido de tu publicación...'
                    value={newPostContent}
                    onChangeText={setNewPostContent}
                    minHeight={200}
                    maxLength={1000}
                    numberOfLines={8}
                  />
                  <Text fontSize='$2' color='$gray11' textAlign='right'>
                    {newPostContent.length}/1000
                  </Text>
                </YStack>
              )}

              <Button
                size='$4'
                theme='blue'
                onPress={handleCreatePost}
                disabled={createPostMutation.isPending || !isFormValid}
                icon={createPostMutation.isPending ? <Spinner size='small' /> : <Send size={20} />}
              >
                {createPostMutation.isPending ? 'Publicando...' : 'Publicar'}
              </Button>
              {!isFormValid && (
                <Text fontSize='$2' color='$red10' textAlign='center'>
                  Completa los campos obligatorios para publicar
                </Text>
              )}
            </YStack>
          </YStack>
        </ScrollView>
      </YStack>
    )
  }

  return (
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
              Comunidad
            </Text>
            {profile?.colonia?.nombre && (
              <Text fontSize='$2' color='$gray11'>
                {profile.colonia.nombre}
              </Text>
            )}
          </YStack>
        </XStack>
        {(selectedCategory !== 'statements' || isAdmin) && (
          <Button
            size='$3'
            theme='blue'
            icon={<Plus size={18} />}
            onPress={() => setShowCreatePost(true)}
          >
            Nueva
          </Button>
        )}
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

        {/* Modal para el menú de categorías */}
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
              {categories.map((category, index) => {
                const Icon = category.icon
                const isSelected = selectedCategory === category.id
                
                return (
                  <TouchableOpacity
                    key={category.id}
                    onPress={() => {
                      setSelectedCategory(category.id)
                      setShowCategoryDropdown(false)
                    }}
                    style={{
                      padding: 12,
                      backgroundColor: isSelected ? category.color : 'transparent',
                      borderBottomWidth: index < categories.length - 1 ? 1 : 0,
                      borderBottomColor: '#e0e0e0'
                    }}
                  >
                    <XStack space='$3' alignItems='center'>
                      <Icon size={20} color={category.color} />
                      <YStack flex={1}>
                        <Text fontWeight='600' fontSize='$3' color={isSelected ? '$gray12' : '$color'}>
                          {category.title}
                        </Text>
                        <Text fontSize='$2' color={isSelected ? '$color' : '$gray11'}>
                          {category.description}
                        </Text>
                      </YStack>
                    </XStack>
                  </TouchableOpacity>
                )
              })}
            </YStack>
          </TouchableOpacity>
        </Modal>
      </YStack>

      {/* Lista de publicaciones */}
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
              Cargando publicaciones...
            </Text>
          </YStack>
        ) : !posts || posts.length === 0 ? (
          <YStack flex={1} justifyContent='center' alignItems='center' padding='$6' space='$4'>
            <Circle size={80} backgroundColor='$gray5' elevate>
              {selectedCategoryData && (
                <selectedCategoryData.icon size={40} color='$gray10' />
              )}
            </Circle>
            <YStack space='$2' alignItems='center'>
              <Text fontSize='$5' fontWeight='bold' color='$gray12'>
                Sin Publicaciones
              </Text>
              <Text fontSize='$3' color='$gray11' textAlign='center'>
                No hay publicaciones en esta categoría.
              </Text>
              <Text fontSize='$3' color='$gray11' textAlign='center'>
                ¡Sé el primero en publicar!
              </Text>
            </YStack>
            {(selectedCategory !== 'statements' || isAdmin) && (
              <Button
                size='$3'
                theme='blue'
                icon={<Plus size={18} />}
                onPress={() => setShowCreatePost(true)}
              >
                Crear Publicación
              </Button>
            )}
          </YStack>
        ) : selectedCategory === 'statements' ? (
          // Vista especial para estados de cuenta
          <YStack space='$3'>
            {months.length === 0 ? (
              <YStack flex={1} justifyContent='center' alignItems='center' padding='$6' space='$4'>
                <Circle size={80} backgroundColor='$gray5' elevate>
                  <FileText size={40} color='$gray10' />
                </Circle>
                <YStack space='$2' alignItems='center'>
                  <Text fontSize='$5' fontWeight='bold' color='$gray12'>
                    Sin Estados de Cuenta
                  </Text>
                  <Text fontSize='$3' color='$gray11' textAlign='center'>
                    No hay estados de cuenta disponibles.
                  </Text>
                  {isAdmin && (
                    <Text fontSize='$3' color='$gray11' textAlign='center'>
                      ¡Sube el primer estado de cuenta!
                    </Text>
                  )}
                </YStack>
              </YStack>
            ) : (
              months.map((month) => {
                const monthPosts = statementsByMonth[month]
                const post = monthPosts[0] // Tomar el primer post del mes
                
                return (
                  <Card
                    key={month}
                    elevate
                    size='$3'
                    bordered
                    padding='$3'
                    pressStyle={{ scale: 0.98, opacity: 0.9 }}
                    backgroundColor='$orange2'
                    borderColor='$orange7'
                    onPress={() => {
                      if (post.file_url) {
                        openPdf(post.file_url)
                      } else {
                        Alert.alert('Error', 'No hay archivo disponible para este mes')
                      }
                    }}
                  >
                    <XStack space='$3' alignItems='center'>
                      <Circle size={50} backgroundColor='$orange10' elevate>
                        <FileText size={24} color='white' />
                      </Circle>
                      <YStack flex={1} space='$1'>
                        <Text fontSize='$5' fontWeight='bold' color='$orange11'>
                          {formatMonthDisplay(month)}
                        </Text>
                        <Text fontSize='$3' color='$gray11'>
                          Estado de cuenta mensual
                        </Text>
                        <Text fontSize='$2' color='$gray10'>
                          Toca para ver el PDF
                        </Text>
                      </YStack>
                      <ChevronDown size={20} color='$orange10' style={{ transform: [{ rotate: '-90deg' }] }} />
                    </XStack>
                  </Card>
                )
              })
            )}
          </YStack>
        ) : (
          <YStack space='$3'>
            {posts.map((post) => (
              <Card
                key={post.id}
                elevate
                size='$3'
                bordered
                padding='$3'
                pressStyle={{ scale: 0.98, opacity: 0.9 }}
                onPress={() => {
                  Alert.alert(
                    post.title,
                    post.content,
                    [{ text: 'Cerrar' }]
                  )
                }}
              >
                <YStack space='$2'>
                  {/* Header del post */}
                  <XStack justifyContent='space-between' alignItems='flex-start'>
                    <YStack flex={1} space='$1'>
                      <Text fontSize='$4' fontWeight='bold'>
                        {post.title}
                      </Text>
                      <XStack space='$2' alignItems='center'>
                        <Text fontSize='$2' color='$gray11'>
                          {post.author_name}
                        </Text>
                        {post.author_unit && (
                          <>
                            <Text fontSize='$2' color='$gray9'>
                              •
                            </Text>
                            <Text fontSize='$2' color='$gray11'>
                              {post.author_unit}
                            </Text>
                          </>
                        )}
                      </XStack>
                    </YStack>
                    <Text fontSize='$2' color='$gray10'>
                      {formatDate(post.created_at)}
                    </Text>
                  </XStack>

                  {/* Información del evento (solo para eventos) */}
                  {post.category === 'events' && (post.event_date || post.event_time || post.event_duration) && (
                    <Card backgroundColor='$blue2' padding='$2' borderRadius='$2'>
                      <XStack space='$3' flexWrap='wrap'>
                        {post.event_date && (
                          <XStack space='$1.5' alignItems='center'>
                            <CalendarIcon size={14} color='$blue10' />
                            <Text fontSize='$2' color='$blue11' fontWeight='600'>
                              {post.event_date}
                            </Text>
                          </XStack>
                        )}
                        {post.event_time && (
                          <XStack space='$1.5' alignItems='center'>
                            <Clock size={14} color='$blue10' />
                            <Text fontSize='$2' color='$blue11' fontWeight='600'>
                              {post.event_time}
                            </Text>
                          </XStack>
                        )}
                        {post.event_duration && (
                          <XStack space='$1.5' alignItems='center'>
                            <Text fontSize='$2' color='$blue11'>
                              ⏱
                            </Text>
                            <Text fontSize='$2' color='$blue11' fontWeight='600'>
                              {post.event_duration}
                            </Text>
                          </XStack>
                        )}
                      </XStack>
                    </Card>
                  )}

                  {/* Contenido del post */}
                  <Text fontSize='$3' color='$gray12' numberOfLines={3}>
                    {post.content}
                  </Text>

                  {/* Footer del post */}
                  {post.replies_count !== undefined && post.replies_count > 0 && (
                    <XStack space='$2' alignItems='center' marginTop='$1'>
                      <MessageCircle size={14} color='$gray10' />
                      <Text fontSize='$2' color='$gray11'>
                        {post.replies_count} {post.replies_count === 1 ? 'respuesta' : 'respuestas'}
                      </Text>
                    </XStack>
                  )}
                </YStack>
              </Card>
            ))}
          </YStack>
        )}
      </ScrollView>

      {/* Modal para visualizar PDF */}
      <Modal
        visible={showPdfViewer}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowPdfViewer(false)}
      >
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
            <Button
              size='$3'
              chromeless
              icon={<ChevronLeft size={20} />}
              onPress={() => setShowPdfViewer(false)}
            >
              Cerrar
            </Button>
            <Text fontSize='$5' fontWeight='bold'>
              Estado de Cuenta
            </Text>
            <Button
              size='$3'
              theme='blue'
              onPress={() => {
                if (selectedPdfUrl) {
                  Linking.openURL(selectedPdfUrl).catch(err => {
                    Alert.alert('Error', 'No se pudo abrir el archivo')
                  })
                }
              }}
            >
              Abrir
            </Button>
          </XStack>
          <YStack flex={1} justifyContent='center' alignItems='center' padding='$4'>
            <Circle size={80} backgroundColor='$orange5' elevate marginBottom='$4'>
              <FileText size={40} color='$orange10' />
            </Circle>
            <Text fontSize='$5' fontWeight='bold' marginBottom='$2'>
              Documento PDF
            </Text>
            <Text fontSize='$3' color='$gray11' textAlign='center' marginBottom='$4'>
              Presiona "Abrir" para ver el estado de cuenta en tu navegador o aplicación de PDF.
            </Text>
            {selectedPdfUrl && (
              <Text fontSize='$2' color='$gray10' textAlign='center' numberOfLines={2}>
                {selectedPdfUrl}
              </Text>
            )}
          </YStack>
        </YStack>
      </Modal>
    </YStack>
  )
}
