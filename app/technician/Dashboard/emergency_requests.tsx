import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const HIDDEN_KEY = 'hiddenEmergencyRequests';
const COLLAPSED_KEY = 'collapsedEmergencyRequests';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type EmergencyRequest = {
  id: number;
  title?: string | null;
  description?: string | null;
  company?: string | null;       // name string, if you store it on the row
  company_id?: string | number;  // FK to companies.id (if present)
  contact?: string | null;
  phone_number?: string | null;
  created_at: string;
  image_url?: string | string[] | null; // 👈 links for images
  // hydrated in fast path if FK exists:
  companies?: { company_name?: string | null; service_address?: string | null } | null;

  // derived for UI
  display_images?: string[];
};

type Company = {
  id: string | number;
  company_name: string;
  service_address?: string | null;
};

export default function EmergencyRequestScreen() {
  const [alarms, setAlarms] = useState<EmergencyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set()); // keys: emergency:<id>

  // Full-screen viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerImages, setViewerImages] = useState<string[]>([]);

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

  // Parse image_url field into an array of URLs
  const parseImageUrlField = (val: any): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(Boolean).map(String).map(s => s.trim()).filter(Boolean);
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith('[')) {
        try {
          const arr = JSON.parse(trimmed);
          if (Array.isArray(arr)) return arr.filter(Boolean).map(String).map(s => s.trim()).filter(Boolean);
        } catch {}
      }
      // comma / newline / space separated
      return trimmed.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    }
    return [];
  };

  const fetchAlarms = useCallback(async () => {
    if (!refreshing) setLoading(true);

    // Load hidden keys
    let hiddenSet = new Set<string>();
    try {
      const json = await AsyncStorage.getItem(HIDDEN_KEY);
      if (json) JSON.parse(json).forEach((k: string) => hiddenSet.add(k));
    } catch {}

    // FAST PATH: relational select via FK company_id → companies(id)
    let data: EmergencyRequest[] | null = null;
    let error: any = null;

    const fast = await supabase
      .from('emergency_service_requests')
      .select(
        `*,
         companies:company_id (
           company_name,
           service_address
         )`
      )
      .eq('completed_job', false)
      .order('created_at', { ascending: false });

    if (fast.error) {
      error = fast.error;
    } else {
      data = fast.data as EmergencyRequest[] | null;
    }

    // FALLBACK: name-based join emergency_service_requests.company → companies.company_name
    if (error || (data && data.some(r => r.company_id == null && !r.companies))) {
      const base = await supabase
        .from('emergency_service_requests')
        .select('*')
        .eq('completed_job', false)
        .order('created_at', { ascending: false });

      if (!base.error && base.data) {
        const rows = base.data as EmergencyRequest[];

        const names = Array.from(
          new Set(rows.map(r => (r.company ?? '').trim()).filter(Boolean))
        );

        let nameToCompany: Record<string, Company> = {};
        if (names.length) {
          const compRes = await supabase
            .from('companies')
            .select('id, company_name, service_address')
            .in('company_name', names);

          if (!compRes.error && compRes.data) {
            compRes.data.forEach((c: Company) => {
              nameToCompany[c.company_name] = c;
            });
          }
        }

        data = rows.map(r => {
          const c = r.company ? nameToCompany[r.company] : undefined;
          return c
            ? { ...r, companies: { company_name: c.company_name, service_address: c.service_address ?? null } }
            : r;
        });
      } else {
        error = base.error;
      }
    }

    if (data) {
      // attach display_images from image_url field
      const enriched = data.map(row => ({
        ...row,
        display_images: parseImageUrlField((row as any).image_url),
      }));
      const visible = enriched.filter(a => !hiddenSet.has(`emergency:${a.id}`));
      setAlarms(visible);
    }

    setLoading(false);
    setRefreshing(false);
  }, [refreshing]);

  useEffect(() => {
    loadCollapsed();
    fetchAlarms();

    const channel = supabase
      .channel('realtime:emergency_service_requests')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'emergency_service_requests' },
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
    const key = `emergency:${id}`;
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

  function isCollapsed(id: number) {
    return collapsedSet.has(`emergency:${id}`);
  }

  async function toggleCollapsed(id: number) {
    const key = `emergency:${id}`;
    const next = new Set(collapsedSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsedSet(next);
    await saveCollapsed(next);
  }

  const getServiceAddress = (row: EmergencyRequest) =>
    row.companies?.service_address ?? (row as any)['service_address'] ?? '—';

  // Open/close viewer
  const openViewer = (images: string[], index: number) => {
    if (!images?.length) return;
    setViewerImages(images);
    setViewerIndex(index);
    setViewerOpen(true);
  };
  const closeViewer = () => setViewerOpen(false);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollArea}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.header}>🚨 Emergency Requests</Text>

        {alarms.map((alarm) => {
          const collapsed = isCollapsed(alarm.id);
          return (
            <View key={alarm.id} style={styles.card}>
              {/* Collapse/Expand button (top-right) */}
              <TouchableOpacity
                style={styles.collapseBtn}
                onPress={() => toggleCollapsed(alarm.id)}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Text style={styles.collapseBtnText}>{collapsed ? '+' : '−'}</Text>
              </TouchableOpacity>

              {/* Always show title */}
              <Text style={styles.title}>{alarm.title || 'No Subject'}</Text>

              {/* If collapsed, stop here */}
              {collapsed ? null : (
                <>
                  {/* Thumbnails from image_url */}
                  {alarm.display_images?.length ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.imageRow}
                    >
                      {alarm.display_images.map((url, idx) => (
                        <TouchableOpacity key={idx} onPress={() => openViewer(alarm.display_images!, idx)}>
                          <Image source={{ uri: url }} style={styles.thumb} />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : null}

                  <Text style={styles.body}>{alarm.description || 'No Body'}</Text>
                  <Text style={styles.meta}>
                    Company: {alarm.companies?.company_name ?? alarm.company ?? '—'}
                  </Text>
                  <Text style={styles.meta}>Address: {getServiceAddress(alarm)}</Text>
                  <Text style={styles.meta}>Contact: {alarm.contact ?? '—'}</Text>
                  <Text style={styles.meta}>Phone Number: {alarm.phone_number ?? '—'}</Text>
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
                </>
              )}
            </View>
          );
        })}

        {!loading && alarms.length === 0 && (
          <Text style={styles.noData}>No emergency requests found.</Text>
        )}
      </ScrollView>

      {/* Full-screen image viewer */}
      <Modal
        visible={viewerOpen}
        animationType="fade"
        transparent
        onRequestClose={closeViewer}
      >
        <View style={styles.viewerBackdrop}>
          <FlatList
            data={viewerImages}
            horizontal
            pagingEnabled
            keyExtractor={(u, i) => `${i}-${u}`}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={viewerIndex}
            getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
                        onMomentumScrollEnd={(e) => {
                          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
                          setViewerIndex(idx);
                        }}
                        renderItem={({ item }) => (
                          <View style={{ width: SCREEN_W, height: SCREEN_H, alignItems: 'center', justifyContent: 'center' }}>
                            <Image source={{ uri: item }} style={styles.viewerImage} />
                          </View>
                        )}
                      />

          <View style={styles.viewerTopBar}>
            <TouchableOpacity onPress={closeViewer} style={styles.viewerCloseBtn} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Text style={styles.viewerCloseText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.viewerCounter}>
              {viewerIndex + 1} / {viewerImages.length}
            </Text>
          </View>
        </View>
      </Modal>
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
    position: 'relative',
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderColor: '#444',
    borderWidth: 1,
  },
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
    marginRight: 36, // space for collapse button
    marginBottom: 6,
  },
  imageRow: { marginTop: 8, marginBottom: 6 },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: '#1f1f1f',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#555',
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

  // Viewer styles
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.98)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: SCREEN_W,
    height: SCREEN_H,
    resizeMode: 'contain',
  },
  viewerTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 40, // allow for status bar
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewerCloseBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  viewerCloseText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  viewerCounter: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
