import Button from '@/components/Button';
import ImageViewer from '@/components/imageviewer';
import { supabase } from '@/lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
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
import theme from '@/styles/theme';

const PlaceholderImage = require('@/assets/images/dsr.jpg');

export default function EmergencyCall() {
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
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Permission to access media library is required!');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
      base64: true,
    });

    if (!result.canceled) {
      setImages((prev) => [...prev, result.assets[0].uri]);
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

    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
      base64: true,
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
    let uploadedUrls: string[] = [];

    for (const uri of images) {
      try {
        const fileName = `client-${Date.now()}-${Math.random()}.jpg`;
        const fileInfo = await FileSystem.getInfoAsync(uri);

        if (!fileInfo.exists) throw new Error('File does not exist');

        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

        const { error: uploadError } = await supabase.storage
          .from('emergency-call-pictures')
          .upload(fileName, binary, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('emergency-call-pictures').getPublicUrl(fileName);
        uploadedUrls.push(data.publicUrl);
      } catch (error: any) {
        console.error('Upload failed:', error.message);
        Alert.alert('Upload failed', error.message);
        return;
      }
    }

    const { error } = await supabase.from('emergency_service_requests').insert([
      {
        title,
        description,
        company,
        contact,
        image_url: uploadedUrls,
      },
    ]);

    if (error) {
      Alert.alert('Submission Failed', error.message);
    } else {
      Alert.alert('Request Submitted');
      setTitle('');
      setDescription('');
      setImages([]);
      if (!isProfileLoaded) {
        setCompany('');
        setContact('');
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ImageViewer imgSource={PlaceholderImage} mode="banner" />

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.text}>SEND FIRE TRUCKS! THIS IS AN EMERGENCY!</Text>

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
    textAlign: 'center',
    fontWeight: 'bold',
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
