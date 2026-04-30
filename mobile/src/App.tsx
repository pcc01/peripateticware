import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View, Text, AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from './stores/authStore';
import { useSettingsStore } from './stores/settingsStore';

import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import DashboardScreen from './screens/DashboardScreen';
import ChildProgressScreen from './screens/ChildProgressScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import SettingsScreen from './screens/SettingsScreen';

let WebSocketService: any = null;
let OfflineQueueService: any = null;

if (Platform.OS !== 'web') {
  try {
    const wsModule = require('./services/websocketService');
    const queueModule = require('./services/offlineQueue');
    WebSocketService = wsModule.WebSocketService;
    OfflineQueueService = queueModule.OfflineQueueService;
  } catch (e) {
    console.warn('Services not available:', e);
  }
}

import { api } from './services/api';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}

function AppTabs() {
  return (
    <Tab.Navigator screenOptions={{ tabBarActiveTintColor: '#2563eb' }}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard', tabBarLabel: 'Home' }} />
      <Tab.Screen name="ChildProgress" component={ChildProgressScreen} options={{ title: 'Progress', tabBarLabel: 'Progress' }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications', tabBarLabel: 'Notifications' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings', tabBarLabel: 'Settings' }} />
    </Tab.Navigator>
  );
}

function AppStack() {
  return <Stack.Navigator screenOptions={{ headerShown: false }}><Stack.Screen name="AppTabs" component={AppTabs} /></Stack.Navigator>;
}

export default function App() {
  const { token, isAuthenticated, getCurrentUser, refreshToken } = useAuthStore();
  const { loadSettings } = useSettingsStore();
  
  const [initialized, setInitialized] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState(true);
  const wsService = useRef<any>(null);
  const offlineQueue = useRef<any>(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const initialize = async () => {
      try {
        try {
          await api.get('/health');
          setBackendAvailable(true);
        } catch (error) {
          setBackendAvailable(false);
        }

        if (token) {
          try {
            await getCurrentUser();
            if (Platform.OS !== 'web' && WebSocketService) {
              wsService.current = new WebSocketService();
              await wsService.current.connect(token);
            }
            if (Platform.OS !== 'web' && OfflineQueueService) {
              offlineQueue.current = new OfflineQueueService();
              await offlineQueue.current.loadQueuedMessages();
            }
            await loadSettings();
          } catch (authError) {
            try {
              await refreshToken();
            } catch (refreshError) {
              console.error('Auth failed:', refreshError);
            }
          }
        }
      } catch (error) {
        console.error('Init error:', error);
      } finally {
        setInitialized(true);
      }
    };

    initialize();

    return () => {
      if (Platform.OS !== 'web' && wsService.current) {
        wsService.current.close();
      }
    };
  }, []);

  if (!initialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={{ marginTop: 16, color: '#6b7280' }}>Connecting...</Text>
      </View>
    );
  }

  return <NavigationContainer>{token && isAuthenticated ? <AppStack /> : <AuthStack />}</NavigationContainer>;
}