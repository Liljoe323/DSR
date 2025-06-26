import ImageViewer from '@/components/imageviewer';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import theme from '@/styles/theme';

const PlaceholderImage = require('@/assets/images/dsr.jpg');

async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') return;
  if (!Device.isDevice) {
    Alert.alert('Error', 'Must use physical device for push notifications');
    return;
  }
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    Alert.alert('Error', 'Failed to get push token');
    return;
  }
  const tokenData = await Notifications.getExpoPushTokenAsync();
  console.log('Expo Push Token:', tokenData.data);
  return tokenData.data;
}

async function sendLocalNotification(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null,
  });
}

export default function TechnicianDashboard() {
  const [serviceRequests, setServiceRequests] = useState<any[]>([]);
  const [emergencyRequests, setEmergencyRequests] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, []);

  useEffect(() => {
    fetchRequests();
    fetchUserName();
    registerForPushNotificationsAsync();

    const notifyAndFetch = async () => {
      await fetchRequests();
      await sendLocalNotification('New Request', 'A new service request has been submitted.');
    };

    const serviceSub = supabase
      .channel('realtime:service_requests')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'service_requests' }, notifyAndFetch)
      .subscribe();

    const emergencySub = supabase
      .channel('realtime:emergency_service_requests')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emergency_service_requests' }, notifyAndFetch)
      .subscribe();

    const partsSub = supabase
      .channel('realtime:parts_requests')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'parts_requests' }, notifyAndFetch)
      .subscribe();

    return () => {
      supabase.removeChannel(serviceSub);
      supabase.removeChannel(emergencySub);
      supabase.removeChannel(partsSub);
    };
  }, []);

  const fetchRequests = async () => {
    const [serviceRes, emergencyRes, partsRes] = await Promise.all([
      supabase.from('service_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('emergency_service_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('parts_requests').select('*').order('created_at', { ascending: false }),
    ]);

    if (!serviceRes.error) setServiceRequests(serviceRes.data);
    if (!emergencyRes.error) setEmergencyRequests(emergencyRes.data);
    if (!partsRes.error) setPartsRequests(partsRes.data);
  };

  const fetchUserName = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    if (!error && data?.full_name) {
      setUserName(data.full_name);
    }
  };

  const handleDelete = async (id: number, table: string) => {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (!error) {
      Alert.alert('Deleted');
      fetchRequests();
    }
  };

  const openImageModal = (uri: string) => {
    setSelectedImage(uri);
    setModalVisible(true);
  };

  const renderRequestCard = (item: any, table: string, isEmergency = false) => {
    let imageUrls: string[] = [];

    try {
      if (Array.isArray(item.image_url)) {
        imageUrls = item.image_url;
      } else if (typeof item.image_url === 'string') {
        const parsed = JSON.parse(item.image_url);
        if (Array.isArray(parsed)) {
          imageUrls = parsed;
        } else if (typeof parsed === 'string') {
          imageUrls = [parsed];
        }
      }
    } catch (e) {
      console.warn('Could not parse image_url:', e);
    }

    return (
      <View style={[styles.requestCard, isEmergency && styles.emergencyCard]}>
        <Text style={styles.requestTitle}>{item.title}</Text>
        <Text style={styles.description}>{item.description}</Text>
        <Text style={styles.meta}>Company: {item.company}</Text>
        <Text style={styles.meta}>Name: {item.contact || 'N/A'}</Text>
        <Text style={styles.meta}>Phone: {item.phone_number || 'N/A'}</Text>
        <Text style={styles.meta}>Submitted: {new Date(item.created_at).toLocaleString()}</Text>

        {imageUrls.length > 0 && (
          <View style={styles.imagePreviewWrapper}>
            {imageUrls.map((uri: string, idx: number) => {
              if (typeof uri !== 'string' || !uri.startsWith('http')) return null;
              return (
                <TouchableOpacity key={idx} onPress={() => openImageModal(uri)}>
                  <Image source={{ uri }} style={styles.imageThumbnail} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item.id, table)}>
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollArea}>
        <ImageViewer imgSource={PlaceholderImage} mode="banner" />
        <View style={styles.headerRow}>
          <Text style={styles.name}>{userName}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('account')}>
            <Ionicons name="person-circle-outline" size={30} color={theme.colors.textOnPrimary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionHeader}>🚨 Emergency Requests</Text>
        {emergencyRequests.map((item) => renderRequestCard(item, 'emergency_service_requests', true))}

        <Text style={styles.sectionHeader}>🔧 Service Requests</Text>
        {serviceRequests.map((item) => renderRequestCard(item, 'service_requests'))}

        <Text style={styles.sectionHeader}>🔩 Parts Requests</Text>
        {partsRequests.map((item) => renderRequestCard(item, 'parts_requests'))}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackground} onPress={() => setModalVisible(false)}>
          <Image source={{ uri: selectedImage ?? '' }} style={styles.fullImage} resizeMode="contain" />
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollArea: {
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  name: {
    fontSize: theme.fontSize.lg,
    color: theme.colors.textOnPrimary,
    fontWeight: '600',
  },
  sectionHeader: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: '#fff',
    marginTop: 20,
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  requestCard: {
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderColor: '#444',
    borderWidth: 1,
    marginHorizontal: 16,
  },
  emergencyCard: {
    backgroundColor: '#3a1e1e',
    borderColor: '#ff4d4d',
  },
  requestTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    color: '#ddd',
  },
  meta: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 6,
  },
  imagePreviewWrapper: {
    flexDirection: 'row',
    marginTop: 10,
  },
  imageThumbnail: {
    width: 100,
    height: 100,
    marginRight: 8,
    borderRadius: 8,
    borderColor: '#ccc',
    borderWidth: 1,
  },
  deleteButton: {
    marginTop: 10,
    backgroundColor: '#cc0000',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  deleteButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '90%',
    height: '80%',
  },
});
