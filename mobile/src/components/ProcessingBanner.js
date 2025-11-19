import React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export function ProcessingBanner({ opacity, translateY, progressTranslate }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.processingBanner,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={styles.processingRow}>
        <MaterialCommunityIcons name="progress-clock" size={16} color="#0f172a" />
        <Text style={styles.processingText}>Building your optimized route…</Text>
      </View>
      <View style={styles.processingTrack}>
        <Animated.View
          style={[
            styles.processingMeter,
            {
              transform: [{ translateX: progressTranslate }],
            },
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  processingBanner: {
    backgroundColor: '#e0f2fe',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 3,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  processingText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
  },
  processingTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.15)',
    overflow: 'hidden',
  },
  processingMeter: {
    width: 140,
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#1d4ed8',
    opacity: 0.7,
  },
});
