// app/technician/Dashboard.tsx
import { supabase } from "@/lib/supabase";
import theme from "@/styles/theme";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "expo-router";
import React, { useEffect, useLayoutEffect, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ImageViewer from "@/components/imageviewer";

const PlaceholderImage = require("@/assets/images/dsr.jpg");

export default function TechnicianDashboard() {
  const navigation = useNavigation();
  const [isManager, setIsManager] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        if (isMounted) setIsManager(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("is_manager")
        .eq("id", userId)
        .maybeSingle();

      if (!error && isMounted) {
        setIsManager(Boolean(data?.is_manager));
      } else if (isMounted) {
        setIsManager(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ImageViewer imgSource={PlaceholderImage} mode="banner" />

        <View style={styles.headerRow}>
          <Text style={styles.welcome}>Welcome back office folks!</Text>
          <TouchableOpacity
            style={styles.accountButton}
            onPress={() => navigation.navigate("account" as never)}
            activeOpacity={0.85}
          >
            <Ionicons
              name="person-circle-outline"
              size={40}
              color={theme.colors.textOnPrimary}
            />
          </TouchableOpacity>
        </View>

        {isManager === true && (
          <View style={styles.block}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => navigation.navigate("Manager" as never)}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryButtonText}>Manager Tabs</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { paddingBottom: 40 },
  headerRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  welcome: {
    fontSize: theme.fontSize.lg,
    color: theme.colors.textOnPrimary,
    fontWeight: "600",
  },
  accountButton: {
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 20,
  },
  block: { paddingHorizontal: 16, marginTop: 10 },
  primaryButton: {
    marginTop: 40,
    backgroundColor: theme.colors.primaryLight,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    elevation: 5,
  },
  primaryButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  helpText: {
    color: "#cfcfcf",
    marginTop: 8,
    fontSize: 12,
    textAlign: "center",
  },
});
