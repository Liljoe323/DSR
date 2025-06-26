import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import ImageViewer from '@/components/imageviewer';
import { useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import theme from '@/styles/theme';

const PlaceholderImage = require('@/assets/images/dsr.jpg');

export default function AccountScreen() {
  const [profile, setProfile] = useState({
    full_name: '',
    phone_number: '',
    company: '',
    role: '',
  });
  const [loading, setLoading] = useState(false);
  const [addressPromptVisible, setAddressPromptVisible] = useState(false);
  const [newCompanyAddress, setNewCompanyAddress] = useState('');
  const router = useRouter();
  const navigation = useNavigation();

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, phone_number, company, role')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error(error);
        Alert.alert('Error loading profile');
      } else {
        setProfile({
          full_name: data.full_name || '',
          phone_number: data.phone_number || '',
          company: data.company || '',
          role: data.role || '',
        });
      }
      setLoading(false);
    };

    loadProfile();
  }, []);

  const updateProfile = async () => {
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return;

    if (profile.company) {
      const { data: existingCompany, error: companyError } = await supabase
        .from('companies')
        .select('id')
        .eq('company_name', profile.company)
        .maybeSingle();

      if (companyError) {
        console.error(companyError);
        Alert.alert('Error checking company');
        setLoading(false);
        return;
      }

      if (!existingCompany) {
        setAddressPromptVisible(true);
        setLoading(false);
        return;
      }
    }

    await saveProfile(user.id);
  };

  const saveProfile = async (userId: string) => {
    const updates = {
      id: userId,
      ...profile,
      phone_number: profile.phone,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('profiles').upsert(updates);

    if (error) {
      console.error(error);
      Alert.alert('Error updating profile');
    } else {
      Alert.alert('Profile updated');
    }
    setLoading(false);
  };

  const insertCompanyAndSave = async () => {
    setAddressPromptVisible(false);

    const { error: insertError } = await supabase.from('companies').insert({
      company_name: profile.company,
      service_address: newCompanyAddress,
    });

    if (insertError) {
      console.error(insertError);
      Alert.alert('Error saving new company');
    } else {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (user) await saveProfile(user.id);
    }
    setNewCompanyAddress('');
  };

  const handleChange = (field: string, value: string) => {
    setProfile({ ...profile, [field]: value });
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Logout error', error.message);
    } else {
      router.replace('/');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      <ImageViewer imgSource={PlaceholderImage} mode="banner" />

      <View style={styles.card}>
        <Text style={styles.title}>Account Info</Text>

        <TextInput
          style={styles.input}
          placeholder="Full Name"
          value={profile.full_name}
          onChangeText={(text) => handleChange('full_name', text)}
        />
        <TextInput
          style={styles.input}
          placeholder="Phone Number"
          value={profile.phone_number}
          onChangeText={(text) => handleChange('phone_number', text)}
        />
        <TextInput
          style={styles.input}
          placeholder="Company"
          value={profile.company}
          onChangeText={(text) => handleChange('company', text)}
        />

        <TouchableOpacity
          style={[styles.button, styles.saveButton]}
          onPress={updateProfile}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Saving...' : 'Save Changes'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.logoutButton]} onPress={handleLogout}>
          <Text style={styles.buttonText}>Log Out</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={addressPromptVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Company Service Address</Text>
            <TextInput
              placeholder="Enter service address"
              value={newCompanyAddress}
              onChangeText={setNewCompanyAddress}
              style={styles.input}
            />
            <TouchableOpacity style={styles.button} onPress={insertCompanyAndSave}>
              <Text style={styles.buttonText}>Submit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 16,
    color: theme.colors.link || '#007AFF',
  },
  card: {
    margin: theme.spacing.lg,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: theme.fontSize.xl,
    color: theme.colors.textOnPrimary,
    fontWeight: 'bold',
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  input: {
    backgroundColor: theme.colors.inputBackground,
    borderColor: theme.colors.inputBorder,
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    fontSize: theme.fontSize.base,
    color: theme.colors.text,
  },
  button: {
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  saveButton: {
    backgroundColor: theme.colors.success,
  },
  logoutButton: {
    backgroundColor: theme.colors.error,
  },
  buttonText: {
    color: theme.colors.textOnPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
  },
  modalTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    marginBottom: theme.spacing.md,
  },
});