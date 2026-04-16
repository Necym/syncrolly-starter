import AsyncStorage from '@react-native-async-storage/async-storage';

const PUSH_REGISTRATION_KEY = 'syncrolly.push-registration';

export interface SavedPushRegistration {
  expoPushToken: string;
  userId: string;
}

export async function getSavedPushRegistration(): Promise<SavedPushRegistration | null> {
  try {
    const rawValue = await AsyncStorage.getItem(PUSH_REGISTRATION_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as Partial<SavedPushRegistration>;

    if (
      typeof parsedValue?.expoPushToken !== 'string' ||
      typeof parsedValue?.userId !== 'string'
    ) {
      return null;
    }

    return {
      expoPushToken: parsedValue.expoPushToken,
      userId: parsedValue.userId
    };
  } catch {
    return null;
  }
}

export async function savePushRegistration(registration: SavedPushRegistration) {
  await AsyncStorage.setItem(PUSH_REGISTRATION_KEY, JSON.stringify(registration));
}

export async function clearPushRegistration() {
  await AsyncStorage.removeItem(PUSH_REGISTRATION_KEY);
}
