// app/handler/PartsManager.tsx
import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const HIDDEN_KEY = 'hiddenparts';
const COLLAPSED_KEY = 'collapsedPartsRequests';
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type PartsRequest = {
  id: number;
  title?: string | null;
  description?: string | null;
  company?: string | null;
  company_id?: string | number | null;
  contact?: string | null;
  phone_number?: string | null;
  created_at: string;
  taken_care_of?: boolean | null;
  ordered?: boolean | null;
  ordered_at?: string | null;
  image_url?: string | string[] | null;
  companies?: { company_name?: string | null; service_address?: string | null } | null;

  display_images?: string[]; // derived for UI
};

type Company = {
  id: string | number;
  company_name: string;
  service_address?: string | null;
};

type SortField = 'created_at' | 'company' | 'title';
type SortDir = 'asc' | 'desc';

export default function PartsManager() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [items, setItems] = useState<PartsRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // search (debounced)
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // sort
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set());

  // image viewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerImages, setViewerImages] = useState<string[]>([]);

  const goBack = () => router.back();

  // --- utils ---
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

  const getServiceAddress = (row: PartsRequest) =>
    row.companies?.service_address ?? (row as any)['service_address'] ?? '—';

  // --- persisted UI state ---
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

  function isCollapsed(id: number) {
    return collapsedSet.has(`parts:${id}`);
  }

  async function toggleCollapsed(id: number) {
    const key = `parts:${id}`;
    const next = new Set(collapsedSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsedSet(next);
    await saveCollapsed(next);
  }

  // --- search debounce ---
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  // --- data fetch ---
  const fetchItems = useCallback(async () => {
    if (!refreshing) setLoading(true);

    // hidden
    let hiddenSet = new Set<string>();
    try {
      const json = await AsyncStorage.getItem(HIDDEN_KEY);
      if (json) JSON.parse(json).forEach((k: string) => hiddenSet.add(k));
    } catch {}

    // map sort fields to joined/base columns
    const orderColJoin =
      sortField === 'created_at'
        ? 'created_at'
        : sortField === 'company'
        ? 'companies.company_name'
        : 'title';
    const orderColBase =
      sortField === 'created_at'
        ? 'created_at'
        : sortField === 'company'
        ? 'company'
        : 'title';

    const buildSearch = (qb: any) => {
      if (debouncedQuery.length === 0) return qb;
      const safe = debouncedQuery.replace(/[%_]/g, '\\$&');
      return qb.or(
        [
          `title.ilike.%${safe}%`,
          `description.ilike.%${safe}%`,
          `company.ilike.%${safe}%`,
          `contact.ilike.%${safe}%`,
          `phone_number.ilike.%${safe}%`,
        ].join(',')
      );
    };

    let data: PartsRequest[] | null = null;

    // 1) fast: joined select
    let fastQ = buildSearch(
      supabase
        .from('parts_requests')
        .select(
          `*,
           companies:company_id (
             company_name,
             service_address
           )`
        )
        .eq('taken_care_of', false)
        // TS may not like the dot-path column type; cast is fine.
        .order(orderColJoin as any, { ascending: sortDir === 'asc' })
    );

    const fastRes = await fastQ;
    if (fastRes.error) {
      // 2) fallback if join failed or mixed data
      let baseQ = buildSearch(
        supabase
          .from('parts_requests')
          .select('*')
          .eq('taken_care_of', false)
          .order(orderColBase as any, { ascending: sortDir === 'asc' })
    );
      const baseRes = await baseQ;
      if (!baseRes.error && baseRes.data) {
        const rows = baseRes.data as PartsRequest[];
        const names = Array.from(new Set(rows.map((r) => (r.company ?? '').trim()).filter(Boolean)));

        let nameToCompany: Record<string, Company> = {};
        if (names.length) {
          const compRes = await supabase
            .from('companies')
            .select('id, company_name, service_address')
            .in('company_name', names);
          if (!compRes.error && compRes.data) {
            compRes.data.forEach((c: Company) => (nameToCompany[c.company_name] = c));
          }
        }

        data = rows.map((r) => {
          const c = r.company ? nameToCompany[r.company] : undefined;
          return c
            ? { ...r, companies: { company_name: c.company_name, service_address: c.service_address ?? null } }
            : r;
        });
      }
    } else {
      data = (fastRes.data as PartsRequest[]) ?? null;

      // if any row lacks company info and no company_id, do the same fallback enrichment
      if (data && data.some((r) => r.company_id == null && !r.companies)) {
        let baseQ = buildSearch(
          supabase
            .from('parts_requests')
            .select('*')
            .eq('taken_care_of', false)
            .order(orderColBase as any, { ascending: sortDir === 'asc' })
        );
        const baseRes = await baseQ;
        if (!baseRes.error && baseRes.data) {
          const rows = baseRes.data as PartsRequest[];
          const names = Array.from(new Set(rows.map((r) => (r.company ?? '').trim()).filter(Boolean)));

          let nameToCompany: Record<string, Company> = {};
          if (names.length) {
            const compRes = await supabase
              .from('companies')
              .select('id, company_name, service_address')
              .in('company_name', names);
            if (!compRes.error && compRes.data) {
              compRes.data.forEach((c: Company) => (nameToCompany[c.company_name] = c));
            }
          }

          data = rows.map((r) => {
            const c = r.company ? nameToCompany[r.company] : undefined;
            return c
              ? { ...r, companies: { company_name: c.company_name, service_address: c.service_address ?? null } }
              : r;
          });
        }
      }
    }

    if (data) {
      const enriched = data.map((row) => ({
        ...row,
        display_images: parseImageUrlField(row.image_url),
      }));
      const visible = enriched.filter((a) => !hiddenSet.has(`parts:${a.id}`));
      setItems(visible);
    }

    setLoading(false);
    setRefreshing(false);
  }, [refreshing, sortField, sortDir, debouncedQuery]);

  useEffect(() => {
    loadCollapsed();
    fetchItems();

    const channel = supabase
      .channel('realtime:parts_requests')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'parts_requests' }, fetchItems)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'parts_requests' }, fetchItems)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchItems, loadCollapsed]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchItems();
  }, [fetchItems]);

  // --- actions (manager controls) ---
  const markOrdered = async (id: number) => {
    // optimistic
    setItems((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ordered: true, ordered_at: new Date().toISOString() } : r))
    );

    const { error } = await supabase
      .from('parts_requests')
      .update({ ordered: true, ordered_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      Alert.alert('Error', error.message);
      setItems((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ordered: false, ordered_at: null } : r))
      );
    } else {
      fetchItems();
    }
  };

  const markTakenCareOf = async (id: number) => {
    // optimistic remove
    const prev = items;
    setItems((cur) => cur.filter((r) => r.id !== id));

    const { error } = await supabase
      .from('parts_requests')
      .update({ taken_care_of: true })
      .eq('id', id);

    if (error) {
      Alert.alert('Error', error.message);
      setItems(prev); // revert
    } else {
      fetchItems();
    }
  };

  // --- image viewer ---
  const openViewer = (images: string[], index: number) => {
    if (!images?.length) return;
    setViewerImages(images);
    setViewerIndex(index);
    setViewerOpen(true);
  };
  const closeViewer = () => setViewerOpen(false);

  const hasResults = useMemo(() => items.length > 0, [items]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      <ScrollView
        contentContainerStyle={styles.scrollArea}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.header}>🔩 Parts Requests (Handler)</Text>

        {/* Search + Sort */}
        <View style={styles.toolbar}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search title, description, company, contact, phone..."
            placeholderTextColor="#9aa0a6"
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          <View style={styles.sortRow}>
            <Text style={styles.sortLabel}>Sort:</Text>
            <Chip label="Newest"  active={sortField === 'created_at'} onPress={() => setSortField('created_at')} />
            <Chip label="Company" active={sortField === 'company'}    onPress={() => setSortField('company')} />
            <Chip label="Title"   active={sortField === 'title'}      onPress={() => setSortField('title')} />
            <TouchableOpacity style={styles.dirBtn} onPress={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
              <Text style={styles.dirBtnText}>{sortDir.toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading && !hasResults ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 12 }} />
        ) : null}

        {items.map((row) => {
          const collapsed = isCollapsed(row.id);
          const isOrdered = !!row.ordered;
          const orderedDate = row.ordered_at ? new Date(row.ordered_at).toLocaleString() : null;

          return (
            <View key={row.id} style={styles.card}>
              {/* Collapse toggle */}
              <TouchableOpacity
                style={styles.collapseBtn}
                onPress={() => toggleCollapsed(row.id)}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Text style={styles.collapseBtnText}>{collapsed ? '+' : '−'}</Text>
              </TouchableOpacity>

              {/* Title */}
              <Text style={styles.title}>{row.title || 'No Subject'}</Text>

              {/* Ordered badge */}
              {!collapsed && (
                <View style={[styles.badge, isOrdered ? styles.badgeOrdered : styles.badgePending]}>
                  <Text style={styles.badgeText}>
                    {isOrdered ? (orderedDate ? `Ordered • ${orderedDate}` : 'Ordered') : 'Not ordered'}
                  </Text>
                </View>
              )}

              {collapsed ? null : (
                <>
                  {/* Thumbnails */}
                  {row.display_images?.length ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
                      {row.display_images.map((url, idx) => (
                        <TouchableOpacity key={idx} onPress={() => openViewer(row.display_images!, idx)}>
                          <Image source={{ uri: url }} style={styles.thumb} />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : null}

                  {/* Body + meta */}
                  <Text style={styles.body}>{row.description || 'No description'}</Text>
                  <Text style={styles.meta}>Company: {row.companies?.company_name ?? row.company ?? '—'}</Text>
                  <Text style={styles.meta}>Address: {getServiceAddress(row)}</Text>
                  <Text style={styles.meta}>Contact: {row.contact ?? '—'}</Text>
                  <Text style={styles.meta}>Phone: {row.phone_number ?? '—'}</Text>
                  <Text style={styles.meta}>Submitted: {new Date(row.created_at).toLocaleString()}</Text>

                  {/* Actions: merge of both pages */}
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={[styles.button, isOrdered ? styles.buttonDisabled : styles.buttonPrimary]}
                      onPress={() => !isOrdered && markOrdered(row.id)}
                      disabled={isOrdered}
                    >
                      <Text style={[styles.buttonText, isOrdered ? styles.buttonTextDisabled : styles.buttonTextPrimary]}>
                        {isOrdered ? '✓ Ordered' : 'Mark as Ordered'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => markTakenCareOf(row.id)}>
                      <Text style={styles.removeText}>✕ Taken Care Of</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          );
        })}

        {!loading && items.length === 0 && (
          <Text style={styles.noData}>No parts requests found.</Text>
        )}
      </ScrollView>

      {/* full-screen image viewer */}
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
            <Text style={styles.viewerCounter}>{viewerIndex + 1} / {viewerImages.length}</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** ---------- Small UI chip ---------- */
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
  header: { fontSize: theme.fontSize.lg, fontWeight: '700', color: '#fff', marginTop: 30, marginBottom: 12 },

  // back fab
  backFab: {
    position: 'absolute',
    left: 12,
    top: 8,
    zIndex: 10,
    elevation: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
  },
  backFabText: { color: theme.colors.textOnPrimary, fontWeight: '700' },

  // search/sort
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
  sortLabel: { color: '#c7c7c7', marginRight: 6, fontWeight: '600' },
  dirBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#404040',
    marginLeft: 'auto',
  },
  dirBtnText: { color: '#fff', fontWeight: '700' },

  // card
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
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#3a3a3a',
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#555',
    zIndex: 3, elevation: 3,
  },
  collapseBtnText: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 18 },

  title: { fontSize: 16, fontWeight: '600', color: '#fff', marginRight: 36, marginBottom: 6 },

  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 6,
  },
  badgeOrdered: { backgroundColor: '#d9f8e6' },
  badgePending: { backgroundColor: '#fde8d9' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#1a1a1a' },

  imageRow: { marginTop: 4, marginBottom: 6 },
  thumb: {
    width: 72, height: 72, borderRadius: 8, marginRight: 8,
    backgroundColor: '#1f1f1f', borderWidth: StyleSheet.hairlineWidth, borderColor: '#555',
  },

  body: { fontSize: 14, color: '#ddd', marginBottom: 6 },
  meta: { fontSize: 12, color: '#aaa', marginTop: 2 },

  actionsRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  button: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  buttonPrimary: { backgroundColor: theme.colors.primary },
  buttonDisabled: { backgroundColor: '#e1e1e1' },
  buttonText: { fontSize: 14, fontWeight: '600' },
  buttonTextPrimary: { color: theme.colors.textOnPrimary },
  buttonTextDisabled: { color: theme.colors.muted },

  removeText: { fontSize: 13, color: theme.colors.error, textDecorationLine: 'underline' },

  noData: { fontSize: 16, color: '#999', textAlign: 'center', marginTop: 40 },

  // viewer
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.98)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: { width: SCREEN_W, height: SCREEN_H, resizeMode: 'contain' },
  viewerTopBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    paddingTop: 40,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewerCloseBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  viewerCloseText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  viewerCounter: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
