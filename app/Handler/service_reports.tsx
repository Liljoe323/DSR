// app/handler/ServiceReports.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  RefreshControl,
  Pressable,
  ScrollView,
  Alert,
} from "react-native";
import { supabase } from "@/lib/supabase";
import { format, parseISO } from "date-fns";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ServiceReport = {
  id: string | number;
  po: string | null;
  date: string; // ISO string (job date)
  start_time: string | null; // ISO or time string
  end_time: string | null;   // ISO or time string
  job_location: string | null;
  company_id: number | null;
  customer_name: string | null;
  technician_id: string | null;
  technician_name: string | null;
  materials_used: string | null;
  follow_up_needed: boolean | null;
  QB_Invoice: string | number | null;
  is_refrigeration?: boolean | null;
  is_robot?: boolean | null;
  is_dsol?: boolean | null;
};

type SubKey = "refrigeration" | "robot" | "none";
type MainKey = "Dairy Solutions" | "Dick Soule";

const PAGE_SIZE = 50;


/** Column widths (px). */
const COLS = {
  customer: 220,
  po: 180,
  description: 300,
  invoice: 140,
  technician: 200,
  date: 140,
  start: 120,
  end: 120,
  location: 260,
  materials: 400,
  follow: 120,
};
const TABLE_WIDTH =
  COLS.customer +
  COLS.po +
  COLS.description +
  COLS.invoice +
  COLS.technician +
  COLS.date +
  COLS.start +
  COLS.end +
  COLS.location +
  COLS.materials +
  COLS.follow;

// --- Helpers ---
function asDateString(isoLike: string | null | undefined, fmt = "yyyy-MM-dd HH:mm") {
  if (!isoLike) return "—";
  try {
    const d = isoLike.match(/T|Z|\d{2}:\d{2}/) ? new Date(isoLike) : parseISO(String(isoLike));
    if (isNaN(d.getTime())) return String(isoLike);
    return format(d, fmt);
  } catch {
    return String(isoLike);
  }
}


