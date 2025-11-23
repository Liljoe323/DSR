// app/handler/ServiceReports.tsx
import { supabase } from "@/lib/supabase";
import { format, parseISO } from "date-fns";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ServiceReport = {
  id: string | number;
  po: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
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
  description_notes?: string | null;
  ready_for_billing?: boolean | null;
  additional_tech?: string | null;

  // Robot
  box1_problem?: string | null;
  box2_problem?: string | null;
  box3_problem?: string | null;

  // Refrigeration
  head_pressure?: string | null;
  suction_pressure?: string | null;
  compressor_amp?: string | null;
  system_amp?: string | null;
  condenser_temp?: string | null;
  product_temp?: string | null;
};

type SubKey = "refrigeration" | "robot" | "none";
type MainKey = "Dairy Solutions" | "Dick Soule";

const PAGE_SIZE = 50;

/** Column widths (px). */
const COLS = {
  dsol: 90,
  billing: 120,
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
  robot1: 220,
  robot2: 220,
  robot3: 220,
  head: 120,
  suction: 120,
  comp: 120,
  system: 120,
  cond: 120,
  prod: 120,
};

type ColKey = keyof typeof COLS;

const TABLE_WIDTH =
  COLS.dsol +
  COLS.billing +
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
  COLS.follow +
  COLS.robot1 +
  COLS.robot2 +
  COLS.robot3 +
  COLS.head +
  COLS.suction +
  COLS.comp +
  COLS.system +
  COLS.cond +
  COLS.prod;

// Helpers
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

  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) {
      return arr
        .map((x) => (x == null ? "" : String(x)))
        .map((x) => x.trim())
        .filter(Boolean)
        .join("\n");
    }
  } catch {
    // not JSON
  }

  s = s.replace(/\\n|\/n/gi, "\n");
  s = s.replace(/^\s*\[+\s*|\s*\]+\s*$/g, "");

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

// Column configs
const BASE_COL_DEFS: { key: ColKey; label: string }[] = [
  { key: "dsol", label: "DSOL" },
  { key: "billing", label: "Ready" },
  { key: "customer", label: "Customer" },
  { key: "po", label: "PO" },
  { key: "description", label: "Description" },
  { key: "invoice", label: "QB Invoice" },
  { key: "technician", label: "Technician(s)" },
  { key: "date", label: "Date" },
  { key: "start", label: "Start" },
  { key: "end", label: "End" },
  { key: "location", label: "Job Location" },
  { key: "materials", label: "Materials" },
];

const FOLLOW_COL_DEF: { key: ColKey; label: string } = {
  key: "follow",
  label: "Follow-Up",
};

const ROBOT_COL_DEFS: { key: ColKey; label: string }[] = [
  { key: "robot1", label: "Box 1" },
  { key: "robot2", label: "Box 2" },
  { key: "robot3", label: "Box 3" },
];

const REFRIG_COL_DEFS: { key: ColKey; label: string }[] = [
  { key: "head", label: "Head" },
  { key: "suction", label: "Suction" },
  { key: "comp", label: "Comp Amp" },
  { key: "system", label: "Sys Amp" },
  { key: "cond", label: "Cond Temp" },
  { key: "prod", label: "Prod Temp" },
];

function getColumnDefsForSub(sub: SubKey) {
  let cols = [...BASE_COL_DEFS];
  if (sub === "robot") cols = cols.concat(ROBOT_COL_DEFS);
  if (sub === "refrigeration") cols = cols.concat(REFRIG_COL_DEFS);
  // Follow-up always last
  cols = cols.concat(FOLLOW_COL_DEF);
  return cols;
}

