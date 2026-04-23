import MaskedView from '@react-native-masked-view/masked-view';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@syncrolly/config';
import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type TabRoute = {
  key: string;
  name: string;
  params?: object;
};

type TabDescriptor = {
  options: {
    tabBarAccessibilityLabel?: string;
    tabBarButtonTestID?: string;
    tabBarLabel?: string;
    title?: string;
  };
};

type CustomTabBarProps = {
  descriptors: Record<string, TabDescriptor>;
  insets: {
    bottom: number;
  };
  navigation: {
    emit: (event: {
      type: string;
      target: string;
      canPreventDefault?: boolean;
    }) => {
      defaultPrevented?: boolean;
    };
    navigate: (name: string, params?: object) => void;
  };
  state: {
    index: number;
    routes: TabRoute[];
  };
};

function getTabMeta(routeName: string, focused: boolean) {
  if (routeName === 'feed') {
    return {
      iconName: focused ? 'grid' : 'grid-outline',
      label: 'Feed'
    } as const;
  }

  if (routeName === 'clients') {
    return {
      iconName: focused ? 'calendar' : 'calendar-outline',
      label: 'Calendar'
    } as const;
  }

  if (routeName === 'index') {
    return {
      iconName: focused ? 'chatbubble' : 'chatbubble-outline',
      label: 'Inbox'
    } as const;
  }

  if (routeName === 'content') {
    return {
      iconName: focused ? 'settings' : 'settings-outline',
      label: 'Settings'
    } as const;
  }

  return {
    iconName: focused ? 'person' : 'person-outline',
    label: 'Profile'
  } as const;
}

function GradientIcon({
  name,
  size
}: {
  name: string;
  size: number;
}) {
  return (
    <MaskedView
      androidRenderingMode="software"
      maskElement={
        <View style={styles.iconMaskElement}>
          <Ionicons name={name} size={size} color="#000000" />
        </View>
      }
      style={[styles.iconMask, { width: size + 2, height: size + 2 }]}
    >
      <LinearGradient
        colors={theme.gradients.brand}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.maskFill}
      />
    </MaskedView>
  );
}

function GradientLabel({
  label
}: {
  label: string;
}) {
  const width = Math.max(42, Math.ceil(label.length * 7.2));

  return (
    <MaskedView
      androidRenderingMode="software"
      maskElement={
        <View style={[styles.labelMaskElement, { width }]}>
          <Text numberOfLines={1} style={styles.labelMaskText}>
            {label}
          </Text>
        </View>
      }
      style={[styles.labelMask, { width }]}
    >
      <LinearGradient
        colors={theme.gradients.brand}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.maskFill}
      />
    </MaskedView>
  );
}

function CustomTabBar({
  descriptors,
  insets,
  navigation,
  state
}: CustomTabBarProps) {
  return (
    <View
      style={[
        styles.tabBarShell,
        {
          paddingBottom: Math.max(insets.bottom, 14)
        }
      ]}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const fallbackMeta = getTabMeta(route.name, focused);
        const label =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : typeof options.title === 'string'
              ? options.title
              : fallbackMeta.label;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true
          });

          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key
          });
        };

        return (
          <Pressable
            key={route.key}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            onLongPress={onLongPress}
            onPress={onPress}
            style={styles.tabButton}
            testID={options.tabBarButtonTestID}
          >
            {focused ? (
              <>
                <GradientIcon name={fallbackMeta.iconName} size={20} />
                <GradientLabel label={label} />
              </>
            ) : (
              <>
                <Ionicons name={fallbackMeta.iconName} size={20} color={theme.colors.textMuted} />
                <Text style={styles.tabLabelText}>{label}</Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: theme.colors.background
        }
      }}
      tabBar={(props) => <CustomTabBar {...(props as CustomTabBarProps)} />}
    >
      <Tabs.Screen name="feed" options={{ title: 'Feed' }} />
      <Tabs.Screen name="clients" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="index" options={{ title: 'Inbox' }} />
      <Tabs.Screen name="content" options={{ title: 'Settings' }} />
      <Tabs.Screen name="settings" options={{ title: 'Profile' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarShell: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(11,19,38,0.94)',
    borderTopColor: 'rgba(255,255,255,0.08)',
    borderTopWidth: 1
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: 52
  },
  iconMask: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconMaskElement: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  maskFill: {
    width: '100%',
    height: '100%'
  },
  labelMask: {
    height: 16
  },
  labelMaskElement: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  labelMaskText: {
    color: '#000000',
    fontSize: 11,
    lineHeight: 12,
    fontWeight: '700',
    includeFontPadding: false
  },
  tabLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted
  }
});
