import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Keyboard, 
  TouchableWithoutFeedback, 
  KeyboardAvoidingView,
} from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';

import BackButton from '@/components/BackButton';
import { useRouter } from 'expo-router';

type SortField = 'created_at' | 'company' | 'title';
type SortDir = 'asc' | 'desc';

export default function ManagerDashboard() {
  const router = useRouter();
  const goBack = () => router.back();

  const [requests, setRequests] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<{ [key: string]: any[] }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null); // spinner for "Mark Completed"
  const [openDropdowns, setOpenDropdowns] = useState<{ [key: string]: boolean }>({});
  const [selectedTechs, setSelectedTechs] = useState<{ [key: string]: string | null }>({});

  // Search (debounced)
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sort
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // ------- SCHEDULING (date-only) -------
  // Requires column: public.technician_assignments.scheduled_for date
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleReq, setScheduleReq] = useState<any | null>(null); // the request object
  const [scheduleReqType, setScheduleReqType] = useState<'service' | 'emergency' | null>(null);
  const [scheduleTech, setScheduleTech] = useState<string | null>(null);
  const [scheduleTechOpen, setScheduleTechOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  // ------- NEW JOB -------
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newJobType, setNewJobType] = useState<'service' | 'emergency'>('service');
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobDesc, setNewJobDesc] = useState('');
  const [newJobTech, setNewJobTech] = useState<string | null>(null);
  const [newJobTechOpen, setNewJobTechOpen] = useState(false);
  const [newJobSaving, setNewJobSaving] = useState(false);
  const descriptionInputRef = useRef<TextInput>(null);

  // ------- MANAGER NOTES -------
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesReq, setNotesReq] = useState<any | null>(null);
  const [notesText, setNotesText] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);

  const techItems = useMemo(
    () => technicians.map((t) => ({ label: t.full_name, value: t.id })),
    [technicians]
  );

  function fmtDateLocal(d: Date) {
    // YYYY-MM-DD in local time
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function openScheduleModal(req: any, presetTechId?: string) {
    setScheduleReq(req);
    setScheduleReqType(req.request_type);
    setScheduleTech(presetTechId ?? null);
    setScheduleDate(new Date());
    setScheduleOpen(true);
    setShowDatePicker(false);
  }

  const onChangeScheduleDate = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== 'ios') setShowDatePicker(false);
    if (selected) setScheduleDate(selected);
  };

  async function saveSchedule() {
    if (!scheduleReq || !scheduleReqType || !scheduleTech) {
      Alert.alert('Missing fields', 'Please choose a technician and a date.');
      return;
    }
    setScheduleSaving(true);
    try {
      const key = scheduleReq.id.toString();
      const match: any = { technician_id: scheduleTech };
      if (scheduleReqType === 'service') match.service_request_id = key;
      else match.emergency_service_request_id = key;

      // Does an assignment for this tech+request already exist?
      const { data: existing, error: exErr } = await supabase
        .from('technician_assignments')
        .select('id')
        .match(match)
        .maybeSingle();

      const patch = { scheduled_for: fmtDateLocal(scheduleDate) };

      if (exErr) {
        // If select failed for RLS reasons, fallback to insert; DB uniqueness/duplicate will be handled
        const { error: insErr } = await supabase.from('technician_assignments').insert([{ ...match, ...patch }]);
        if (insErr && insErr.code !== '23505') throw insErr;
      } else if (existing?.id) {
        // Update that row with date
        const { error: upErr } = await supabase
          .from('technician_assignments')
          .update(patch)
          .eq('id', existing.id);
        if (upErr) throw upErr;
      } else {
        // No existing row; insert a new assignment with date
        const { error: insErr } = await supabase.from('technician_assignments').insert([{ ...match, ...patch }]);
        if (insErr && insErr.code !== '23505') throw insErr;
      }

      setScheduleOpen(false);
      await fetchData();
    } catch (e: any) {
      console.error('Schedule error:', e);
      Alert.alert('Error', e?.message ?? 'Failed to schedule assignment.');
    } finally {
      setScheduleSaving(false);
    }
  }
  // ------- END SCHEDULING -------

  // Debounce search input (250ms)
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  const fetchData = useCallback(async () => {
    if (!refreshing) setLoading(true);

    const buildSearch = (qb: any) => {
      if (!debouncedQuery) return qb;
      const safe = debouncedQuery.replace(/[%_]/g, '\\$&');
      return qb.or(
        [
          `title.ilike.%${safe}%`,
          `description.ilike.%${safe}%`,
          `company.ilike.%${safe}%`,
          `contact.ilike.%${safe}%`,
        ].join(',')
      );
    };

    // Order-by column (we'll also do a final global sort client-side)
    const orderCol = sortField === 'created_at' ? 'created_at' : sortField === 'company' ? 'company' : 'title';
    const ascending = sortDir === 'asc';

    const serviceQ = buildSearch(
      supabase
        .from('service_requests')
        .select('*')
        .not('completed_job', 'is', 'true')
    ).order(orderCol as any, { ascending });

    const emergencyQ = buildSearch(
      supabase
        .from('emergency_service_requests')
        .select('*')
        .not('completed_job', 'is', 'true')
    ).order(orderCol as any, { ascending });

    const assignsQ = supabase
      .from('technician_assignments')
      .select(`
        technician_id,
        service_request_id,
        emergency_service_request_id,
        completed,
        scheduled_for,
        profiles:profiles!technician_assignments_technician_id_fkey (
          id,
          full_name
        )
      )`);

    const techsQ = supabase.from('profiles').select('id, full_name').eq('role', 'technician');

    const [
      { data: serviceData, error: serviceError },
      { data: emergencyData, error: emergencyError },
      { data: techData, error: techError },
      { data: assignDataAll, error: assignError },
    ] = await Promise.all([serviceQ, emergencyQ, techsQ, assignsQ]);

    if (serviceError || emergencyError || techError || assignError) {
      console.error('Fetch errors:', serviceError, emergencyError, techError, assignError);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Tag type and combine
    const combined = [
      ...(serviceData || []).map((r: any) => ({ ...r, request_type: 'service' as const })),
      ...(emergencyData || []).map((r: any) => ({ ...r, request_type: 'emergency' as const })),
    ];

    // Hide requests where assignments are completed (belt & suspenders)
    const completedIds = new Set(
      (assignDataAll || [])
        .filter((a: any) => a.completed)
        .map((a: any) => (a.service_request_id ?? a.emergency_service_request_id)?.toString())
    );
    const visibleRequests = combined.filter((r) => !completedIds.has(r.id.toString()));

    // Group *incomplete* assignments by request ID
    const grouped: { [key: string]: any[] } = {};
    (assignDataAll || [])
      .filter((a: any) => !a.completed)
      .forEach((a: any) => {
        const key = (a.service_request_id ?? a.emergency_service_request_id)!.toString();
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(a.profiles ? { ...a.profiles, scheduled_for: a.scheduled_for } : { scheduled_for: a.scheduled_for });
      });

    // Final global sort (ensures inter-table ordering is correct)
    const sorted = [...visibleRequests].sort((a, b) => {
      let A: any;
      let B: any;
      if (sortField === 'created_at') {
        A = new Date(a.created_at).getTime();
        B = new Date(b.created_at).getTime();
      } else if (sortField === 'company') {
        A = (a.company ?? '').toLowerCase();
        B = (b.company ?? '').toLowerCase();
      } else {
        A = (a.title ?? '').toLowerCase();
        B = (b.title ?? '').toLowerCase();
      }
      let cmp = 0;
      if (typeof A === 'number' && typeof B === 'number') {
        cmp = A - B;
      } else {
        cmp = A > B ? 1 : A < B ? -1 : 0;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    setRequests(sorted);
    setTechnicians(techData || []);
    setAssignments(grouped);
    setLoading(false);
    setRefreshing(false);
  }, [refreshing, debouncedQuery, sortField, sortDir]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  // Assign a tech
  const assignTech = async (
    requestId: string,
    technicianId: string,
    requestType: 'service' | 'emergency'
  ) => {
    setAssigning(requestId);
    const payload: any = { technician_id: technicianId };
    if (requestType === 'service') payload.service_request_id = requestId;
    else payload.emergency_service_request_id = requestId;

    const { error } = await supabase.from('technician_assignments').insert([payload]);
    if (error && error.code !== '23505') Alert.alert('Error', error.message);
    await fetchData();
    setAssigning(null);
  };

  // Unassign a tech
  const unassignTech = async (
    requestId: string,
    technicianId: string,
    requestType: 'service' | 'emergency'
  ) => {
    const matchObj: any = { technician_id: technicianId };
    if (requestType === 'service') matchObj.service_request_id = requestId;
    else matchObj.emergency_service_request_id = requestId;

    const { error } = await supabase.from('technician_assignments').delete().match(matchObj);
    if (error) Alert.alert('Error', error.message);
    else await fetchData();
  };

  // Mark a request as completed
  const markCompleted = async (req: any) => {
    const key = req.id.toString();
    const table = req.request_type === 'service' ? 'service_requests' : 'emergency_service_requests';

    Alert.alert(
      'Mark Completed',
      'Are you sure you want to mark this request as completed? It will be removed from the list.',
      [
        { text: 'No' },
        {
          text: 'Yes',
          onPress: async () => {
            setClosingId(key);
            // Optimistically remove
            setRequests((prev) => prev.filter((r) => !(r.id === req.id && r.request_type === req.request_type)));

            const { error } = await supabase.from(table).update({ completed_job: true }).eq('id', req.id);

            setClosingId(null);

            if (error) {
              Alert.alert('Update Failed', error.message || 'Could not mark as completed.');
              await fetchData(); // revert
            }
          },
        },
      ]
    );
  };

  // Notes modal open
  function openNotesModal(req: any) {
    setNotesReq(req);
    setNotesText(req.notes ?? '');
    setNotesOpen(true);
  }

  // Save manager notes
  async function saveManagerNotes() {
    if (!notesReq) return;
    try {
      setNotesSaving(true);
      const table = notesReq.request_type === 'service' ? 'service_requests' : 'emergency_service_requests';
      const { error } = await supabase
        .from(table)
        .update({ notes: notesText })
        .eq('id', notesReq.id);

      if (error) throw error;

      // reflect immediately
      setRequests(prev =>
        prev.map(r =>
          r.id === notesReq.id && r.request_type === notesReq.request_type
            ? { ...r, notes: notesText }
            : r
        )
      );
      setNotesOpen(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save note.');
    } finally {
      setNotesSaving(false);
    }
  }

  // Dropdown for a given request (assign tech quickly)
  const renderDropdown = (req: any) => {
    const key = req.id.toString();
    const already = assignments[key] || [];
    const available = technicians.filter((t) => !already.some((a) => a.id === t.id));
    const items = available.map((t) => ({ label: t.full_name, value: t.id }));

    return (
      <DropDownPicker
        open={openDropdowns[key] || false}
        value={selectedTechs[key]}
        items={items}
        setOpen={(o) => setOpenDropdowns((p) => ({ ...p, [key]: o })) }
        setValue={(valGetter) => {
          const techId = valGetter(selectedTechs[key] || null);
          if (techId) {
            assignTech(key, techId, req.request_type);
            setSelectedTechs((p) => ({ ...p, [key]: null }));
            setOpenDropdowns((p) => ({ ...p, [key]: false }));
          }
        }}
        placeholder="Select technician..."
        style={styles.picker}
        dropDownContainerStyle={styles.dropdownContainer}
        textStyle={styles.pickerText}
        listMode="SCROLLVIEW"
      />
    );
  };

  // Expandable description block (uses ONLY req.description)
  const DescriptionBlock = ({ text }: { text: string }) => {
    const [expanded, setExpanded] = useState(false);
    return (
      <TouchableOpacity onPress={() => setExpanded((e) => !e)} activeOpacity={0.7}>
        <Text style={styles.description} numberOfLines={expanded ? undefined : 3}>
          {text}
        </Text>
        {text.length > 140 ? (
          <Text style={styles.toggle}>{expanded ? 'Show less' : 'Show more'}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  // Split into unassigned vs assigned (only among visible requests)
  const assignedIds = useMemo(() => new Set(Object.keys(assignments)), [assignments]);
  const unassigned = useMemo(() => requests.filter((r) => !assignedIds.has(r.id.toString())), [requests, assignedIds]);
  const assignedList = useMemo(() => requests.filter((r) => assignedIds.has(r.id.toString())), [requests, assignedIds]);

  const CompletedButton = ({ req }: { req: any }) => {
    const busy = closingId === req.id.toString();
    return (
      <TouchableOpacity
        style={[styles.completeBtn, busy && styles.completeBtnDisabled]}
        disabled={busy}
        onPress={() => markCompleted(req)}
      >
        <Text style={styles.completeBtnText}>{busy ? 'Saving…' : 'Mark Completed'}</Text>
      </TouchableOpacity>
    );
  };

  const canCreateNewJob = useMemo(
    () => !!newJobTech && newJobTitle.trim().length > 0 && newJobDesc.trim().length > 0 && !newJobSaving,
    [newJobTech, newJobTitle, newJobDesc, newJobSaving]
  );

  const openNewJobModal = () => {
    setNewJobOpen(true);
    setNewJobType('service');
    setNewJobTitle('');
    setNewJobDesc('');
    setNewJobTech(null);
    setNewJobTechOpen(false);
  };

  const createNewJob = async () => {
    if (!newJobTech || !newJobTitle.trim() || !newJobDesc.trim()) {
      Alert.alert('Missing fields', 'Please choose a technician and enter a title & description.');
      return;
    }
    try {
      setNewJobSaving(true);

      if (newJobType === 'service') {
        // 1) Insert service request
        const { data: sr, error: srErr } = await supabase
          .from('service_requests')
          .insert([{ title: newJobTitle.trim(), description: newJobDesc.trim(), completed_job: false, suppress_alerts: true }])
          .select('id')
          .single();
        if (srErr) throw srErr;
        if (!sr?.id) throw new Error('No service request id returned.');

        // 2) Assignment
        const { error: taErr } = await supabase.from('technician_assignments').insert([
          { technician_id: newJobTech, service_request_id: sr.id, completed: false },
        ]);
        if (taErr && taErr.code !== '23505') throw taErr;
      } else {
        // Emergency request
        const { data: er, error: erErr } = await supabase
          .from('emergency_service_requests')
          .insert([{ title: newJobTitle.trim(), description: newJobDesc.trim(), completed_job: false, suppress_alerts: true }])
          .select('id')
          .single();
        if (erErr) throw erErr;
        if (!er?.id) throw new Error('No emergency request id returned.');

        const { error: taErr } = await supabase.from('technician_assignments').insert([
          { technician_id: newJobTech, emergency_service_request_id: er.id, completed: false },
        ]);
        if (taErr && taErr.code !== '23505') throw taErr;
      }

      setNewJobOpen(false);
      await fetchData();
    } catch (e: any) {
      console.error('Create job error:', e);
      Alert.alert('Error', e?.message ?? 'Failed to create the job.');
    } finally {
      setNewJobSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.primary }}>
      
      <BackButton style={styles.backButton} onPress={goBack} />
      {/* Search + Sort toolbar */}
      <View style={styles.toolbar}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search title, description, company, contact…"
          placeholderTextColor="#9aa0a6"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort:</Text>
          <Chip label="Newest" active={sortField === 'created_at'} onPress={() => setSortField('created_at')} />
          <Chip label="Company" active={sortField === 'company'} onPress={() => setSortField('company')} />
          <Chip label="Title" active={sortField === 'title'} onPress={() => setSortField('title')} />
          <TouchableOpacity style={styles.dirBtn} onPress={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
            <Text style={styles.dirBtnText}>{sortDir.toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollArea}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* HEADER + NEW JOB BUTTON */}
        <View style={styles.headerRow}>
          <Text style={styles.header}>Unassigned Calls</Text>
          <TouchableOpacity onPress={openNewJobModal} style={styles.newBtn}>
            <Text style={styles.newBtnText}>＋ New Job</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} />
        ) : unassigned.length === 0 ? (
          <Text style={styles.empty}>All calls assigned or completed.</Text>
        ) : (
          unassigned.map((req) => (
            <View key={req.id} style={[styles.card, req.request_type === 'emergency' && styles.emergencyCard]}>
              <Text style={styles.title}>{req.title}</Text>
              <Text style={styles.meta}>
                {req.company} – {req.contact}
              </Text>
              <Text style={styles.meta}>{new Date(req.created_at).toLocaleString()}</Text>

              {/* Description */}
              {typeof req.description === 'string' && req.description.trim().length > 0 ? (
                <DescriptionBlock text={req.description} />
              ) : null}

              {/* Actions */}
              <View style={[styles.actionsRow, { flexWrap: 'wrap' }]}>
                <View style={{ flex: 1, minWidth: 220 }}>{renderDropdown(req)}</View>
                <TouchableOpacity style={styles.scheduleBtn} onPress={() => openScheduleModal(req)}>
                  <Text style={styles.scheduleBtnText}>Schedule</Text>
                </TouchableOpacity>

                {/* Add/Edit Note button */}
                <TouchableOpacity style={styles.notesBtn} onPress={() => openNotesModal(req)}>
                  <Text style={styles.notesBtnText}>
                    {typeof req.notes === 'string' && req.notes.trim().length > 0 ? 'Edit Note' : 'Add Note'}
                  </Text>
                </TouchableOpacity>

                <CompletedButton req={req} />
              </View>
            </View>
          ))
        )}

        <Text style={[styles.header, { marginTop: 10 }]}>Assigned Calls</Text>
        {assignedList.length === 0 ? (
          <Text style={styles.empty}>No assigned calls pending.</Text>
        ) : (
          assignedList.map((req) => (
            <View key={req.id} style={[styles.card, req.request_type === 'emergency' && styles.emergencyCard]}>
              <Text style={styles.title}>{req.title}</Text>
              <Text style={styles.meta}>
                {req.company} – {req.contact}
              </Text>
              <Text style={styles.meta}>{new Date(req.created_at).toLocaleString()}</Text>

              {/* Description */}
              {typeof req.description === 'string' && req.description.trim().length > 0 ? (
                <DescriptionBlock text={req.description} />
              ) : null}

              <Text style={styles.meta}>Assigned Tech(s):</Text>
              {assignments[req.id.toString()]?.map((tech, idx) => (
                <View key={idx} style={styles.techRow}>
                  <Text style={styles.metaText}>
                    • {tech.full_name} {tech.scheduled_for ? `(Scheduled: ${tech.scheduled_for})` : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity onPress={() => openScheduleModal(req, tech.id)}>
                      <Text style={styles.scheduleLink}>Schedule</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => unassignTech(req.id.toString(), tech.id, req.request_type)}>
                      <Text style={styles.unassign}>✕ Unassign</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              <Text style={styles.assignLabel}>Assign Another Technician:</Text>
              <View style={styles.actionsRow}>
                <View style={{ flex: 1 }}>{renderDropdown(req)}</View>

                {/* Add/Edit Note button */}
                <TouchableOpacity style={styles.notesBtn} onPress={() => openNotesModal(req)}>
                  <Text style={styles.notesBtnText}>
                    {typeof req.notes === 'string' && req.notes.trim().length > 0 ? 'Edit Note' : 'Add Note'}
                  </Text>
                </TouchableOpacity>

                <CompletedButton req={req} />
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* SCHEDULE MODAL */}
      <Modal visible={scheduleOpen} transparent animationType="fade" onRequestClose={() => setScheduleOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Schedule Assignment</Text>
            {scheduleReq ? (
              <Text style={styles.modalSub}>
                {scheduleReq.title ?? '(no title)'} — {scheduleReq.company ?? '—'}
              </Text>
            ) : null}

            <Text style={styles.label}>Technician</Text>
            <DropDownPicker
              open={scheduleTechOpen}
              setOpen={setScheduleTechOpen}
              value={scheduleTech}
              setValue={setScheduleTech}
              items={techItems}
              setItems={() => {}}
              searchable
              listMode="MODAL"
              modalTitle="Select technician"
              placeholder="Choose a technician"
              style={styles.picker}
              dropDownContainerStyle={styles.dropdownContainer}
              textStyle={{ color: '#111' }}
            />

            <Text style={styles.label}>Date</Text>
            <TouchableOpacity style={[styles.input, { justifyContent: 'center' }]} onPress={() => setShowDatePicker(true)}>
              <Text style={{ color: '#111', fontWeight: '600' }}>{fmtDateLocal(scheduleDate)}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={scheduleDate}
                mode="date"
                display={Platform.select({ ios: 'spinner', android: 'default' })}
                onChange={onChangeScheduleDate}
              />
            )}

            <View style={styles.modalRow}>
              <TouchableOpacity style={[styles.btn, styles.btnGrey]} onPress={() => setScheduleOpen(false)}>
                <Text style={styles.btnGreyText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={saveSchedule} disabled={scheduleSaving}>
                <Text style={styles.btnText}>{scheduleSaving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* END SCHEDULE MODAL */}

{/* NEW JOB MODAL (improved keyboard handling) */}
<Modal visible={newJobOpen} transparent animationType="fade" onRequestClose={() => setNewJobOpen(false)}>
  <View style={styles.modalRoot}>
    {/* Backdrop: tap to dismiss keyboard (not the modal) */}
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.modalBackdropAbsolute} />
    </TouchableWithoutFeedback>

    {/* Foreground: lifted over keyboard on iOS */}
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0} // adjust if you have a header
      style={styles.modalCenter}
    >
      <ScrollView
        contentContainerStyle={styles.modalCard}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <Text style={styles.modalTitle}>Create New Job</Text>

        {/* Type selector */}
        <View style={styles.segment}>
          <TouchableOpacity
            onPress={() => setNewJobType('service')}
            style={[styles.segmentBtn, newJobType === 'service' && styles.segmentBtnActive]}
          >
            <Text style={[styles.segmentText, newJobType === 'service' && styles.segmentTextActive]}>Service</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setNewJobType('emergency')}
            style={[styles.segmentBtn, newJobType === 'emergency' && styles.segmentBtnActive]}
          >
            <Text style={[styles.segmentText, newJobType === 'emergency' && styles.segmentTextActive]}>Emergency</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Technician</Text>
        <DropDownPicker
          open={newJobTechOpen}
          setOpen={setNewJobTechOpen}
          value={newJobTech}
          setValue={setNewJobTech}
          items={techItems}
          setItems={() => {}}
          searchable
          listMode="MODAL"
          modalTitle="Select technician"
          placeholder="Choose a technician"
          style={styles.picker}
          dropDownContainerStyle={styles.dropdownContainer}
          textStyle={{ color: '#111' }}
        />

        <Text style={styles.label}>Title</Text>
        <TextInput
          value={newJobTitle}
          onChangeText={setNewJobTitle}
          placeholder="Enter title"
          style={styles.input}
          placeholderTextColor="#9aa0a6"
          returnKeyType="next"
          onSubmitEditing={() => {
            // Move focus to description on return
            (descriptionInputRef.current as any)?.focus?.();
          }}
          blurOnSubmit={false}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          ref={descriptionInputRef}
          value={newJobDesc}
          onChangeText={setNewJobDesc}
          placeholder="Enter description"
          style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
          placeholderTextColor="#9aa0a6"
          multiline
          returnKeyType="done"
          blurOnSubmit
          onSubmitEditing={Keyboard.dismiss}
        />

        <View style={styles.modalRow}>
          <TouchableOpacity style={[styles.btn, styles.btnGrey]} onPress={() => setNewJobOpen(false)}>
            <Text style={styles.btnGreyText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, !canCreateNewJob && { opacity: 0.6 }]}
            onPress={createNewJob}
            disabled={!canCreateNewJob}
          >
            <Text style={styles.btnText}>{newJobSaving ? 'Creating…' : 'Create'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </View>
</Modal>
{/* END NEW JOB MODAL */}


      {/* MANAGER NOTES MODAL */}
<Modal visible={notesOpen} transparent animationType="fade" onRequestClose={() => setNotesOpen(false)}>
  {/* Tap anywhere on the backdrop to dismiss the keyboard */}
  <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
    <View style={styles.modalBackdrop}>
      {/* Lift content above the keyboard on iOS */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Manager Note</Text>
          {notesReq ? (
            <Text style={styles.modalSub}>
              {notesReq.title ?? '(no title)'} — {notesReq.company ?? '—'}
            </Text>
          ) : null}

          <TextInput
            value={notesText}
            onChangeText={setNotesText}
            placeholder="Type a note for managers…"
            placeholderTextColor="#9aa0a6"
            style={[styles.input, { height: 140, textAlignVertical: 'top' }]}
            multiline
            // These help the keyboard dismiss from the keyboard itself
            returnKeyType="done"
            blurOnSubmit
            onSubmitEditing={Keyboard.dismiss}
          />

          <View style={styles.modalRow}>
            <TouchableOpacity style={[styles.btn, styles.btnGrey]} onPress={() => setNotesOpen(false)}>
              <Text style={styles.btnGreyText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={saveManagerNotes} disabled={notesSaving}>
              <Text style={styles.btnText}>{notesSaving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  </TouchableWithoutFeedback>
</Modal>
{/* END MANAGER NOTES MODAL */}

      {/* END MANAGER NOTES MODAL */}
    </View>
  );
}

/** Small UI chip */
function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[chipStyles.chip, active && chipStyles.chipActive]}>
      <Text style={[chipStyles.chipText, active && chipStyles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#4b4b4b',
    backgroundColor: '#1b1b1b',
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#2d6cdf',
    borderColor: '#2d6cdf',
  },
  chipText: { fontSize: 12, color: '#cfcfcf' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 16,
  },
  scrollArea: {
    paddingBottom: 80,
  },

  backButton: {
    marginTop: 60,
  },

  headerRow: {
    marginTop: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Toolbar
  toolbar: {
    marginTop: 15,
    marginBottom: 14,
    gap: 10,
    backgroundColor: theme.colors.primary,
  },
  searchInput: {
    backgroundColor: '#1e1f22',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  sortLabel: { color: '#c7c7c7', marginRight: 6, marginLeft: 16, fontWeight: '600' },
  dirBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#404040',
    marginLeft: 'auto',
    marginRight: 16,
  },
  dirBtnText: { color: '#fff', fontWeight: '700' },

  header: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.textOnPrimary,
  },
  newBtn: {
    marginLeft: 'auto',
    backgroundColor: '#22c55e',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  newBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },

  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  emergencyCard: {
    backgroundColor: '#ffe5e5',
    borderColor: '#ff4d4d',
    borderWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  meta: {
    fontSize: 12,
    color: theme.colors.muted,
    marginTop: 4,
  },
  assignLabel: {
    fontSize: 14,
    color: theme.colors.text,
    marginTop: 12,
  },
  picker: {
    marginTop: 8,
    borderColor: theme.colors.border,
  },
  pickerText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  dropdownContainer: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
  },
  empty: {
    fontSize: 14,
    color: theme.colors.muted,
    marginBottom: 20,
  },
  techRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
    color: theme.colors.text,
  },
  unassign: {
    fontSize: 12,
    color: theme.colors.error,
    textDecorationLine: 'underline',
  },
  scheduleLink: {
    fontSize: 12,
    color: '#2563eb',
    textDecorationLine: 'underline',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  completeBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#10B981',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeBtnDisabled: {
    opacity: 0.6,
  },
  completeBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  description: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.text,
  },
  toggle: {
    marginTop: 4,
    fontSize: 12,
    textDecorationLine: 'underline',
    color: theme.colors.primary,
  },

  // Schedule button
  scheduleBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },

  // Notes button
  notesBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#6b7280', // gray
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },

  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 16,
  },
  modalBackdropAbsolute: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginTop: 100,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalSub: { marginTop: 4, color: '#4b5563', marginBottom: 8 },
  label: { fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#fff',
    color: '#111',
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  btnPrimary: { backgroundColor: '#1f6feb' },
  btnText: { color: '#fff', fontWeight: '700' },
  btnGrey: { backgroundColor: '#e2e8f0' },
  btnGreyText: { color: '#111', fontWeight: '700' },

  // Segmented control (job type)
  segment: {
    flexDirection: 'row',
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    padding: 4,
    marginTop: 8,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#1f6feb',
  },
  segmentText: {
    color: '#1f2937',
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#fff',
  },
  modalRoot: {
  flex: 1,
  justifyContent: 'center',
},
modalCenter: {
  flex: 1,
  justifyContent: 'center',
  padding: 16,
},
});