export default function HandlerServiceReports() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

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
              "ready_for_billing",
              "additional_tech",
              "box1_problem",
              "box2_problem",
              "box3_problem",
              "head_pressure",
              "suction_pressure",
              "compressor_amp",
              "system_amp",
              "condenser_temp",
              "product_temp",
            ].join(",")
          )
          .is("merged_at", null)
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

  const normalized = useMemo(
    () =>
      items.map((r) => ({
        ...r,
        _is_dsol: typeof (r as any).is_dsol === "boolean" ? (r as any).is_dsol : null,
      })),
    [items]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return normalized;
    return normalized.filter((r) => {
      const fields = [
        r.customer_name ?? "",
        r.technician_name ?? "",
        r.additional_tech ?? "",
        r.materials_used ?? "",
        r.job_location ?? "",
        r.box1_problem ?? "",
        r.box2_problem ?? "",
        r.box3_problem ?? "",
        r.head_pressure ?? "",
        r.suction_pressure ?? "",
        r.compressor_amp ?? "",
        r.system_amp ?? "",
        r.condenser_temp ?? "",
        r.product_temp ?? "",
        String(r.QB_Invoice ?? ""),
        String(r.id ?? ""),
      ].map((s) => s.toLowerCase());
      return fields.some((f) => f.includes(q));
    });
  }, [normalized, query]);

  const sections = useMemo(() => {
    const dsolCounts = { refrigeration: 0, robot: 0, none: 0 };
    const nonCounts = { refrigeration: 0, robot: 0, none: 0 };

    const buckets: Record<MainKey, Record<SubKey, ServiceReport[]>> = {
      "Dairy Solutions": { refrigeration: [], robot: [], none: [] },
      "Dick Soule": { refrigeration: [], robot: [], none: [] },
    };

    for (const r of filtered as Array<ServiceReport & { _is_dsol?: boolean }>) {
      const main: MainKey = r._is_dsol ? "Dairy Solutions" : "Dick Soule";
      const sub: SubKey = r.is_refrigeration
        ? "refrigeration"
        : r.is_robot
        ? "robot"
        : "none";
      buckets[main][sub].push(r);
      if (main === "Dairy Solutions") dsolCounts[sub]++; else nonCounts[sub]++;
    }

    const totalDSOL = dsolCounts.refrigeration + dsolCounts.robot + dsolCounts.none;
    const totalNon = nonCounts.refrigeration + nonCounts.robot + nonCounts.none;

    const make = (
      main: MainKey,
      sub: SubKey,
      showMain: boolean,
      mainCount: number
    ) => ({
      key: `${main}-${sub}`,
      title:
        sub === "refrigeration"
          ? "Refrigeration Report"
          : sub === "robot"
          ? "Robot Report"
          : "Simple Report",
      main,
      sub,
      showMain,
      mainCount,
      data: buckets[main][sub],
    });

    return [
      // Dairy Solutions: all three sections
      make("Dairy Solutions", "refrigeration", true, totalDSOL),
      make("Dairy Solutions", "robot", false, totalDSOL),
      make("Dairy Solutions", "none", false, totalDSOL),

      // Dick Soule: refrigeration + simple only (NO robot)
      make("Dick Soule", "refrigeration", true, totalNon),
      // NO robot section here
      make("Dick Soule", "none", false, totalNon),
    ];
  }, [filtered]);

  const needsHorizontalScroll = width < TABLE_WIDTH;

  const renderHeaderRow = (sub: SubKey) => {
    const cols = getColumnDefsForSub(sub);
    return (
      <View style={[styles.tableHeaderRow, { width: TABLE_WIDTH }]}>
        {cols.map((col) => (
          <Text key={col.key} style={[styles.th, { width: COLS[col.key] }]}>
            {col.label}
          </Text>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Service Reports</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by customer, technician, additional tech, materials, location, invoice…"
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
      ) : needsHorizontalScroll ? (
        <ScrollView
          horizontal
          bounces={false}
          contentContainerStyle={{ width: TABLE_WIDTH }}
        >
          <SectionList
            sections={sections}
            keyExtractor={(item) => String(item.id)}
            stickySectionHeadersEnabled
            onEndReachedThreshold={0.25}
            onEndReached={onEndReached}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
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
                  {renderHeaderRow(section.sub as SubKey)}
                </View>
              </View>
            )}
            renderItem={({ item, section }) => (
              <Row report={item as any} sub={section.sub as SubKey} />
            )}
            ListFooterComponent={
              paging ? (
                <View style={{ paddingVertical: 16 }}>
                  <ActivityIndicator />
                </View>
              ) : null
            }
          />
        </ScrollView>
      ) : (
        <View style={{ flex: 1, alignItems: "center" }}>
          <SectionList
            style={{ flex: 1 }}
            sections={sections}
            keyExtractor={(item) => String(item.id)}
            stickySectionHeadersEnabled
            onEndReachedThreshold={0.25}
            onEndReached={onEndReached}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            contentContainerStyle={{
              paddingBottom: insets.bottom + 96,
              width: TABLE_WIDTH,
            }}
            renderSectionHeader={({ section }) => (
              <View style={{ width: TABLE_WIDTH }}>
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
                  {renderHeaderRow(section.sub as SubKey)}
                </View>
              </View>
            )}
            renderItem={({ item, section }) => (
              <View style={{ width: TABLE_WIDTH }}>
                <Row report={item as any} sub={section.sub as SubKey} />
              </View>
            )}
            ListFooterComponent={
              paging ? (
                <View style={{ paddingVertical: 16 }}>
                  <ActivityIndicator />
                </View>
              ) : null
            }
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function Row({
  report,
  sub,
}: {
  report: ServiceReport & { _is_dsol?: boolean | null };
  sub: SubKey;
}) {
  const [customerName, setCustomerName] = useState(report.customer_name ?? "");
  const [poText, setPoText] = useState((report.po ?? "").trim());
  const [description, setDescription] = useState(report.description_notes ?? "");
  const [invoice, setInvoice] = useState(
    report.QB_Invoice === null || report.QB_Invoice === undefined ? "" : String(report.QB_Invoice)
  );
  const [technicianName, setTechnicianName] = useState(report.technician_name ?? "");

  const [dateText, setDateText] = useState(() => {
    const s = asDateString(report.date, "yyyy-MM-dd HH:mm");
    return s === "—" ? "" : s;
  });
  const [startText, setStartText] = useState(() => {
    const s = asDateString(report.start_time, "yyyy-MM-dd HH:mm");
    return s === "—" ? "" : s;
  });
  const [endText, setEndText] = useState(() => {
    const s = asDateString(report.end_time, "yyyy-MM-dd HH:mm");
    return s === "—" ? "" : s;
  });

  const [location, setLocation] = useState(report.job_location ?? "");
  const [materialsText, setMaterialsText] = useState(() => {
    const m = formatMaterials(report.materials_used);
    return m === "—" ? "" : m;
  });
  const [followUp, setFollowUp] = useState(!!report.follow_up_needed);

  const [isDsol, setIsDsol] = useState<boolean>(!!(report._is_dsol ?? report.is_dsol));
  const [readyForBilling, setReadyForBilling] = useState<boolean>(
    !!report.ready_for_billing
  );

  const [savingField, setSavingField] = useState<string | null>(null);

  const nulled = (s: string) => {
    const trimmed = s.trim();
    return trimmed === "" ? null : trimmed;
  };

  const saveField = async (
    fieldKey: string,
    column: keyof ServiceReport,
    value: any,
    originalValue: any
  ) => {
    if (value === originalValue) return;

    try {
      setSavingField(fieldKey);
      const patch: any = { [column]: value };
      const { error } = await supabase
        .from("service_reports")
        .update(patch)
        .eq("id", report.id);
      if (error) throw error;
    } catch (e: any) {
      Alert.alert("Save failed", String(e?.message ?? e));
    } finally {
      setSavingField((prev) => (prev === fieldKey ? null : prev));
    }
  };

  const isRobot = !!report.is_robot;
  const isRefrig = !!report.is_refrigeration;

  const cols = getColumnDefsForSub(sub);

  const renderCell = (key: ColKey) => {
    switch (key) {
      case "dsol":
        return (
          <View
            key="dsol"
            style={{ width: COLS.dsol, alignItems: "center", justifyContent: "center" }}
          >
            <Switch
              value={isDsol}
              onValueChange={(next) => {
                setIsDsol(next);
                saveField("is_dsol", "is_dsol", next, report.is_dsol ?? false);
              }}
            />
            {savingField === "is_dsol" && (
              <Text style={styles.savingText}>Saving…</Text>
            )}
          </View>
        );

      case "billing":
        return (
          <View
            key="billing"
            style={{ width: COLS.billing, alignItems: "center", justifyContent: "center" }}
          >
            <Pressable
              onPress={() => {
                const next = !readyForBilling;
                setReadyForBilling(next);
                saveField(
                  "ready_for_billing",
                  "ready_for_billing",
                  next,
                  report.ready_for_billing ?? false
                );
              }}
              style={styles.checkboxRow}
            >
              <View
                style={[
                  styles.checkboxBox,
                  readyForBilling && styles.checkboxBoxChecked,
                ]}
              >
                {readyForBilling && <View style={styles.checkboxCheck} />}
              </View>
              <Text style={styles.checkboxLabel}></Text>
            </Pressable>
            {savingField === "ready_for_billing" && (
              <Text style={styles.savingText}>Saving…</Text>
            )}
          </View>
        );

      case "customer":
        return (
          <View key="customer" style={{ width: COLS.customer }}>
            <TextInput
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="Customer"
              style={[styles.cellInput, styles.multiCell]}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              onBlur={() =>
                saveField(
                  "customer_name",
                  "customer_name",
                  nulled(customerName),
                  report.customer_name
                )
              }
            />
            {savingField === "customer_name" && (
              <Text style={styles.savingText}>Saving…</Text>
            )}
          </View>
        );

      case "po":
        return (
          <View key="po" style={{ width: COLS.po }}>
            <TextInput
              value={poText}
              onChangeText={setPoText}
              placeholder="PO"
              style={styles.cellInput}
              onBlur={() => saveField("po", "po", nulled(poText), report.po)}
            />
            {savingField === "po" && <Text style={styles.savingText}>Saving…</Text>}
          </View>
        );

      case "description":
        return (
          <View key="description" style={{ width: COLS.description }}>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Description"
              style={[styles.cellInput, styles.descriptionInput]}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              onBlur={() =>
                saveField(
                  "description_notes",
                  "description_notes",
                  nulled(description),
                  report.description_notes
                )
              }
            />
            {savingField === "description_notes" && (
              <Text style={styles.savingText}>Saving…</Text>
            )}
          </View>
        );

      case "invoice":
        return (
          <View key="invoice" style={{ width: COLS.invoice }}>
            <TextInput
              value={invoice}
              onChangeText={setInvoice}
              placeholder="Enter #"
              keyboardType="number-pad"
              returnKeyType="done"
              style={styles.cellInput}
              onBlur={() =>
                saveField(
                  "QB_Invoice",
                  "QB_Invoice",
                  nulled(invoice),
                  report.QB_Invoice ?? null
                )
              }
            />
            {savingField === "QB_Invoice" && (
              <Text style={styles.savingText}>Saving…</Text>
            )}
          </View>
        );

      case "technician":
        return (
          <View key="technician" style={{ width: COLS.technician }}>
            <TextInput
              value={technicianName}
              onChangeText={setTechnicianName}
              placeholder="Technician"
              style={[styles.cellInput, styles.multiCell]}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              onBlur={() =>
                saveField(
                  "technician_name",
                  "technician_name",
                  nulled(technicianName),
                  report.technician_name
                )
              }
            />
            {report.additional_tech ? (
              <Text style={[styles.cellInput, styles.multiCell]}>
                {report.additional_tech}
              </Text>
            ) : null}
            {savingField === "technician_name" && (
              <Text style={styles.savingText}>Saving…</Text>
            )}
          </View>
        );

      case "date":
        return (
          <View key="date" style={{ width: COLS.date }}>
            <TextInput
              value={dateText}
              onChangeText={setDateText}
              placeholder="yyyy-MM-dd"
              style={styles.cellInput}
              onBlur={() => saveField("date", "date", nulled(dateText), report.date)}
            />
            {savingField === "date" && <Text style={styles.savingText}>Saving…</Text>}
          </View>
        );

      case "start":
        return (
          <View key="start" style={{ width: COLS.start }}>
            <TextInput
              value={startText}
              onChangeText={setStartText}
              placeholder="Start"
              style={styles.cellInput}
              onBlur={() =>
                saveField("start_time", "start_time", nulled(startText), report.start_time)
              }
            />
            {savingField === "start_time" && (
              <Text style={styles.savingText}>Saving…</Text>
            )}
          </View>
        );

      case "end":
        return (
          <View key="end" style={{ width: COLS.end }}>
            <TextInput
              value={endText}
              onChangeText={setEndText}
              placeholder="End"
              style={styles.cellInput}
              onBlur={() =>
                saveField("end_time", "end_time", nulled(endText), report.end_time)
              }
            />
            {savingField === "end_time" && (
              <Text style={styles.savingText}>Saving…</Text>
            )}
          </View>
        );

      case "location":
        return (
          <View key="location" style={{ width: COLS.location }}>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Job Location"
              style={[styles.cellInput, styles.locationInput]}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              onBlur={() =>
                saveField(
                  "job_location",
                  "job_location",
                  nulled(location),
                  report.job_location
                )
              }
            />
            {savingField === "job_location" && (
              <Text style={styles.savingText}>Saving…</Text>
            )}
          </View>
        );

      case "materials":
        return (
          <View key="materials" style={{ width: COLS.materials }}>
            <TextInput
              value={materialsText}
              onChangeText={setMaterialsText}
              placeholder="Materials"
              style={[styles.cellInput, styles.materialsInput]}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              onBlur={() =>
                saveField(
                  "materials_used",
                  "materials_used",
                  nulled(materialsText),
                  report.materials_used
                )
              }
            />
            {savingField === "materials_used" && (
              <Text style={styles.savingText}>Saving…</Text>
            )}
          </View>
        );

      case "follow":
        return (
          <View
            key="follow"
            style={{ width: COLS.follow, alignItems: "flex-start" }}
          >
            <Pressable
              onPress={() => {
                const next = !followUp;
                setFollowUp(next);
                saveField(
                  "follow_up_needed",
                  "follow_up_needed",
                  next,
                  report.follow_up_needed ?? false
                );
              }}
            >
              <FollowBadge ok={followUp} />
            </Pressable>
            {savingField === "follow_up_needed" && (
              <Text style={styles.savingText}>Saving…</Text>
            )}
          </View>
        );

      // Robot (view-only)
      case "robot1":
        return (
          <View key="robot1" style={{ width: COLS.robot1 }}>
            <Text style={styles.valueCell}>
              {isRobot ? (report.box1_problem ?? "") : ""}
            </Text>
          </View>
        );
      case "robot2":
        return (
          <View key="robot2" style={{ width: COLS.robot2 }}>
            <Text style={styles.valueCell}>
              {isRobot ? (report.box2_problem ?? "") : ""}
            </Text>
          </View>
        );
      case "robot3":
        return (
          <View key="robot3" style={{ width: COLS.robot3 }}>
            <Text style={styles.valueCell}>
              {isRobot ? (report.box3_problem ?? "") : ""}
            </Text>
          </View>
        );

      // Refrigeration (view-only)
      case "head":
        return (
          <View key="head" style={{ width: COLS.head }}>
            <Text style={styles.valueCell}>
              {isRefrig ? (report.head_pressure ?? "") : ""}
            </Text>
          </View>
        );
      case "suction":
        return (
          <View key="suction" style={{ width: COLS.suction }}>
            <Text style={styles.valueCell}>
              {isRefrig ? (report.suction_pressure ?? "") : ""}
            </Text>
          </View>
        );
      case "comp":
        return (
          <View key="comp" style={{ width: COLS.comp }}>
            <Text style={styles.valueCell}>
              {isRefrig ? (report.compressor_amp ?? "") : ""}
            </Text>
          </View>
        );
      case "system":
        return (
          <View key="system" style={{ width: COLS.system }}>
            <Text style={styles.valueCell}>
              {isRefrig ? (report.system_amp ?? "") : ""}
            </Text>
          </View>
        );
      case "cond":
        return (
          <View key="cond" style={{ width: COLS.cond }}>
            <Text style={styles.valueCell}>
              {isRefrig ? (report.condenser_temp ?? "") : ""}
            </Text>
          </View>
        );
      case "prod":
        return (
          <View key="prod" style={{ width: COLS.prod }}>
            <Text style={styles.valueCell}>
              {isRefrig ? (report.product_temp ?? "") : ""}
            </Text>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={[styles.tr, { width: TABLE_WIDTH }]}>
      {cols.map((c) => renderCell(c.key))}
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
      <Text style={[styles.badgeText, { color: ok ? "#166534" : "#374151" }]}>
        {ok ? "Needed" : "No"}
      </Text>
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

  cellInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  multiCell: {
    minHeight: 40,
  },
  descriptionInput: {
    minHeight: 60,
  },
  locationInput: {
    minHeight: 50,
  },
  materialsInput: {
    minHeight: 80,
  },

  savingText: {
    marginTop: 2,
    fontSize: 11,
    color: "#6B7280",
  },

  valueCell: {
    fontSize: 12,
    color: "#111827",
  },

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

  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#9CA3AF",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  checkboxBoxChecked: {
    borderColor: "#16A34A",
    backgroundColor: "#DCFCE7",
  },
  checkboxCheck: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: "#16A34A",
  },
  checkboxLabel: {
    fontSize: 12,
    color: "#111827",
    fontWeight: "600",
  },
});
