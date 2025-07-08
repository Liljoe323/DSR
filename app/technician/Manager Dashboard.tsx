import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';

export default function ManagerDashboard() {
  const [serviceRequests, setServiceRequests] = useState<any[]>([]);
  const [emergencyRequests, setEmergencyRequests] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<{ [key: string]: any[] }>({});
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [openDropdowns, setOpenDropdowns] = useState<{ [key: string]: boolean }>({});
  const [selectedTechs, setSelectedTechs] = useState<{ [key: string]: string | null }>({});

  // Fetch requests, techs, and assignments
  const fetchData = async () => {
    setLoading(true);
    const [
      { data: serviceData, error: serviceError },
      { data: emergencyData, error: emergencyError },
      { data: techData, error: techError },
      { data: assignData, error: assignError }
    ] = await Promise.all([
      supabase.from('service_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('emergency_service_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('role', 'technician'),
      supabase.from('technician_assignments').select(`
        technician_id,
        service_request_id,
        emergency_service_request_id,
        profiles:profiles!technician_assignments_technician_id_fkey (
          id, full_name
        )
      `),
    ]);

    if (serviceError || emergencyError || techError || assignError) {
      console.error('Fetch errors:', serviceError, emergencyError, techError, assignError);
      setLoading(false);
      return;
    }

    // Combine and mark type
    const combinedRequests = [
      ...(serviceData || []).map(req => ({ ...req, request_type: 'service' })),
      ...(emergencyData || []).map(req => ({ ...req, request_type: 'emergency' })),
    ];

    // Group assignments by request id
    const grouped: { [key: string]: any[] } = {};
    (assignData || []).forEach(a => {
      const key = a.service_request_id ?? a.emergency_service_request_id;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(a.profiles);
    });

    setServiceRequests(combinedRequests);
    setTechnicians(techData || []);
    setAssignments(grouped);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Assign tech helper without ON CONFLICT
  const assignTech = async (
    requestId: string,
    technicianId: string,
    requestType: 'service' | 'emergency'
  ) => {
    setAssigning(requestId);
    const payload: any = { technician_id: technicianId };
    if (requestType === 'service') payload.service_request_id = requestId;
    else payload.emergency_service_request_id = requestId;

    const { data, error } = await supabase
      .from('technician_assignments')
      .insert([payload]);

    if (error && error.code !== '23505') {
      // ignore unique violation, alert others
      Alert.alert('Error', error.message);
    }
    await fetchData();
    setAssigning(null);
  };

  // Unassign helper remains same
  const unassignTech = async (
    requestId: string,
    technicianId: string,
    requestType: 'service' | 'emergency'
  ) => {
    const matchObj: any = { technician_id: technicianId };
    if (requestType === 'service') matchObj.service_request_id = requestId;
    else matchObj.emergency_service_request_id = requestId;

    const { error } = await supabase
      .from('technician_assignments')
      .delete()
      .match(matchObj);

    if (error) Alert.alert('Error', error.message);
    else await fetchData();
  };

  // Render dropdown with branching
  const renderDropdown = (req: any) => {
    const requestKey = req.id.toString();
    const already = assignments[requestKey] || [];
    const available = technicians.filter(t => !already.some(a => a.id === t.id));
    const items = available.map(t => ({ label: t.full_name, value: t.id }));

    return (
      <DropDownPicker
        open={openDropdowns[requestKey] || false}
        value={selectedTechs[requestKey]}
        items={items}
        setOpen={o => setOpenDropdowns(prev => ({ ...prev, [requestKey]: o }))}
        setValue={val => {
          const techId = val(selectedTechs[requestKey] || null);
          if (techId) {
            assignTech(requestKey, techId, req.request_type);
            setSelectedTechs(p => ({ ...p, [requestKey]: null }));
            setOpenDropdowns(p => ({ ...p, [requestKey]: false }));
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

  // Separate assigned/unassigned
  const assignedIds = new Set(Object.keys(assignments));
  const unassigned = serviceRequests.filter(r => !assignedIds.has(r.id.toString()));
  const assignedList = serviceRequests.filter(r => assignedIds.has(r.id.toString()));

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Unassigned Calls</Text>
      {loading ? (
        <ActivityIndicator size="large" color={theme.colors.primary} />
      ) : unassigned.length === 0 ? (
        <Text style={styles.empty}>All calls assigned.</Text>
      ) : (
        unassigned.map(req => (
          <View
            key={req.id}
            style={[styles.card, req.request_type === 'emergency' && styles.emergencyCard]}
          >
            <Text style={styles.title}>{req.title}</Text>
            <Text style={styles.meta}>{req.company} - {req.contact}</Text>
            <Text style={styles.meta}>{new Date(req.created_at).toLocaleString()}</Text>
            {renderDropdown(req)}
          </View>
        ))
      )}

      <Text style={styles.header}>Assigned Calls</Text>
      {assignedList.length === 0 ? (
        <Text style={styles.empty}>No assigned calls yet.</Text>
      ) : (
        assignedList.map(req => (
          <View
            key={req.id}
            style={[styles.card, req.request_type === 'emergency' && styles.emergencyCard]}
          >
            <Text style={styles.title}>{req.title}</Text>
            <Text style={styles.meta}>{req.company} - {req.contact}</Text>
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
            <Text style={styles.assignLabel}>Assign Additional Technician:</Text>
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
