// app/technician/Assignments.tsx
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';

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

      setUserId(session.user.id);

      const { data, error: fetchError } = await supabase
        .from('technician_assignments')
        .select(`
          assigned_at,
          completed,
          service_requests (
            id,
            title,
            description,
            company,
            contact,
            created_at
          )
        `)
        .eq('technician_id', session.user.id)
        .eq('completed', false)
        .order('assigned_at', { ascending: false });

      if (fetchError) {
        setError('Failed to load assignments.');
        console.error(fetchError);
      } else {
        const flattened = (data || []).map((record) => ({
          ...record.service_requests,
          assigned_at: record.assigned_at,
        }));
        setAssignments(flattened);
      }

      setLoading(false);
    };

    fetchAssignments();
  }, []);

  const markAsComplete = async (requestId: string) => {
    if (!userId) return;

    const { error } = await supabase
      .from('technician_assignments')
      .update({ completed: true })
      .match({ service_request_id: requestId, technician_id: userId });

    if (error) {
      console.error('❌ Mark complete error:', error);
      Alert.alert('Error', 'Failed to mark assignment as complete.');
    } else {
      setAssignments(assignments.filter((a) => a.id !== requestId));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Assigned Service Calls</Text>

      {loading ? (
        <ActivityIndicator size="large" color={theme.colors.primary} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : assignments.length === 0 ? (
        <Text style={styles.empty}>No active assignments found.</Text>
      ) : (
        <ScrollView style={styles.scroll}>
          {assignments.map((assignment, index) => (
            <View key={assignment.id || index} style={styles.card}>
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
              <TouchableOpacity onPress={() => markAsComplete(assignment.id)}>
                <Text style={styles.completeButton}>✔️ Mark Complete</Text>
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
  scroll: {
    flex: 1,
  },
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
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    color: theme.colors.text,
    marginBottom: 8,
  },
  meta: {
    fontSize: 12,
    color: theme.colors.muted,
  },
  error: {
    color: theme.colors.error,
    fontSize: 16,
  },
  empty: {
    fontSize: 16,
    color: theme.colors.muted,
    textAlign: 'center',
    marginTop: 32,
  },
  completeButton: {
    marginTop: 10,
    color: 'green',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
