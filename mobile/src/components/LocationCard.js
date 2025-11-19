import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

export function LocationCard({ locationLabel, error, isRefreshing, onRefresh }) {
  if (!locationLabel && !error) return null;

  return (
    <View style={styles.locationCard}>
      <View style={styles.locationHeader}>
        <View style={styles.locationRow}>
          <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#38bdf8" />
          <Text style={styles.locationLabel}>You are here</Text>
        </View>
        <Pressable
          onPress={onRefresh}
          disabled={isRefreshing}
          style={({ pressed }) => [
            styles.locationRefreshButton,
            isRefreshing && styles.locationRefreshButtonDisabled,
            pressed && !isRefreshing && styles.locationRefreshButtonPressed,
          ]}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#38bdf8" />
          ) : (
            <View style={styles.locationRefreshContent}>
              <Ionicons name="refresh" size={16} color="#38bdf8" />
              <Text style={styles.locationRefreshLabel}>Refresh</Text>
            </View>
          )}
        </Pressable>
      </View>
      {locationLabel ? (
        <Text style={styles.locationValue}>{locationLabel}</Text>
      ) : (
        <Text style={styles.locationError}>Unable to resolve your location address.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  locationCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    gap: 8,
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 4,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationLabel: {
    fontSize: 13,
    color: '#38bdf8',
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  locationValue: {
    fontSize: 15,
    color: '#e0f2fe',
    fontWeight: '600',
    lineHeight: 20,
  },
  locationError: {
    fontSize: 13,
    color: '#fecaca',
  },
  locationRefreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    backgroundColor: 'rgba(14, 116, 144, 0.16)',
  },
  locationRefreshButtonDisabled: {
    opacity: 0.6,
  },
  locationRefreshButtonPressed: {
    opacity: 0.8,
  },
  locationRefreshContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationRefreshLabel: {
    fontSize: 13,
    color: '#38bdf8',
    fontWeight: '600',
  },
});
