import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Modal from 'react-native-modal';

type Props = {
  isVisible: boolean;
  onClose: () => void;
};

export default function AuthModal({ isVisible, onClose }: Props) {
  const router = useRouter();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'client' | 'technician'>('client');
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    if (!email || !password) {
      return Alert.alert('Missing fields', 'Please enter both email and password.');
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp(
          { email, password },
          //{ redirectTo: '/account' } // optional: for deep linking after email confirm
        );

        if (error) throw error;

        const userId = data.user?.id;
        if (!userId) throw new Error('User ID not returned after signup.');

        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{ id: userId, role, full_name: '', company: '' }]);

        if (profileError) throw profileError;

        if (role === 'technician') {
  await supabase.from('profiles').insert([
    { id: userId, role, full_name: '', company: '' }
  ]);

  Alert.alert(
    'Account Created',
    'Please check your email to confirm your account. Once confirmed, log in to complete your profile.'
  );

  setIsSignUp(false); // Switch to login form
  setEmail('');
  setPassword('');
}




        setEmail('');
        setPassword('');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        Alert.alert('Login Successful');
        setEmail('');
        setPassword('');
        onClose();
      }
    } catch (err: any) {
      console.error('Auth error:', err.message);
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isVisible={isVisible} onBackdropPress={onClose}>
      <View style={styles.modal}>
        <Text style={styles.title}>{isSignUp ? 'Sign Up' : 'Log In'}</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#888"
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={setEmail}
          value={email}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#888"
          secureTextEntry
          onChangeText={setPassword}
          value={password}
        />

        {isSignUp && (
          <View style={styles.roleSelector}>
            {['client', 'technician'].map((r) => (
              <TouchableOpacity
                key={r}
                onPress={() => setRole(r as 'client' | 'technician')}
                style={[styles.roleButton, role === r && styles.roleSelected]}
              >
                <Text style={[styles.roleLabel, role === r && styles.roleLabelSelected]}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.submit, loading && { opacity: 0.6 }]}
          onPress={handleAuth}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>
              {isSignUp ? 'Create Account' : 'Log In'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)}>
          <Text style={styles.switchText}>
            {isSignUp
              ? 'Already have an account? Log in'
              : "Don't have an account? Sign up"}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 16,
  },
  input: {
    width: '100%',
    borderColor: '#ccc',
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
    borderRadius: 8,
  },
  roleSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  roleButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginHorizontal: 5,
  },
  roleSelected: {
    backgroundColor: '#007aff',
    borderColor: '#007aff',
  },
  roleLabel: {
    color: '#333',
    fontWeight: '500',
  },
  roleLabelSelected: {
    color: '#fff',
  },
  submit: {
    backgroundColor: '#007aff',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
    width: '100%',
    alignItems: 'center',
  },
  submitText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  switchText: {
    marginTop: 12,
    color: '#007aff',
  },
});
