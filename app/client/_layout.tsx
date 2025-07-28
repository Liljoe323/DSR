import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';

export default function TabLayout() {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const fetchRole = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;

      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!error && data?.role) {
        setRole(data.role);
      }
    };

    fetchRole();
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FFD33D',
        tabBarInactiveTintColor: theme.colors.inputBorder,
        tabBarHideOnKeyboard: true, // ✅ Hides on keyboard open
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
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home-sharp' : 'home-outline'} color={color} size={18} />
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
                <Ionicons
                  name={focused ? 'alert-circle' : 'alert-circle-outline'}
                  color={color}
                  size={18}
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
                  size={18}
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
                  name={focused ? 'cube' : 'cube-outline'}
                  color={color}
                  size={18}
                />
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
              size={18}
            />
          ),
        }}
      />
    </Tabs>
  );
}