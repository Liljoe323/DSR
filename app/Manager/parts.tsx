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
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BackButton from '@/components/BackButton';

export default function ManagerParts() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

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

  const markOrdered = async (id: string) => {
    // optimistic UI (optional)
    setPartRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ordered: true, ordered_at: new Date().toISOString() } : r))
    );

    const { error } = await supabase
      .from('parts_requests')
      .update({ ordered: true, ordered_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      Alert.alert('Error', error.message);
      // revert optimistic update if failed
      setPartRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ordered: false, ordered_at: null } : r))
      );
    } else {
      fetchParts(); // ensure fresh data
    }
  };

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('technician'); // ← adjust fallback route if needed
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.primary, }}>
     <BackButton style={styles.backButton} onPress={goBack} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollArea, partRequests.length === 0 ? styles.emptyContainer : undefined]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.header}>Parts Requests</Text>

        {loading && !refreshing ? (
          <ActivityIndicator size="large" color={theme.colors.primary} />
        ) : partRequests.length === 0 ? (
          <Text style={styles.empty}>No parts requests found.</Text>
        ) : (
          partRequests.map((request) => {
            const isOrdered = !!request.ordered;
            const orderedDate = request.ordered_at ? new Date(request.ordered_at).toLocaleString() : null;

            return (
              <View key={request.id} style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.title}>{request.title}</Text>
                  <View
                    style={[
                      styles.badge,
                      isOrdered ? styles.badgeOrdered : styles.badgePending,
                    ]}
                  >
                    <Text style={styles.badgeText}>
                      {isOrdered ? (orderedDate ? `Ordered • ${orderedDate}` : 'Ordered') : 'Not ordered'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.description}>{request.description}</Text>
                <Text style={styles.meta}>Company: {request.company}</Text>
                <Text style={styles.meta}>Contact: {request.contact}</Text>
                <Text style={styles.meta}>
                  Submitted: {new Date(request.created_at).toLocaleString()}
                </Text>

                <View style={styles.actionsRow}>
                  <Pressable
                    style={[styles.button, isOrdered ? styles.buttonDisabled : styles.buttonPrimary]}
                    onPress={() => !isOrdered && markOrdered(request.id)}
                    disabled={isOrdered}
                  >
                    <Text style={[styles.buttonText, isOrdered ? styles.buttonTextDisabled : styles.buttonTextPrimary]}>
                      {isOrdered ? '✓ Ordered' : 'Mark as Ordered'}
                    </Text>
                  </Pressable>

                  <Pressable onPress={() => clearFromView(request.id)}>
                    <Text style={styles.remove}>✕ Taken Care Of</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
 
  backButton: {
    marginTop: 60,
    backgroundColor: theme.colors.primary,
  },

  scrollArea: {
    paddingBottom: 80,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 1,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.textOnPrimary,
    marginTop: 10,
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
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  title: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeOrdered: {
    backgroundColor: '#d9f8e6', // soft green
  },
  badgePending: {
    backgroundColor: '#fde8d9', // soft orange
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.text,
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
  actionsRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  button: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  buttonPrimary: {
    backgroundColor: theme.colors.primary,
  },
  buttonDisabled: {
    backgroundColor: '#e1e1e1',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  buttonTextPrimary: {
    color: theme.colors.textOnPrimary,
  },
  buttonTextDisabled: {
    color: theme.colors.muted,
  },
  remove: {
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
