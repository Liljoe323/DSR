import Button from '@/components/Button';
import ImageViewer from '@/components/imageviewer';
import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';

import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { Buffer } from 'buffer';

import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const PlaceholderImage = require('@/assets/images/dsr.jpg');

// ---------- Helpers: base64 -> bytes, and URI -> JPEG bytes ----------
function b64ToBytes(b64: string) {
  try {
    // Prefer Buffer when available (Expo has it)
    const buf = Buffer.from(b64, 'base64');
    return new Uint8Array(buf);
  } catch {
    // Fallback to atob if polyfilled
    // @ts-ignore
    const bin = typeof atob === 'function' ? atob(b64) : '';
    const len = bin.length;
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
}

// Convert any content:// or file:// URI to compressed JPEG bytes
async function uriToJpegBytes(uri: string, maxWidth = 1600, jpegQuality = 0.8) {
  // Normalize (resize + force JPEG). Fixes iOS HEIC and reduces Android payloads.
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress: jpegQuality, format: ImageManipulator.SaveFormat.JPEG }
  );

  // Read as base64 so it works for content:// on Android
  const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return b64ToBytes(base64);
}

export default function RequestService() {
  const [images, setImages] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [company, setCompany] = useState('');
  const [contact, setContact] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    const fetchUserProfile = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('company, full_name, phone_number')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error fetching profile:', error.message);
        return;
      }

      if (profile) {
        setCompany(profile.company || '');
        setContact(profile.full_name || '');
        setPhoneNumber(profile.phone_number || '');
        setProfileLoaded(true);
      }
    };

    fetchUserProfile();
  }, []);

  const pickImageAsync = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Permission to access media library is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,        // no base64; we’ll read file ourselves
    });

    if (!result.canceled) {
      setImages((prev) => [...prev, result.assets[0].uri]); // content:// on Android, file:// on iOS
    } else {
      Alert.alert('Image Selection Cancelled', 'You did not select any image.');
    }
  };

  const takePhotoAsync = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Permission to use camera is required!');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,        // no base64; we’ll read file ourselves
    });

    if (!result.canceled) {
      setImages((prev) => [...prev, result.assets[0].uri]);
    } else {
      Alert.alert('Camera Cancelled', 'You did not take a photo.');
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert('Missing info', 'Please provide a title and description.');
      return;
    }

    const uploadedUrls: string[] = [];

    try {
      // Upload sequentially to keep memory use low
      for (const uri of images) {
        // Ensure the file exists before reading
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists) throw new Error('File does not exist');

        // Convert to JPEG bytes (works for HEIC, content://, etc.)
        const bytes = await uriToJpegBytes(uri, 1600, 0.8);
        const fileName = `client-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('service-request-pictures')
          .upload(fileName, bytes, {
            contentType: 'image/jpeg',
            upsert: true, // keep your original behavior; set to false if you prefer no overwrite
          });

        if (uploadError) throw uploadError;

        const { data } = supabase
          .storage
          .from('service-request-pictures')
          .getPublicUrl(fileName);

        uploadedUrls.push(data.publicUrl);
      }

      const { error } = await supabase.from('service_requests').insert([{
        title,
        description,
        company,
        contact,
        phone_number: phoneNumber,
        image_url: uploadedUrls,
      }]);

      if (error) {
        Alert.alert('Submission Failed', error.message);
      } else {
        Alert.alert('Request Submitted');
        setTitle('');
        setDescription('');
        setImages([]);
        if (!profileLoaded) {
          setCompany('');
          setContact('');
          setPhoneNumber('');
        }
      }
    } catch (err: any) {
      console.error('Upload failed:', err?.message || err);
      Alert.alert('Upload failed', err?.message ?? 'Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ImageViewer imgSource={PlaceholderImage} mode="banner" />

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.text}>Request A Service</Text>

          <TextInput
            style={styles.input}
            placeholder="Request Title"
            placeholderTextColor={theme.colors.muted}
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe the issue"
            placeholderTextColor={theme.colors.muted}
            multiline
            numberOfLines={4}
            value={description}
            onChangeText={setDescription}
          />

          {(!company || !contact || !phoneNumber) && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Company"
                placeholderTextColor={theme.colors.muted}
                value={company}
                onChangeText={setCompany}
              />
              <TextInput
                style={styles.input}
                placeholder="Contact Info"
                placeholderTextColor={theme.colors.muted}
                value={contact}
                onChangeText={setContact}
              />
              <TextInput
                style={styles.input}
                placeholder="Phone Number"
                placeholderTextColor={theme.colors.muted}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
              />
            </>
          )}

          <View style={styles.stackedButtons}>
            <Button theme="primary" label="Add Photo" onPress={pickImageAsync} />
            <View style={{ height: 12 }} />
            <Button theme="secondary" label="Take Photo" onPress={takePhotoAsync} />
          </View>

          <View style={styles.thumbnailContainer}>
            {images.map((uri, index) => (
              <View key={index} style={styles.thumbnailWrapper}>
                <Image source={{ uri }} style={styles.thumbnail} />
                <Pressable onPress={() => removeImage(index)} style={styles.removeButton}>
                  <Text style={styles.removeButtonText}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>

          <View style={{ marginTop: theme.spacing.lg }}>
            <Button theme="primary" label="Submit Request" onPress={handleSubmit} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
  },
  scrollContent: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
  },
  text: {
    color: theme.colors.textOnPrimary,
    fontSize: theme.fontSize.lg,
    marginBottom: theme.spacing.md,
  },
  input: {
    width: '100%',
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    fontSize: theme.fontSize.base,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  stackedButtons: {
    flexDirection: 'column',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  thumbnailContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: theme.spacing.sm,
  },
  thumbnailWrapper: {
    position: 'relative',
    marginRight: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    alignItems: 'center',
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: theme.colors.error,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  removeButtonText: {
    color: theme.colors.textOnPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: 'bold',
    lineHeight: 24,
  },
});