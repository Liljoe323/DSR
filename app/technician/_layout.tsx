import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';

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

      console.log('Fetched profile:', data); // Debug log

      if (!error && data) {
        setRole(data.role);
        setIsManager(data.is_manager === true);
      } else {
        console.warn('Failed to fetch role or manager status:', error?.message);
      }
    };

    fetchUserData();
  }, []);

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
          backgroundColor: theme.colors.primary,
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
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={22} />
          ),
        }}
      />

      {role === 'client' && (
        <>
          <Tabs.Screen
            name="Emergency Call"
            options={{
              title: 'Emergency',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? 'alert-circle' : 'alert-circle-outline'} color={color} size={22} />
              ),
            }}
          />
          <Tabs.Screen
            name="Request Service"
            options={{
              title: 'Service',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? 'construct' : 'construct-outline'} color={color} size={22} />
              ),
            }}
          />
          <Tabs.Screen
            name="Parts Request"
            options={{
              title: 'Parts',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? 'cog' : 'cog-outline'} color={color} size={22} />
              ),
            }}
          />
        </>
      )}

      {role === 'technician' && (
        <>
          <Tabs.Screen
            name="technician/dashboard"
            options={{
              title: 'Dashboard',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? 'speedometer' : 'speedometer-outline'} color={color} size={22} />
              ),
            }}
          />
          <Tabs.Screen
            name="technician/Assignments"
            options={{
              title: 'Assignments',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? 'clipboard' : 'clipboard-outline'} color={color} size={22} />
              ),
            }}
          />
        </>
      )}

      {isManager === true && (
        <>
          <Tabs.Screen
            name="technician/ManagerDashboard"
            options={{
              title: 'Manager',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? 'briefcase' : 'briefcase-outline'} color={color} size={22} />
              ),
            }}
          />
          <Tabs.Screen
            name="technician/ManagerParts"
            options={{
              title: 'Parts',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? 'cube' : 'cube-outline'} color={color} size={22} />
              ),
            }}
          />
        </>
      )}

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
