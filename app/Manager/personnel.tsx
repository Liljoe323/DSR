// app/manager/Personnel.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import theme from '@/styles/theme';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  ActionSheetIOS,
} from "react-native";
import { supabase } from "@/lib/supabase";

import BackButton from '@/components/BackButton';

import { useRouter } from 'expo-router';

type Person = {
  id: string;
  full_name: string | null;
  role: "technician" | "client" | "handler";
  is_manager: boolean;
};

const ROLES: Array<Person["role"]> = ["technician", "client", "handler"];

  const router = useRouter();
  const goBack = () => router.back();

export default function Personnel() {
  const [meIsManager, setMeIsManager] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});

  // --- Helpers
  const setSaving = (id: string, v: boolean) =>
    setSavingIds((prev) => ({ ...prev, [id]: v }));

  const fetchMe = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMeIsManager(false);
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("is_manager")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("fetchMe error", error);
      setMeIsManager(false);
      return;
    }
    setMeIsManager(Boolean(data?.is_manager));
  }, []);

  const fetchPeople = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_manager")
      .order("full_name", { ascending: true, nullsFirst: true });

    if (error) {
      console.error("fetchPeople error", error);
      Alert.alert("Error", "Could not load personnel.");
      return;
    }
    setPeople(
      (data ?? []).map((p) => ({
        id: p.id as string,
        full_name: (p.full_name ?? "") as string,
        role: (p.role ?? "client") as Person["role"],
        is_manager: Boolean(p.is_manager),
      }))
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await fetchMe();
      await fetchPeople();
    } finally {
      setLoading(false);
    }
  }, [fetchMe, fetchPeople]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchPeople();
    } finally {
      setRefreshing(false);
    }
  }, [fetchPeople]);

  // --- Mutations
  const updateRole = useCallback(
    async (id: string, role: Person["role"]) => {
      const prev = people;
      const next = people.map((p) => (p.id === id ? { ...p, role } : p));
      setPeople(next);
      setSaving(id, true);

      const { error } = await supabase
        .from("profiles")
        .update({ role })
        .eq("id", id);

      setSaving(id, false);
      if (error) {
        console.error("updateRole error", error);
        setPeople(prev); // rollback
        Alert.alert("Update failed", error.message || "Could not change role.");
      }
    },
    [people]
  );

  const updateManager = useCallback(
    async (id: string, is_manager: boolean) => {
      // UI guard: don’t allow toggling managers for clients
      const target = people.find((p) => p.id === id);
      if (!target) return;
      if (target.role === "client" && is_manager) {
        Alert.alert(
          "Not allowed",
          "Clients cannot be granted manager permissions. Change the role first."
        );
        return;
      }

      const prev = people;
      const next = people.map((p) =>
        p.id === id ? { ...p, is_manager } : p
      );
      setPeople(next);
      setSaving(id, true);

      const { error } = await supabase
        .from("profiles")
        .update({ is_manager })
        .eq("id", id);

      setSaving(id, false);
      if (error) {
        console.error("updateManager error", error);
        setPeople(prev); // rollback
        Alert.alert(
          "Update failed",
          error.message || "Could not change manager permission."
        );
      }
    },
    [people]
  );

  // --- UI bits
  const showRolePicker = useCallback(
    (person: Person) => {
      const choose = (role: Person["role"]) => updateRole(person.id, role);

      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: person.full_name || "Select role",
            options: [...ROLES, "Cancel"],
            cancelButtonIndex: ROLES.length,
            userInterfaceStyle: "light",
          },
          (idx) => {
            if (idx == null || idx === ROLES.length) return;
            choose(ROLES[idx]);
          }
        );
      } else {
        // Simple Android fallback
        Alert.alert(
          person.full_name || "Select role",
          undefined,
          [
            ...ROLES.map((r) => ({
              text: r,
              onPress: () => choose(r),
            })),
            { text: "Cancel", style: "cancel" },
          ],
          { cancelable: true }
        );
      }
    },
    [updateRole]
  );

  const renderItem = useCallback(
    ({ item }: { item: Person }) => {
      const disabled = !!savingIds[item.id];
      const canToggleManager = item.role !== "client";
      return (
        
        <View style={styles.row}>
          <View style={styles.left}>
            <Text style={styles.name}>{item.full_name || "(no name)"}</Text>
            <TouchableOpacity
              style={styles.rolePill}
              disabled={disabled}
              onPress={() => showRolePicker(item)}
            >
              <Text style={styles.roleText}>{item.role}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.right}>
            <View style={styles.toggleWrap}>
              <Text style={styles.toggleLabel}>Manager</Text>
              <Switch
                value={item.is_manager}
                onValueChange={(v) => updateManager(item.id, v)}
                disabled={disabled || !canToggleManager}
              />
            </View>
            {disabled && <ActivityIndicator style={{ marginLeft: 8 }} />}
          </View>
        </View>
      );
    },
    [savingIds, showRolePicker, updateManager]
  );

  const keyExtractor = useCallback((p: Person) => p.id, []);

  // --- Gate for non-managers
  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }
  if (!meIsManager) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.noAccessTitle}>Managers only</Text>
        <Text style={styles.noAccessText}>
          You don’t have permission to view personnel.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
        
     <BackButton style={styles.backButton} onPress={goBack} />
      <View style={styles.header}>
        <Text style={styles.title}>Personnel</Text>
        <Text style={styles.subtitle}>
          View and manage roles. Only technicians and handlers may be managers.
        </Text>
      </View>

      <FlatList
        data={people}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        contentContainerStyle={{ padding: 12, paddingBottom: 36 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { padding: 10, marginBottom: 12 },
  title: { fontSize: 24, fontWeight: "700", textAlign: 'center', color: theme.colors.textOnPrimary },
  subtitle: { marginTop: 4, color: "#666" },
  sep: { height: 10 },
  row: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#f7f7f8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  left: { flexShrink: 1, paddingRight: 12 },
  right: { flexDirection: "row", alignItems: "center" },
  name: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  rolePill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#e9ecff",
  },
    backButton: {
    marginTop: 10,
  },
  roleText: { fontWeight: "600", color: "#2f3ab2" },
  toggleWrap: { flexDirection: "row", alignItems: "center" },
  toggleLabel: { marginRight: 8, color: "#333" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  noAccessTitle: { fontSize: 22, fontWeight: "700" },
  noAccessText: { marginTop: 8, color: "#666", textAlign: "center" },
});
