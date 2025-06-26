// theme.ts

const theme = {
  colors: {
    // Brand Colors
    primary: '#002D72',       // Deep DSR Blue
    primaryLight: '#3366CC',  // Lighter Blue (Accent)
    background: '#002D72',    // Main App Background
    card: '#FFFFFF',          // White cards/panels
    inputBackground: '#F0F4FF',
    inputBorder: '#D1D9F0',
    textPrimary: '#111827',
    textOnPrimary: '#FFFFFF',
    error: '#EF4444',
    success: '#10B981',
    muted: '#6B7280',
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },

  borderRadius: {
    sm: 6,
    md: 10,
    lg: 16,
    full: 9999,
  },

  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    md: 18,
    lg: 22,
    xl: 28,
  },

  shadow: {
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 6,
    },
  },
};

export default theme;
