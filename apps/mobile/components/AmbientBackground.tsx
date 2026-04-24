import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

export default function AmbientBackground() {
  return (
    <View pointerEvents="none" style={styles.backgroundLayer}>
      <LinearGradient
        colors={['#060e20', '#0b1326', '#131b2e']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.backgroundBase}
      />
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject
  },
  backgroundBase: {
    ...StyleSheet.absoluteFillObject
  },
  backgroundGlowTop: {
    position: 'absolute',
    width: 220,
    height: 220,
    top: 56,
    right: -92,
    borderRadius: 999,
    backgroundColor: 'rgba(77, 142, 255, 0.10)'
  },
  backgroundGlowBottom: {
    position: 'absolute',
    width: 240,
    height: 240,
    bottom: 80,
    left: -110,
    borderRadius: 999,
    backgroundColor: 'rgba(87, 27, 193, 0.10)'
  }
});
