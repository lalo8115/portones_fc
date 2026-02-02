import React, { useState } from 'react'
import { ScrollView, Alert, RefreshControl } from 'react-native'
import { YStack, XStack, Text, Button, Card, Input, TextArea, Spinner, Circle } from 'tamagui'
import { ChevronLeft, Plus, MessageCircle, Calendar, AlertCircle, Send, ChevronDown } from '@tamagui/lucide-icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'

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
  category: 'events' | 'messages' | 'requests'
  replies_count?: number
}

interface CreatePostData {
  title: string
  content: string
  category: 'events' | 'messages' | 'requests'
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
  const [selectedCategory, setSelectedCategory] = useState<'events' | 'messages' | 'requests'>('events')
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [showCreatePost, setShowCreatePost] = useState(false)
  const [newPostTitle, setNewPostTitle] = useState('')
  const [newPostContent, setNewPostContent] = useState('')

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
      icon: Calendar,
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
      id: 'requests' as const,
      title: 'Peticiones',
      icon: AlertCircle,
      color: '$orange10',
      description: 'Solicitudes de la comunidad'
    }
  ]

  const selectedCategoryData = categories.find(c => c.id === selectedCategory)

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

    createPostMutation.mutate({
      title: newPostTitle,
      content: newPostContent,
      category: selectedCategory
    })
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

              <Button
                size='$4'
                theme='blue'
                onPress={handleCreatePost}
                disabled={createPostMutation.isPending}
                icon={createPostMutation.isPending ? <Spinner size='small' /> : <Send size={20} />}
              >
                {createPostMutation.isPending ? 'Publicando...' : 'Publicar'}
              </Button>
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
        <Button
          size='$3'
          theme='blue'
          icon={<Plus size={18} />}
          onPress={() => setShowCreatePost(true)}
        >
          Nueva
        </Button>
      </XStack>

      {/* Categorías - Dropdown */}
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
          onPress={() => setShowCategoryDropdown(!showCategoryDropdown)}
        >
          <XStack space='$2' alignItems='center' flex={1}>
            {selectedCategoryData && <selectedCategoryData.icon size={18} color='white' />}
            <Text color='white' fontWeight='600' flex={1} textAlign='left'>
              {selectedCategoryData?.title}
            </Text>
          </XStack>
          <ChevronDown size={18} color='white' style={{ transform: [{ rotate: showCategoryDropdown ? '180deg' : '0deg' }] }} />
        </Button>

        {showCategoryDropdown && (
          <YStack
            marginTop='$2'
            borderRadius='$2'
            borderWidth={1}
            borderColor='$gray5'
            overflow='hidden'
            backgroundColor='$background'
          >
            {categories.map((category, index) => {
              const Icon = category.icon
              const isSelected = selectedCategory === category.id
              
              return (
                <Button
                  key={category.id}
                  unstyled
                  padding='$3'
                  backgroundColor={isSelected ? category.color : '$background'}
                  opacity={1}
                  borderBottomWidth={index < categories.length - 1 ? 1 : 0}
                  borderBottomColor='$gray5'
                  onPress={() => {
                    setSelectedCategory(category.id)
                    setShowCategoryDropdown(false)
                  }}
                >
                  <XStack space='$3' alignItems='center' opacity={1}>
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
                </Button>
              )
            })}
          </YStack>
        )}
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
            <Button
              size='$3'
              theme='blue'
              icon={<Plus size={18} />}
              onPress={() => setShowCreatePost(true)}
            >
              Crear Publicación
            </Button>
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
    </YStack>
  )
}
