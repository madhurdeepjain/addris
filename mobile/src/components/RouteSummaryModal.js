import React from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

export function RouteSummaryModal({
  visible,
  onClose,
  routeSummary,
  routeLegs,
  onModifySelection,
  onOpenRoute,
  routeBackdropOpacity,
  routeTranslateY,
  formatDistance,
  formatDuration,
  formatDelay,
  formatCurrency,
  providerLabel,
}) {
  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalWrapper}>
        <Animated.View style={[styles.modalBackdrop, { opacity: routeBackdropOpacity }]} />
        <Pressable
          style={styles.modalDismissArea}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss optimized route summary"
        />
        <Animated.View
          style={[
            styles.modalSheet,
            { transform: [{ translateY: routeTranslateY }] },
          ]}
        >
          <View style={styles.modalHandle} />
          <View style={styles.modalHeaderRow}>
            <MaterialCommunityIcons name="map-marker-path" size={22} color="#166534" />
            <Text style={styles.modalTitle}>Optimized route</Text>
          </View>
          {routeSummary && (
            <View style={styles.routeSummaryCard}>
              <View style={styles.routeSummaryMetrics}>
                {routeSummary.totalDistanceMeters != null && (
                  <View style={styles.routeSummaryMetric}>
                    <Text style={styles.routeSummaryMetricLabel}>Distance</Text>
                    <Text style={styles.routeSummaryMetricValue}>
                      {formatDistance(routeSummary.totalDistanceMeters)}
                    </Text>
                  </View>
                )}
                {routeSummary.totalEtaSeconds != null && (
                  <View style={styles.routeSummaryMetric}>
                    <Text style={styles.routeSummaryMetricLabel}>ETA</Text>
                    <Text style={styles.routeSummaryMetricValue}>
                      {formatDuration(routeSummary.totalEtaSeconds)}
                    </Text>
                  </View>
                )}
                {routeSummary.totalStaticEtaSeconds != null && (
                  <View style={styles.routeSummaryMetric}>
                    <Text style={styles.routeSummaryMetricLabel}>Base ETA</Text>
                    <Text style={styles.routeSummaryMetricValue}>
                      {formatDuration(routeSummary.totalStaticEtaSeconds)}
                    </Text>
                  </View>
                )}
                {routeSummary.totalTrafficDelaySeconds != null
                  && routeSummary.totalTrafficDelaySeconds !== 0 && (
                    <View style={styles.routeSummaryMetric}>
                      <Text style={styles.routeSummaryMetricLabel}>Traffic impact</Text>
                      <Text style={styles.routeSummaryMetricValue}>
                        {formatDelay(routeSummary.totalTrafficDelaySeconds)}
                      </Text>
                    </View>
                  )}
                {routeSummary.totalTollCost != null ? (
                  <View style={styles.routeSummaryMetric}>
                    <Text style={styles.routeSummaryMetricLabel}>Tolls</Text>
                    <Text style={styles.routeSummaryMetricValue}>
                      {formatCurrency(
                        routeSummary.totalTollCost,
                        routeSummary.totalTollCurrency,
                      )}
                    </Text>
                  </View>
                ) : (
                  routeSummary.containsTolls && (
                    <View style={styles.routeSummaryMetric}>
                      <Text style={styles.routeSummaryMetricLabel}>Tolls</Text>
                      <Text style={styles.routeSummaryMetricValue}>Present</Text>
                    </View>
                  )
                )}
              </View>
              {(routeSummary.distanceProvider
                || routeSummary.usesLiveTraffic
                || routeSummary.containsTolls) && (
                <View style={styles.routeSummaryTags}>
                  {routeSummary.distanceProvider ? (
                    <View style={styles.routeSummaryTag}>
                      <MaterialCommunityIcons
                        name={routeSummary.distanceProvider === 'google' ? 'google-maps' : 'map-marker-distance'}
                        size={14}
                        color="#0f172a"
                      />
                      <Text style={styles.routeSummaryTagText}>
                        {providerLabel ?? routeSummary.distanceProvider}
                      </Text>
                    </View>
                  ) : null}
                  {routeSummary.usesLiveTraffic ? (
                    <View style={[styles.routeSummaryTag, styles.routeSummaryTagTraffic]}>
                      <MaterialCommunityIcons name="traffic-light" size={14} color="#14532d" />
                      <Text style={styles.routeSummaryTagTrafficText}>Live traffic</Text>
                    </View>
                  ) : null}
                  {routeSummary.containsTolls ? (
                    <View style={[styles.routeSummaryTag, styles.routeSummaryTagToll]}>
                      <MaterialCommunityIcons name="cash-multiple" size={14} color="#86198f" />
                      <Text style={styles.routeSummaryTagTollText}>Tolls</Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          )}
          <ScrollView style={styles.modalScroll}>
            {routeLegs.map((leg, index) => {
              const hasDelay = leg.trafficDelaySeconds != null && leg.trafficDelaySeconds !== 0;
              const delayLabel = hasDelay ? formatDelay(leg.trafficDelaySeconds) : null;
              const delayStyle = leg.trafficDelaySeconds != null && leg.trafficDelaySeconds < 0
                ? styles.routeLegMetaGain
                : styles.routeLegMetaDelay;
              
              const isStart = index === 0;
              const isEnd = index === routeLegs.length - 1;

              return (
                <View key={leg.order} style={styles.routeStep}>
                  <View style={[
                    styles.routeOrder, 
                    isStart && styles.routeOrderStart,
                    isEnd && styles.routeOrderEnd
                  ]}>
                    {isStart ? (
                      <MaterialCommunityIcons name="map-marker" size={14} color="#fff" />
                    ) : isEnd ? (
                      <MaterialCommunityIcons name="flag-checkered" size={14} color="#fff" />
                    ) : (
                      <Text style={styles.routeOrderText}>{leg.order + 1}</Text>
                    )}
                  </View>
                  <View style={styles.routeContent}>
                    <Text style={styles.routeLabel}>{leg.label}</Text>
                    {leg.latitude != null && leg.longitude != null && (
                      <Text style={styles.routeCoords}>
                        {leg.latitude.toFixed(4)}, {leg.longitude.toFixed(4)}
                      </Text>
                    )}
                    {(leg.distanceMeters != null || leg.etaSeconds != null) && (
                      <View style={styles.routeLegMetaRow}>
                        {leg.distanceMeters != null && (
                          <Text style={styles.routeLegMeta}>
                            Leg: {formatDistance(leg.distanceMeters)}
                          </Text>
                        )}
                        {leg.etaSeconds != null && (
                          <Text style={styles.routeLegMeta}>
                            ETA: {formatDuration(leg.etaSeconds)}
                          </Text>
                        )}
                      </View>
                    )}
                    {(leg.staticEtaSeconds != null || delayLabel) && (
                      <View style={styles.routeLegMetaRow}>
                        {leg.staticEtaSeconds != null && (
                          <Text style={styles.routeLegMetaSub}>
                            Base: {formatDuration(leg.staticEtaSeconds)}
                          </Text>
                        )}
                        {delayLabel && (
                          <Text style={[styles.routeLegMetaSub, delayStyle]}>
                            Traffic: {delayLabel}
                          </Text>
                        )}
                      </View>
                    )}
                    {(leg.cumulativeDistanceMeters != null || leg.cumulativeEtaSeconds != null) && (
                      <View style={styles.routeLegMetaRow}>
                        {leg.cumulativeDistanceMeters != null && (
                          <Text style={styles.routeLegMetaSub}>
                            Total: {formatDistance(leg.cumulativeDistanceMeters)}
                          </Text>
                        )}
                        {leg.cumulativeEtaSeconds != null && (
                          <Text style={styles.routeLegMetaSub}>
                            {formatDuration(leg.cumulativeEtaSeconds)} overall
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <View style={styles.modalActions}>
            <Pressable
              onPress={onModifySelection}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
              ]}
            >
              <View style={styles.modalActionContent}>
                <MaterialCommunityIcons name="tune-variant" size={18} color="#1d4ed8" />
                <Text style={styles.secondaryButtonLabel}>Modify selection</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={onOpenRoute}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
              ]}
            >
              <View style={styles.modalActionContent}>
                <Ionicons name="navigate-outline" size={18} color="#fff" />
                <Text style={styles.primaryButtonLabel}>Open in Maps</Text>
              </View>
            </Pressable>
          </View>
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
  routeSummaryCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  routeSummaryMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  routeSummaryMetric: {
    gap: 2,
  },
  routeSummaryMetricLabel: {
    fontSize: 11,
    color: '#166534',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  routeSummaryMetricValue: {
    fontSize: 15,
    color: '#14532d',
    fontWeight: '700',
  },
  routeSummaryTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  routeSummaryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  routeSummaryTagText: {
    fontSize: 11,
    color: '#0f172a',
    fontWeight: '600',
  },
  routeSummaryTagTraffic: {
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
  },
  routeSummaryTagTrafficText: {
    fontSize: 11,
    color: '#15803d',
    fontWeight: '600',
  },
  routeSummaryTagToll: {
    borderColor: '#f5d0fe',
    backgroundColor: '#fdf4ff',
  },
  routeSummaryTagTollText: {
    fontSize: 11,
    color: '#a21caf',
    fontWeight: '600',
  },
  modalScroll: {
    // flex: 1, // Removed to allow content to determine height
  },
  routeStep: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  routeOrder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#64748b',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  routeOrderStart: {
    backgroundColor: '#16a34a',
  },
  routeOrderEnd: {
    backgroundColor: '#dc2626',
  },
  routeOrderText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  routeContent: {
    flex: 1,
    gap: 4,
  },
  routeLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  routeCoords: {
    fontSize: 12,
    color: '#64748b',
    fontFamily: 'monospace',
  },
  routeLegMetaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
  },
  routeLegMeta: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  routeLegMetaSub: {
    fontSize: 11,
    color: '#94a3b8',
  },
  routeLegMetaDelay: {
    color: '#ef4444',
    fontWeight: '600',
  },
  routeLegMetaGain: {
    color: '#16a34a',
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
  },
  secondaryButton: {
    backgroundColor: '#e0e7ff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  secondaryButtonPressed: {
    opacity: 0.8,
  },
  modalActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryButtonLabel: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
