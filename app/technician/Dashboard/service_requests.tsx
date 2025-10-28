import BackButton from '@/components/BackButton';
import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const HIDDEN_KEY = 'hiddenServiceRequests';
const COLLAPSED_KEY = 'collapsedServiceRequests';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type ServiceRequest = {
  id: number;
  title?: string | null;
  description?: string | null;
  company?: string | null;
  contact?: string | null;
  phone_number?: string | null;
  created_at: string;
  image_url?: string | string[] | null;
  notes?: string | null;

  // NEW:
  tech_mark_complete?: boolean | null;
  tech_completed_by?: string | null;       // uuid
  tech_completed_by_name?: string | null;  // text

  // derived for UI
  display_images?: string[];
  display_notes?: string | null;
};

type SortField = 'created_at' | 'company' | 'title';
type SortDir = 'asc' | 'desc';

export default function ServiceRequestsScreen() {
  const router = useRouter();
  const goBack = () => router.back();

  const [alarms, setAlarms] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set()); // "service:<id>"

  // current user (for "completed by …")
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('Technician');

  // Search
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sort
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Full-screen viewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerImages, setViewerImages] = useState<string[]>([]);

  // ===== current user info =====
  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s?.session?.user?.id ?? null;
      setUserId(uid);

      if (uid) {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', uid)
          .maybeSingle();
        if (!error && data?.full_name) setUserName(data.full_name);
      }
    })();
  }, []);

  const loadCollapsed = useCallback(async () => {
    try {
      const json = await AsyncStorage.getItem(COLLAPSED_KEY);
      if (json) {
        const arr = JSON.parse(json) as string[];
        setCollapsedSet(new Set(arr));
      }
    } catch {}
  }, []);

  const saveCollapsed = useCallback(async (setVal: Set<string>) => {
    try {
      await AsyncStorage.setItem(COLLAPSED_KEY, JSON.stringify(Array.from(setVal)));
    } catch {}
  }, []);

  // Parse image_url into array of URLs
  const parseImageUrlField = (val: any): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(Boolean).map((s) => String(s).trim()).filter(Boolean);
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith('[')) {
        try {
          const arr = JSON.parse(trimmed);
          if (Array.isArray(arr)) return arr.filter(Boolean).map((s) => String(s).trim()).filter(Boolean);
        } catch {}
      }
      return trimmed.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    }
    return [];
  };

  // Normalize notes
  const normalizeNotes = (val?: string | null): string | null => {
    if (!val) return null;
    const text = String(val).replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
    return text.length ? text : null;
  };

  // Debounce search input (250ms)
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  const fetchAlarms = useCallback(async () => {
    if (!refreshing) setLoading(true);

    // Load hidden keys
    let hiddenSet = new Set<string>();
    try {
      const json = await AsyncStorage.getItem(HIDDEN_KEY);
      if (json) JSON.parse(json).forEach((k: string) => hiddenSet.add(k));
    } catch {}

    try {
      let queryBuilder = supabase
        .from('service_requests')
        .select('*')
        .eq('completed_job', false);

      if (debouncedQuery.length > 0) {
        const safe = debouncedQuery.replace(/[%_]/g, '\\$&');
        queryBuilder = queryBuilder.or(
          [
            `title.ilike.%${safe}%`,
            `description.ilike.%${safe}%`,
            `company.ilike.%${safe}%`,
            `contact.ilike.%${safe}%`,
            `phone_number.ilike.%${safe}%`,
            `notes.ilike.%${safe}%`,
          ].join(',')
        );
      }

      const orderCol =
        sortField === 'created_at'
          ? 'created_at'
          : sortField === 'company'
          ? 'company'
          : 'title';

      queryBuilder = queryBuilder.order(orderCol as any, {
        ascending: sortDir === 'asc',
      });

      const { data, error } = await queryBuilder;
      if (error) throw error;

      const withDerived = (data as ServiceRequest[]).map((r) => ({
        ...r,
        display_images: parseImageUrlField((r as any).image_url),
        display_notes: normalizeNotes((r as any).notes),
      }));
      const visible = withDerived.filter((r) => !hiddenSet.has(`service:${r.id}`));
      setAlarms(visible);
    } catch (e) {
      console.error('❌ fetchAlarms error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing, debouncedQuery, sortField, sortDir]);

  useEffect(() => {
    loadCollapsed();
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
  }, [fetchAlarms, loadCollapsed]);

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

  function isCollapsed(id: number) {
    return collapsedSet.has(`service:${id}`);
  }

  async function toggleCollapsed(id: number) {
    const key = `service:${id}`;
    const next = new Set(collapsedSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsedSet(next);
    await saveCollapsed(next);
  }

  // NEW: mark tech complete
  const [markingId, setMarkingId] = useState<number | null>(null);
  async function markTechDone(req: ServiceRequest) {
    if (!userId) {
      Alert.alert('Not signed in', 'You must be signed in to mark this as done.');
      return;
    }
    try {
      setMarkingId(req.id);
      const patch: any = {
        tech_mark_complete: true,
        tech_completed_by: userId,
        tech_completed_by_name: userName || 'Technician',
      };

      const { error } = await supabase
        .from('service_requests')
        .update(patch)
        .eq('id', req.id);
      if (error) throw error;

      await fetchAlarms();
    } catch (e: any) {
      console.error('markTechDone error', e);
      Alert.alert('Error', e?.message ?? 'Failed to update.');
    } finally {
      setMarkingId(null);
    }
  }

  // Viewer controls
  const openViewer = (images: string[], index: number) => {
    if (!images?.length) return;
    setViewerImages(images);
    setViewerIndex(index);
    setViewerOpen(true);
  };
  const closeViewer = () => setViewerOpen(false);

  const hasResults = useMemo(() => alarms.length > 0, [alarms]);

  return (
    <SafeAreaView style={styles.container}>
      <BackButton onPress={goBack} />
      <Text style={styles.header}>🔧 Service Requests</Text>

      {/* Search + Sort Row */}
      <View style={styles.toolbar}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search title, description, company, contact, notes..."
          placeholderTextColor="#9aa0a6"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort:</Text>
          <Chip
            label="Newest"
            active={sortField === 'created_at'}
            onPress={() => setSortField('created_at')}
          />
          <Chip
            label="Company"
            active={sortField === 'company'}
            onPress={() => setSortField('company')}
          />
          <Chip
            label="Title"
            active={sortField === 'title'}
            onPress={() => setSortField('title')}
          />
          <TouchableOpacity
            style={styles.dirBtn}
            onPress={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          >
            <Text style={styles.dirBtnText}>{sortDir.toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollArea}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {loading && !hasResults ? <Text style={styles.loadingText}>Loading…</Text> : null}

        {alarms.map((alarm) => {
          const collapsed = isCollapsed(alarm.id);
          const done = Boolean(alarm.tech_mark_complete);

          return (
            <View key={alarm.id} style={styles.card}>
              {/* Collapse/Expand button */}
              <TouchableOpacity
                style={styles.collapseBtn}
                onPress={() => toggleCollapsed(alarm.id)}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Text style={styles.collapseBtnText}>{collapsed ? '+' : '−'}</Text>
              </TouchableOpacity>

              {/* Completed badge (top-right, left of collapse) */}
              {done && (
                <View style={styles.doneBadge}>
                  <Text style={styles.doneBadgeText}>
                    ✓ {alarm.tech_completed_by_name ? `Done by ${alarm.tech_completed_by_name}` : 'Done'}
                  </Text>
                </View>
              )}

              {/* Title */}
              <Text style={styles.title}>{alarm.title || 'No Subject'}</Text>

              {/* Expanded body */}
              {collapsed ? null : (
                <>
                  {/* Images */}
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

                  <Text style={styles.meta}>Company: {alarm.company ?? '—'}</Text>
                  <Text style={styles.meta}>Contact: {alarm.contact ?? '—'}</Text>
                  <Text style={styles.meta}>Phone Number: {alarm.phone_number ?? '—'}</Text>
                  <Text style={styles.meta}>
                    Received: {new Date(alarm.created_at).toLocaleString()}
                  </Text>

                  {/* Notes */}
                  {alarm.display_notes ? (
                    <View style={styles.notesBox}>
                      <Text style={styles.notesLabel}>Notes</Text>
                      <Text style={styles.notesText}>{alarm.display_notes}</Text>
                    </View>
                  ) : null}

                  {/* Actions */}
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={[styles.doneButton, done && styles.doneButtonDisabled]}
                      disabled={done || markingId === alarm.id}
                      onPress={() => markTechDone(alarm)}
                    >
                      <Text style={styles.doneButtonText}>
                        {markingId === alarm.id ? 'Saving…' : done ? 'Done' : 'Mark Done'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.hideButton} onPress={() => hideAlarm(alarm.id)}>
                      <Text style={styles.hideButtonText}>Hide</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          );
        })}

        {!loading && alarms.length === 0 && (
          <Text style={styles.noData}>No service requests found.</Text>
        )}
      </ScrollView>

      {/* Full-screen image viewer */}
      <Modal visible={viewerOpen} animationType="fade" transparent onRequestClose={closeViewer}>
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

/** ---------- Small UI bits ---------- */
function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[chipStyles.chip, active && chipStyles.chipActive]}>
      <Text style={[chipStyles.chipText, active && chipStyles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#4b4b4b',
    backgroundColor: '#1b1b1b',
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#2d6cdf',
    borderColor: '#2d6cdf',
  },
  chipText: { fontSize: 12, color: '#cfcfcf' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
});

/** ---------- Styles ---------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollArea: { padding: 16, paddingBottom: 80 },
  header: { fontSize: theme.fontSize.lg, fontWeight: '700', color: '#fff', marginBottom: 12, textAlign: 'center' },

  toolbar: { marginBottom: 14, gap: 10 },
  searchInput: {
    backgroundColor: '#1e1f22',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  sortRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  sortLabel: { color: '#c7c7c7', marginRight: 6, marginLeft: 15, fontWeight: '600' },
  dirBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#404040',
    marginLeft: 15,
  },
  dirBtnText: { color: '#fff', fontWeight: '700' },

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
  collapseBtnText: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 18 },

  // Completed badge (top-right, left of collapse)
  doneBadge: {
    position: 'absolute',
    top: 10,
    right: 48, // leave room for collapse button
    backgroundColor: '#14532d',
    borderColor: '#16a34a',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  doneBadgeText: { color: '#dcfce7', fontSize: 11, fontWeight: '700' },

  title: { fontSize: 16, fontWeight: '600', color: '#fff', marginRight: 36, marginBottom: 6 },
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
  body: { fontSize: 14, color: '#ddd', marginBottom: 6 },

  // Notes styles
  notesBox: {
    marginTop: 6,
    marginBottom: 6,
    padding: 10,
    backgroundColor: '#242628',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  notesLabel: { color: '#c9d1d9', fontWeight: '700', marginBottom: 4 },
  notesText: { color: '#e6edf3', lineHeight: 20 },

  meta: { fontSize: 12, color: '#aaa', marginTop: 2 },

  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  hideButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.colors.error,
    borderRadius: 6,
  },
  hideButtonText: { color: '#fff', fontWeight: '600' },

  // Mark Done button
  doneButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#16a34a',
    borderRadius: 6,
  },
  doneButtonDisabled: { opacity: 0.6 },
  doneButtonText: { color: '#fff', fontWeight: '700' },

  noData: { fontSize: 16, color: '#999', textAlign: 'center', marginTop: 40 },
  loadingText: { color: '#bdbdbd', marginBottom: 8 },

  // Viewer styles
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.98)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: { width: SCREEN_W, height: SCREEN_H, resizeMode: 'contain' },
  viewerTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 40,
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
