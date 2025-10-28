// app/report/ServiceReport.tsx

import { supabase } from "@/lib/supabase";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import MaterialsEditor from "@/components/MaterialsEditor";

type CompanyItem = { label: string; value: string };
type TechItem = { label: string; value: string }; // value = tech name (stored as text)

const toPgTime = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const parseNumOrNull = (v: string): number | null => {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
};

const s = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? undefined;

/** Fallback formatter: [{material_id:"Valve", qty:2}] -> "2x Valve" (joined by " /n ") */
function formatMaterialsForDB(
  rows?: Array<{ material_id?: string | null; qty?: number | null }>
) {
  if (!Array.isArray(rows)) return "";
  return rows
    .filter(r => (r?.material_id ?? "").toString().trim() && (r?.qty ?? 0) > 0)
    .map(r => `${r!.qty}x ${String(r!.material_id)}`)
    .join(" /n ");
}

export default function ServiceReport() {
  const router = useRouter();

  const p = useLocalSearchParams<{
    request_id?: string | string[];
    assignment_id?: string | string[];
    service_request_id?: string | string[];
    emergency_service_request_id?: string | string[];
    company?: string | string[];
    companyId?: string | string[];
  }>();

  const requestIdGeneric = s(p.request_id);
  const assignmentId = s(p.assignment_id);
  const serviceRequestId = s(p.service_request_id);
  const emergencyRequestId = s(p.emergency_service_request_id);
  const paramCompanyName = s(p.company);
  const paramCompanyId = s(p.companyId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Company picker + free-typed
  const [companyItems, setCompanyItems] = useState<CompanyItem[]>([]);
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(paramCompanyId ?? null);
  const [companyName, setCompanyName] = useState<string>(paramCompanyName ?? "");
  const [freeCompanyName, setFreeCompanyName] = useState<string>("");

  // Form fields
  const [location, setLocation] = useState("");
  const [po, setPo] = useState("");

  // Additional technician (dropdown stores name as text)
  const [additionalTech, setAdditionalTech] = useState<string | null>(null);
  const [techOpen, setTechOpen] = useState(false);
  const [techItems, setTechItems] = useState<TechItem[]>([]);

  // Time
  const [startAt, setStartAt] = useState<Date>(new Date());
  const [endAt, setEndAt] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Materials (structured JSON) + export text
  const [materials, setMaterials] = useState<Array<{ material_id: string; qty: number }>>([]);
  const [materialsText, setMaterialsText] = useState<string>(""); // "2x Valve /n 1x Coupling"

  // Misc
  const [notes, setNotes] = useState("");
  const [followUpNeeded, setFollowUpNeeded] = useState(false);

  // Refrigeration
  const [isRefrigeration, setIsRefrigeration] = useState(false);
  const [headPressure, setHeadPressure] = useState<string>("");
  const [suctionPressure, setSuctionPressure] = useState<string>("");
  const [systemAmp, setSystemAmp] = useState<string>("");
  const [compressorAmp, setCompressorAmp] = useState<string>("");
  const [condenserTemp, setCondenserTemp] = useState<string>("");
  const [productTemp, setProductTemp] = useState<string>("");

  // Robot
  const [isRobot, setIsRobot] = useState(false);
  const [box1Problem, setBox1Problem] = useState("");
  const [box2Problem, setBox2Problem] = useState("");
  const [box3Problem, setBox3Problem] = useState("");

  //Hygiene
  const [isDsol, setIsDsol] = useState(false);

  // ---------- Load ----------
  useEffect(() => {
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData?.session?.user?.id ?? null;
        setUserId(uid);

        // Companies
        const { data: companies, error: cErr } = await supabase
          .from("companies")
          .select("id,company_name")
          .order("company_name", { ascending: true });
        if (cErr) throw cErr;

        const items = (companies ?? []).map((c: any) => ({ label: c?.company_name ?? "(unnamed)", value: String(c?.id) }));
        setCompanyItems(items);

        // Preselect from params if present
        if (paramCompanyId) {
          setCompanyId(String(paramCompanyId));
          const found = items.find((i) => i.value === String(paramCompanyId));
          if (found) setCompanyName(found.label);
        } else if (paramCompanyName) {
          const exact = items.find(
            (i) => (i.label ?? "").trim().toLowerCase() === paramCompanyName.trim().toLowerCase()
          );
          if (exact) {
            setCompanyId(exact.value);
            setCompanyName(exact.label);
          } else {
            setCompanyName(paramCompanyName);
          }
        }

        // Technicians (exclude current user)
        const { data: techs, error: tErr } = await supabase
          .from("profiles")
          .select("id, full_name, role")
          .eq("role", "technician")
          .neq("id", uid ?? "")
          .order("full_name", { ascending: true });

        if (!tErr && techs) {
          const techOptions = techs
            .filter((r: any) => !!r.full_name?.trim())
            .map((r: any) => ({ label: r.full_name, value: r.full_name }));
          setTechItems(techOptions);
        }
      } catch (e: any) {
        console.error("Load error:", e);
        Alert.alert("Error", e?.message ?? "Failed to load data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [paramCompanyId, paramCompanyName]);

  // ---------- Time validation (1-hour minimum) ----------
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const timesMinHour = endAt.getTime() - startAt.getTime() >= ONE_HOUR_MS;

  const onChangeStart = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== "ios") setShowStartPicker(false);
    if (selected) {
      setStartAt(selected);
      // If end is before start+1h, bump it to start+1h
      if (endAt.getTime() < selected.getTime() + ONE_HOUR_MS) {
        setEndAt(new Date(selected.getTime() + ONE_HOUR_MS));
      }
    }
  };
  const onChangeEnd = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== "ios") setShowEndPicker(false);
    if (selected) {
      const minEnd = new Date(startAt.getTime() + ONE_HOUR_MS);
      setEndAt(selected.getTime() < minEnd.getTime() ? minEnd : selected);
    }
  };

  // ---------- Helpers ----------
  const canSubmit = useMemo(
    () =>
      Boolean(
        userId &&
          timesMinHour &&
          ((companyId && String(companyId).length > 0) ||
            (freeCompanyName && freeCompanyName.trim().length > 0) ||
            (companyId == null && companyName && companyName.trim().length > 0))
      ),
    [userId, timesMinHour, companyId, freeCompanyName, companyName]
  );

  // Resolve or create company id if needed
  async function resolveCompanyId(): Promise<string | null> {
    if (companyId) return companyId;

    const name = (freeCompanyName || companyName || "").trim();
    if (!name) return null;

    const { data: existing, error: findErr } = await supabase
      .from("companies")
      .select("id,company_name")
      .ilike("company_name", name);
    if (findErr) console.warn("Company lookup warning:", findErr.message);

    const exact =
      existing?.find((c) => (c.company_name ?? "").trim().toLowerCase() === name.toLowerCase()) ??
      existing?.[0];
    if (exact) return String(exact.id);

    const { data: created, error: insErr } = await supabase
      .from("companies")
      .insert([{ company_name: name }])
      .select("id")
      .single();
    if (insErr) {
      Alert.alert("Error", `Could not create company "${name}": ${insErr.message}`);
      return null;
    }
    return String(created!.id);
  }

  const resetForm = useCallback(() => {
    setOpen(false);
    setLocation("");
    setPo("");
    const now = new Date();
    setStartAt(now);
    setEndAt(new Date(now.getTime() + ONE_HOUR_MS));
    setMaterials([]);
    setMaterialsText(""); // reset export string
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
    setFreeCompanyName("");
    setAdditionalTech(null);
    setTechOpen(false);
    setIsDsol(false);
  }, []);

  // ---------- Submit ----------
  const onSubmit = async () => {
    if (!timesMinHour) {
      Alert.alert("Time range too short", "End time must be at least 1 hour after start time.");
      return;
    }
    setSaving(true);
    try {
      const resolvedId = await resolveCompanyId();
      if (!resolvedId) {
        setSaving(false);
        Alert.alert("Customer required", "Please select a customer or type a new company name.");
        return;
      }

      // Only set ONE request FK
      const fk: any = {};
      if (serviceRequestId) fk.service_request_id = serviceRequestId;
      else if (emergencyRequestId) fk.emergency_service_request_id = emergencyRequestId;

      // Build export string if editor hasn't provided one yet
      const materialsToSave =
        (materialsText ?? "").trim().length > 0
          ? materialsText
          : formatMaterialsForDB(materials);

      const { error: insErr } = await supabase.from("service_reports").insert({
        ...fk,
        assignment_id: assignmentId ?? null,
        technician_id: userId,
        company_id: resolvedId,
        job_location: location || null,
        po: po || null,
        start_time: toPgTime(startAt),
        end_time: toPgTime(endAt),
        description_notes: notes || null,
        follow_up_needed: followUpNeeded,
        materials_used: materialsToSave,  // <-- store "qtyx item /n qtyx item" here
        is_refrigeration: isRefrigeration,
        head_pressure: isRefrigeration ? parseNumOrNull(headPressure) : null,
        suction_pressure: isRefrigeration ? parseNumOrNull(suctionPressure) : null,
        system_amp: isRefrigeration ? parseNumOrNull(systemAmp) : null,
        compressor_amp: isRefrigeration ? parseNumOrNull(compressorAmp) : null,
        condenser_temp: isRefrigeration ? parseNumOrNull(condenserTemp) : null,
        product_temp: isRefrigeration ? parseNumOrNull(productTemp) : null,
        is_robot: isRobot,
        box1_problem: isRobot ? (box1Problem.trim() || null) : null,
        box2_problem: isRobot ? (box2Problem.trim() || null) : null,
        box3_problem: isRobot ? (box3Problem.trim() || null) : null,
        additional_tech: additionalTech || null,
        is_dsol: isDsol, 
      });
      if (insErr) throw insErr;

      // Mark assignment complete (UUID)
      if (assignmentId) {
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRe.test(assignmentId)) {
          Alert.alert("Bad assignment id", `Not a UUID: ${assignmentId}`);
          setSaving(false);
          return;
        }

        const { error: readErr } = await supabase
          .from("technician_assignments")
          .select("id")
          .eq("id", assignmentId)
          .maybeSingle();
        if (readErr) {
          Alert.alert("Cannot read assignment", readErr.message);
          setSaving(false);
          return;
        }

        const { data: updated, error: upErr } = await supabase
          .from("technician_assignments")
          .update({ completed: true })
          .eq("id", assignmentId)
          .eq("technician_id", userId!)
          .select("id, completed")
          .single();

        if (upErr) {
          Alert.alert("Assignment not updated", upErr.message);
          setSaving(false);
          return;
        }
        if (!updated?.completed) {
          Alert.alert("Assignment not updated", "The update did not persist.");
          setSaving(false);
          return;
        }
      }

      if (serviceRequestId) {
        const { error: sErr } = await supabase
          .from("service_requests")
          .update({ completed_job: true })
          .eq("id", serviceRequestId);
        if (sErr) console.warn("Service request update warning:", sErr.message);
      } else if (emergencyRequestId) {
        const { error: eErr } = await supabase
          .from("emergency_service_requests")
          .update({ completed_job: true })
          .eq("id", emergencyRequestId);
        if (eErr) console.warn("Emergency request update warning:", eErr.message);
      }

      resetForm();

      const fromAssignmentOrRequest = Boolean(assignmentId || serviceRequestId || emergencyRequestId);
      if (fromAssignmentOrRequest) {
        Alert.alert("Success", "Report submitted and request marked complete.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } else {
        Alert.alert("Success", "Report submitted. You can start another.");
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

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" >
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
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Hygiene</Text>
              <Switch value={isDsol} onValueChange={setIsDsol} />
            </View>
          </View>
        </View>

        {(serviceRequestId || emergencyRequestId || requestIdGeneric || assignmentId) && (
          <View style={{ marginBottom: 8 }}>
            {serviceRequestId ? <Text style={{ color: "#666" }}>Service Request ID: {serviceRequestId}</Text> : null}
            {emergencyRequestId ? <Text style={{ color: "#666" }}>Emergency Request ID: {emergencyRequestId}</Text> : null}
            {requestIdGeneric ? <Text style={{ color: "#666" }}>Request ID: {requestIdGeneric}</Text> : null}
            {assignmentId ? <Text style={{ color: "#666" }}>Assignment ID: {assignmentId}</Text> : null}
          </View>
        )}

        <Text style={styles.label}>Customer</Text>
        <View style={{ zIndex: 10 }}>
          <DropDownPicker
            open={open}
            value={companyId ?? null}
            items={companyItems}
            setOpen={setOpen}
            setValue={setCompanyId}
            setItems={setCompanyItems}
            placeholder={companyName ? `Prefilled: ${companyName}` : "Select a customer"}
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

        <Text style={[styles.smallLabel, { marginTop: 10 }]}>Or type a new company name</Text>
        <TextInput
          style={styles.input}
          placeholder="New customer name"
          value={freeCompanyName}
          onChangeText={setFreeCompanyName}
        />
        <Text style={{ fontSize: 12, color: "#777", marginTop: 4 }}>
          If you don’t select a company above, we’ll use this name and create a new customer if needed.
        </Text>

        {/* ADDITIONAL TECHNICIAN */}
        <Text style={styles.label}>Additional Technician (optional)</Text>
        <View style={{ zIndex: 20 }}>
          <DropDownPicker
            open={techOpen}
            value={additionalTech}
            items={techItems}
            setOpen={setTechOpen}
            setValue={setAdditionalTech}
            setItems={setTechItems}
            placeholder="Select additional technician"
            searchable
            listMode="MODAL"
            modalTitle="Select additional technician"
            style={{ borderColor: "#ccc", borderRadius: 10, backgroundColor: "#fff", minHeight: 48 }}
            textStyle={{ color: "#111", fontWeight: "600" }}
            placeholderStyle={{ color: "#888", fontWeight: "400" }}
            dropDownContainerStyle={{ borderColor: "#ccc", backgroundColor: "#fff" }}
            listItemLabelStyle={{ color: "#111" }}
            selectedItemLabelStyle={{ color: "#111", fontWeight: "700" }}
            showTickIcon
            showArrowIcon
            closeAfterSelecting
          />
        </View>

        <Text style={styles.label}>Location</Text>
        <TextInput style={styles.input} placeholder="Town" value={location} onChangeText={setLocation} />

        <Text style={styles.label}>PO/Job Description</Text>
        <TextInput style={styles.input} placeholder="Brief Job Description" value={po} onChangeText={setPo} />

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

        {!timesMinHour && (
          <Text style={{ color: "#c00", marginTop: 6 }}>
            End time must be at least 1 hour after start time.
          </Text>
        )}

        {/* MATERIALS TABLE */}
        <Text style={styles.label}>Materials Used</Text>
        <MaterialsEditor
          value={materials}
          onChange={setMaterials}
          onChangeText={setMaterialsText}   // keep "2x Valve /n 1x Coupling" in state
        />

        {isRefrigeration && (
          <View style={styles.refrigCard}>
            <Text style={styles.refrigTitle}>Refrigeration Details</Text>
            <Text style={styles.smallLabel}>Head Pressure</Text>
            <TextInput style={styles.input} placeholder="psig" keyboardType="numeric" value={headPressure} onChangeText={setHeadPressure} />
            <Text style={styles.smallLabel}>Suction Pressure</Text>
            <TextInput style={styles.input} placeholder="psig" keyboardType="numeric" value={suctionPressure} onChangeText={setSuctionPressure} />
            <Text style={styles.smallLabel}>System Amps</Text>
            <TextInput style={styles.input} placeholder="A" keyboardType="numeric" value={systemAmp} onChangeText={setSystemAmp} />
            <Text style={styles.smallLabel}>Compressor Amps</Text>
            <TextInput style={styles.input} placeholder="A" keyboardType="numeric" value={compressorAmp} onChangeText={setCompressorAmp} />
            <Text style={styles.smallLabel}>Condenser Temp (°F)</Text>
            <TextInput style={styles.input} placeholder="°F" keyboardType="numeric" value={condenserTemp} onChangeText={setCondenserTemp} />
            <Text style={styles.smallLabel}>Product Temp (°F)</Text>
            <TextInput style={styles.input} placeholder="°F" keyboardType="numeric" value={productTemp} onChangeText={setProductTemp} />
          </View>
        )}

        {isRobot && (
          <View style={styles.robotCard}>
            <Text style={styles.robotTitle}>Robot Details</Text>
            <Text style={styles.smallLabel}>Box 1 Problem</Text>
            <TextInput style={[styles.input, { minHeight: 60 }]} placeholder="Describe issue in Box 1" value={box1Problem} onChangeText={setBox1Problem} multiline />
            <Text style={styles.smallLabel}>Box 2 Problem</Text>
            <TextInput style={[styles.input, { minHeight: 60 }]} placeholder="Describe issue in Box 2" value={box2Problem} onChangeText={setBox2Problem} multiline />
            <Text style={styles.smallLabel}>Box 3 Problem</Text>
            <TextInput style={[styles.input, { minHeight: 60 }]} placeholder="Describe issue in Box 3" value={box3Problem} onChangeText={setBox3Problem} multiline />
          </View>
        )}

        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, { minHeight: 80 }]}
          placeholder="Work performed, observations, issues…"
          value={notes}
          onChangeText={setNotes}
          multiline
        />

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
  headerRow: { marginTop: 40, marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 22, fontWeight: "700" },
  togglesRight: { gap: 8 },
  toggleRow: { flexDirection: "row", alignItems: "center" },
  toggleLabel: { fontWeight: "600", marginRight: 8 },
  label: { fontWeight: "600", marginTop: 14, marginBottom: 6 },
  smallLabel: { fontWeight: "600", marginTop: 12, marginBottom: 6, fontSize: 14 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12, backgroundColor: "white" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  refrigCard: { marginTop: 18, padding: 14, backgroundColor: "#f9fbff", borderRadius: 12, borderWidth: 1, borderColor: "#d9e3ff" },
  refrigTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  robotCard: { marginTop: 18, padding: 14, backgroundColor: "#fff9f4", borderRadius: 12, borderWidth: 1, borderColor: "#ffd9bf" },
  robotTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  button: { marginTop: 20, marginBottom: 30, backgroundColor: "#1f6feb", paddingVertical: 14, borderRadius: 12, alignItems: "center", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "white", fontWeight: "700", fontSize: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
