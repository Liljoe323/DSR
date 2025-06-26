// components/ImageViewer.tsx
import { Image } from 'expo-image';
import {
  ImageSourcePropType,
  useWindowDimensions,
  StyleSheet,
  View,
} from 'react-native';

type Props = {
  imgSource: ImageSourcePropType;
  selectedImage?: string;
  mode?: 'banner' | 'viewer';
};

export default function ImageViewer({
  imgSource,
  selectedImage,
  mode = 'viewer',
}: Props) {
  const imageSource = selectedImage ? { uri: selectedImage } : imgSource;
  const { width } = useWindowDimensions();

  const bannerHeight = width * 0.3; // reduced height (was 0.5625 for 16:9)

  return (
    <View
      style={
        mode === 'banner'
          ? [styles.bannerWrapper, { height: bannerHeight }]
          : undefined
      }
    >
      <Image
        source={imageSource}
        style={
          mode === 'banner'
            ? [styles.bannerImage, { width }]
            : styles.image
        }
        contentFit="contain"
        transition={100}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    width: 320,
    height: 440,
    borderRadius: 18,
  },
  bannerWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  bannerImage: {
    height: '100%',
    resizeMode: 'contain',
  },
});
