import { theme } from '@syncrolly/config';
import { registerPushDevice, unregisterPushDevice } from '@syncrolly/data';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import {
  configureNotificationHandler,
  extractThreadIdFromNotificationData,
  getDeviceContext,
  getDevicePlatform,
  registerForPushNotificationsAsync
} from '../lib/notifications';
import {
  getSavedPushRegistration,
  savePushRegistration
} from '../lib/pushRegistration';
import { useMobileSession } from '../lib/session';

export default function RootLayout() {
  const router = useRouter();
  const { user, supabase, isConfigured } = useMobileSession();

  useEffect(() => {
    configureNotificationHandler();
  }, []);

  useEffect(() => {
    const navigateFromResponse = (response: Notifications.NotificationResponse | null) => {
      const threadId = extractThreadIdFromNotificationData(response?.notification.request.content.data);

      if (!threadId) {
        return;
      }

      router.push({
        pathname: '/thread/[threadId]',
        params: {
          threadId
        }
      });
    };

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      navigateFromResponse(response);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateFromResponse(response);
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  useEffect(() => {
    if (!supabase || !isConfigured || !user) {
      return;
    }

    const currentSupabase = supabase;
    const currentUser = user;
    let isActive = true;

    async function syncPushRegistration() {
      try {
        const nextPushToken = await registerForPushNotificationsAsync();

        if (!isActive || !nextPushToken) {
          return;
        }

        const savedRegistration = await getSavedPushRegistration();

        if (!isActive) {
          return;
        }

        if (
          savedRegistration &&
          savedRegistration.userId === currentUser.id &&
          savedRegistration.expoPushToken !== nextPushToken
        ) {
          await unregisterPushDevice(currentSupabase, {
            expoPushToken: savedRegistration.expoPushToken
          });
        }

        await registerPushDevice(currentSupabase, {
          expoPushToken: nextPushToken,
          platform: getDevicePlatform(),
          ...getDeviceContext()
        });

        if (!isActive) {
          return;
        }

        await savePushRegistration({
          userId: currentUser.id,
          expoPushToken: nextPushToken
        });
      } catch (error) {
        console.warn('Push registration failed', error);
      }
    }

    void syncPushRegistration();

    return () => {
      isActive = false;
    };
  }, [isConfigured, supabase, user?.id]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: theme.colors.background
        }
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="thread/[threadId]"
        options={{
          animation: 'slide_from_right'
        }}
      />
    </Stack>
  );
}
