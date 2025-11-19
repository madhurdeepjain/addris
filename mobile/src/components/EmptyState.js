import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export function EmptyState({ onAddImage }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyStateCard}>
        <MaterialCommunityIcons name="inbox-arrow-down-outline" size={40} color="#3b82f6" />
        <Text style={styles.emptyStateTitle}>Start your route</Text>
        <Text style={styles.emptyStateSubtitle}>
          Import or capture a shipping label to extract addresses and plan stops automatically.
        </Text>
        <Pressable
          onPress={onAddImage}
          style={({ pressed }) => [styles.emptyActionButton, pressed && styles.emptyActionButtonPressed]}
        >
          <MaterialCommunityIcons name="image-plus" size={22} color="#1d4ed8" />
          <Text style={styles.emptyActionText}>Add image</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    paddingVertical: 10,
  },
  emptyStateCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    gap: 14,
    alignItems: 'flex-start',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 3,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  emptyActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  emptyActionButtonPressed: {
    opacity: 0.85,
  },
  emptyActionText: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '600',
  },
});