function formatMaterials(raw: string | null | undefined): string {
  if (!raw) return "—";
  let s = String(raw).trim();

  // Try to parse JSON array first (e.g., '["A","B"]')
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) {
      return arr
        .map((x) => (x == null ? "" : String(x)))
        .map((x) => x.trim())
        .filter(Boolean)
        .join("\n");
    }
  } catch (_) {
    // not JSON; continue
  }

  // Replace either literal "\\n" or "/n" with real newlines
  s = s.replace(/\\n|\/n/gi, "\n");

  // Strip surrounding square brackets if present
  s = s.replace(/^\s*\[+\s*|\s*\]+\s*$/g, "");

  // If it looks like a comma-separated list, split to lines
  if (s.includes(",")) {
    s = s
      .split(",")
      .map((p) => p.trim().replace(/^\"+|\"+$/g, ""))
      .filter(Boolean)
      .join("\n");
  }

  s = s.replace(/^\"+|\"+$/g, "").trim();
  return s.length ? s : "—";
}

export default function HandlerServiceReports() {
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<ServiceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const fromRef = useRef(0);
  const [hasMore, setHasMore] = useState(true);
  const [paging, setPaging] = useState(false);

  const fetchPage = useCallback(
    async (reset = false) => {
      try {
        setError(null);
        if (reset) {
          fromRef.current = 0;
          setHasMore(true);
        }
        if (!hasMore && !reset) return;

        const from = fromRef.current;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await supabase
          .from("service_reports")
          .select(
            [
              "id",
              "date",
              "start_time",
              "end_time",
              "job_location",
              "company_id",
              "customer_name",
              "technician_id",
              "technician_name",
              "materials_used",
              "follow_up_needed",
              "QB_Invoice",
              "is_refrigeration",
              "is_robot",
              "is_dsol",
              "po",
              "description_notes",
            ].join(",")
          )
          .is("QB_Invoice", null)      
          .order("date", { ascending: false })
          .range(from, to);

        if (error) throw error;

        const next = reset ? (data ?? []) : [...items, ...(data ?? [])];
        setItems(next);

        if (!data || data.length < PAGE_SIZE) {
          setHasMore(false);
        } else {
          fromRef.current = to + 1;
        }
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
        setPaging(false);
      }
    },
    [items, hasMore]
  );

  useEffect(() => {
    fetchPage(true);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPage(true);
  }, [fetchPage]);

  const onEndReached = useCallback(() => {
    if (!loading && !paging && hasMore) {
      setPaging(true);
      fetchPage(false);
    }
  }, [loading, paging, hasMore, fetchPage]);

  // Normalize DSOL flag to _is_dsol (boolean | null)
  const normalized = useMemo(
    () =>
      items.map((r) => ({
        ...r,
        _is_dsol: typeof (r as any).is_dsol === "boolean" ? (r as any).is_dsol : null,
      })),
    [items]
  );

  // Client-side search (now includes invoice + job_location)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return normalized;
    return normalized.filter((r) => {
      const fields = [
        r.customer_name ?? "",
        r.technician_name ?? "",
        r.materials_used ?? "",
        r.job_location ?? "",
        String(r.QB_Invoice ?? ""),
        String(r.id ?? ""),
      ].map((s) => s.toLowerCase());
      return fields.some((f) => f.includes(q));
    });
  }, [normalized, query]);

  // Build sections: "Dairy Solutions" vs "Dick Soule" → Refrigeration / Robot / No Flags
  const sections = useMemo(() => {
    const dsolCounts = { refrigeration: 0, robot: 0, none: 0 };
    const nonCounts = { refrigeration: 0, robot: 0, none: 0 };

    const buckets: Record<MainKey, Record<SubKey, ServiceReport[]>> = {
      "Dairy Solutions": { refrigeration: [], robot: [], none: [] },
      "Dick Soule": { refrigeration: [], robot: [], none: [] },
    };

    for (const r of filtered as Array<ServiceReport & { _is_dsol?: boolean }>) {
      const main: MainKey = r._is_dsol ? "Dairy Solutions" : "Dick Soule";
      const sub: SubKey = r.is_refrigeration ? "refrigeration" : r.is_robot ? "robot" : "none";
      buckets[main][sub].push(r);
      if (main === "Dairy Solutions") dsolCounts[sub]++; else nonCounts[sub]++;
    }

    const totalDSOL = dsolCounts.refrigeration + dsolCounts.robot + dsolCounts.none;
    const totalNon = nonCounts.refrigeration + nonCounts.robot + nonCounts.none;

    const make = (main: MainKey, sub: SubKey, showMain: boolean, mainCount: number) => ({
      key: `${main}-${sub}`,
      title: sub === "refrigeration" ? "Refrigeration Report" : sub === "robot" ? "Robot Report" : "Simple Report",
      main,
      showMain,
      mainCount,
      data: buckets[main][sub],
    });

    return [
      make("Dairy Solutions", "refrigeration", true, totalDSOL),
      make("Dairy Solutions", "robot", false, totalDSOL),
      make("Dairy Solutions", "none", false, totalDSOL),
      make("Dick Soule", "refrigeration", true, totalNon),
      make("Dick Soule", "robot", false, totalNon),
      make("Dick Soule", "none", false, totalNon),
    ];
  }, [filtered]);

  return (
    <SafeAreaView style={[styles.root, { paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Service Reports</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by customer, technician, materials, location, invoice…"
          style={styles.search}
          placeholderTextColor="#9CA3AF"
        />
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>Error: {error}</Text>
          <Pressable onPress={() => fetchPage(true)} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.muted}>Loading reports…</Text>
        </View>
      ) : (
        <ScrollView horizontal bounces={false} contentContainerStyle={{ width: TABLE_WIDTH }}>
          <SectionList
            sections={sections}
            keyExtractor={(item) => String(item.id)}
            stickySectionHeadersEnabled
            onEndReachedThreshold={0.25}
            onEndReached={onEndReached}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
            renderSectionHeader={({ section }) => (
              <View>
                {section.showMain && (
                  <View style={styles.mainBanner}>
                    <Text style={styles.mainBannerTitle}>{section.main}</Text>
                    <View style={styles.mainBadge}>
                      <Text style={styles.mainBadgeText}>{section.mainCount}</Text>
                    </View>
                  </View>
                )}

                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <View style={[styles.tableHeaderRow, { width: TABLE_WIDTH }]}>
                    <Text style={[styles.th, { width: COLS.customer }]}>Customer</Text>
                    <Text style={[styles.th, { width: COLS.po }]}>PO</Text>  
                    <Text style={[styles.th, { width: COLS.description }]}>Description</Text>
                    <Text style={[styles.th, { width: COLS.invoice }]}>QB Invoice</Text>
                    <Text style={[styles.th, { width: COLS.technician }]}>Technician</Text>
                    <Text style={[styles.th, { width: COLS.date }]}>Date</Text>
                    <Text style={[styles.th, { width: COLS.start }]}>Start</Text>
                    <Text style={[styles.th, { width: COLS.end }]}>End</Text>
                    <Text style={[styles.th, { width: COLS.location }]}>Job Location</Text>
                    <Text style={[styles.th, { width: COLS.materials }]}>Materials</Text>
                    <Text style={[styles.th, { width: COLS.follow }]}>Follow-Up</Text>
                  </View>
                </View>
              </View>
            )}
            renderItem={({ item }) => <Row report={item} />}
            ListFooterComponent={
              paging ? (
                <View style={{ paddingVertical: 16 }}>
                  <ActivityIndicator />
                </View>
              ) : null
            }
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Row({ report }: { report: ServiceReport & { _is_dsol?: boolean | null } }) {
  const [invoice, setInvoice] = useState(
    report.QB_Invoice === null || report.QB_Invoice === undefined ? "" : String(report.QB_Invoice)
  );
  const [saving, setSaving] = useState(false);

  const po = (report.po ?? "").trim() || "—";
  const date = asDateString(report.date, "yyyy-MM-dd");
  const start = asDateString(report.start_time, "HH:mm");
  const end = asDateString(report.end_time, "HH:mm");
  const materials = formatMaterials(report.materials_used);

  const saveInvoice = async () => {
    if ((report.QB_Invoice ?? "") === (invoice.trim() || "")) return;
    try {
      setSaving(true);
      const { error } = await supabase
        .from("service_reports")
        .update({ QB_Invoice: invoice.trim() === "" ? null : invoice.trim() })
        .eq("id", report.id);
      if (error) throw error;
    } catch (e: any) {
      Alert.alert("Save failed", String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.tr, { width: TABLE_WIDTH }]}> 
      <Text style={[styles.td, { width: COLS.customer }]}>{report.customer_name ?? "—"}</Text>
      <Text style={[styles.td, { width: COLS.po }]}>{po}</Text>
      <Text style={[styles.td, { width: COLS.description }]}>{report.description_notes}</Text>
     <View style={[styles.td, { width: COLS.invoice }]}>
  <TextInput
    value={invoice}
    onChangeText={setInvoice}
    placeholder="Enter #"
    keyboardType="number-pad"
    returnKeyType="done"
    // Save when the field loses focus:
    onBlur={() => saveInvoice(invoice)}
    // Keep these if you still want Enter to trigger save as well:
    onEndEditing={() => saveInvoice(invoice)}
    onSubmitEditing={() => saveInvoice(invoice)}
    style={styles.invoiceInput}
  />
  {saving ? <Text style={styles.savingText}>Saving…</Text> : null}
</View>

      <Text style={[styles.td, { width: COLS.technician }]}>{report.technician_name ?? "—"}</Text>
      <Text style={[styles.td, { width: COLS.date }]}>{date}</Text>
      <Text style={[styles.td, { width: COLS.start }]}>{start}</Text>
      <Text style={[styles.td, { width: COLS.end }]}>{end}</Text>
      <Text style={[styles.td, { width: COLS.location }]}>{report.job_location ?? "—"}</Text>

      <View style={[styles.td, { width: COLS.materials }]}> 
        <Text>{materials}</Text>
      </View>

      <View style={[styles.td, { width: COLS.follow }]}>
        <FollowBadge ok={!!report.follow_up_needed} />
      </View>
    </View>
  );
}

function FollowBadge({ ok }: { ok: boolean }) {
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: ok ? "#DCFCE7" : "#F3F4F6", borderColor: ok ? "#16A34A" : "#9CA3AF" },
      ]}
    >
      <Text style={[styles.badgeText, { color: ok ? "#166534" : "#374151" }]}>{ok ? "Needed" : "No"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  header: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  title: { fontSize: 20, fontWeight: "700", color: "#111827" },
  search: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#111827",
  },

  // Main group banner
  mainBanner: {
    backgroundColor: "#111827",
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mainBannerTitle: { color: "white", fontWeight: "800", fontSize: 16 },
  mainBadge: {
    marginLeft: 8,
    backgroundColor: "#1F2937",
    borderColor: "#374151",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  mainBadgeText: { color: "#E5E7EB", fontWeight: "700", fontSize: 12 },

  // Section header
  sectionHeader: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#111827", marginBottom: 6 },
  tableHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 6,
  },
  th: { fontSize: 12, fontWeight: "700", color: "#4B5563" },

  // Row
  tr: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  td: { fontSize: 13, color: "#111827" },

  // Invoice input
  invoiceInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  savingText: { marginTop: 4, fontSize: 11, color: "#6B7280" },

  // Misc
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 16 },
  muted: { color: "#6B7280" },
  error: { color: "#B91C1C", fontWeight: "600" },
  retry: {
    marginTop: 8,
    backgroundColor: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retryText: { color: "white", fontWeight: "600" },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: { fontSize: 12, fontWeight: "700" },
});
