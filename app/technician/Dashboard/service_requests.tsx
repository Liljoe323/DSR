import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const HIDDEN_KEY = 'hiddenServiceRequests';

export default function ServiceRequestsScreen() {
  const [alarms, setAlarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlarms = useCallback(async () => {
    if (!refreshing) setLoading(true);

    let hiddenSet = new Set<string>();
    try {
      const json = await AsyncStorage.getItem(HIDDEN_KEY);
      if (json) JSON.parse(json).forEach((k: string) => hiddenSet.add(k));
    } catch {}

    const { data, error } = await supabase
      .from('service_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const visibleAlarms = data.filter(alarm => !hiddenSet.has(`service:${alarm.id}`));
      setAlarms(visibleAlarms);
    }

    setLoading(false);
    setRefreshing(false);
  }, [refreshing]);

  useEffect(() => {
    fetchAlarms();

    const channel = supabase
      .channel('realtime:service_requests')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'service_requests' },
        fetchAlarms
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAlarms]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAlarms();
  }, [fetchAlarms]);

  async function hideAlarm(id: number) {
    const key = `service:${id}`;
    try {
      const json = await AsyncStorage.getItem(HIDDEN_KEY);
      const arr = json ? JSON.parse(json) : [];
      if (!arr.includes(key)) {
        arr.push(key);
        await AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(arr));
      }
    } catch {}
    fetchAlarms();
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollArea}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text style={styles.header}>🔧 Service Requests</Text>

        {alarms.map((alarm) => (
          <View key={alarm.id} style={styles.card}>
            <Text style={styles.title}>{alarm.title || 'No Subject'}</Text>
            <Text style={styles.body}>{alarm.description || 'No Body'}</Text>
            <Text style={styles.meta}>Company: {alarm.company}</Text>
            <Text style={styles.meta}>Contact: {alarm.contact}</Text>
            <Text style={styles.meta}>Phone Number: {alarm.phone_number}</Text>
            <Text style={styles.meta}>
              Received: {new Date(alarm.created_at).toLocaleString()}
            </Text>

            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.hideButton}
                onPress={() => hideAlarm(alarm.id)}
              >
                <Text style={styles.hideButtonText}>Hide</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {!loading && alarms.length === 0 && (
          <Text style={styles.noData}>No service requests found.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollArea: {
    padding: 16,
    paddingBottom: 80,
  },
  header: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderColor: '#444',
    borderWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    color: '#ddd',
    marginBottom: 6,
  },
  meta: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  hideButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.colors.error,
    borderRadius: 6,
  },
  hideButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  noData: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 40,
  },
});
