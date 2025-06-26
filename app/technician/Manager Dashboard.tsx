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
} from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';

export default function ManagerDashboard() {
  const [serviceRequests, setServiceRequests] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<{ [key: string]: any[] }>({});
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [openDropdowns, setOpenDropdowns] = useState<{ [key: string]: boolean }>({});
  const [selectedTechs, setSelectedTechs] = useState<{ [key: string]: string | null }>({});

  const fetchData = async () => {
    setLoading(true);

    const [
      { data: serviceData, error: serviceError },
      { data: emergencyData, error: emergencyError },
      { data: techData, error: techError },
      { data: assignmentData, error: assignError }
    ] = await Promise.all([
      supabase.from('service_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('emergency_service_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('role', 'technician'),
      supabase.from('technician_assignments').select(`
        technician_id,
        service_request_id,
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

    const combinedRequests = [
      ...(serviceData || []).map((req) => ({ ...req, request_type: 'standard' })),
      ...(emergencyData || []).map((req) => ({ ...req, request_type: 'emergency' })),
    ];

    const grouped: { [key: string]: any[] } = {};
    for (const assign of assignmentData || []) {
      const reqId = assign.service_request_id.toString();
      if (!grouped[reqId]) grouped[reqId] = [];
      grouped[reqId].push(assign.profiles);
    }

    setServiceRequests(combinedRequests);
    setTechnicians(techData || []);
    setAssignments(grouped);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const assignTech = async (requestId: string, technicianId: string) => {
    setAssigning(requestId);

    const { error } = await supabase
      .from('technician_assignments')
      .upsert(
        [{ service_request_id: requestId, technician_id: technicianId }],
        { onConflict: ['service_request_id', 'technician_id'] }
      );

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Success', 'Technician assigned.');
      await fetchData();
    }

    setAssigning(null);
  };

  const unassignTech = async (requestId: string, technicianId: string) => {
    const { error } = await supabase
      .from('technician_assignments')
      .delete()
      .match({ service_request_id: requestId, technician_id: technicianId });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      await fetchData();
    }
  };

  const renderDropdown = (requestId: string) => {
    const requestKey = requestId.toString();
    const alreadyAssigned = assignments[requestKey] || [];
    const availableTechs = technicians.filter(
      (tech) => !alreadyAssigned.some((t) => t.id === tech.id)
    );

    const items = availableTechs.map((tech) => ({
      label: tech.full_name,
      value: tech.id,
    }));

    return (
      <DropDownPicker
        open={openDropdowns[requestKey] || false}
        value={selectedTechs[requestKey] || null}
        items={items}
        setOpen={(open) => setOpenDropdowns((prev) => ({ ...prev, [requestKey]: open }))}
        setValue={(callback) => {
          const value = callback(selectedTechs[requestKey] || null);
          if (value) {
            assignTech(requestKey, value);
            setSelectedTechs((prev) => ({ ...prev, [requestKey]: null }));
            setOpenDropdowns((prev) => ({ ...prev, [requestKey]: false }));
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

  const assignedIds = new Set(Object.keys(assignments).map((id) => id.toString()));
  const unassigned = serviceRequests.filter((req) => !assignedIds.has(req.id.toString()));
  const assigned = serviceRequests.filter((req) => assignedIds.has(req.id.toString()));

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Unassigned Calls</Text>
      {loading ? (
        <ActivityIndicator size="large" color={theme.colors.primary} />
      ) : unassigned.length === 0 ? (
        <Text style={styles.empty}>All calls assigned.</Text>
      ) : (
        unassigned.map((request) => (
          <View
            key={request.id}
            style={[
              styles.card,
              request.request_type === 'emergency' && styles.emergencyCard,
            ]}
          >
            <Text style={styles.title}>{request.title}</Text>
            <Text style={styles.meta}>{request.company} - {request.contact}</Text>
            <Text style={styles.meta}>{new Date(request.created_at).toLocaleString()}</Text>
            {renderDropdown(request.id)}
          </View>
        ))
      )}

      <Text style={styles.header}>Assigned Calls</Text>
      {assigned.length === 0 ? (
        <Text style={styles.empty}>No assigned calls yet.</Text>
      ) : (
        assigned.map((request) => (
          <View
            key={request.id}
            style={[
              styles.card,
              request.request_type === 'emergency' && styles.emergencyCard,
            ]}
          >
            <Text style={styles.title}>{request.title}</Text>
            <Text style={styles.meta}>{request.company} - {request.contact}</Text>
            <Text style={styles.meta}>{new Date(request.created_at).toLocaleString()}</Text>
            <Text style={styles.meta}>Assigned Tech(s):</Text>
            {assignments[request.id.toString()]?.map((tech, idx) => (
              <View key={idx} style={styles.techRow}>
                <Text style={styles.metaText}>• {tech.full_name}</Text>
                <Text
                  style={styles.unassign}
                  onPress={() => unassignTech(request.id, tech.id)}
                >
                  ✕ Unassign
                </Text>
              </View>
            ))}
            <Text style={styles.assignLabel}>Assign Additional Technician:</Text>
            {renderDropdown(request.id)}
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