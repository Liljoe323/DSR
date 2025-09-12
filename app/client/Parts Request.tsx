import Button from '@/components/Button';
import ImageViewer from '@/components/imageviewer';
import { supabase } from '@/lib/supabase';
import theme from '@/styles/theme';
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from 'expo-image-picker';
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

// ---- Helpers for cross-platform uploads ----

// Base64 -> Uint8Array (works with or without Buffer polyfill)
function b64ToBytes(b64: string) {
  // @ts-ignore
  if (typeof atob === 'function') {
    // @ts-ignore
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  // Fallback to Buffer if available
  // @ts-ignore
  const buf = Buffer.from(b64, 'base64');
  return new Uint8Array(buf);
}

// Convert any URI (content:// or file://) to compressed JPEG bytes
async function uriToJpegBytes(uri: string, maxWidth = 1600, jpegQuality = 0.8) {
  // Normalize/resize & force JPEG (fixes iOS HEIC, reduces Android payloads)
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress: jpegQuality, format: ImageManipulator.SaveFormat.JPEG }
  );

  // Read as base64 so this works for content:// on Android
  const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return b64ToBytes(base64);
}

export default function RequestParts() {
  const [images, setImages] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [company, setCompany] = useState('');
  const [contact, setContact] = useState('');
  const [isProfileLoaded, setIsProfileLoaded] = useState(false);

  useEffect(() => {
    const fetchUserProfile = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('company, full_name')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error fetching profile:', error.message);
        return;
      }

      if (profile) {
        setCompany(profile.company || '');
        setContact(profile.full_name || '');
        setIsProfileLoaded(true);
      }
    };

    fetchUserProfile();
  }, []);

  const pickImageAsync = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      setImages((prev) => [...prev, result.assets[0].uri]); // content:// on Android, file:// on iOS
    } else {
      Alert.alert('Image Selection Cancelled', 'You did not select any image.');
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

    let uploadedUrls: string[] = [];

    try {
      // Upload sequentially to keep memory usage low
      for (const uri of images) {
        // Always convert to JPEG bytes (cross-platform safe)
        const bytes = await uriToJpegBytes(uri, 1600, 0.8);
        const fileName = `client-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('parts-request-pictures')
          .upload(fileName, bytes, {
            contentType: 'image/jpeg',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from('parts-request-pictures')
          .getPublicUrl(fileName);

        uploadedUrls.push(data.publicUrl);
      }

      const { error } = await supabase.from('parts_requests').insert([
        {
          title,
          description,
          company,
          contact,
          image_url: uploadedUrls, // jsonb/text[] in your table
        },
      ]);

      if (error) {
        Alert.alert('Submission Failed', error.message);
      } else {
        Alert.alert('Request Submitted');
        setTitle('');
        setDescription('');
        setImages([]);
        // keep company and contact
      }
    } catch (error: any) {
      console.error('Upload failed:', error?.message || error);
      Alert.alert('Upload failed', error?.message ?? 'Please try again.');
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
          <Text style={styles.text}>Request A Part</Text>

          <TextInput
            style={styles.input}
            placeholder="Request Title"
            placeholderTextColor={theme.colors.muted}
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe the part"
            placeholderTextColor={theme.colors.muted}
            multiline
            numberOfLines={4}
            value={description}
            onChangeText={setDescription}
          />

          {!isProfileLoaded && (
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
            </>
          )}

          <View style={styles.row}>
            <Button theme="primary" label="Add Photo" onPress={pickImageAsync} />
          </View>

          <View style={styles.thumbnailContainer}>
            {images.map((uri, index) => (
              <View key={index} style={styles.thumbnailWrapper}>
                <Image source={{ uri }} style={styles.thumbnail} />
                <Pressable
                  onPress={() => removeImage(index)}
                  style={styles.removeButton}
                >
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
  row: {
    flexDirection: 'row',
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