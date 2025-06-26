// app/technician/ManagerParts.tsx
import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Alert,
} from 'react-native';

export default function ManagerParts() {
  const [partRequests, setPartRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchParts = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('parts_requests')
      .select('*')
      .eq('cleared_by_manager', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Failed to fetch part requests:', error.message);
    }

    setPartRequests(data || []);
    setLoading(false);
  };

  const clearFromView = async (id: string) => {
    const { error } = await supabase
      .from('parts_requests')
      .update({ cleared_by_manager: true })
      .eq('id', id);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      fetchParts();
    }
  };

  useEffect(() => {
    fetchParts();
  }, []);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Parts Requests</Text>

      {loading ? (
        <ActivityIndicator size="large" color={theme.colors.primary} />
      ) : partRequests.length === 0 ? (
        <Text style={styles.empty}>No parts requests found.</Text>
      ) : (
        partRequests.map((request) => (
          <View key={request.id} style={styles.card}>
            <Text style={styles.title}>{request.title}</Text>
            <Text style={styles.description}>{request.description}</Text>
            <Text style={styles.meta}>Company: {request.company}</Text>
            <Text style={styles.meta}>Contact: {request.contact}</Text>
            <Text style={styles.meta}>
              Submitted: {new Date(request.created_at).toLocaleString()}
            </Text>
            <Pressable onPress={() => clearFromView(request.id)}>
              <Text style={styles.remove}>✕ Remove from view</Text>
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 16,
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 16,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: theme.colors.text,
    marginBottom: 8,
  },
  meta: {
    fontSize: 12,
    color: theme.colors.muted,
  },
  empty: {
    fontSize: 14,
    color: theme.colors.muted,
    textAlign: 'center',
    marginTop: 32,
  },
  remove: {
    marginTop: 10,
    fontSize: 13,
    color: theme.colors.error,
    textDecorationLine: 'underline',
  },
});