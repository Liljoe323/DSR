// app/technician/account.tsx
import { useEffect, useState } from 'react';
import { SafeAreaView, Text, View, StyleSheet, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import Button from '@/components/Button';
import ImageViewer from '@/components/imageviewer';
import { useRouter, router } from 'expo-router';

const PlaceholderImage = require('@/assets/images/dsr.jpg');

export default function TechnicianAccount() {
  const [profile, setProfile] = useState<any>(null);
  const router = useRouter();

  const fetchProfile = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      Alert.alert('Error', 'Failed to load profile info');
      console.error(error);
    } else {
      setProfile(data);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      Alert.alert('Logout Error', error.message);
    } else {
    // Clear any local state and force full navigation reset
      setProfile(null);
    router.push('/');  // Use push instead of replace to trigger navigation
  }
};

  useEffect(() => {
    fetchProfile();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ImageViewer imgSource={PlaceholderImage} mode="banner" />
      <View style={styles.content}>
        <Text style={styles.title}>Technician Profile</Text>
        {profile ? (
          <>
            <Text style={styles.info}>Email: {profile.email}</Text>
            <Text style={styles.info}>Role: {profile.role}</Text>
          </>
        ) : (
          <Text style={styles.info}>Loading profile...</Text>
        )}
        <Button label="Log Out" onPress={handleLogout} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#25292e',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 20,
  },
  info: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 10,
  },
});