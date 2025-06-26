import { StyleSheet, Text, View, Linking, ScrollView } from 'react-native';
import ImageViewer from '@/components/imageviewer';
import theme from '@/styles/theme';

const BannerImage = require('@/assets/images/dsr.jpg'); // swap for your logo/banner if preferred

export default function AboutScreen() {
  const handleEmail = () => Linking.openURL('mailto:service@dsr.com');
  const handleCall = () => Linking.openURL('tel:5551234567');
  const handleWeb = () => Linking.openURL('https://www.dicksoulerefrigeration.com');

  return (
    <View style={styles.container}>
      <ImageViewer imgSource={BannerImage} mode="banner" />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>About Dick Soule Refrigeration</Text>

        <Text style={styles.paragraph}>
          Dick Soule Refrigeration has been servicing dairy and commercial businesses in New England and Eastern New York since 1967. We specialize in the sales, installation, and service of dairy and commercial refrigeration, and dairy parlor technology systems. Our partners include Mueller, Heatcraft Refrigeration, Crown Tonka Cold Storage Solutions, Hoshizaki Ice Machines, Daikin Heat Pumps, Schaefer Ventilation, and AfiMilk. 
        </Text>

        <Text style={styles.sectionTitle}>What We Offer</Text>
        <Text style={styles.listItem}>• 24/7 Emergency Service</Text>
        <Text style={styles.listItem}>• Preventative Maintenance</Text>
        <Text style={styles.listItem}>• Refrigeration Equipment & Installations</Text>
        <Text style={styles.listItem}>• Parts Request & Support</Text>
        <Text style={styles.listItem}>• Certified Technicians with Years of Experience</Text>

        <Text style={styles.sectionTitle}>Contact Us</Text>
        <Text style={styles.link} onPress={handleCall}>📞 (802) 933-6167</Text>
        <Text style={styles.link} onPress={handleEmail}>✉️ service@dsr.com</Text>
        <Text style={styles.link} onPress={handleWeb}>🌐 www.dicksoulerefrigeration.com</Text>

        <Text style={[styles.paragraph, { marginTop: theme.spacing.md }]}>
          This app was developed by JP. Contact him if you experience issues or have suggestions!
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: 40,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.textOnPrimary,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.textOnPrimary,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xs,
  },
  paragraph: {
    fontSize: theme.fontSize.base,
    color: theme.colors.textOnPrimary,
    lineHeight: 22,
    marginBottom: theme.spacing.sm,
  },
  listItem: {
    fontSize: theme.fontSize.base,
    color: theme.colors.textOnPrimary,
    marginBottom: theme.spacing.xs,
    paddingLeft: 8,
  },
  link: {
    color: '#FFD33D',
    fontSize: theme.fontSize.base,
    marginBottom: theme.spacing.xs,
  },
});