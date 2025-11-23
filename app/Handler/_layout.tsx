// app/Handler/_layout.tsx
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import theme from '@/styles/theme';


export default function HandlerLayout() {
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

<Tabs.Screen
        name="tech_dashboard"
        options={{
          tabBarLabel: 'Dashboard',
          title: 'Dashboard',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={18} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="report_lookup"
        options={{
          tabBarLabel: 'Service Reports',
          title: 'Service Reports',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'document-text' : 'document-text-outline'}
              size={18}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="invoices"
        options={{
          tabBarLabel: 'Invoice Export ',
          title: 'Invoices',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'card' : 'card-outline'} size={18} color={color} />
          ),
        }}
      />
    
    
      <Tabs.Screen
        name="service_reports"
        options={{
          tabBarLabel: 'QB Entry',
          title: 'QB Entry',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'file-tray-full' : 'file-tray-full-outline'} size={18} color={color} />
          ),
        }}
      />


      <Tabs.Screen
        name="parts"
        options={{
          tabBarLabel: 'Parts',
          title: 'Parts',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'construct' : 'construct-outline'} size={18} color={color} />
          ),
        }}
      />


      <Tabs.Screen
        name="Parts Request"
        options={{
          tabBarLabel: 'Parts request',
          title: 'Parts Request',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'construct' : 'construct-outline'} size={18} color={color} />
          ),
        }}
      />

       <Tabs.Screen
        name="Request Service"
        options={{
          href: null,
          tabBarLabel: 'Parts request',
          title: 'Parts Request',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'construct' : 'construct-outline'} size={18} color={color} />
          ),
        }}
      />

    </Tabs>
  );
}
