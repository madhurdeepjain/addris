import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

export function ActionButtons({
  opacity,
  translateY,
  selectedCount,
  onShowOverlay,
  onOptimizeRoute,
  isComputing,
  pulseOpacity,
  pulseScale,
  spinnerRotation,
}) {
  return (
    <Animated.View
      style={[
        styles.topActions,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Pressable
        onPress={() => selectedCount && onShowOverlay()}
        disabled={!selectedCount}
        style={({ pressed }) => [
          styles.selectedChip,
          !selectedCount && styles.selectedChipEmpty,
          pressed && selectedCount && styles.selectedChipPressed,
        ]}
      >
        <View style={styles.selectedChipContent}>
          <View style={styles.selectedChipIcon}>
            <Ionicons
              name="flag-outline"
              size={18}
              color={selectedCount ? '#1d4ed8' : '#64748b'}
            />
          </View>
          <View style={styles.selectedChipTextGroup}>
            <Text style={styles.selectedChipLabel} numberOfLines={1}>Stops</Text>
            <Text style={styles.selectedChipText} numberOfLines={1}>
              {selectedCount ? `${selectedCount} selected` : 'No stops yet'}
            </Text>
          </View>
          {selectedCount ? (
            <View style={styles.selectedChipActionRow}>
              <Text style={styles.selectedChipActionLabel}>Manage stops</Text>
              <Ionicons name="chevron-forward" size={16} color="#1d4ed8" />
            </View>
          ) : null}
        </View>
      </Pressable>

      <Pressable
        onPress={onOptimizeRoute}
        disabled={!selectedCount || isComputing}
        style={({ pressed }) => [
          styles.routeButton,
          (!selectedCount || isComputing) && styles.routeButtonDisabled,
          pressed && !(isComputing || !selectedCount) && styles.routeButtonPressed,
        ]}
      >
        {isComputing && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.routeButtonPulseOverlay,
              {
                opacity: pulseOpacity,
                transform: [{ scale: pulseScale }],
              },
            ]}
          />
        )}
        {isComputing ? (
          <View style={styles.routeButtonLoaderWrapper}>
            <View style={styles.routeButtonLoadingContent}>
              <Animated.View
                style={[
                  styles.routeButtonSpinner,
                  { transform: [{ rotate: spinnerRotation }] },
                ]}
              >
                <MaterialCommunityIcons name="navigation-variant" size={18} color="#fff" />
              </Animated.View>
              <Text style={styles.routeButtonLoadingText}>Building route</Text>
            </View>
          </View>
        ) : (
          <View style={styles.routeButtonContent}>
            <MaterialCommunityIcons name="map-marker-path" size={20} color="#fff" />
            <Text style={styles.routeButtonText}>Build route</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  topActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    flexWrap: 'wrap',
  },
  selectedChip: {
    backgroundColor: '#dbeafe',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 52,
  },
  selectedChipEmpty: {
    backgroundColor: '#e2e8f0',
  },
  selectedChipPressed: {
    opacity: 0.75,
  },
  selectedChipContent: {
    gap: 12,
  },
  selectedChipIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.14)',
  },
  selectedChipTextGroup: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  selectedChipLabel: {
    fontSize: 12,
    color: '#1e3a8a',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
    flexShrink: 0,
  },
  selectedChipText: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '500',
    flexShrink: 1,
  },
  selectedChipActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  selectedChipActionLabel: {
    fontSize: 13,
    color: '#1d4ed8',
    fontWeight: '600',
  },
  routeButton: {
    backgroundColor: '#22c55e',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
  },
  routeButtonDisabled: {
    backgroundColor: '#4ade80',
    opacity: 0.6,
  },
  routeButtonPressed: {
    opacity: 0.85,
  },
  routeButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  routeButtonLoaderWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  routeButtonLoadingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  routeButtonLoadingText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  routeButtonPulseOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  routeButtonSpinner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
