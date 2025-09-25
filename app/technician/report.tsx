import { supabase } from "@/lib/supabase";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DropDownPicker from "react-native-dropdown-picker";

type CompanyItem = { label: string; value: string };

// JS Date -> 'HH:MM:SS' for Postgres `time`
const toPgTime = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// "123" -> 123; "" -> null; "abc" -> null
const parseNumOrNull = (v: string): number | null => {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
};

export default function ServiceReport() {
  const router = useRouter();

  // Route params
  const params = useLocalSearchParams<{
    requestId?: string | string[];
    companyId?: string | string[];
    assignmentId?: string | string[];
  }>();
  const requestId = params.requestId ? String(params.requestId) : undefined;
  const paramCompanyId = params.companyId ? String(params.companyId) : undefined;
  const assignmentId = params.assignmentId ? String(params.assignmentId) : undefined;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Company handling
  const [companyId, setCompanyId] = useState<string | null>(
    paramCompanyId ? String(paramCompanyId) : null
  );
  const [companyName, setCompanyName] = useState<string>("");

  // Dropdown state
  const [open, setOpen] = useState(false);
  const [companyItems, setCompanyItems] = useState<CompanyItem[]>([]);

  // Form fields
  const [location, setLocation] = useState("");
  const [po, setPo] = useState("");

  // Date/time pickers (store as Date, send as HH:MM:SS)
  const [startAt, setStartAt] = useState<Date>(new Date());
  const [endAt, setEndAt] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [materialsText, setMaterialsText] = useState("");
  const [notes, setNotes] = useState("");
  const [followUpNeeded, setFollowUpNeeded] = useState(false);

  // Refrigeration toggle + fields
  const [isRefrigeration, setIsRefrigeration] = useState(false);
  const [headPressure, setHeadPressure] = useState<string>("");
  const [suctionPressure, setSuctionPressure] = useState<string>("");
  const [systemAmp, setSystemAmp] = useState<string>("");
  const [compressorAmp, setCompressorAmp] = useState<string>("");
  const [condenserTemp, setCondenserTemp] = useState<string>("");
  const [productTemp, setProductTemp] = useState<string>("");

  // Robot toggle + fields
  const [isRobot, setIsRobot] = useState(false);
  const [box1Problem, setBox1Problem] = useState("");
  const [box2Problem, setBox2Problem] = useState("");
  const [box3Problem, setBox3Problem] = useState("");

  // Auth user
  const [userId, setUserId] = useState<string | null>(null);

  // ---------- Load ----------
  useEffect(() => {
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        setUserId(sessionData?.session?.user?.id ?? null);

        if (paramCompanyId) {
          const { data: c, error: cerr } = await supabase
            .from("companies")
            .select("id,company_name")
            .eq("id", paramCompanyId)
            .maybeSingle();
          if (cerr) throw cerr;
          setCompanyName(c?.company_name ?? "");
        } else {
          const { data: companies, error: cErr } = await supabase
            .from("companies")
            .select("id,company_name")
            .order("company_name", { ascending: true });
          if (cErr) throw cErr;
          setCompanyItems(
            (companies ?? []).map((c: any) => ({
              label: c?.company_name ?? "(unnamed)",
              value: String(c?.id),
            }))
          );
        }
      } catch (e: any) {
        console.error("Load error:", e);
        Alert.alert("Error", e?.message ?? "Failed to load data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [paramCompanyId]);

  // ---------- Helpers ----------
  const materialsJson = useMemo(
    () =>
      materialsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [materialsText]
  );

  const resolvedCompanyId: string | null = (companyId ?? paramCompanyId) ?? null;
  const timesValid = endAt.getTime() >= startAt.getTime();

  const canSubmit = useMemo(
    () => Boolean(userId && resolvedCompanyId && timesValid),
    [userId, resolvedCompanyId, timesValid]
  );

  const onChangeStart = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== "ios") setShowStartPicker(false);
    if (selected) {
      setStartAt(selected);
      if (selected.getTime() > endAt.getTime()) setEndAt(selected);
    }
  };
  const onChangeEnd = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== "ios") setShowEndPicker(false);
    if (selected) {
      setEndAt(selected.getTime() < startAt.getTime() ? startAt : selected);
    }
  };

  // Reset form after a successful ad-hoc submission
  const resetForm = () => {
    setCompanyId(paramCompanyId ? String(paramCompanyId) : null);
    setOpen(false);
    setLocation("");
    setPo("");
    const now = new Date();
    setStartAt(now);
    setEndAt(now);
    setMaterialsText("");
    setNotes("");
    setFollowUpNeeded(false);

    setIsRefrigeration(false);
    setHeadPressure("");
    setSuctionPressure("");
    setSystemAmp("");
    setCompressorAmp("");
    setCondenserTemp("");
    setProductTemp("");

    setIsRobot(false);
    setBox1Problem("");
    setBox2Problem("");
    setBox3Problem("");
  };

  // ---------- Submit ----------
  const onSubmit = async () => {
    if (!canSubmit) {
      Alert.alert(
        "Incomplete",
        !timesValid
          ? "End time must be after start time."
          : "Please select a company and fill required fields."
      );
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        service_request_id: requestId ?? null, // nullable for ad-hoc
        assignment_id: assignmentId ?? null,
        technician_id: userId,
        company_id: resolvedCompanyId,
        job_location: location || null,
        po: po || null,
        start_time: toPgTime(startAt), // Postgres `time`
        end_time: toPgTime(endAt),     // Postgres `time`
        description_notes: notes || null,
        follow_up_needed: followUpNeeded,
        materials_used: materialsJson,

        // Refrigeration fields
        is_refrigeration: isRefrigeration,
        head_pressure: isRefrigeration ? parseNumOrNull(headPressure) : null,
        suction_pressure: isRefrigeration ? parseNumOrNull(suctionPressure) : null,
        system_amp: isRefrigeration ? parseNumOrNull(systemAmp) : null,
        compressor_amp: isRefrigeration ? parseNumOrNull(compressorAmp) : null,
        condenser_temp: isRefrigeration ? parseNumOrNull(condenserTemp) : null,
        product_temp: isRefrigeration ? parseNumOrNull(productTemp) : null,

        // Robot fields
        is_robot: isRobot,
        box1_problem: isRobot ? (box1Problem.trim() || null) : null,
        box2_problem: isRobot ? (box2Problem.trim() || null) : null,
        box3_problem: isRobot ? (box3Problem.trim() || null) : null,
      };

      const { error: insErr } = await supabase.from("service_reports").insert(payload);
      if (insErr) throw insErr;

      // If this was tied to an assignment, mark complete and leave the page
      if (assignmentId) {
        const { error: upErr } = await supabase
          .from("technician_assignments")
          .update({ completed: true })
          .eq("id", assignmentId);
        if (upErr) console.warn("Assignment update warning:", upErr.message);
      }

      // Success UX:
      if (assignmentId || requestId) {
        Alert.alert("Saved", "Service report submitted.", [{ text: "OK", onPress: () => router.back() }]);
      } else {
        // ad-hoc flow: stay and clear the form
        Alert.alert("Saved", "Service report submitted.", [{ text: "Start new report", onPress: resetForm }]);
        resetForm();
      }
    } catch (e: any) {
      console.error("Submit error:", e);
      Alert.alert("Error", e?.message ?? "Failed to submit report.");
    } finally {
      setSaving(false);
    }
  };

  // ---------- UI ----------
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Loading…</Text>
      </View>
    );
  }

  const showReadonlyCompany = Boolean(paramCompanyId);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header with title (left) and toggles (right) */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>Service Report</Text>
          <View style={styles.togglesRight}>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Refrigeration</Text>
              <Switch value={isRefrigeration} onValueChange={setIsRefrigeration} />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Robot</Text>
              <Switch value={isRobot} onValueChange={setIsRobot} />
            </View>
          </View>
        </View>

        {/* Customer */}
        <Text style={styles.label}>Customer</Text>
        {showReadonlyCompany ? (
          <View style={styles.readonlyBox}>
            <Text style={styles.readonlyText}>{companyName || paramCompanyId}</Text>
          </View>
        ) : (
          <View style={{ zIndex: 10 }}>
            <DropDownPicker
              open={open}
              value={companyId ?? null}
              items={companyItems}
              setOpen={setOpen}
              setValue={setCompanyId}
              setItems={setCompanyItems}
              placeholder="Select a customer"
              searchable
              listMode="MODAL"
              style={{ borderColor: "#ccc", borderRadius: 10, backgroundColor: "#fff", minHeight: 48 }}
              textStyle={{ color: "#111", fontWeight: "600" }}
              placeholderStyle={{ color: "#888", fontWeight: "400" }}
              dropDownContainerStyle={{ borderColor: "#ccc", backgroundColor: "#fff" }}
              listItemLabelStyle={{ color: "#111" }}
              selectedItemLabelStyle={{ color: "#111", fontWeight: "700" }}
              modalTitle="Select Company"
              modalTitleStyle={{ color: "#111", fontWeight: "700" }}
            />
          </View>
        )}

        {/* Location */}
        <Text style={styles.label}>Location</Text>
        <TextInput
          style={styles.input}
          placeholder="Town"
          value={location}
          onChangeText={setLocation}
        />

          {/* PO/Job Description */}
        <Text style={styles.label}>PO/Job Description</Text>
        <TextInput
          style={styles.input}
          placeholder="Brief Job Description"
          value={po}
          onChangeText={setPo}
        />

        {/* Start Time */}
        <Text style={styles.label}>Start Time</Text>
        <Pressable onPress={() => setShowStartPicker(true)} style={[styles.input, { justifyContent: "center" }]}>
          <Text style={{ color: "#111" }}>{startAt.toLocaleTimeString()}</Text>
        </Pressable>
        {showStartPicker && (
          <DateTimePicker
            value={startAt}
            mode="time"
            display={Platform.select({ ios: "spinner", android: "default" })}
            onChange={onChangeStart}
            is24Hour={false}
          />
        )}

        {/* End Time */}
        <Text style={styles.label}>End Time</Text>
        <Pressable onPress={() => setShowEndPicker(true)} style={[styles.input, { justifyContent: "center" }]}>
          <Text style={{ color: "#111" }}>{endAt.toLocaleTimeString()}</Text>
        </Pressable>
        {showEndPicker && (
          <DateTimePicker
            value={endAt}
            mode="time"
            display={Platform.select({ ios: "spinner", android: "default" })}
            onChange={onChangeEnd}
            is24Hour={false}
          />
        )}

        {!timesValid && (
          <Text style={{ color: "#c00", marginTop: 6 }}>
            End time must be after start time.
          </Text>
        )}

        {/* Materials */}
        <Text style={styles.label}>Materials Used (comma separated)</Text>
        <TextInput
          style={[styles.input, { minHeight: 60 }]}
          placeholder={`e.g. 2x 1/2" PVC , 1x Coupling `}
          value={materialsText}
          onChangeText={setMaterialsText}
          multiline
        />

        {/* Refrigeration-only fields */}
        {isRefrigeration && (
          <View style={styles.refrigCard}>
            <Text style={styles.refrigTitle}>Refrigeration Details</Text>

            <Text style={styles.smallLabel}>Head Pressure</Text>
            <TextInput
              style={styles.input}
              placeholder="psig"
              keyboardType="numeric"
              value={headPressure}
              onChangeText={setHeadPressure}
            />

            <Text style={styles.smallLabel}>Suction Pressure</Text>
            <TextInput
              style={styles.input}
              placeholder="psig"
              keyboardType="numeric"
              value={suctionPressure}
              onChangeText={setSuctionPressure}
            />

            <Text style={styles.smallLabel}>System Amps</Text>
            <TextInput
              style={styles.input}
              placeholder="A"
              keyboardType="numeric"
              value={systemAmp}
              onChangeText={setSystemAmp}
            />

            <Text style={styles.smallLabel}>Compressor Amps</Text>
            <TextInput
              style={styles.input}
              placeholder="A"
              keyboardType="numeric"
              value={compressorAmp}
              onChangeText={setCompressorAmp}
            />

            <Text style={styles.smallLabel}>Condenser Temp (°F)</Text>
            <TextInput
              style={styles.input}
              placeholder="°F"
              keyboardType="numeric"
              value={condenserTemp}
              onChangeText={setCondenserTemp}
            />

            <Text style={styles.smallLabel}>Product Temp (°F)</Text>
            <TextInput
              style={styles.input}
              placeholder="°F"
              keyboardType="numeric"
              value={productTemp}
              onChangeText={setProductTemp}
            />
          </View>
        )}

        {/* Robot-only fields */}
        {isRobot && (
          <View style={styles.robotCard}>
            <Text style={styles.robotTitle}>Robot Details</Text>

            <Text style={styles.smallLabel}>Box 1 Problem</Text>
            <TextInput
              style={[styles.input, { minHeight: 60 }]}
              placeholder="Describe issue in Box 1"
              value={box1Problem}
              onChangeText={setBox1Problem}
              multiline
            />

            <Text style={styles.smallLabel}>Box 2 Problem</Text>
            <TextInput
              style={[styles.input, { minHeight: 60 }]}
              placeholder="Describe issue in Box 2"
              value={box2Problem}
              onChangeText={setBox2Problem}
              multiline
            />

            <Text style={styles.smallLabel}>Box 3 Problem</Text>
            <TextInput
              style={[styles.input, { minHeight: 60 }]}
              placeholder="Describe issue in Box 3"
              value={box3Problem}
              onChangeText={setBox3Problem}
              multiline
            />
          </View>
        )}

        {/* Notes */}
        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, { minHeight: 80 }]}
          placeholder="Work performed, observations, issues…"
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        {/* Follow Up */}
        <View style={styles.row}>
          <Text style={styles.label}>Follow-up Needed</Text>
          <Switch value={followUpNeeded} onValueChange={setFollowUpNeeded} />
        </View>

        <TouchableOpacity
          style={[styles.button, !canSubmit || saving ? styles.buttonDisabled : null]}
          onPress={onSubmit}
          disabled={!canSubmit || saving}
        >
          <Text style={styles.buttonText}>{saving ? "Saving..." : "Submit Report"}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  headerRow: {
    marginTop: 40,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 22, fontWeight: "700" },
  togglesRight: { gap: 8 },
  toggleRow: { flexDirection: "row", alignItems: "center" },
  toggleLabel: { fontWeight: "600", marginRight: 8 },
  label: { fontWeight: "600", marginTop: 14, marginBottom: 6 },
  smallLabel: { fontWeight: "600", marginTop: 12, marginBottom: 6, fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "white",
  },
  readonlyBox: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#f7f7f7",
  },
  readonlyText: { fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  refrigCard: {
    marginTop: 18,
    padding: 14,
    backgroundColor: "#f9fbff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d9e3ff",
  },
  refrigTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  robotCard: {
    marginTop: 18,
    padding: 14,
    backgroundColor: "#fff9f4",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ffd9bf",
  },
  robotTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  button: {
    marginTop: 20,
    marginBottom: 30,
    backgroundColor: "#1f6feb",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "white", fontWeight: "700", fontSize: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
