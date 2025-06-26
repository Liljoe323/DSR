import AuthModal from '@/components/AuthModal';
import Button from '@/components/Button';
import ImageViewer from '@/components/imageviewer';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import theme from '@/styles/theme';

const PlaceholderImage = require('@/assets/images/dsr.jpg');

export default function Index() {
  const [showAuth, setShowAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  const router = useRouter();

  const checkSession = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;

    if (!session) {
      setIsLoggedIn(false);
      setShowAuth(true);
      setHasCheckedAuth(true);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', session.user.id)
      .single();

    if (error || !data?.role) {
      console.error('Error fetching role:', error?.message);
      setIsLoggedIn(false);
      setShowAuth(true);
      setHasCheckedAuth(true);
      return;
    }

    setIsLoggedIn(true);
    setUserName(data.full_name || null);
    setShowAuth(false);

    if (data.role === 'client') {
      router.replace('/client/Home');
    } else if (data.role === 'technician') {
      router.replace('/technician/Dashboard');
    } else {
      console.error('Unknown role:', data.role);
    }

    setHasCheckedAuth(true);
  };

  useEffect(() => {
    checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setTimeout(() => checkSession(), 300);
      } else {
        setShowAuth(true);
        setIsLoggedIn(false);
        setUserName(null);
      }
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  if (!hasCheckedAuth) return null;

  return (
    <>
      <SafeAreaView style={styles.container}>
        <ImageViewer imgSource={PlaceholderImage} mode="banner" />

        {isLoggedIn && (
          <View style={styles.accountRow}>
            <Pressable onPress={() => router.push('/account')} style={styles.accountButton}>
              <Ionicons name="person-circle-outline" size={28} color={theme.colors.textOnPrimary} />
              <Text style={styles.accountName}>{userName}</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.content}>
          <Text style={styles.title}>Welcome to Dick Soule Service</Text>
          <Text style={styles.subtitle}>Fast, reliable service at your fingertips</Text>
          {!isLoggedIn && (
            <Button label="Get Started" onPress={() => setShowAuth(true)} />
          )}
        </View>
      </SafeAreaView>

      <AuthModal isVisible={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.textOnPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.fontSize.base,
    color: theme.colors.textOnPrimary,
    textAlign: 'center',
    opacity: 0.9,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  accountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accountName: {
    color: theme.colors.textOnPrimary,
    fontSize: theme.fontSize.sm,
    maxWidth: 100,
  },
});