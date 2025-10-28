// app/technician/Assignments.tsx
import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Calendar, DateObject } from 'react-native-calendars';

type FlatAssignment = {
  // technician_assignments
  assignment_id: string;
  assigned_at: string;
  completed: boolean;
  scheduled_for?: string | null; // ← NEW (YYYY-MM-DD)

  // which table the request came from
  request_type: 'service' | 'emergency';

  // request fields (from either table)
  request_id: string | number;
  title?: string | null;
  description?: string | null;
  company?: string | null;
  contact?: string | null;
  created_at: string;
};

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function Assignments() {
  const router = useRouter();

  const [assignments, setAssignments] = useState<FlatAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Calendar selection
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());

  const fetchAssignments = useCallback(async () => {
    if (!refreshing) setLoading(true);
    setError(null);

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const session = sessionData?.session;

    if (sessionError || !session?.user) {
      setError('Could not load user session.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const techId = session.user.id;
    setUserId(techId);

    const { data, error: fetchError } = await supabase
      .from('technician_assignments')
      .select(`
        id,
        assigned_at,
        completed,
        scheduled_for,
        service_requests (
          id, title, description, company, contact, created_at
        ),
        emergency_service_requests (
          id, title, description, company, contact, created_at
        )
      `)
      .eq('technician_id', techId)
      .eq('completed', false)
      .order('assigned_at', { ascending: false });

    if (fetchError) {
      console.error(fetchError);
      setError('Failed to load assignments.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const flat: FlatAssignment[] = (data ?? [])
      .map((rec: any) => {
        const base = {
          assignment_id: String(rec.id),
          assigned_at: rec.assigned_at,
          completed: rec.completed,
          scheduled_for: rec.scheduled_for as string | null,
        };
        if (rec.service_requests) {
          const r = rec.service_requests;
          return {
            ...base,
            request_type: 'service' as const,
            request_id: r.id,
            title: r.title,
            description: r.description,
            company: r.company,
            contact: r.contact,
            created_at: r.created_at,
          };
        }
        if (rec.emergency_service_requests) {
          const r = rec.emergency_service_requests;
          return {
            ...base,
            request_type: 'emergency' as const,
            request_id: r.id,
            title: r.title,
            description: r.description,
            company: r.company,
            contact: r.contact,
            created_at: r.created_at,
          };
        }
        return null;
      })
      .filter(Boolean) as FlatAssignment[];

    setAssignments(flat);
    setLoading(false);
    setRefreshing(false);
  }, [refreshing]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAssignments();
  }, [fetchAssignments]);

  const markAsComplete = (item: FlatAssignment) => {
    if (!userId) return;

    const params: Record<string, string> = {
      request_id: String(item.request_id),
      assignment_id: String(item.assignment_id),
      company: item.company ?? '',
    };
    if (item.request_type === 'service') {
      params.service_request_id = String(item.request_id);
    } else {
      params.emergency_service_request_id = String(item.request_id);
    }

    router.push({ pathname: '/technician/report', params });
  };

  // ---- Calendar helpers ----
  const assignmentsByDate = useMemo(() => {
    const map: Record<string, FlatAssignment[]> = {};
    for (const a of assignments) {
      const d = a.scheduled_for;
      if (!d) continue;
      if (!map[d]) map[d] = [];
      map[d].push(a);
    }
    return map;
  }, [assignments]);

  const markedDates = useMemo(() => {
    // Mark days that have at least one scheduled assignment
    const marks: Record<string, any> = {};
    Object.keys(assignmentsByDate).forEach((d) => {
      marks[d] = { marked: true, dotColor: '#22c55e' };
    });
    // selected day highlight
    marks[selectedDate] = {
      ...(marks[selectedDate] || {}),
      selected: true,
      selectedColor: '#2563eb',
    };
    return marks;
  }, [assignmentsByDate, selectedDate]);

  const selectedDayAssignments = useMemo(
    () => assignmentsByDate[selectedDate] || [],
    [assignmentsByDate, selectedDate]
  );

  return (
    <View style={styles.container}>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
      <Text style={styles.header}>Upcoming Schedule</Text>
      <View style={styles.calendarCard}>
        <Calendar
          initialDate={selectedDate}
          markedDates={markedDates}
          onDayPress={(day: DateObject) => setSelectedDate(day.dateString)}
          theme={{
            calendarBackground: theme.colors.card,
            dayTextColor: theme.colors.text,
            monthTextColor: theme.colors.textOnPrimary,
            textDisabledColor: theme.colors.muted,
            arrowColor: theme.colors.primary,
            selectedDayBackgroundColor: '#2563eb',
            todayTextColor: '#22c55e',
          }}
        />
      </View>

        {loading && !refreshing ? (
          <ActivityIndicator size="large" color={theme.colors.primary} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : selectedDayAssignments.length > 0 ? (
          selectedDayAssignments.map((a) => (
            <View key={`day:${selectedDate}:${a.assignment_id}`} style={styles.card}>
              <Text style={styles.title}>{a.title}</Text>
              {a.description ? <Text style={styles.description}>{a.description}</Text> : null}
              <Text style={styles.meta}>Company: {a.company ?? '—'}</Text>
              <Text style={styles.meta}>Contact: {a.contact ?? '—'}</Text>
              <Text style={styles.meta}>Submitted: {new Date(a.created_at).toLocaleString()}</Text>
              <Text style={styles.meta}>Assigned: {new Date(a.assigned_at).toLocaleString()}</Text>
              <Text style={styles.meta}>Scheduled: {a.scheduled_for}</Text>

              <TouchableOpacity onPress={() => markAsComplete(a)} style={styles.completeButton}>
                <Text style={styles.completeText}>✔️ Mark Complete</Text>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <View style={styles.noDayCard}>
            <Text style={styles.noDayText}>No work scheduled for this day.</Text>
          </View>
        )}

        {/* ---- Optional: keep full list below ---- */}
        <Text style={[styles.header, { marginTop: 24 }]}>Assigned Calls (All)</Text>
        {assignments.length === 0 ? (
          <Text style={styles.empty}>No active assignments found.</Text>
        ) : (
          assignments.map((a) => (
            <View key={`${a.request_type}:${a.request_id}:${a.assignment_id}`} style={styles.card}>
              <Text style={styles.title}>{a.title}</Text>
              {a.description ? <Text style={styles.description}>{a.description}</Text> : null}
              <Text style={styles.meta}>Company: {a.company ?? '—'}</Text>
              <Text style={styles.meta}>Contact: {a.contact ?? '—'}</Text>
              <Text style={styles.meta}>Submitted: {new Date(a.created_at).toLocaleString()}</Text>
              <Text style={styles.meta}>Assigned: {new Date(a.assigned_at).toLocaleString()}</Text>
              {a.scheduled_for ? <Text style={styles.meta}>Scheduled: {a.scheduled_for}</Text> : null}

              <TouchableOpacity onPress={() => markAsComplete(a)} style={styles.completeButton}>
                <Text style={styles.completeText}>✔️ Mark Complete</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
  header: { fontSize: 22, fontWeight: 'bold', color: theme.colors.textOnPrimary, marginBottom: 10, marginTop: 40 },
  subHeader: { fontSize: 14, color: theme.colors.muted, marginBottom: 10 },

  calendarCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    borderColor: theme.colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 8,
    marginBottom: 10,
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
  noDayCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  noDayText: { color: theme.colors.muted },

  title: { fontSize: 18, fontWeight: '600', color: theme.colors.primaryLight, marginBottom: 6 },
  description: { fontSize: 14, color: theme.colors.text, marginBottom: 8 },
  meta: { fontSize: 12, color: theme.colors.muted, marginBottom: 4 },

  completeButton: { marginTop: 10, padding: 8, backgroundColor: '#e0ffe0', borderRadius: 6 },
  completeText: { color: 'green', fontWeight: 'bold', fontSize: 14, textAlign: 'center' },

  error: { color: theme.colors.error, fontSize: 16, textAlign: 'center' },
  empty: { fontSize: 16, color: theme.colors.muted, textAlign: 'center', marginTop: 12 },
});
