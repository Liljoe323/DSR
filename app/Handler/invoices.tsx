// app/Handler/invoices.tsx
import { supabase } from '@/lib/supabase';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const IIF_FUNCTION_NAME = 'QB--IIF-Export';
const MERGE_FUNCTION_NAME = 'invoice-report-merge';
const SR_TABLE = 'service_reports';
const QB_INVOICE_COL = 'QB_Invoice';

// NEW: your storage bucket name must match the Edge Function’s BUCKET_OUTPUT
const OUTPUT_BUCKET = 'invoices';

type StoredFile = {
  name: string;
  path: string;     // includes folder prefix if any (e.g., "debug/raw-DSR.docx")
  size?: number | null;
  updated_at?: string | null;
  url?: string;     // signed or public URL
  isDebug?: boolean;
};

export default function InvoicesScreen() {
  const [exporting, setExporting] = useState(false);
  const [merging, setMerging] = useState(false);

  // Debug states
  const [preflighting, setPreflighting] = useState(false);
  const [reportIdForPreflight, setReportIdForPreflight] = useState<string>("");

  // NEW: file list states
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const getFunctionUrl = (fnName: string) => {
    const base = (supabase as any).supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!base) throw new Error('Supabase URL not found. Set EXPO_PUBLIC_SUPABASE_URL or expose supabaseUrl.');
    return `${base}/functions/v1/${fnName}`;
  };

  // ---------------- IIF EXPORT (unchanged) ----------------
  const exportAllUnexported = async () => {
    try {
      setExporting(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const url = `${getFunctionUrl(IIF_FUNCTION_NAME)}?mark=1`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      });

      const text = await res.text();
      if (!res.ok) throw new Error(text || `Export failed (${res.status})`);

      if (text.trim().startsWith('No reports to export')) {
        Alert.alert('Nothing to export', 'All service reports are already exported.');
        return;
      }

      const filename = `invoices_${Date.now()}.iif`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/plain', dialogTitle: 'Export .IIF' });
      } else {
        Alert.alert('Exported', `Saved to app documents as ${filename}.`);
      }
    } catch (e: any) {
      Alert.alert('Export error', e?.message ?? 'Failed to export .IIF');
    } finally {
      setExporting(false);
    }
  };

  // ---------------- MERGE QB-INVOICED REPORTS ----------------
  async function fetchReportIdsWithQBInvoice(): Promise<string[]> {
    const { data, error } = await supabase
      .from(SR_TABLE)
      .select(`id, ${QB_INVOICE_COL}`)
      .not(QB_INVOICE_COL, 'is', null)
      .neq(QB_INVOICE_COL, '');
    if (error) throw error;

    return (data ?? [])
      .filter((r: any) => String(r[QB_INVOICE_COL] ?? '').trim().length > 0)
      .map((r: any) => r.id as string);
  }

  // ---------- Debug: Preflight/Diagnostics ----------
  const runPreflight = async (reportId: string) => {
    try {
      setPreflighting(true);
      const url  = getFunctionUrl(MERGE_FUNCTION_NAME);
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({ report_ids: [reportId], preflight: true }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(typeof json === 'string' ? json : JSON.stringify(json, null, 2));
      Alert.alert('Preflight', JSON.stringify(json, null, 2));
    } catch (e:any) {
      Alert.alert('Preflight error', e.message ?? String(e));
    } finally {
      setPreflighting(false);
    }
  };

  const runPreflightLatestQB = async () => {
    try {
      setPreflighting(true);
      const ids = await fetchReportIdsWithQBInvoice();
      if (!ids.length) {
        Alert.alert('No matches', 'No service reports have a QB_Invoice number.');
        return;
      }
      await runPreflight(ids[0]);
    } finally {
      setPreflighting(false);
    }
  };

  const mergeQBInvoicedReports = async () => {
    try {
      setMerging(true);

      const reportIds = await fetchReportIdsWithQBInvoice();
      if (!reportIds.length) {
        Alert.alert('No matches', 'No service reports have a QB_Invoice number.');
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const url = getFunctionUrl(MERGE_FUNCTION_NAME);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({ report_ids: reportIds }),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || `Merge failed (${res.status})`);
      }

      const payload = await res.json();
      const files = (payload?.files ?? []) as Array<{ report_id: string; template_used?: string; file: string; url?: string }>;

      if (!files.length) {
        Alert.alert('No documents created', 'The merge completed but returned no files.');
        return;
      }

      // Offer to open first file, then refresh listing
      const count = files.length;
      const firstUrl = files[0]?.url;

      if (firstUrl) {
        Alert.alert(
          'Merge complete',
          `Created ${count} document${count > 1 ? 's' : ''}.\nOpen the first one now?`,
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Open', onPress: () => Linking.openURL(firstUrl) }]
        );
      } else {
        Alert.alert('Merge complete', `Created ${count} document${count > 1 ? 's' : ''}.`);
      }

      await loadInvoiceFiles(); // NEW: refresh list after merging
    } catch (e: any) {
      Alert.alert('Merge error', e?.message ?? 'Failed to generate documents.');
    } finally {
      setMerging(false);
    }
  };

  // ---------------- NEW: List files from the invoices bucket ----------------
  const signedUrlFor = async (path: string): Promise<string | undefined> => {
    // Try signed (private buckets)
    const { data, error } = await supabase.storage.from(OUTPUT_BUCKET).createSignedUrl(path, 3600);
    if (!error && data?.signedUrl) return data.signedUrl;

    // Fallback to public URL (if bucket is public)
    const pub = supabase.storage.from(OUTPUT_BUCKET).getPublicUrl(path);
    return pub?.data?.publicUrl;
  };

  const listAtPrefix = async (prefix = '') => {
    // sort by updated_at desc; limit to 100 at a time (adjust as needed or paginate)
    const { data, error } = await supabase.storage.from(OUTPUT_BUCKET).list(prefix, {
      limit: 100,
      offset: 0,
      sortBy: { column: 'updated_at', order: 'desc' },
    });
    if (error) throw error;

    return (data ?? [])
      .filter((it) => it.name && !it.name.endsWith('/')) // ignore folder placeholders
      .map((it) => ({
        name: it.name,
        path: prefix ? `${prefix}/${it.name}` : it.name,
        size: it.metadata?.size ?? null,
        updated_at: it.updated_at ?? null,
        isDebug: prefix === 'debug',
      })) as StoredFile[];
  };

  const loadInvoiceFiles = useCallback(async () => {
    try {
      setLoadingFiles(true);
      const [root, debug] = await Promise.all([listAtPrefix(''), listAtPrefix('debug')]);

      // Attach URLs
      const all = [...root, ...debug];
      const withUrls = await Promise.all(
        all.map(async (f) => ({ ...f, url: await signedUrlFor(f.path) }))
      );

      // Sort newest first by updated_at (fallback: by name desc)
      withUrls.sort((a, b) => {
        const at = a.updated_at ? Date.parse(a.updated_at) : 0;
        const bt = b.updated_at ? Date.parse(b.updated_at) : 0;
        if (bt !== at) return bt - at;
        return (b.name || '').localeCompare(a.name || '');
      });

      setFiles(withUrls);
    } catch (e: any) {
      Alert.alert('List error', e?.message ?? 'Could not list invoice files.');
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInvoiceFiles();
    setRefreshing(false);
  }, [loadInvoiceFiles]);

  const openFile = async (url?: string) => {
    if (!url) {
      Alert.alert('No URL', 'Could not generate a link for this file.');
      return;
    }
    Linking.openURL(url);
  };

  

  // Call this once via a button (explicit), or you can auto-load if you prefer.
  useEffect(() => { loadInvoiceFiles(); }, []);

  // -------------- UI --------------
  const renderFile = ({ item }: { item: StoredFile }) => {
    const subtitleParts = [];
    if (item.updated_at) subtitleParts.push(new Date(item.updated_at).toLocaleString());
    if (item.size) subtitleParts.push(`${(item.size / 1024).toFixed(1)} KB`);
    if (item.isDebug) subtitleParts.push('debug');
    const subtitle = subtitleParts.join(' • ');

    return (
      <View style={styles.fileRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fileName}>{item.name}</Text>
          {!!subtitle && <Text style={styles.fileMeta}>{subtitle}</Text>}
        </View>
        <TouchableOpacity style={styles.fileBtn} onPress={() => openFile(item.url)}>
          <Ionicons name="open-outline" size={18} color="#fff" />
          <Text style={styles.fileBtnText}>Open</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Invoices</Text>
      {/*<Text style={styles.sub}>
        Export .IIF for QuickBooks, generate Word documents, and browse existing files.
      </Text>*/}

      {/* Export Unexported (.IIF) */}
      {/*<TouchableOpacity style={[styles.button, exporting && { opacity: 0.7 }]} onPress={exportAllUnexported} disabled={exporting}>
        {exporting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="download-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>Export Reports not Entered in QB (.IIF)</Text>
          </>
        )}
      </TouchableOpacity>*/}

      {/* Merge QB-Invoiced Reports */}
      <TouchableOpacity style={[styles.button, styles.secondary, merging && { opacity: 0.7 }]} onPress={mergeQBInvoicedReports} disabled={merging}>
        {merging ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="document-text-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>Merge QB-Invoiced Reports</Text>
          </>
        )}
      </TouchableOpacity>

      {/* ---------- NEW: Files in invoices bucket ---------- */}
      <View style={styles.hintBox}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.hintTitle}>Generated Documents (invoices bucket)</Text>
          <TouchableOpacity style={styles.smallBtn} onPress={loadInvoiceFiles} disabled={loadingFiles}>
            {loadingFiles ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.smallBtnText}>Refresh</Text>}
          </TouchableOpacity>
        </View>

        {files.length === 0 && !loadingFiles ? (
          <Text style={styles.hintText}>No files found yet. Generate some, then tap Refresh.</Text>
        ) : (
          <FlatList
            data={files}
            keyExtractor={(it) => it.path}
            renderItem={renderFile}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            style={{ marginTop: 8 }}
          />
        )}
      </View>

      
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  header: { fontSize: 22, fontWeight: '800', marginBottom: 4, marginTop: 45, textAlign: 'center' },
  sub: { color: '#444', marginBottom: 8 },
  button: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2f6feb',
    paddingVertical: 14,
    borderRadius: 12,
  },
  secondary: { backgroundColor: '#0f915a' },
  buttonText: { color: '#fff', fontWeight: '800' },

  // Files list
  hintBox: { marginTop: 12, backgroundColor: '#F5F7FF', borderRadius: 10, padding: 12 },
  hintTitle: { fontWeight: '800', marginBottom: 6 },
  hintText: { color: '#444' },

  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
  },
  fileName: { fontWeight: '700', marginBottom: 2 },
  fileMeta: { color: '#666', fontSize: 12 },
  fileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2f6feb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  fileBtnAlt: { backgroundColor: '#6b5aed' },
  fileBtnText: { color: '#fff', fontWeight: '800' },

  // Debug
  debugBox: {
    marginTop: 14,
    backgroundColor: '#FFF9EF',
    borderRadius: 10,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#FFE1B3',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'white',
  },
  debugButton: {
    flex: 1,
    backgroundColor: '#6b5aed',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  debugButtonAlt: {
    flex: 1,
    backgroundColor: '#8b5cf6',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  debugButtonText: { color: '#fff', fontWeight: '800', textAlign: 'center' },

  smallBtn: {
    backgroundColor: '#2f6feb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallBtnText: { color: '#fff', fontWeight: '800' },
});
