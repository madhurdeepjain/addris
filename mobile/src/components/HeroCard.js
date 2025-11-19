import React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export function HeroCard({ opacity, translateY, scale }) {
  return (
    <Animated.View
      style={[
        styles.heroCard,
        {
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      <View style={styles.heroTextGroup}>
        <Text style={styles.heroEyebrow}>Delivery intelligence</Text>
        <Text style={styles.heroTitle}>Addris</Text>
        <Text style={styles.heroSubtitle}>Smart Delivery Assistant</Text>
        <Text style={styles.heroTagline}>Plan, confirm, deliver without the busywork.</Text>
      </View>
      <View style={styles.heroIcon}>
        <MaterialCommunityIcons name="truck-fast-outline" size={48} color="#bfdbfe" />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: '#1e3a8a',
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#1e293b',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 4,
  },
  heroTextGroup: {
    flex: 1,
    gap: 6,
  },
  heroEyebrow: {
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#c7d2fe',
    fontWeight: '600',
    marginBottom: 2,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#c7d2fe',
    marginTop: 4,
  },
  heroTagline: {
    fontSize: 14,
    color: '#e0e7ff',
    marginTop: 8,
    lineHeight: 20,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
