import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let notificationHandlerConfigured = false;

export type ThreadNotificationData = {
  threadId?: string;
  thread_id?: string;
};

export function configureNotificationHandler() {
  if (notificationHandlerConfigured) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true
    })
  });

  notificationHandlerConfigured = true;
}

export function extractThreadIdFromNotificationData(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }

  const notificationData = data as ThreadNotificationData;
  return typeof notificationData.threadId === 'string'
    ? notificationData.threadId
    : typeof notificationData.thread_id === 'string'
      ? notificationData.thread_id
      : null;
}

function getExpoProjectId(): string | null {
  return (
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    process.env.EXPO_PUBLIC_EXPO_PROJECT_ID ??
    null
  );
}

function isPushUnsupportedRuntime(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#115cb9'
    });
  }

  if (isPushUnsupportedRuntime()) {
    console.warn('Push notifications require a development build. Expo Go does not support this flow.');
    return null;
  }

  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device.');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId = getExpoProjectId();

  if (!projectId) {
    throw new Error('Expo project ID not found. Configure EAS projectId before enabling push notifications.');
  }

  const token = await Notifications.getExpoPushTokenAsync({
    projectId
  });

  return token.data;
}

export function getDevicePlatform(): 'ios' | 'android' | 'web' | 'unknown' {
  if (Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web') {
    return Platform.OS;
  }

  return 'unknown';
}

export function getDeviceContext() {
  return {
    deviceName: Device.deviceName ?? undefined,
    deviceModel: Device.modelName ?? undefined
  };
}
