import React from 'react';
import { Modal, View, Text, TextInput, Button, StyleSheet, Clipboard, Alert, TouchableOpacity } from 'react-native';

export default function PushTokenPopup({
  visible,
  token,
  onClose,
}: {
  visible: boolean;
  token: string;
  onClose: () => void;
}) {
  const copyToClipboard = () => {
    Clipboard.setString(token);
    Alert.alert('Copied', 'Push token copied to clipboard');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Your Push Token</Text>

          <TextInput
            style={styles.input}
            value={token}
            editable={false}
            multiline
          />

          <TouchableOpacity onPress={copyToClipboard} style={styles.copyButton}>
            <Text style={styles.copyText}>Copy to Clipboard</Text>
          </TouchableOpacity>

          <Button title="Close" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  container: {
    margin: 30,
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 10,
    elevation: 10,
  },
  title: {
    fontSize: 18,
    marginBottom: 10,
    fontWeight: 'bold',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 6,
    marginBottom: 10,
    color: '#333',
    backgroundColor: '#f9f9f9',
  },
  copyButton: {
    alignSelf: 'flex-start',
    marginBottom: 15,
  },
  copyText: {
    color: '#007AFF',
  },
});
