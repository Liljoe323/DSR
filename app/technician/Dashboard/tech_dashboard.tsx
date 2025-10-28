// app/technician/Dashboard.tsx
import ImageViewer from '@/components/imageviewer';
import PushTokenPopup from '@/components/PushTokenPopup';
import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

const PlaceholderImage = require('@/assets/images/dsr.jpg');
const HIDDEN_KEY = 'hiddenRequests';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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

  const [showTokenPopup, setShowTokenPopup] = useState(false);
  const [currentToken, setCurrentToken] = useState('');

  const [isManager, setIsManager] = useState<boolean | null>(null);

  const notifListener = useRef<any>();
  const responseListener = useRef<any>();

  useEffect(() => {
  const fetchUserData = async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('is_manager')
      .eq('id', session.user.id)
      .maybeSingle();

    if (!error && data) {
      setIsManager(Boolean(data.is_manager));
    } else {
      console.warn('Failed to fetch role or manager status:', error?.message);
    }
  };

  fetchUserData();
}, []);


  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, []);

  const fetchRequests = useCallback(async () => {
    if (!refreshing) setLoading(true);

    let hiddenSet = new Set<string>();
    try {
      const json = await AsyncStorage.getItem(HIDDEN_KEY);
      if (json) JSON.parse(json).forEach((k: string) => hiddenSet.add(k));
    } catch {}

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
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    fetchRequests();

    const notifyAndFetch = async () => {
      await fetchRequests();
      await Notifications.scheduleNotificationAsync({
        content: { title: 'New Request', body: 'A new request has been submitted.' },
        trigger: null,
      });
    };

    const subs = [
      supabase
        .channel('realtime:service_requests')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'service_requests' }, notifyAndFetch)
        .subscribe(),
      supabase
        .channel('realtime:emergency_service_requests')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emergency_service_requests' }, notifyAndFetch)
        .subscribe(),
      supabase
        .channel('realtime:parts_requests')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'parts_requests' }, notifyAndFetch)
        .subscribe(),
    ];

    notifListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Push Received:', notification);
    });
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Push Response:', response);
    });

    return () => {
      subs.forEach(ch => supabase.removeChannel(ch));
      Notifications.removeNotificationSubscription(notifListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, [fetchRequests]);

  useEffect(() => {
  const checkAndShowTokenPopup = async () => {
    if (Platform.OS === 'web' || !Device.isDevice) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const user = session?.user;
    if (!user) return;

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const { status: newStatus } = await Notifications.requestPermissionsAsync();
      if (newStatus !== 'granted') return;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const expoToken = tokenData.data;
    setCurrentToken(expoToken);

    const { data: push_tokens, error } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.error('Error checking token in Supabase:', error.message);
      return;
    }

    if (!push_tokens?.token) {
      setShowTokenPopup(true);
    }
  };

  checkAndShowTokenPopup();
}, []);

  const handleTokenSubmit = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;

  if (!user || !currentToken) return;

  const { error } = await supabase
    .from('push_tokens')
    .update({ token: currentToken })
    .eq('user_id', user.id);

  if (error) {
    Alert.alert('Error saving token', error.message);
  } else {
    setShowTokenPopup(false);
  }
};


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
      const parsed = Array.isArray(item.image_url) ? item.image_url : JSON.parse(item.image_url);
      if (Array.isArray(parsed)) imageUrls = parsed;
    } catch {}

    return (
      <View key={`${type}:${item.id}`} style={[styles.requestCard, type === 'emergency' && styles.emergencyCard]}>
        <Text style={styles.requestTitle}>{item.title}</Text>
        <Text style={styles.description}>{item.description}</Text>
        <Text style={styles.meta}>Company: {item.company}</Text>
        <Text style={styles.meta}>Name: {item.contact || 'N/A'}</Text>
        <Text style={styles.meta}>Phone: {item.phone_number || 'N/A'}</Text>
        <Text style={styles.meta}>Submitted: {new Date(item.created_at).toLocaleString()}</Text>

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
          <TouchableOpacity style={styles.hideButton} onPress={() => hideRequest(item.id, type)}>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <ImageViewer imgSource={PlaceholderImage} mode="banner" />

        <View style={styles.headerRow}>
          <Text style={styles.name}>Welcome back!</Text>
          <TouchableOpacity
            style={styles.accountButton}
            onPress={() => navigation.navigate('account')}
          >
            <Ionicons name="person-circle-outline" size={40} color={theme.colors.textOnPrimary} />
          </TouchableOpacity>
        </View>

        {isManager === true && (
          <View style={styles.plcButtonContainer}>
          <TouchableOpacity
            style={styles.plcButton}
            onPress={() => navigation.navigate('Manager')}
            activeOpacity={0.85}
          >
            <Text style={styles.plcButtonText}>Manager Tabs</Text>
          </TouchableOpacity>
        </View>
      )}

        <Text style={styles.headerText}> Customer Requests</Text>

        <View style={styles.plcButtonContainer}>
          <TouchableOpacity
            style={styles.plcButton}
            onPress={() => navigation.navigate('PLCAlarms')}
            activeOpacity={0.85}
          >
            <Text style={styles.plcButtonText}>🔔 PLC Alarms</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.plcButtonContainer}>
          <TouchableOpacity
            style={styles.plcButton}
            onPress={() => navigation.navigate('emergency_requests')}
            activeOpacity={0.85}
          >
            <Text style={styles.plcButtonText}>🚨 Emergency Requests</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.plcButtonContainer}>
          <TouchableOpacity
            style={styles.plcButton}
            onPress={() => navigation.navigate('service_requests')}
            activeOpacity={0.85}
          >
            <Text style={styles.plcButtonText}>🔧 Service Requests</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.plcButtonContainer}>
          <TouchableOpacity
            style={styles.plcButton}
            onPress={() => navigation.navigate('parts_requests')}
            activeOpacity={0.85}
          >
            <Text style={styles.plcButtonText}>🔩 Parts Requests</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.headerText}> Make a Request For:</Text>

        <View style={styles.plcButtonContainer}>
          <TouchableOpacity
            style={styles.plcButton}
            onPress={() => navigation.navigate('Request Service')}
            activeOpacity={0.85}
          >
            <Text style={styles.plcButtonText}>🔧 Service </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.plcButtonContainer}>
          <TouchableOpacity
            style={styles.plcButton}
            onPress={() => navigation.navigate('Parts Request')}
            activeOpacity={0.85}
          >
            <Text style={styles.plcButtonText}>🔩 Parts</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackground} onPress={() => setModalVisible(false)}>
          <Image source={{ uri: selectedImage! }} style={styles.fullImage} resizeMode="contain" />
        </Pressable>
      </Modal>

      <PushTokenPopup visible={showTokenPopup} token={currentToken} onClose={handleTokenSubmit} />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollArea: { paddingBottom: 80 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: theme.spacing.md },
  name: { fontSize: theme.fontSize.lg, color: theme.colors.textOnPrimary, fontWeight: '600' },
  sectionHeader: { fontSize: theme.fontSize.lg, fontWeight: '700', color: '#fff', marginTop: 20, marginBottom: 10, paddingHorizontal: 16 },
  requestCard: { backgroundColor: '#2a2a2a', padding: 16, borderRadius: 12, marginBottom: 16, borderColor: '#444', borderWidth: 1, marginHorizontal: 16 },
  emergencyCard: { backgroundColor: '#3a1e1e', borderColor: '#ff4d4d' },
  requestTitle: { fontSize: 18, fontWeight: '600', color: '#fff', marginBottom: 6 },
  description: { fontSize: 14, color: '#ddd' },
  meta: { fontSize: 12, color: '#aaa', marginTop: 6 },
  imagePreviewWrapper: { flexDirection: 'row', marginTop: 10 },
  imageThumbnail: { width: 100, height: 100, marginRight: 8, borderRadius: 8, borderColor: '#ccc', borderWidth: 1 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  hideButton: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.colors.error, borderRadius: 6 },
  hideButtonText: { color: '#fff', fontWeight: '600' },
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  fullImage: { width: '90%', height: '80%' },
  plcButtonContainer: { paddingHorizontal: 16, marginTop: 10, marginBottom: 20 },
  plcButton: { backgroundColor: theme.colors.primaryLight, paddingVertical: 14, borderRadius: 10, alignItems: 'center', elevation: 5 },
  plcButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  accountButton: { backgroundColor: theme.colors.primaryLight, padding: 6, borderRadius: 20 },
  headerText: {textAlign: "center", color:  '#fff', fontSize: 25, padding: 12 }
});
