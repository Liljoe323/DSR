// app/technician/Reports.tsx
import { supabase } from "@/lib/supabase";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DropDownPicker from "react-native-dropdown-picker";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

type SortKey = "date" | "start_time" | "end_time";
type SortDir = "asc" | "desc";
type FollowFilter = "all" | "yes" | "no";

export default function TechnicianReports() {
  const insets = useSafeAreaInsets();
  const bottomPad = (insets?.bottom ?? 0) + 24;

  const [companies, setCompanies] = useState<{ label: string; value: string }[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [service_address, setServiceAddress] = useState<string>("");

  // Filters / sort / search
  const [search, setSearch] = useState("");
  const [follow, setFollow] = useState<FollowFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Companies
  useEffect(() => {
    supabase
      .from("companies")
      .select("id, company_name")
      .order("company_name", { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setCompanies((data ?? []).map((c) => ({ label: c.company_name, value: String(c.id) })));
      });
  }, []);

  // Reports (server-side follow + sort)
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    let q = supabase
      .from("service_reports")
      .select(
        "id, job_location, date, start_time, end_time, description_notes, follow_up_needed, companies(company_name), profiles(full_name), po"
      )
      .eq("company_id", companyId)
      .order(sortKey, { ascending: sortDir === "asc" });

    if (follow === "yes") q = q.eq("follow_up_needed", true);
    if (follow === "no") q = q.eq("follow_up_needed", false);

    q.then(({ data, error }) => {
      if (error) console.error(error);
      setReports(data ?? []);
    }).finally(() => setLoading(false));
  }, [companyId, follow, sortKey, sortDir]);

  // Address (header)
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    supabase
      .from("companies")
      .select("service_address")
      .eq("id", companyId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) throw error;
        setServiceAddress(data?.service_address ?? "");
      })
      .catch((e) => {
        console.error("service_address load error:", e);
        setServiceAddress("");
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  // Client-side search (PO, notes, tech, location)
  const filteredReports = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return reports;
    return reports.filter((r) => {
      const hay = [r.po, r.description_notes, r.job_location, r.profiles?.full_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [reports, search]);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <FlatList
        data={filteredReports}
        keyExtractor={(r) => String(r.id)}
        ListHeaderComponent={
          <Header
            open={open}
            setOpen={setOpen}
            companyId={companyId}
            setCompanyId={setCompanyId}
            companies={companies}
            setCompanies={setCompanies}
            service_address={service_address}
            loading={loading}
            search={search}
            setSearch={setSearch}
            follow={follow}
            setFollow={setFollow}
            sortKey={sortKey}
            setSortKey={setSortKey}
            sortDir={sortDir}
            setSortDir={setSortDir}
          />
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.container, { paddingBottom: bottomPad }]}
        renderItem={({ item: r }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{r.po ?? "(no PO)"}</Text>
            <Text>Tech: {r.profiles?.full_name}</Text>
            <Text>{r.date}</Text>
            <Text>{r.start_time} → {r.end_time}</Text>
            {!!r.job_location && <Text>{r.job_location}</Text>}
            {!!r.description_notes && <Text>Notes: {r.description_notes}</Text>}
            {r.follow_up_needed && <Text style={{ color: "red" }}>Follow-up required</Text>}
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={{ padding: 24 }}>
              <Text style={{ textAlign: "center", color: "#666" }}>
                {companyId ? "No reports match your filters." : "Select a customer to view reports."}
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

/** ---- Stable header component so TextInput keeps focus ---- */
const Header = React.memo(function Header({
  open,
  setOpen,
  companyId,
  setCompanyId,
  companies,
  setCompanies,
  service_address,
  loading,
  search,
  setSearch,
  follow,
  setFollow,
  sortKey,
  setSortKey,
  sortDir,
  setSortDir,
}: any) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Service History</Text>

      <View style={{ zIndex: 10 }}>
        <DropDownPicker
          open={open}
          value={companyId}
          items={companies}
          setOpen={setOpen}
          setValue={setCompanyId}
          setItems={setCompanies}
          placeholder="Select a Customer"
          listMode="MODAL"
          style={{ borderColor: "#ccc", backgroundColor: "#fff" }}
          textStyle={{ color: "#111", fontWeight: "600" }}
          dropDownContainerStyle={{ borderColor: "#ccc", backgroundColor: "#fff" }}
        />
      </View>

      {!!service_address && (
        <View style={styles.addressBox}>
          <Text style={styles.addressLabel}>Service Address</Text>
          <Text style={styles.addressText}>{service_address}</Text>
        </View>
      )}

      {/* Filters / Search / Sort */}
      <View style={styles.filtersWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search PO, notes, tech, location"
          placeholderTextColor="#888"
          style={styles.searchInput}
        />

        <View style={styles.pillsRow}>
          <Pill label="All" active={follow === "all"} onPress={() => setFollow("all")} />
          <Pill label="Follow-up" active={follow === "yes"} onPress={() => setFollow("yes")} />
          <Pill label="No Follow-up" active={follow === "no"} onPress={() => setFollow("no")} />
        </View>

        <View style={styles.sortRow}>
          <SortButton
            label="Date"
            active={sortKey === "date"}
            dir={sortDir}
            onPress={() => {
              if (sortKey === "date") setSortDir((d: SortDir) => (d === "asc" ? "desc" : "asc"));
              setSortKey("date");
            }}
          />
          <SortButton
            label="Start"
            active={sortKey === "start_time"}
            dir={sortDir}
            onPress={() => {
              if (sortKey === "start_time") setSortDir((d: SortDir) => (d === "asc" ? "desc" : "asc"));
              setSortKey("start_time");
            }}
          />
          <SortButton
            label="End"
            active={sortKey === "end_time"}
            dir={sortDir}
            onPress={() => {
              if (sortKey === "end_time") setSortDir((d: SortDir) => (d === "asc" ? "desc" : "asc"));
              setSortKey("end_time");
            }}
          />
        </View>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 8 }} />}
    </View>
  );
});

/** ---- Small UI helpers ---- */
function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function SortButton({
  label,
  active,
  dir,
  onPress,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.sortBtn, active && styles.sortBtnActive]}>
      <Text style={[styles.sortText, active && styles.sortTextActive]}>
        {label} {active ? (dir === "asc" ? "↑" : "↓") : ""}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20, backgroundColor: "#fff" },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 12, paddingTop: 40, textAlign: "center" },

  addressBox: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#fafafa",
    borderRadius: 10,
    marginTop: 10,
  },
  addressLabel: { fontWeight: "700", marginBottom: 4, textAlign: "center" },
  addressText: { textAlign: "center" },

  // Filters
  filtersWrap: { marginTop: 12, gap: 10 },
  searchInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  pillsRow: { flexDirection: "row", gap: 8 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  pillActive: { backgroundColor: "#1f6feb22", borderColor: "#1f6feb" },
  pillText: { color: "#333", fontWeight: "600" },
  pillTextActive: { color: "#1f6feb" },

  sortRow: { flexDirection: "row", gap: 8 },
  sortBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  sortBtnActive: { borderColor: "#1f6feb" },
  sortText: { color: "#333", fontWeight: "600" },
  sortTextActive: { color: "#1f6feb" },

  // Cards
  card: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 15,
    paddingBottom: 12,
    marginBottom: 15,
    backgroundColor: "#fff",
  },
  cardTitle: { fontWeight: "600", marginBottom: 4, textAlign: "center" },
});
