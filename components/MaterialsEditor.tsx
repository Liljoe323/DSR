// components/MaterialsEditor.tsx
import { supabase } from "@/lib/supabase";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import DropDownPicker from "react-native-dropdown-picker";

export type MaterialRow = { id: string; material_id: string | null; qty: number | null };
type RawMat = { item: string; description?: string };

export default function MaterialsEditor({
  value,
  onChange,
  onChangeText,               // <-- NEW
  disabled,
}: {
  value: Array<{ material_id: string; qty: number }> | null | undefined;
  onChange: (rows: Array<{ material_id: string; qty: number }>) => void;
  onChangeText?: (text: string) => void; // <-- NEW
  disabled?: boolean;
}) {
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [raw, setRaw] = useState<RawMat[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState<string | null>(null);

  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const seededRef = useRef(false);

  async function loadCatalog() {
    setLoading(true);
    setLoadErr(null);
    const { data, error } = await supabase
      .from("materials")
      .select(`"Item","Description"`)
      .order("Item", { ascending: true });

    if (error) {
      setLoadErr(error.message);
      setRaw([]);
    } else {
      const rows = (data ?? []).map((r: any) => ({
        item: String(r?.Item ?? "").trim(),
        description: String(r?.Description ?? "").trim(),
      }));
      setRaw(rows.filter((r) => r.item.length > 0));
    }
    setLoading(false);
  }

  useEffect(() => { loadCatalog(); }, []);

  // Build picker items: show Item + Description, save only Item
  const items = useMemo(
    () => raw.map((r) => ({ label: r.item, value: r.item, desc: r.description })),
    [raw]
  );

  // Helpers to normalize + export
  const normalize = (draft: MaterialRow[]) => {
    const filtered = draft.filter((r) => r.material_id && r.qty && r.qty > 0);
    const map = new Map<string, number>();
    for (const r of filtered) {
      const key = r.material_id!;
      map.set(key, (map.get(key) || 0) + (r.qty || 0));
    }
    return Array.from(map.entries()).map(([material_id, qty]) => ({ material_id, qty }));
  };

  const exportString = (norm: Array<{ material_id: string; qty: number }>) =>
    norm.map((r) => `${r.qty}x ${r.material_id}`).join(" /n ");

  // Publish both normalized array and export string
  const publish = (draft: MaterialRow[]) => {
    const norm = normalize(draft);
    onChange(norm);
    onChangeText?.(exportString(norm));     // <-- send the "qtyx item /n ..." string up
    setSavingNote("Updated");
    setTimeout(() => setSavingNote(null), 800);
  };

  // Seed once from parent and publish immediately
  useEffect(() => {
    if (seededRef.current) return;
    const v = Array.isArray(value) ? value : [];
    const seeded = v.map((r, i) => ({
      id: `row-${i}-${r.material_id}`,
      material_id: r.material_id ?? null,
      qty: typeof r.qty === "number" ? r.qty : Number(r.qty) || null,
    }));
    setRows(seeded);
    publish(seeded);               // <-- ensure parent gets initial export text
    seededRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const addRow = () => {
    const id = `row-${Date.now()}`;
    const draft = [...rows, { id, material_id: null, qty: null }];
    setRows(draft);
    publish(draft);
    setTimeout(() => setOpenRowId(id), 0);
  };

  const removeRow = (id: string) => {
    const draft = rows.filter((r) => r.id !== id);
    setRows(draft);
    publish(draft);
    if (openRowId === id) setOpenRowId(null);
  };

  const setQty = (id: string, text: string) => {
    const n = text.replace(/[^0-9.]/g, "");
    const qty = n === "" ? null : Number(n);
    const draft = rows.map((r) => (r.id === id ? { ...r, qty } : r));
    setRows(draft);
    publish(draft);
  };

  const applyMaterial = (id: string, next: string | null) => {
    const draft = rows.map((r) => (r.id === id ? { ...r, material_id: next } : r));
    setRows(draft);
    publish(draft);
  };

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={[styles.h, { width: 90 }]}>Qty</Text>
        <Text style={[styles.h, { flex: 1 }]}>Material</Text>
        <Text style={[styles.h, { width: 44 }]} />
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator />
          <Text style={styles.muted}>Loading materials…</Text>
        </View>
      ) : loadErr ? (
        <View style={styles.loadingRow}>
          <Text style={[styles.muted, { color: "#b91c1c" }]}>Error: {loadErr}</Text>
          <Pressable onPress={loadCatalog} style={styles.reloadBtn}>
            <Text style={styles.reloadText}>Reload</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.loadingRow}>
          <Text style={styles.muted}>No materials found.</Text>
          <Pressable onPress={loadCatalog} style={styles.reloadBtn}>
            <Text style={styles.reloadText}>Reload</Text>
          </Pressable>
        </View>
      ) : (
        rows.map((r, idx) => (
          <View key={r.id} style={[styles.row, { zIndex: (rows.length - idx) + 10 }]}>
            <TextInput
              editable={!disabled}
              value={r.qty == null ? "" : String(r.qty)}
              onChangeText={(t) => setQty(r.id, t)}
              keyboardType="numeric"
              placeholder="0"
              style={[styles.input, { width: 90 }]}
            />

            <DropDownPicker
              disabled={!!disabled}
              open={openRowId === r.id}
              value={r.material_id ?? null}
              items={items}
              setOpen={(o) => setOpenRowId(o ? r.id : null)}
              // Set & close on select
              onSelectItem={(itm) => {
                applyMaterial(r.id, (itm?.value as string) ?? null);
                setOpenRowId(null);
              }}
              onChangeValue={(val) => {
                applyMaterial(r.id, (val as string) ?? null);
                setOpenRowId(null);
              }}
              setValue={(cb) => {
                const next = cb(r.material_id ?? null) as string | null;
                applyMaterial(r.id, next);
                setOpenRowId(null);
              }}
              listMode="MODAL"
              modalTitle="Select material"
              modalTitleStyle={{ fontWeight: "700" }}
              placeholder="Select material…"
              searchable
              style={styles.ddp}
              zIndex={5000}
              zIndexInverse={5000}
              closeAfterSelecting
              // Custom list item: Item (bold) + Description (muted)
              renderListItem={(props) => {
                const { item, onPress } = props as any;
                return (
                  <Pressable
                    style={({ pressed }) => [
                      { paddingVertical: 10, paddingHorizontal: 12 },
                      pressed && { opacity: 0.6 },
                    ]}
                    onPress={() => {
                      applyMaterial(r.id, item.value as string);
                      onPress?.(item);
                      setOpenRowId(null);
                    }}
                  >
                    <Text style={{ fontWeight: "700", color: "#111827" }}>{item.label}</Text>
                    {!!item.desc && <Text style={{ color: "#6B7280", marginTop: 2 }}>{item.desc}</Text>}
                  </Pressable>
                );
              }}
            />

            <Pressable
              disabled={disabled}
              onPress={() => removeRow(r.id)}
              style={({ pressed }) => [styles.remove, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.removeText}>✕</Text>
            </Pressable>
          </View>
        ))
      )}

      <View style={styles.footer}>
        <Pressable disabled={disabled} onPress={addRow} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Add Material</Text>
        </Pressable>
        {savingNote ? <Text style={styles.saving}>{savingNote}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, gap: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 4 },
  h: { fontSize: 12, fontWeight: "700", color: "#374151" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  muted: { color: "#6B7280" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: "#111827", backgroundColor: "white" },
  ddp: { flex: 1, borderColor: "#E5E7EB", minHeight: 44 },
  remove: { width: 44, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  removeText: { color: "#6B7280", fontSize: 16, fontWeight: "700" },
  footer: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 },
  addBtn: { backgroundColor: "#111827", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  addBtnText: { color: "white", fontWeight: "700" },
  saving: { color: "#6B7280", fontSize: 12 },
  reloadBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  reloadText: { color: "#111827", fontWeight: "700" },
});
