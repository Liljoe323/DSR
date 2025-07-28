// app/index.tsx
import AuthModal from '@/components/AuthModal';
import Button from '@/components/Button';
import { supabase } from '@/lib/supabase';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Linking,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const PlaceholderImage = require('@/assets/images/dsr.jpg');

// Configure how notifications are shown when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function Index() {
  const [showAuth, setShowAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  // Notification state & refs
  const [expoPushToken, setExpoPushToken] = useState<string>('');
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

  const router = useRouter();

  /** HANDLE DEEP LINKS FOR AUTH CALLBACK **/
  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      // Let Supabase parse the URL and set the session
      await supabase.auth.getSessionFromUrl({ storeSession: true });
      // After processing, re-check session/role
      await checkSession();
    };

    Linking.addEventListener('url', handleUrl);
    // Handle cold start
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    return () => {
      //Linking.removeEventListener('url', handleUrl);
    };
  }, []);

  /** SESSION + ROLE CHECK **/
  const checkSession = async () => {
    setLoading(true);
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const session = sessionData?.session;

    if (!session || sessionError) {
      setIsLoggedIn(false);
      setShowAuth(true);
      setLoading(false);
      return;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user?.id) {
      setIsLoggedIn(false);
      setShowAuth(true);
      setLoading(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (profileError || !profileData?.role) {
      router.replace('/account');
      return setLoading(false);
    }

    setIsLoggedIn(true);
    setShowAuth(false);

    // route based on their role
    if (profileData.role === 'client') {
      router.replace('/client/Home');
    } else if (profileData.role === 'technician') {
      router.replace('/technician/Dashboard');
    }

    setLoading(false);
  };

  /** AUTH LISTENER + INITIAL SESSION RESTORE **/
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        checkSession();
      } else {
        setShowAuth(true);
        setIsLoggedIn(false);
      }
    });

    checkSession();

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  /** PUSH NOTIFICATIONS SETUP **/
  useEffect(() => {
    // 1) Android notification channel
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    // 2) Permissions & get token
    (async () => {
      if (!Device.isDevice) {
        Alert.alert('Must use a physical device for Push Notifications');
        return;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        Alert.alert('Failed to get push token for push notification!');
        return;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync();
      setExpoPushToken(tokenData.data);
      console.log('Expo Push Token:', tokenData.data);
    })();

    // 3) Listeners for incoming notifications
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification Received:', notification);
    });
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification Response:', response);
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  // show a full-screen spinner while restoring session
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <ImageBackground source={PlaceholderImage} style={styles.background} resizeMode="cover">
      <View style={styles.overlay}>
        <SafeAreaView style={styles.inner}>
          <Text style={styles.title}>Welcome to the Dick Soule Service App</Text>
          <Button label="Sign In / Sign Up" onPress={() => setShowAuth(true)} />
        </SafeAreaView>
      </View>
      <AuthModal isVisible={showAuth} onClose={() => setShowAuth(false)} />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: {
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 30,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
