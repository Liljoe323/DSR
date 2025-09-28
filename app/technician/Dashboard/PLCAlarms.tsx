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

const HIDDEN_KEY = 'hiddenPLCAlarms';
const COLLAPSED_KEY = 'collapsedPLCAlarms'; // NEW

export default function PLCAlarmsScreen() {
  const [alarms, setAlarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set()); // NEW (keys: plc:<id>)

  const loadCollapsed = useCallback(async () => {
    try {
      const json = await AsyncStorage.getItem(COLLAPSED_KEY);
      if (json) setCollapsedSet(new Set(JSON.parse(json)));
    } catch {}
  }, []);

  const saveCollapsed = useCallback(async (setVal: Set<string>) => {
    try {
      await AsyncStorage.setItem(COLLAPSED_KEY, JSON.stringify(Array.from(setVal)));
    } catch {}
  }, []);

  const fetchAlarms = useCallback(async () => {
    if (!refreshing) setLoading(true);

    let hiddenSet = new Set<string>();
    try {
      const json = await AsyncStorage.getItem(HIDDEN_KEY);
      if (json) JSON.parse(json).forEach((k: string) => hiddenSet.add(k));
    } catch {}

    const { data, error } = await supabase
      .from('plc_alarms')
      .select('*')
      .order('received_at', { ascending: false });

    if (!error && data) {
      const visibleAlarms = data.filter(alarm => !hiddenSet.has(`plc:${alarm.id}`));
      setAlarms(visibleAlarms);
    }

    setLoading(false);
    setRefreshing(false);
  }, [refreshing]);

  useEffect(() => {
    loadCollapsed(); // NEW
    fetchAlarms();

    const channel = supabase
      .channel('realtime:plc_alarms')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'plc_alarms' },
        fetchAlarms
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAlarms, loadCollapsed]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAlarms();
  }, [fetchAlarms]);

  async function hideAlarm(id: number) {
    const key = `plc:${id}`;
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

  // NEW: collapse helpers
  const isCollapsed = (id: number) => collapsedSet.has(`plc:${id}`);
  const toggleCollapsed = async (id: number) => {
    const key = `plc:${id}`;
    const next = new Set(collapsedSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsedSet(next);
    await saveCollapsed(next);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollArea}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text style={styles.header}>🔔 PLC Alarms</Text>

        {alarms.map((alarm) => {
          const collapsed = isCollapsed(alarm.id);
          return (
            <View key={alarm.id} style={styles.card}>
              {/* NEW collapse/expand button */}
              <TouchableOpacity
                style={styles.collapseBtn}
                onPress={() => toggleCollapsed(alarm.id)}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Text style={styles.collapseBtnText}>{collapsed ? '+' : '−'}</Text>
              </TouchableOpacity>

              {/* Always show subject/title */}
              <Text style={styles.title}>{alarm.subject || 'No Subject'}</Text>

              {/* Collapsed hides body + meta + actions */}
              {collapsed ? null : (
                <>
                  <Text style={styles.body}>{alarm.body || 'No Body'}</Text>
                  <Text style={styles.meta}>
                    Received: {new Date(alarm.received_at).toLocaleString()}
                  </Text>

                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.hideButton}
                      onPress={() => hideAlarm(alarm.id)}
                    >
                      <Text style={styles.hideButtonText}>Hide</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          );
        })}

        {!loading && alarms.length === 0 && (
          <Text style={styles.noData}>No PLC alarms found.</Text>
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
    position: 'relative', // NEW (for corner button)
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderColor: '#444',
    borderWidth: 1,
  },
  // NEW styles:
  collapseBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3a3a3a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#555',
  },
  collapseBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 18,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginRight: 36, // leave space for corner button
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
