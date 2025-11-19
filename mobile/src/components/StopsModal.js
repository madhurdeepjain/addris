import React from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export function StopsModal({
  visible,
  onClose,
  images,
  selectedCount,
  selectableCandidateCount,
  location,
  displayLabel,
  toggleCandidate,
  overlayBackdropOpacity,
  overlayTranslateY,
}) {
  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalWrapper}>
        <Animated.View style={[styles.modalBackdrop, { opacity: overlayBackdropOpacity }]} />
        <Pressable
          style={styles.modalDismissArea}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss selected stops overview"
        />
        <Animated.View
          style={[
            styles.modalSheet,
            styles.modalSheetLarge,
            { transform: [{ translateY: overlayTranslateY }] },
          ]}
        >
          <View style={styles.modalHandle} />
          <View style={styles.modalHeaderRow}>
            <MaterialCommunityIcons name="map-marker-multiple-outline" size={22} color="#1d4ed8" />
            <Text style={styles.modalTitle}>Stops overview</Text>
          </View>
          <View style={styles.modalSummary}>
            <View style={styles.modalSummaryRow}>
              <MaterialCommunityIcons name="check-circle-outline" size={18} color="#1e3a8a" />
              <Text style={styles.modalSummaryText}>
                {selectedCount} of {selectableCandidateCount} selectable address{selectableCandidateCount === 1 ? '' : 'es'} chosen
              </Text>
            </View>
            <View style={styles.modalSummaryRow}>
              <MaterialCommunityIcons name="image-multiple-outline" size={18} color="#1d4ed8" />
              <Text style={styles.modalSummaryText}>
                {images.length} image{images.length === 1 ? '' : 's'} processed
              </Text>
            </View>
            <View style={styles.modalSummaryRow}>
              <MaterialCommunityIcons
                name={location ? 'crosshairs-gps' : 'crosshairs-off'}
                size={18}
                color={location ? '#16a34a' : '#64748b'}
              />
              <Text style={styles.modalSummaryMeta}>
                {location
                  ? `Origin: ${location.latitude?.toFixed(4)}, ${location.longitude?.toFixed(4)}`
                  : 'Origin unavailable (permission denied).'}
              </Text>
            </View>
          </View>
          <ScrollView style={styles.modalScroll}>
            {images.length === 0 ? (
              <Text style={styles.metaText}>Add images to begin extracting delivery stops.</Text>
            ) : (
              images.map((image, index) => (
                <View key={image.id} style={styles.overlayImageSection}>
                  <View style={styles.overlayImageHeader}>
                    <Text style={styles.overlayImageTitle}>Image {index + 1}</Text>
                    <Text style={styles.overlayImageSubtitle} numberOfLines={1}>
                      {image.fileName}
                    </Text>
                  </View>
                  {image.status === 'extracting' && (
                    <View style={styles.overlayStatusRow}>
                      <ActivityIndicator size="small" color="#2563eb" />
                      <Text style={styles.overlayStatusText}>Extracting…</Text>
                    </View>
                  )}
                  {image.status === 'error' && (
                    <Text style={styles.errorText}>{image.error}</Text>
                  )}
                  {image.status === 'ready' && image.addresses.length === 0 && (
                    <Text style={styles.overlayHint}>No addresses detected.</Text>
                  )}
                  {image.status === 'ready'
                    ? image.addresses.map((candidate) => {
                        const selectable = candidate.latitude != null && candidate.longitude != null;
                        const selected = candidate.selected && selectable;
                        return (
                          <Pressable
                            key={candidate.localId}
                            onPress={() => selectable && toggleCandidate(image.id, candidate.localId)}
                            style={({ pressed }) => [
                              styles.overlayAddressCard,
                              selected && styles.overlayAddressCardSelected,
                              !selectable && styles.overlayAddressCardDisabled,
                              pressed && selectable && styles.overlayAddressCardPressed,
                            ]}
                          >
                            <View style={styles.overlayAddressHeader}>
                              <View style={styles.overlayAddressIcon}>
                                <MaterialCommunityIcons
                                  name={selected ? 'checkbox-marked-circle-outline' : 'checkbox-blank-circle-outline'}
                                  size={20}
                                  color={selected ? '#166534' : selectable ? '#334155' : '#94a3b8'}
                                />
                              </View>
                              <Text style={styles.overlayAddressText}>{displayLabel(candidate)}</Text>
                              {selectable ? (
                                <Text style={selected ? styles.overlayPillSelected : styles.overlayPill}>
                                  {selected ? 'Selected' : 'Select'}
                                </Text>
                              ) : (
                                <Text style={styles.overlayPillDisabled}>No coordinates</Text>
                              )}
                            </View>
                            <Text style={styles.modalAddressMeta}>
                              Confidence: {(candidate.confidence * 100).toFixed(1)}%
                            </Text>
                            <Text style={styles.modalAddressMeta}>Status: {candidate.status}</Text>
                            {candidate.status === 'failed' && candidate.message && (
                              <Text style={styles.errorText}>{candidate.message}</Text>
                            )}
                          </Pressable>
                        );
                      })
                    : null}
                </View>
              ))
            )}
          </ScrollView>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.secondaryButton,
              styles.modalButton,
              pressed && styles.secondaryButtonPressed,
            ]}
          >
            <Text style={styles.secondaryButtonLabel}>Done</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  modalDismissArea: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 34,
    maxHeight: '85%',
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 16,
    elevation: 5,
  },
  modalSheetLarge: {
    height: '80%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalSummary: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  modalSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalSummaryText: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '500',
  },
  modalSummaryMeta: {
    fontSize: 13,
    color: '#64748b',
  },
  modalScroll: {
    flex: 1,
  },
  metaText: {
    fontSize: 14,
    color: '#64748b',
  },
  overlayImageSection: {
    marginBottom: 20,
    gap: 10,
  },
  overlayImageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  overlayImageTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  overlayImageSubtitle: {
    fontSize: 13,
    color: '#64748b',
    maxWidth: '60%',
  },
  overlayStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  overlayStatusText: {
    fontSize: 14,
    color: '#2563eb',
  },
  errorText: {
    fontSize: 13,
    color: '#ef4444',
  },
  overlayHint: {
    fontSize: 14,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  overlayAddressCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  overlayAddressCardSelected: {
    backgroundColor: '#f0fdf4',
    borderColor: '#16a34a',
  },
  overlayAddressCardDisabled: {
    backgroundColor: '#f8fafc',
    opacity: 0.7,
  },
  overlayAddressCardPressed: {
    opacity: 0.8,
  },
  overlayAddressHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  overlayAddressIcon: {
    marginTop: 2,
  },
  overlayAddressText: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    lineHeight: 20,
    fontWeight: '500',
  },
  overlayPill: {
    fontSize: 11,
    color: '#2563eb',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
    fontWeight: '600',
  },
  overlayPillSelected: {
    fontSize: 11,
    color: '#166534',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
    fontWeight: '600',
  },
  overlayPillDisabled: {
    fontSize: 11,
    color: '#94a3b8',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  modalAddressMeta: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 30,
  },
  secondaryButton: {
    backgroundColor: '#e0e7ff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButton: {
    marginTop: 10,
  },
  secondaryButtonPressed: {
    opacity: 0.8,
  },
  secondaryButtonLabel: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '600',
  },
});
