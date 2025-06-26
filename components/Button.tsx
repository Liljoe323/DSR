import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '@/styles/theme';

type Props = {
  label: string;
  theme?: 'primary';
  onPress?: () => void;
};

export default function Button({ label, theme: themeType, onPress }: Props) {
  const isPrimary = themeType === 'primary';

  return (
    <View
      style={[
        styles.buttonContainer,
        isPrimary && {
          borderWidth: 2,
          borderColor: theme.colors.primaryLight,
          borderRadius: theme.borderRadius.lg,
        },
      ]}
    >
      <Pressable
        style={[
          styles.button,
          {
            backgroundColor: isPrimary
              ? theme.colors.card
              : theme.colors.primaryLight,
          },
        ]}
        onPress={onPress}
      >
        {isPrimary && (
          <FontAwesome
            name="picture-o"
            size={18}
            color={theme.colors.textPrimary}
            style={styles.buttonIcon}
          />
        )}
        <Text
          style={[
            styles.buttonLabel,
            {
              color: isPrimary
                ? theme.colors.textPrimary
                : theme.colors.textOnPrimary,
            },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonContainer: {
    width: 320,
    height: 56,
    marginHorizontal: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xs,
  },
  button: {
    borderRadius: theme.borderRadius.md,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonIcon: {
    paddingRight: theme.spacing.sm,
  },
  buttonLabel: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
});