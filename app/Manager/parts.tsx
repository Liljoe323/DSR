// app/technician/ManagerParts.tsx
import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export default function ManagerParts() {
  const [partRequests, setPartRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchParts = useCallback(async () => {
    // only show full-screen spinner on initial load
    if (!refreshing) setLoading(true);

    const { data, error } = await supabase
      .from('parts_requests')
      .select('*')
      .eq('taken_care_of', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Failed to fetch part requests:', error.message);
    }

    setPartRequests(data || []);
    setLoading(false);
    setRefreshing(false);
  }, [refreshing]);

  useEffect(() => {
    fetchParts();
  }, [fetchParts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchParts();
  }, [fetchParts]);

  const clearFromView = async (id: string) => {
    const { error } = await supabase
      .from('parts_requests')
      .update({ taken_care_of: true })
      .eq('id', id);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      fetchParts();
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollArea, partRequests.length === 0 ? styles.emptyContainer : undefined]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.header}>Parts Requests</Text>

      {loading && !refreshing ? (
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
              <Text style={styles.remove}>✕ Taken Care Of</Text>
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollArea: {
    paddingBottom: 80
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 16,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.textOnPrimary,
    marginTop: 50,
    marginBottom: 30,
    textAlign: 'center',
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
    marginBottom: 4,
  },
  remove: {
    marginTop: 10,
    fontSize: 13,
    color: theme.colors.error,
    textDecorationLine: 'underline',
  },
  empty: {
    fontSize: 14,
    color: theme.colors.muted,
    textAlign: 'center',
    marginTop: 32,
  },
});