import React, { createContext, useContext, useState, useEffect } from 'react';

const SUNNY = {
  mode: 'sunny' as const,
  background: '#F2F5F8',
  surface: '#FFFFFF',
  surfaceGlass: 'rgba(255,255,255,0.85)',
  primary: '#005BBB',
  primaryHover: '#004B99',
  accent: '#FFD500',
  textPrimary: '#0A1128',
  textSecondary: '#4A5568',
  border: 'rgba(0,91,187,0.12)',
  tabBar: 'rgba(255,255,255,0.92)',
  danger: '#FF3B30',
  success: '#34C759',
  warning: '#FF9F0A',
};

const STORM = {
  mode: 'storm' as const,
  background: '#0F0F11',
  surface: '#1A1A1D',
  surfaceGlass: 'rgba(26,26,29,0.9)',
  primary: '#FF3B30',
  primaryHover: '#D62828',
  accent: '#FF9F0A',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0AEC0',
  border: 'rgba(255,59,48,0.25)',
  tabBar: 'rgba(15,15,17,0.95)',
  danger: '#FF3B30',
  success: '#34C759',
  warning: '#FF9F0A',
};

export type ThemeColors = typeof SUNNY;

interface ThemeContextType {
  colors: ThemeColors;
  isStorm: boolean;
  toggleStorm: (val?: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  colors: SUNNY,
  isStorm: false,
  toggleStorm: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isStorm, setIsStorm] = useState(false);

  const toggleStorm = (val?: boolean) => {
    setIsStorm(val !== undefined ? val : !isStorm);
  };

  return (
    <ThemeContext.Provider value={{ colors: isStorm ? STORM : SUNNY, isStorm, toggleStorm }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
