import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export function StatusPills({
  opacity,
  extractionInFlight,
  isComputing,
  routeReady,
  routeSummaryMeta,
  onViewRoute,
}) {
  if (!extractionInFlight && !isComputing && !routeReady) return null;

  return (
    <Animated.View style={[styles.statusPills, { opacity }]}>
      {extractionInFlight && (
        <View style={styles.statusPill}>
          <MaterialCommunityIcons name="file-search-outline" size={16} color="#2563eb" />
          <Text style={styles.statusPillText}>Extracting addresses…</Text>
        </View>
      )}
      {isComputing && (
        <View style={styles.statusPill}>
          <MaterialCommunityIcons name="map-clock" size={16} color="#16a34a" />
          <Text style={styles.statusPillText}>Optimizing route…</Text>
        </View>
      )}
      {routeReady && !isComputing && (
        <Pressable
          onPress={onViewRoute}
          style={({ pressed }) => [styles.statusPillReady, pressed && styles.statusPillReadyPressed]}
        >
          <MaterialCommunityIcons name="map-marker-check-outline" size={16} color="#166534" />
          <Text style={styles.statusPillReadyText}>Route ready</Text>
          {routeSummaryMeta ? (
            <Text style={styles.statusPillReadyMeta}>{routeSummaryMeta}</Text>
          ) : null}
          <Text style={styles.statusPillReadyAction}>View</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  statusPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#e0e7ff',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  statusPillText: {
    fontSize: 13,
    color: '#1e3a8a',
    fontWeight: '500',
  },
  statusPillReady: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  statusPillReadyPressed: {
    opacity: 0.85,
  },
  statusPillReadyText: {
    fontSize: 13,
    color: '#15803d',
    fontWeight: '600',
  },
  statusPillReadyAction: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  statusPillReadyMeta: {
    fontSize: 12,
    color: '#0f766e',
    fontWeight: '600',
  },
});
