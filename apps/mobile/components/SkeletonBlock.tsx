import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export default function SkeletonBlock({
  width = '100%',
  height,
  radius = 16,
  style
}: {
  width?: number | `${number}%` | '100%';
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.block, { width, height, borderRadius: radius }, style]} />;
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: 'rgba(201, 209, 224, 0.45)'
  }
});
