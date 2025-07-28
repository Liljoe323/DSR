import React, { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import ImageViewer from '@/components/imageviewer';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Platform,
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
  RefreshControl,
} from 'react-native';
import theme from '@/styles/theme';

const PlaceholderImage = require('@/assets/images/dsr.jpg');
const HIDDEN_KEY = 'hiddenRequests';

// 1. GLOBAL handler so foreground notifications show
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web' || !Device.isDevice) {
    Alert.alert('Error', 'Must use a physical device for push notifications');
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

  // 2. Get the token
  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data;
  console.log('Expo Push Token:', token);

  // 3. Persist it in Supabase
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user?.id) {
    await supabase.from('push_tokens').upsert({
      user_id: session.user.id,
      token,
    });
  }
}

async function sendLocalNotification(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null,
  });
}

// Optional client-side helper for sending pushes via Expo API
export async function sendRemotePush(expoPushToken: string, title: string, body: string) {
  return fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: expoPushToken,
      sound: 'default',
      title,
      body,
      data: {},
    }),
  });
}

export default function TechnicianDashboard() {
  const navigation = useNavigation();
  const [serviceRequests, setServiceRequests] = useState<any[]>([]);
  const [emergencyRequests, setEmergencyRequests] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [userName, setUserName] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // refs for notification subscriptions
  const notifListener = useRef<any>();
  const responseListener = useRef<any>();

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, []);

  const fetchRequests = useCallback(async () => {
    if (!refreshing) setLoading(true);

    // load hidden keys
    let hiddenSet = new Set<string>();
    try {
      const json = await AsyncStorage.getItem(HIDDEN_KEY);
      if (json) JSON.parse(json).forEach((k: string) => hiddenSet.add(k));
    } catch {}

    // fetch all three tables
    const [sRes, eRes, pRes] = await Promise.all([
      supabase.from('service_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('emergency_service_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('parts_requests').select('*').order('created_at', { ascending: false }),
    ]);

    if (sRes.data) {
      setServiceRequests(sRes.data.filter(r => !hiddenSet.has(`service:${r.id}`)));
    }
    if (eRes.data) {
      setEmergencyRequests(eRes.data.filter(r => !hiddenSet.has(`emergency:${r.id}`)));
    }
    if (pRes.data) {
      setPartsRequests(pRes.data.filter(r => !hiddenSet.has(`parts:${r.id}`)));
    }

    setLoading(false);
    setRefreshing(false);
  }, [refreshing]);

  useEffect(() => {
    // 4. Create Android channel
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    fetchRequests();
    registerForPushNotificationsAsync();

    const notifyAndFetch = async () => {
      await fetchRequests();
      await sendLocalNotification('New Request', 'A new request has been submitted.');
    };

    // 5. Supabase realtime subscriptions
    const subs = [
      supabase
        .channel('realtime:service_requests')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'service_requests' },
          notifyAndFetch
        )
        .subscribe(),

      supabase
        .channel('realtime:emergency_service_requests')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'emergency_service_requests' },
          notifyAndFetch
        )
        .subscribe(),

      supabase
        .channel('realtime:parts_requests')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'parts_requests' },
          notifyAndFetch
        )
        .subscribe(),
    ];

    // 6. Listen to actual push arrivals & user taps
    notifListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Push Received:', notification);
    });
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Push Response:', response);
    });

    // fetch user name
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', session.user.id)
          .single();
        if (!error && data?.full_name) setUserName(data.full_name);
      }
    })();

    return () => {
      subs.forEach(ch => supabase.removeChannel(ch));
      Notifications.removeNotificationSubscription(notifListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, [fetchRequests]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRequests();
  }, [fetchRequests]);

  async function hideRequest(id: number, type: 'service' | 'emergency' | 'parts') {
    const key = `${type}:${id}`;
    try {
      const json = await AsyncStorage.getItem(HIDDEN_KEY);
      const arr = json ? JSON.parse(json) : [];
      if (!arr.includes(key)) {
        arr.push(key);
        await AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(arr));
      }
    } catch {}
    fetchRequests();
  }

  function openImageModal(uri: string) {
    setSelectedImage(uri);
    setModalVisible(true);
  }

  function renderRequestCard(item: any, type: 'service' | 'emergency' | 'parts') {
    let imageUrls: string[] = [];
    try {
      const parsed = Array.isArray(item.image_url)
        ? item.image_url
        : JSON.parse(item.image_url);
      if (Array.isArray(parsed)) imageUrls = parsed;
    } catch {}

    return (
      <View
        key={`${type}:${item.id}`}
        style={[styles.requestCard, type === 'emergency' && styles.emergencyCard]}
      >
        <Text style={styles.requestTitle}>{item.title}</Text>
        <Text style={styles.description}>{item.description}</Text>
        <Text style={styles.meta}>Company: {item.company}</Text>
        <Text style={styles.meta}>Name: {item.contact || 'N/A'}</Text>
        <Text style={styles.meta}>Phone: {item.phone_number || 'N/A'}</Text>
        <Text style={styles.meta}>
          Submitted: {new Date(item.created_at).toLocaleString()}
        </Text>

        {imageUrls.length > 0 && (
          <View style={styles.imagePreviewWrapper}>
            {imageUrls.map((uri, idx) =>
              typeof uri === 'string' && uri.startsWith('http') ? (
                <TouchableOpacity key={idx} onPress={() => openImageModal(uri)}>
                  <Image source={{ uri }} style={styles.imageThumbnail} />
                </TouchableOpacity>
              ) : null
            )}
          </View>
        )}

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.hideButton}
            onPress={() => hideRequest(item.id, type)}
          >
            <Text style={styles.hideButtonText}>Remove</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollArea}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <ImageViewer imgSource={PlaceholderImage} mode="banner" />

        <View style={styles.headerRow}>
          <Text style={styles.name}>{userName}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('account')}>
            <Ionicons
              name="person-circle-outline"
              size={30}
              color={theme.colors.textOnPrimary}
            />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionHeader}>🚨 Emergency Requests</Text>
        {emergencyRequests.map(item => renderRequestCard(item, 'emergency'))}

        <Text style={styles.sectionHeader}>🔧 Service Requests</Text>
        {serviceRequests.map(item => renderRequestCard(item, 'service'))}

        <Text style={styles.sectionHeader}>🔩 Parts Requests</Text>
        {partsRequests.map(item => renderRequestCard(item, 'parts'))}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade">
        <Pressable
          style={styles.modalBackground}
          onPress={() => setModalVisible(false)}
        >
          <Image
            source={{ uri: selectedImage! }}
            style={styles.fullImage}
            resizeMode="contain"
          />
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:           { flex: 1, backgroundColor: theme.colors.background },
  scrollArea:          { paddingBottom: 40 },
  headerRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: theme.spacing.md },
  name:                { fontSize: theme.fontSize.lg, color: theme.colors.textOnPrimary, fontWeight: '600' },
  sectionHeader:       { fontSize: theme.fontSize.lg, fontWeight: '700', color: '#fff', marginTop: 20, marginBottom: 10, paddingHorizontal: 16 },
  requestCard:         { backgroundColor: '#2a2a2a', padding: 16, borderRadius: 12, marginBottom: 16, borderColor: '#444', borderWidth: 1, marginHorizontal: 16 },
  emergencyCard:       { backgroundColor: '#3a1e1e', borderColor: '#ff4d4d' },
  requestTitle:        { fontSize: 18, fontWeight: '600', color: '#fff', marginBottom: 6 },
  description:         { fontSize: 14, color: '#ddd' },
  meta:                { fontSize: 12, color: '#aaa', marginTop: 6 },
  imagePreviewWrapper: { flexDirection: 'row', marginTop: 10 },
  imageThumbnail:      { width: 100, height: 100, marginRight: 8, borderRadius: 8, borderColor: '#ccc', borderWidth: 1 },
  cardActions:         { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  hideButton:          { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.colors.error, borderRadius: 6 },
  hideButtonText:      { color: '#fff', fontWeight: '600' },
  modalBackground:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  fullImage:           { width: '90%', height: '80%' },
});
