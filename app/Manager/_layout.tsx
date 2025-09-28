import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, Stack } from 'expo-router';
import { useEffect, useState } from 'react';


export default function ManagerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}/>
  );
}
