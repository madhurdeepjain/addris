import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

export function ActiveImageCard({ activeImage, onRemove, onRetry, onToggleCandidate, displayLabel }) {
  if (!activeImage) return null;

  return (
    <View style={styles.contentCard}>
      <View style={styles.activeHeader}>
        <Text style={styles.sectionTitle}>Selected image</Text>
        <Pressable
          onPress={() => onRemove(activeImage.id)}
          style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}
        >
          <Text style={styles.textButtonLabel}>Remove</Text>
        </Pressable>
      </View>
      <Image source={{ uri: activeImage.uri }} style={styles.mainPreview} />

      {activeImage.status === 'extracting' && (
        <View style={styles.centeredRow}>
          <ActivityIndicator />
          <Text style={styles.infoText}>Extracting addresses…</Text>
        </View>
      )}

      {activeImage.status === 'error' && (
        <View style={styles.section}>
          <Text style={styles.errorText}>{activeImage.error}</Text>
          <Pressable
            onPress={() => onRetry(activeImage.id, activeImage.asset)}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
            ]}
          >
            <Text style={styles.secondaryButtonLabel}>Retry extraction</Text>
          </Pressable>
        </View>
      )}

      {activeImage.status === 'ready' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Addresses</Text>
          {activeImage.addresses.length === 0 && (
            <Text style={styles.infoText}>No addresses detected in this image.</Text>
          )}
          {activeImage.addresses.map((candidate) => {
            const selectable = candidate.latitude != null && candidate.longitude != null;
            return (
              <Pressable
                key={candidate.localId}
                onPress={() => selectable && onToggleCandidate(activeImage.id, candidate.localId)}
                style={[
                  styles.addressCard,
                  candidate.selected && selectable && styles.addressCardSelected,
                  !selectable && styles.addressCardDisabled,
                ]}
              >
                <View style={styles.addressHeader}>
                  <Text style={styles.addressText}>{displayLabel(candidate)}</Text>
                  {selectable ? (
                    <Text style={candidate.selected ? styles.badgeSelected : styles.badge}>
                      {candidate.selected ? 'Selected' : 'Tap to select'}
                    </Text>
                  ) : (
                    <Text style={styles.badgeDisabled}>No coordinates</Text>
                  )}
                </View>
                <Text style={styles.metaText}>
                  Confidence: {(candidate.confidence * 100).toFixed(1)}%
                </Text>
                <Text style={styles.metaText}>Status: {candidate.status}</Text>
                {candidate.status === 'failed' && candidate.message && (
                  <Text style={styles.errorText}>{candidate.message}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contentCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    gap: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 3,
  },
  activeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  textButton: {
    padding: 8,
  },
  textButtonPressed: {
    opacity: 0.6,
  },
  textButtonLabel: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '600',
  },
  mainPreview: {
    width: '100%',
    height: 240,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    resizeMode: 'contain',
  },
  centeredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 20,
  },
  infoText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  section: {
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
  },
  secondaryButton: {
    backgroundColor: '#e0e7ff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.8,
  },
  secondaryButtonLabel: {
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: '600',
  },
  addressCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  addressCardSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  addressCardDisabled: {
    opacity: 0.6,
    backgroundColor: '#f1f5f9',
  },
  addressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  addressText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    lineHeight: 20,
  },
  badge: {
    fontSize: 11,
    color: '#64748b',
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  badgeSelected: {
    fontSize: 11,
    color: '#1e40af',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
    fontWeight: '600',
  },
  badgeDisabled: {
    fontSize: 11,
    color: '#94a3b8',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  metaText: {
    fontSize: 12,
    color: '#64748b',
  },
});
