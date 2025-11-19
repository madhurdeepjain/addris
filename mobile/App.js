import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Alert,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  UIManager,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { showLocation } from 'react-native-map-link';

import { extractAddresses, computeRoute } from './src/api/addris';
import { HeroCard } from './src/components/HeroCard';
import { LocationCard } from './src/components/LocationCard';
import { ActionButtons } from './src/components/ActionButtons';
import { ProcessingBanner } from './src/components/ProcessingBanner';
import { StatusPills } from './src/components/StatusPills';
import { ImagePreviewStrip } from './src/components/ImagePreviewStrip';
import { EmptyState } from './src/components/EmptyState';
import { ActiveImageCard } from './src/components/ActiveImageCard';
import { StopsModal } from './src/components/StopsModal';
import { RouteSummaryModal } from './src/components/RouteSummaryModal';

const queryClient = new QueryClient();

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function WorkflowScreen() {
  const [images, setImages] = useState([]);
  const [activeImageId, setActiveImageId] = useState(null);
  const [location, setLocation] = useState(null);
  const [reverseGeocodeError, setReverseGeocodeError] = useState(null);
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);
  const [routeLegs, setRouteLegs] = useState([]);
  const [routeSummary, setRouteSummary] = useState(null);
  const [selectedOverlayVisible, setSelectedOverlayVisible] = useState(false);
  const [routeSummaryVisible, setRouteSummaryVisible] = useState(false);

  const heroAnim = useRef(new Animated.Value(0)).current;
  const overlaySheetAnim = useRef(new Animated.Value(0)).current;
  const routeSheetAnim = useRef(new Animated.Value(0)).current;
  const processingOpacity = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const routeButtonPulse = useRef(new Animated.Value(0)).current;
  const routeButtonTraveler = useRef(new Animated.Value(0)).current;
  const routeButtonSpinner = useRef(new Animated.Value(0)).current;

  const fetchLocation = useCallback(async () => {
    try {
      setReverseGeocodeError(null);
      let permission = await Location.getForegroundPermissionsAsync();
      let status = permission.status;
      if (status !== 'granted') {
        permission = await Location.requestForegroundPermissionsAsync();
        status = permission.status;
      }

      if (status !== 'granted') {
        setReverseGeocodeError('Location permission not granted.');
        Alert.alert('Location unavailable', 'Location permission is required to determine your current address.');
        return;
      }

      const current = await Location.getCurrentPositionAsync({});
      const coords = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };
      setLocation(coords);

      try {
        const [place] = await Location.reverseGeocodeAsync({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });

        if (place) {
          const parts = [
            place.name,
            place.street,
            place.postalCode,
            place.city,
            place.region,
          ]
            .map((value) => (value ? String(value).trim() : ''))
            .filter(Boolean);

          setLocation({
            ...coords,
            address: parts.length ? parts.join(', ') : undefined,
          });
          setReverseGeocodeError(null);
        }
      } catch (reverseError) {
        console.warn('Reverse geocoding failed', reverseError);
        setReverseGeocodeError(
          reverseError instanceof Error ? reverseError.message : String(reverseError),
        );
      }
    } catch (error) {
      console.warn('Location refresh failed', error);
      Alert.alert('Location unavailable', 'Unable to retrieve your current location.');
    }
  }, []);

  const handleRefreshLocation = useCallback(async () => {
    if (isRefreshingLocation) {
      return;
    }

    setIsRefreshingLocation(true);
    try {
      await fetchLocation();
    } finally {
      setIsRefreshingLocation(false);
    }
  }, [fetchLocation, isRefreshingLocation]);

  useEffect(() => {
    (async () => {
      const camera = await ImagePicker.requestCameraPermissionsAsync();
      if (camera.status !== 'granted') {
        Alert.alert('Permission required', 'Camera access is needed to capture images.');
      }

      const library = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (library.status !== 'granted') {
        Alert.alert('Permission required', 'Photo library access is needed to pick images.');
      }

      await fetchLocation();
    })();
  }, [fetchLocation]);

  useEffect(() => {
    Animated.timing(heroAnim, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [heroAnim]);

  useEffect(() => {
    if (!images.length) {
      setActiveImageId(null);
      setRouteLegs([]);
      setRouteSummaryVisible(false);
      setRouteSummary(null);
      return;
    }

    if (!images.some((item) => item.id === activeImageId)) {
      setActiveImageId(images[images.length - 1].id);
    }
  }, [images, activeImageId]);

  const locationLabel = useMemo(() => {
    if (!location) {
      return null;
    }
    if (location.address) {
      return location.address;
    }
    if (location.latitude != null && location.longitude != null) {
      return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
    }
    return null;
  }, [location]);

  const extractMutation = useMutation({
    mutationFn: extractAddresses,
  });

  const computeRouteMutation = useMutation({
    mutationFn: computeRoute,
    onSuccess: (data) => {
      const legs = (data.route ?? []).map((leg, index) => ({
        order: leg.order ?? index,
        label:
          index === 0 && locationLabel
            ? locationLabel
            : leg.label ?? `Stop ${index + 1}`,
        latitude: leg.latitude,
        longitude: leg.longitude,
        distanceMeters: leg.distance_meters ?? null,
        cumulativeDistanceMeters: leg.cumulative_distance_meters ?? null,
        etaSeconds: leg.eta_seconds ?? null,
        cumulativeEtaSeconds: leg.cumulative_eta_seconds ?? null,
        staticEtaSeconds: leg.static_eta_seconds ?? null,
        trafficDelaySeconds: leg.traffic_delay_seconds ?? null,
        hasToll: Boolean(leg.has_toll),
        tollCurrency: leg.toll_currency ?? null,
        tollCost: leg.toll_cost ?? null,
      }));
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setRouteLegs(legs);
      setRouteSummaryVisible(legs.length > 0);
      const containsTolls = Boolean(
        data.contains_tolls ?? legs.some((leg) => leg.hasToll || leg.tollCost != null),
      );
      setRouteSummary({
        totalDistanceMeters: data.total_distance_meters ?? null,
        totalEtaSeconds: data.total_eta_seconds ?? null,
        totalStaticEtaSeconds: data.total_static_eta_seconds ?? null,
        totalTrafficDelaySeconds: data.total_traffic_delay_seconds ?? null,
        totalTollCost: data.total_toll_cost ?? null,
        totalTollCurrency: data.total_toll_currency ?? null,
        originAddress: locationLabel ?? data.origin_address ?? null,
        distanceProvider: data.distance_provider ?? null,
        usesLiveTraffic: Boolean(data.uses_live_traffic),
        containsTolls,
      });
    },
    onError: (error) => {
      Alert.alert('Route optimization failed', error.message ?? 'Unable to compute route.');
    },
  });

  useEffect(() => {
    Animated.timing(overlaySheetAnim, {
      toValue: selectedOverlayVisible ? 1 : 0,
      duration: 220,
      easing: selectedOverlayVisible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [selectedOverlayVisible, overlaySheetAnim]);

  useEffect(() => {
    Animated.timing(routeSheetAnim, {
      toValue: routeSummaryVisible ? 1 : 0,
      duration: 220,
      easing: routeSummaryVisible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [routeSummaryVisible, routeSheetAnim]);

  useEffect(() => {
    Animated.timing(processingOpacity, {
      toValue: computeRouteMutation.isPending ? 1 : 0,
      duration: computeRouteMutation.isPending ? 160 : 120,
      easing: computeRouteMutation.isPending ? Easing.out(Easing.quad) : Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [computeRouteMutation.isPending, processingOpacity]);

  useEffect(() => {
    let animation;
    if (computeRouteMutation.isPending) {
      progressAnim.stopAnimation();
      progressAnim.setValue(0);
      animation = Animated.loop(
        Animated.timing(progressAnim, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      );
      animation.start();
    } else {
      progressAnim.stopAnimation();
      progressAnim.setValue(0);
    }

    return () => {
      animation?.stop();
    };
  }, [computeRouteMutation.isPending, progressAnim]);

  useEffect(() => {
    let pulseLoop;
    let travelerLoop;
    let spinnerLoop;
    if (computeRouteMutation.isPending) {
      routeButtonPulse.stopAnimation();
      routeButtonPulse.setValue(0);
      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(routeButtonPulse, {
            toValue: 1,
            duration: 720,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(routeButtonPulse, {
            toValue: 0,
            duration: 620,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      pulseLoop.start();

      routeButtonTraveler.stopAnimation();
      routeButtonTraveler.setValue(0);
      travelerLoop = Animated.loop(
        Animated.timing(routeButtonTraveler, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      );
      travelerLoop.start();

      routeButtonSpinner.stopAnimation();
      routeButtonSpinner.setValue(0);
      spinnerLoop = Animated.loop(
        Animated.timing(routeButtonSpinner, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      spinnerLoop.start();
    } else {
      routeButtonPulse.stopAnimation();
      routeButtonPulse.setValue(0);
      routeButtonTraveler.stopAnimation();
      routeButtonTraveler.setValue(0);
      routeButtonSpinner.stopAnimation();
      routeButtonSpinner.setValue(0);
    }

    return () => {
      pulseLoop?.stop();
      travelerLoop?.stop();
      spinnerLoop?.stop();
    };
  }, [computeRouteMutation.isPending, routeButtonPulse, routeButtonTraveler, routeButtonSpinner]);

  const createImageEntry = useCallback((asset) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return {
      id,
      asset,
      uri: asset.uri,
      fileName: asset.fileName ?? asset.uri.split('/').pop() ?? 'upload.jpg',
      status: 'extracting',
      addresses: [],
      error: null,
    };
  }, []);

  const refreshExtraction = useCallback(
    async (imageId, asset) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setImages((prev) =>
        prev.map((item) =>
          item.id === imageId
            ? { ...item, status: 'extracting', error: null }
            : item,
        ),
      );
      setRouteLegs([]);
      setRouteSummaryVisible(false);
      try {
        const result = await extractMutation.mutateAsync({ asset });
        const addresses = (result.addresses ?? []).map((candidate, index) => ({
          ...candidate,
          localId: `${imageId}-${index}`,
          selected:
            candidate.status === 'validated'
            && candidate.latitude != null
            && candidate.longitude != null,
        }));
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setImages((prev) =>
          prev.map((item) =>
            item.id === imageId
              ? { ...item, addresses, status: 'ready' }
              : item,
          ),
        );
      } catch (error) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setImages((prev) =>
          prev.map((item) =>
            item.id === imageId
              ? { ...item, status: 'error', error: error.message ?? 'Extraction failed' }
              : item,
          ),
        );
      }
    },
    [extractMutation],
  );

  const handleImageResult = useCallback(
    async (result) => {
      if (result.canceled || !result.assets?.length) {
        return;
      }
      const asset = result.assets[0];
      const entry = createImageEntry(asset);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setImages((prev) => [...prev, entry]);
      setActiveImageId(entry.id);
      await refreshExtraction(entry.id, asset);
    },
    [createImageEntry, refreshExtraction],
  );

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });
    await handleImageResult(result);
  }, [handleImageResult]);

  const captureImage = useCallback(async () => {
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7,
    });
    await handleImageResult(result);
  }, [handleImageResult]);

  const handleAddImage = useCallback(() => {
    Alert.alert('Add image', 'Choose how to add a shipping label', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Capture photo', onPress: captureImage },
      { text: 'Pick from library', onPress: pickImage },
    ]);
  }, [captureImage, pickImage]);

  const removeImage = useCallback((imageId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setImages((prev) => prev.filter((item) => item.id !== imageId));
    setRouteLegs([]);
    setRouteSummaryVisible(false);
    setRouteSummary(null);
  }, []);

  const toggleCandidate = useCallback((imageId, candidateId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setImages((prev) =>
      prev.map((image) => {
        if (image.id !== imageId) {
          return image;
        }
        const addresses = image.addresses.map((candidate) => {
          if (candidate.localId !== candidateId) {
            return candidate;
          }
          if (candidate.latitude == null || candidate.longitude == null) {
            return candidate;
          }
          return { ...candidate, selected: !candidate.selected };
        });
        return { ...image, addresses };
      }),
    );
    setRouteLegs([]);
    setRouteSummaryVisible(false);
  }, []);

  const activeImage = useMemo(() => {
    if (!images.length) {
      return null;
    }
    const explicit = images.find((item) => item.id === activeImageId);
    return explicit ?? images[images.length - 1];
  }, [images, activeImageId]);

  const selectedCandidates = useMemo(
    () =>
      images.flatMap((image) =>
        image.addresses.filter(
          (candidate) =>
            candidate.selected
            && candidate.latitude != null
            && candidate.longitude != null,
        ),
      ),
    [images],
  );

  const selectableCandidateCount = useMemo(
    () =>
      images.reduce(
        (total, image) =>
          total
          + image.addresses.filter(
              (candidate) =>
                candidate.latitude != null && candidate.longitude != null,
            ).length,
        0,
      ),
    [images],
  );

  const displayLabel = useCallback((candidate) => {
    if (candidate?.parsed?.resolved_label) {
      return candidate.parsed.resolved_label;
    }
    if (candidate?.parsed) {
      const parts = ['house_number', 'road', 'city', 'state', 'postcode']
        .map((key) => candidate.parsed?.[key])
        .filter(Boolean);
      if (parts.length) {
        return parts.join(', ');
      }
    }
    return candidate?.raw_text ?? 'Unknown address';
  }, []);

  const selectedCount = selectedCandidates.length;
  const extractionInFlight = extractMutation.isPending;

  const handleOptimizeRoute = useCallback(() => {
    if (!selectedCount) {
      Alert.alert('No stops selected', 'Choose at least one address with coordinates.');
      return;
    }

    const stops = selectedCandidates.map((candidate) => ({
      label: displayLabel(candidate),
      latitude: candidate.latitude,
      longitude: candidate.longitude,
    }));

    const payload = {
      stops,
    };

    if (location?.latitude != null && location?.longitude != null) {
      payload.origin = {
        label: 'Current Location',
        latitude: location.latitude,
        longitude: location.longitude,
      };
    }

    setRouteLegs([]);
    setRouteSummary(null);
    setRouteSummaryVisible(false);
    computeRouteMutation.mutate(payload);
  }, [selectedCandidates, selectedCount, location, computeRouteMutation, displayLabel]);

  const handleOpenRoute = useCallback(async () => {
    if (!routeLegs.length) {
      return;
    }

    const validLegs = routeLegs.filter(
      (leg) => typeof leg.latitude === 'number' && typeof leg.longitude === 'number',
    );

    if (!validLegs.length) {
      Alert.alert('Navigation unavailable', 'No coordinates available for this route.');
      return;
    }

    const origin = validLegs[0];
    const destination = validLegs[validLegs.length - 1];
    const isSingleStop = validLegs.length === 1;

    try {
      if (isSingleStop) {
        await showLocation({
          latitude: origin.latitude,
          longitude: origin.longitude,
          title: origin.label ?? 'Stop',
          alwaysIncludeGoogle: true,
          googleForceLatLon: true,
          cancelText: 'Cancel',
        });
        return;
      }

      const intermediateLegs = validLegs.slice(1, validLegs.length - 1);

      await showLocation({
        latitude: destination.latitude,
        longitude: destination.longitude,
        title: destination.label ?? 'Destination',
        sourceLatitude: origin.latitude,
        sourceLongitude: origin.longitude,
        alwaysIncludeGoogle: true,
        googleForceLatLon: true,
        cancelText: 'Cancel',
        directionsMode: 'driving',
        ...(intermediateLegs.length
          ? {
              points: intermediateLegs.map((leg, index) => ({
                latitude: leg.latitude,
                longitude: leg.longitude,
                title: leg.label ?? `Stop ${index + 1}`,
              })),
            }
          : {}),
      });
    } catch (error) {
      console.warn('Failed to open maps link', error);
      Alert.alert('Navigation unavailable', 'Unable to open the maps application.');
    }
  }, [routeLegs]);

  const heroTranslateY = heroAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const heroScale = heroAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });
  const topActionsTranslateY = heroAnim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  const overlayTranslateY = overlaySheetAnim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] });
  const overlayBackdropOpacity = overlaySheetAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const routeTranslateY = routeSheetAnim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] });
  const routeBackdropOpacity = routeSheetAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const progressTranslate = progressAnim.interpolate({ inputRange: [0, 1], outputRange: [-120, 240] });
  const routePulseScale = routeButtonPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const routePulseOpacity = routeButtonPulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.38] });
  const routeSpinnerRotation = routeButtonSpinner.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const hasImages = images.length > 0;

  const formatDistance = useCallback((meters) => {
    if (meters == null) {
      return null;
    }
    const value = Math.abs(meters);
    if (value >= 1000) {
      return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} km`;
    }
    return `${Math.round(value)} m`;
  }, []);

  const formatDuration = useCallback((seconds) => {
    if (seconds == null) {
      return null;
    }
    const value = Math.max(0, seconds);
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    if (hours > 0) {
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${Math.max(1, minutes)}m`;
  }, []);

  const formatDelay = useCallback((seconds) => {
    if (seconds == null) {
      return null;
    }
    if (seconds === 0) {
      return '0m';
    }
    const sign = seconds > 0 ? '+' : '-';
    const formatted = formatDuration(Math.abs(seconds));
    return formatted ? `${sign}${formatted}` : null;
  }, [formatDuration]);

  const formatCurrency = useCallback((amount, currency) => {
    if (amount == null) {
      return null;
    }
    const absolute = Math.abs(amount);
    let precision = 2;
    if (absolute >= 100) {
      precision = 0;
    } else if (absolute >= 10) {
      precision = 1;
    }
    const value = amount.toFixed(precision);
    return currency ? `${currency} ${value}` : value;
  }, []);

  const providerLabel = useMemo(() => {
    const provider = routeSummary?.distanceProvider;
    if (!provider) {
      return null;
    }
    const normalized = provider.toLowerCase();
    if (normalized === 'google') {
      return 'Google Maps';
    }
    if (normalized === 'haversine') {
      return 'Geodesic';
    }
    return provider.replace(/_/g, ' ');
  }, [routeSummary?.distanceProvider]);

  const routeSummaryMeta = useMemo(() => {
    if (!routeSummary) {
      return null;
    }
    const parts = [];
    if (routeSummary.totalDistanceMeters != null) {
      parts.push(formatDistance(routeSummary.totalDistanceMeters));
    }
    if (
      routeSummary.totalTrafficDelaySeconds != null
      && routeSummary.totalTrafficDelaySeconds !== 0
    ) {
      const delay = formatDelay(routeSummary.totalTrafficDelaySeconds);
      if (delay) {
        parts.push(`Traffic ${delay}`);
      }
    } else if (routeSummary.usesLiveTraffic) {
      parts.push('Live traffic');
    }
    if (routeSummary.containsTolls) {
      parts.push('Tolls');
    }
    return parts.length ? parts.join(' • ') : null;
  }, [routeSummary, formatDistance, formatDelay]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <HeroCard
          opacity={heroAnim}
          translateY={heroTranslateY}
          scale={heroScale}
        />

        <LocationCard
          locationLabel={locationLabel}
          error={reverseGeocodeError}
          isRefreshing={isRefreshingLocation}
          onRefresh={handleRefreshLocation}
        />

        <ActionButtons
          opacity={heroAnim}
          translateY={topActionsTranslateY}
          selectedCount={selectedCount}
          onShowOverlay={() => setSelectedOverlayVisible(true)}
          onOptimizeRoute={handleOptimizeRoute}
          isComputing={computeRouteMutation.isPending}
          pulseOpacity={routePulseOpacity}
          pulseScale={routePulseScale}
          spinnerRotation={routeSpinnerRotation}
        />

        {computeRouteMutation.isPending && (
          <ProcessingBanner
            opacity={processingOpacity}
            translateY={topActionsTranslateY}
            progressTranslate={progressTranslate}
          />
        )}

        <StatusPills
          opacity={heroAnim}
          extractionInFlight={extractionInFlight}
          isComputing={computeRouteMutation.isPending}
          routeReady={routeLegs.length > 0}
          routeSummaryMeta={routeSummaryMeta}
          onViewRoute={() => setRouteSummaryVisible(true)}
        />

        {hasImages ? (
          <ImagePreviewStrip
            images={images}
            activeImageId={activeImageId}
            onSelectImage={setActiveImageId}
            onAddImage={handleAddImage}
          />
        ) : (
          <EmptyState onAddImage={handleAddImage} />
        )}

        <ActiveImageCard
          activeImage={activeImage}
          onRemove={removeImage}
          onRetry={refreshExtraction}
          onToggleCandidate={toggleCandidate}
          displayLabel={displayLabel}
        />

        <StatusBar style="dark" />
      </ScrollView>

      <StopsModal
        visible={selectedOverlayVisible}
        onClose={() => setSelectedOverlayVisible(false)}
        images={images}
        selectedCount={selectedCount}
        selectableCandidateCount={selectableCandidateCount}
        location={location}
        displayLabel={displayLabel}
        toggleCandidate={toggleCandidate}
        overlayBackdropOpacity={overlayBackdropOpacity}
        overlayTranslateY={overlayTranslateY}
      />

      <RouteSummaryModal
        visible={routeSummaryVisible}
        onClose={() => setRouteSummaryVisible(false)}
        routeSummary={routeSummary}
        routeLegs={routeLegs}
        onModifySelection={() => setRouteSummaryVisible(false)}
        onOpenRoute={handleOpenRoute}
        routeBackdropOpacity={routeBackdropOpacity}
        routeTranslateY={routeTranslateY}
        formatDistance={formatDistance}
        formatDuration={formatDuration}
        formatDelay={formatDelay}
        formatCurrency={formatCurrency}
        providerLabel={providerLabel}
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WorkflowScreen />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#eef2ff',
  },
  container: {
    flexGrow: 1,
    padding: 20,
    gap: 20,
  },
});