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

  const [expoPushToken, setExpoPushToken] = useState<string>('');
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

  const router = useRouter();

  /** DEEP LINK HANDLER **/
  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      await supabase.auth.getSessionFromUrl({ storeSession: true });
      await checkSession();
    };

    Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    return () => {
      // Linking.removeEventListener is deprecated, handled automatically
    };
  }, []);

  /** SESSION + ROLE CHECK **/
  const checkSession = async () => {
    setLoading(true);

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user?.id) {
      console.log('No user found – showing auth modal');
      setIsLoggedIn(false);
      setShowAuth(true);
      setLoading(false);
      return;
    }

    const user = userData.user;

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Profile fetch error:', profileError.message);
    }

    if (!profileData || !profileData.role) {
      console.log('No role found — redirecting to /account');
      router.replace('/account');
      setLoading(false);
      return;
    }

    setIsLoggedIn(true);
    setShowAuth(false);

    if (profileData.role === 'client') {
      console.log('Redirecting to client Home');
      router.replace('/client/Home');
      return;
    } else if (profileData.role === 'technician') {
      console.log('Redirecting to technician Dashboard');
      router.replace('/technician/Dashboard/tech_dashboard');
      return;
    } else if (profileData.role === 'handler') {
      console.log('Redirecting to handler Dashboard');
      router.replace('/Handler/report_lookup');
      return;
    }

    setLoading(false);
  };

  /** AUTH LISTENER + INITIAL RESTORE **/
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

  /** PUSH NOTIFICATIONS **/
  useEffect(() => {
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

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

      const logToSupabase = async (message: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;

      if (user) {
        await supabase.from('logs').insert([
          {
          user_id: user.id,
          message,
          },
        ]);
      }
      };

      const tokenData = await Notifications.getExpoPushTokenAsync();
      setExpoPushToken(tokenData.data); 
      console.log('APNs Device Token:', tokenData.data);
      await logToSupabase(`📲 APNs token retrieved: ${tokenData.data}`);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      


      if (user && tokenData) {
        const { error: insertError } = await supabase
          .from('push_tokens')
          .upsert(
            [{ user_id: user.id, token: tokenData.data }],
            { onConflict: ['user_id'] }
          );

        if (insertError) {
          await logToSupabase(`❌ Supabase insert error: ${insertError.message}`);
          console.error('Failed to insert push token:', insertError.message);
        } else {
          console.log('Push token saved to push_tokens table');
        }
      }
    })();

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
