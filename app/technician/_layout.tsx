import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';


export default function TabLayout() {
  const [role, setRole] = useState<string | null>(null);
  const [isManager, setIsManager] = useState<boolean | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('role, is_manager')
        .eq('id', session.user.id)
        .maybeSingle();

      console.log('raw is_manager:', data.is_manager, '(', typeof data.is_manager, ')');
      
      if (!error && data) {
        setRole(data.role);
        setIsManager(data.is_manager);
      } else {
        console.warn('Failed to fetch role or manager status:', error?.message);
      }
    };

    fetchUserData();
  }, []);
  console.log(isManager);
  // Wait until we know the user's role & manager status
  if (role === null || isManager === null) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FFD33D',
        tabBarInactiveTintColor: theme.colors.inputBorder,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          position: 'absolute',
          bottom: 20,
          left: 20,
          right: 20,
          backgroundColor: theme.colors.primaryLight,
          borderRadius: theme.borderRadius.full,
          height: 60,
          paddingBottom: 6,
          paddingTop: 6,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
          elevation: 10,
          borderTopWidth: 0,
        },
        tabBarLabelStyle: {
          fontSize: theme.fontSize.sm,
          fontWeight: '600',
        },
      
      }}
    >

      {/* Client-only tabs */}
      {role === 'client' && (
        <>
          <Tabs.Screen
            name="Emergency Call"
            options={{
              title: 'Emergency',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? 'alert-circle' : 'alert-circle-outline'}
                  color={color}
                  size={22}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="Request Service"
            options={{
              title: 'Service',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? 'construct' : 'construct-outline'}
                  color={color}
                  size={22}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="Parts Request"
            options={{
              title: 'Parts',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? 'cog' : 'cog-outline'}
                  color={color}
                  size={18}
                />
              ),
            }}
          />
        </>
      )}

      {role === 'technician' && (
        <>
          {/* Tech tabs */}
          <Tabs.Screen
            name="tech_dashboard"
            options={{
              title: 'Dashboard',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? 'speedometer' : 'speedometer-outline'}
                  color={color}
                  size={18}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="Assignments"
            options={{
              title: 'Assignments',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? 'clipboard' : 'clipboard-outline'}
                  color={color}
                  size={18}
                />
              ),
            }}
          />
        </>
      )}

      {/* Always show “About” */}
      <Tabs.Screen
        name="about"
        options={{
          title: 'About',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'information-circle' : 'information-circle-outline'}
              color={color}
              size={22}
            />
          ),
        }}
      />
    </Tabs>
  );
}
