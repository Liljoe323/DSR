import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';

export default function ManagerHome() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [isManager, setIsManager] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const verifyManager = async () => {
      setLoading(true);
      setError(null);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const session = sessionData?.session;

      if (sessionError || !session?.user) {
        setError('You must be logged in to access this page.');
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_manager')
        .eq('id', session.user.id)
        .single();

      if (profileError || !profile?.is_manager) {
        setError('Access denied. You are not a manager.');
        setLoading(false);
        return;
      }

      setIsManager(true);
      setLoading(false);
    };

    verifyManager();
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!isManager) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Manager Access</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('dashboard')}
      >
        <Text style={styles.buttonText}> Assign Technicians to Calls </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('parts')}
      >
        <Text style={styles.buttonText}> View Parts Requests </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  header: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.textOnPrimary,
    marginBottom: 40,
  },
  button: {
    width: '100%',
    backgroundColor: theme.colors.primaryLight,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginVertical: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: theme.colors.textOnPrimary,
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
