import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';
import { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';

export default function ManagerDashboard() {
  const [requests, setRequests] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<{ [key: string]: any[] }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [openDropdowns, setOpenDropdowns] = useState<{ [key: string]: boolean }>({});
  const [selectedTechs, setSelectedTechs] = useState<{ [key: string]: string | null }>({});

  const fetchData = useCallback(async () => {
    if (!refreshing) setLoading(true);

    // 1. grab service & emergency calls
    const [
      { data: serviceData, error: serviceError },
      { data: emergencyData, error: emergencyError },
      // 2. grab all tech profiles
      { data: techData, error: techError },
      // 3. grab *all* assignments (so we can see which are complete)
      { data: assignDataAll, error: assignError },
    ] = await Promise.all([
      supabase.from('service_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('emergency_service_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('role', 'technician'),
      supabase
        .from('technician_assignments')
        .select(`
          technician_id,
          service_request_id,
          emergency_service_request_id,
          completed,
          profiles:profiles!technician_assignments_technician_id_fkey (
            id,
            full_name
          )
        `),
    ]);

    if (serviceError || emergencyError || techError || assignError) {
      console.error('Fetch errors:', serviceError, emergencyError, techError, assignError);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Combine into one list with a request_type flag
    const combined = [
      ...(serviceData || []).map(r => ({ ...r, request_type: 'service' as const })),
      ...(emergencyData || []).map(r => ({ ...r, request_type: 'emergency' as const })),
    ];

    // Split assignments into incomplete vs completed
    const incomplete = (assignDataAll || []).filter(a => !a.completed);
    const completedIds = new Set(
      (assignDataAll || [])
        .filter(a => a.completed)
        .map(a => (a.service_request_id ?? a.emergency_service_request_id)?.toString())
    );

    // Filter out any call that’s been marked complete
    const visibleRequests = combined.filter(r => !completedIds.has(r.id.toString()));

    // Group *incomplete* assignments by request ID
    const grouped: { [key: string]: any[] } = {};
    incomplete.forEach(a => {
      const key = (a.service_request_id ?? a.emergency_service_request_id)!.toString();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(a.profiles);
    });

    setRequests(visibleRequests);
    setTechnicians(techData || []);
    setAssignments(grouped);
    setLoading(false);
    setRefreshing(false);
  }, [refreshing]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Pull-to-refresh
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
    if (error && error.code !== '23505') {
      Alert.alert('Error', error.message);
    }
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

  // Render the dropdown for a given request
  const renderDropdown = (req: any) => {
    const key = req.id.toString();
    const already = assignments[key] || [];
    const available = technicians.filter(t => !already.some(a => a.id === t.id));
    const items = available.map(t => ({ label: t.full_name, value: t.id }));

    return (
      <DropDownPicker
        open={openDropdowns[key] || false}
        value={selectedTechs[key]}
        items={items}
        setOpen={o => setOpenDropdowns(p => ({ ...p, [key]: o }))}
        setValue={valGetter => {
          const techId = valGetter(selectedTechs[key] || null);
          if (techId) {
            assignTech(key, techId, req.request_type);
            setSelectedTechs(p => ({ ...p, [key]: null }));
            setOpenDropdowns(p => ({ ...p, [key]: false }));
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

  // Split into unassigned vs assigned (only among visible requests)
  const assignedIds = new Set(Object.keys(assignments));
  const unassigned = requests.filter(r => !assignedIds.has(r.id.toString()));
  const assignedList = requests.filter(r => assignedIds.has(r.id.toString()));

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.header}>Unassigned Calls</Text>
      {loading ? (
        <ActivityIndicator size="large" color={theme.colors.primary} />
      ) : unassigned.length === 0 ? (
        <Text style={styles.empty}>All calls assigned or completed.</Text>
      ) : (
        unassigned.map(req => (
          <View
            key={req.id}
            style={[styles.card, req.request_type === 'emergency' && styles.emergencyCard]}
          >
            <Text style={styles.title}>{req.title}</Text>
            <Text style={styles.meta}>
              {req.company} – {req.contact}
            </Text>
            <Text style={styles.meta}>{new Date(req.created_at).toLocaleString()}</Text>
            {renderDropdown(req)}
          </View>
        ))
      )}

      <Text style={styles.header}>Assigned Calls</Text>
      {assignedList.length === 0 ? (
        <Text style={styles.empty}>No assigned calls pending.</Text>
      ) : (
        assignedList.map(req => (
          <View
            key={req.id}
            style={[styles.card, req.request_type === 'emergency' && styles.emergencyCard]}
          >
            <Text style={styles.title}>{req.title}</Text>
            <Text style={styles.meta}>
              {req.company} – {req.contact}
            </Text>
            <Text style={styles.meta}>{new Date(req.created_at).toLocaleString()}</Text>
            <Text style={styles.meta}>Assigned Tech(s):</Text>
            {assignments[req.id.toString()]?.map((tech, idx) => (
              <View key={idx} style={styles.techRow}>
                <Text style={styles.metaText}>• {tech.full_name}</Text>
                <TouchableOpacity
                  onPress={() => unassignTech(req.id.toString(), tech.id, req.request_type)}
                >
                  <Text style={styles.unassign}>✕ Unassign</Text>
                </TouchableOpacity>
              </View>
            ))}
            <Text style={styles.assignLabel}>Assign Another Technician:</Text>
            {renderDropdown(req)}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 16,
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginVertical: 12,
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
});