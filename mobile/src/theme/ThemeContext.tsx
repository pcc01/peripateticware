import React, { createContext, useContext, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveTheme, themes, type Theme, type ThemeName, type LocationSkin } from './tokens';

interface ThemeContextValue {
  themeName: ThemeName;
  locationSkin: LocationSkin;
  theme: Theme;
  setTheme: (name: ThemeName) => Promise<void>;
  setLocationSkin: (skin: LocationSkin) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>('fieldGuide');
  const [locationSkin, setLocationSkinState] = useState<LocationSkin>('field');

  const theme = resolveTheme(themeName, locationSkin);

  const setTheme = async (name: ThemeName) => {
    setThemeName(name);
    await AsyncStorage.setItem('@ppw_theme', name);
  };

  const setLocationSkin = (skin: LocationSkin) => setLocationSkinState(skin);

  return (
    <ThemeContext.Provider value={{ themeName, locationSkin, theme, setTheme, setLocationSkin }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
