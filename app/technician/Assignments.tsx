// app/technician/Assignments.tsx
import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export default function Assignments() {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchAssignments = async () => {
      setLoading(true);
      setError(null);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user) {
        setError('Could not load user session.');
        setLoading(false);
        return;
      }

      const techId = session.user.id;
      setUserId(techId);

      const { data, error: fetchError } = await supabase
        .from('technician_assignments')
        .select(
          `assigned_at,
           completed,
           service_requests (
             id,title,description,company,contact,created_at
           ),
           emergency_service_requests (
             id,title,description,company,contact,created_at
           )`
        )
        .eq('technician_id', techId)
        .eq('completed', false)
        .order('assigned_at', { ascending: false });

      if (fetchError) {
        console.error(fetchError);
        setError('Failed to load assignments.');
      } else {
        // flatten both types
        const flat = (data || []).map((rec: any) => {
          if (rec.service_requests) {
            return {
              ...rec.service_requests,
              assigned_at: rec.assigned_at,
              request_type: 'service',
            };
          } else if (rec.emergency_service_requests) {
            return {
              ...rec.emergency_service_requests,
              assigned_at: rec.assigned_at,
              request_type: 'emergency',
            };
          }
          return null;
        }).filter(Boolean);
        setAssignments(flat as any[]);
      }

      setLoading(false);
    };

    fetchAssignments();
  }, []);

  const markAsComplete = async (request: any) => {
    if (!userId) return;

    // build match object depending on type
    const matchObj: any = { technician_id: userId };
    if (request.request_type === 'service') {
      matchObj.service_request_id = request.id;
    } else {
      matchObj.emergency_service_request_id = request.id;
    }

    const { error } = await supabase
      .from('technician_assignments')
      .update({ completed: true })
      .match(matchObj);

    if (error) {
      console.error('❌ Mark complete error:', error);
      Alert.alert('Error', 'Failed to mark assignment as complete.');
    } else {
      setAssignments(prev => prev.filter(a => a.id !== request.id));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Assigned Calls</Text>

      {loading ? (
        <ActivityIndicator size="large" color={theme.colors.primary} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : assignments.length === 0 ? (
        <Text style={styles.empty}>No active assignments found.</Text>
      ) : (
        <ScrollView>
          {assignments.map((assignment, idx) => (
            <View key={assignment.id || idx} style={styles.card}>
              <Text style={styles.title}>{assignment.title}</Text>
              <Text style={styles.description}>{assignment.description}</Text>
              <Text style={styles.meta}>Company: {assignment.company}</Text>
              <Text style={styles.meta}>Contact: {assignment.contact}</Text>
              <Text style={styles.meta}>
                Submitted: {new Date(assignment.created_at).toLocaleString()}
              </Text>
              <Text style={styles.meta}>
                Assigned: {new Date(assignment.assigned_at).toLocaleString()}
              </Text>

              <TouchableOpacity
                onPress={() => markAsComplete(assignment)}
                style={styles.completeButton}
              >
                <Text style={styles.completeText}>✔️ Mark Complete</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 16,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 16,
  },
  scroll: { flex: 1 },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 3,
  },
  title: { fontSize: 18, fontWeight: '600', color: theme.colors.primary, marginBottom: 6 },
  description: { fontSize: 14, color: theme.colors.text, marginBottom: 8 },
  meta: { fontSize: 12, color: theme.colors.muted },
  completeButton: { marginTop: 10, padding: 8, backgroundColor: '#e0ffe0', borderRadius: 6 },
  completeText: { color: 'green', fontWeight: 'bold', fontSize: 14, textAlign: 'center' },
  error: { color: theme.colors.error, fontSize: 16, textAlign: 'center' },
  empty: { fontSize: 16, color: theme.colors.muted, textAlign: 'center', marginTop: 32 },
});
