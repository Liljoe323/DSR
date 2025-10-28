// app/manager/BillableHours.tsx
import { supabase } from "@/lib/supabase";
import theme from "@/styles/theme";
import { useNavigation } from "expo-router";
import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import BackButton from '@/components/BackButton';
import { useRouter } from 'expo-router';

type Row = {
  day: string;        // 'YYYY-MM-DD'
  full_name: string;  // technician name
  hours: number;      // decimal hours (from the view)
};

const router = useRouter();
  const goBack = () => router.back();

export default function BillableHours() {
  const navigation = useNavigation();
  const [isManager, setIsManager] = useState<boolean | null>(null);
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6); // last 7 days inclusive
    return d;
  });
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) { setIsManager(false); return; }

      const { data, error } = await supabase
        .from("profiles")
        .select("is_manager")
        .eq("id", uid)
        .maybeSingle();

      if (error) {
        console.warn("Failed to fetch manager status:", error.message);
        setIsManager(false);
        return;
      }
      setIsManager(Boolean(data?.is_manager));
    })();
  }, []);

  const fetchHours = async () => {
    try {
      const from = startDate.toISOString().slice(0, 10);
      const to = endDate.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("daily_technician_hours_view")
        .select("*")
        .gte("day", from)
        .lte("day", to)
        .order("day", { ascending: true })
        .order("full_name", { ascending: true });

      if (error) throw error;
      setRows((data as any[]) as Row[]);
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", e.message ?? "Could not load billable hours.");
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchHours();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchHours();
    setRefreshing(false);
  };


  
  // ----- Derived groupings & totals
  const { byDay, byTech, grandTotal } = useMemo(() => {
    const byDay: Record<string, Row[]> = {};
    const byTech: Record<string, number> = {};
    let grand = 0;

    for (const r of rows) {
      if (!byDay[r.day]) byDay[r.day] = [];
      byDay[r.day].push(r);

      byTech[r.full_name] = (byTech[r.full_name] ?? 0) + (Number(r.hours) || 0);
      grand += Number(r.hours) || 0;
    }

    // Sort inner lists by name
    Object.keys(byDay).forEach((d) => byDay[d].sort((a, b) =>
      a.full_name.localeCompare(b.full_name)
    ));

    return { byDay, byTech, grandTotal: grand };
  }, [rows]);

  // ----- Render helpers
  const formatDate = (d: Date) => d.toISOString().slice(0, 10);
  const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

  if (loading || isManager === null) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (!isManager) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.noAccessTitle}>Managers only</Text>
        <Text style={styles.noAccessText}>
          You don’t have permission to view billable hours.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    
    <SafeAreaView style={styles.container}>
        
      <BackButton style={styles.backButton} onPress={goBack} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text style={styles.title}>Billable Hours</Text>

        {/* Date range */}
        <View style={styles.row}>
          <View style={styles.dateBox}>
            <Text style={styles.label}>Start</Text>
            <TouchableOpacity
              onPress={() => setShowStartPicker(true)}
              style={styles.datePill}
            >
              <Text style={styles.dateText}>{formatDate(startDate)}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.dateBox}>
            <Text style={styles.label}>End</Text>
            <TouchableOpacity
              onPress={() => setShowEndPicker(true)}
              style={styles.datePill}
            >
              <Text style={styles.dateText}>{formatDate(endDate)}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {showStartPicker && (
          <DateTimePicker
            value={startDate}
            mode="date"
            display={Platform.OS === "ios" ? "default" : "default"}
            onChange={(_, d) => {
              setShowStartPicker(false);
              if (d) setStartDate(d);
            }}
          />
        )}
        {showEndPicker && (
          <DateTimePicker
            value={endDate}
            mode="date"
            display={Platform.OS === "ios" ? "default" : "default"}
            onChange={(_, d) => {
              setShowEndPicker(false);
              if (d) setEndDate(d);
            }}
          />
        )}

        {/* Grand Total */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Grand Total</Text>
          <Text style={styles.bigNumber}>{fmt(grandTotal)} hrs</Text>
        </View>

        {/* Totals by Technician */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>By Technician</Text>
          {Object.keys(byTech).length === 0 ? (
            <Text style={styles.empty}>No data in range.</Text>
          ) : (
            Object.entries(byTech)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([name, hrs]) => (
                <View key={name} style={styles.line}>
                  <Text style={styles.lineLeft}>{name || "(no name)"}</Text>
                  <Text style={styles.lineRight}>{fmt(hrs)} hrs</Text>
                </View>
              ))
          )}
        </View>

        {/* Totals by Day (with tech breakdown) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>By Day</Text>
          {Object.keys(byDay).length === 0 ? (
            <Text style={styles.empty}>No data in range.</Text>
          ) : (
            Object.keys(byDay).map((d) => {
              const total = byDay[d].reduce((acc, r) => acc + (Number(r.hours) || 0), 0);
              return (
                <View key={d} style={styles.dayBlock}>
                  <View style={styles.dayHeader}>
                    <Text style={styles.dayTitle}>{d}</Text>
                    <Text style={styles.dayTotal}>{fmt(total)} hrs</Text>
                  </View>
                  {byDay[d].map((r) => (
                    <View key={`${d}-${r.full_name}`} style={styles.line}>
                      <Text style={styles.lineLeft}>{r.full_name || "(no name)"}</Text>
                      <Text style={styles.lineRight}>{fmt(Number(r.hours) || 0)} hrs</Text>
                    </View>
                  ))}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { paddingBottom: 40, paddingHorizontal: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
backButton: {
    marginTop: 15,
  },
  title: { fontSize: 24, fontWeight: "700", color: "#fff", marginTop: 25, textAlign: 'center',
   },
  subtitle: { color: "#bbb", marginBottom: 12 },

  row: { flexDirection: "row", gap: 12, marginBottom: 12, marginTop: 6 },
  dateBox: { flex: 1 },
  label: { color: "#ccc", marginBottom: 6 },
  datePill: {
    backgroundColor: "#2a2a2a",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#444",
  },
  dateText: { color: "#fff", fontWeight: "600" },

  card: {
    backgroundColor: "#1f1f1f",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#333",
    padding: 12,
    marginBottom: 12,
  },
  cardTitle: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 8 },
  bigNumber: { color: "#fff", fontSize: 28, fontWeight: "800" },

  empty: { color: "#9a9a9a", paddingVertical: 6 },

  line: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomColor: "#333",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lineLeft: { color: "#eee", flex: 1 },
  lineRight: { color: "#fff", fontWeight: "700", marginLeft: 8 },

  dayBlock: { marginBottom: 6 },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
    marginTop: 4,
  },
  dayTitle: { color: "#fff", fontWeight: "700" },
  dayTotal: { color: "#fff", fontWeight: "800" },
});
