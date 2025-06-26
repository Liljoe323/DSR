import AuthModal from '@/components/AuthModal';
import Button from '@/components/Button';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const PlaceholderImage = require('@/assets/images/dsr.jpg');

export default function Index() {
  const [showAuth, setShowAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const checkSession = async () => {
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
      console.error('User fetch error:', userError?.message);
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
      console.error('Error fetching role:', profileError?.message);
      setIsLoggedIn(false);
      setShowAuth(true);
      setLoading(false);
      return;
    }

    setIsLoggedIn(true);
    setShowAuth(false);

    if (profileData.role === 'client') {
      router.replace('/client/Home');
    } else if (profileData.role === 'technician') {
      router.replace('/technician/Dashboard');
    } else {
      console.error('Unknown role:', profileData.role);
    }

    setLoading(false);
  };

  useEffect(() => {
    checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setTimeout(() => checkSession(), 300);
      } else {
        setShowAuth(true);
        setIsLoggedIn(false);
      }
    });

    return () => {
      listener?.subscription.unsubscribe();
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
    backgroundColor: 'rgba(0,0,0,0.6)', // dark overlay for contrast
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