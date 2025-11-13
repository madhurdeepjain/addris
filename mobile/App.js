import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Easing,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { showLocation } from 'react-native-map-link';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';

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
  const [routeTrackWidth, setRouteTrackWidth] = useState(0);

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
    mutationFn: async ({ asset }) => {
      const formData = new FormData();
      const uri = asset.uri;
      const filename = asset.fileName ?? uri.split('/').pop() ?? 'upload.jpg';
      const extension = filename.split('.').pop()?.toLowerCase();

      let type = asset.mimeType
        ?? (extension === 'png'
          ? 'image/png'
          : extension === 'heic' || extension === 'heif'
            ? 'image/heic'
            : 'image/jpeg');

      if (type === 'image/heif') {
        type = 'image/heic';
      }

      formData.append('image', {
        uri,
        name: filename,
        type,
      });

      const response = await fetch(`${API_BASE_URL}/v1/addresses/extract`, {
        method: 'POST',
        body: formData,
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        let message = `Extraction failed with status ${response.status}`;
        if (errorText) {
          try {
            const payload = JSON.parse(errorText);
            if (payload?.detail) {
              message = Array.isArray(payload.detail)
                ? payload.detail.map((item) => item.msg ?? String(item)).join('\n')
                : String(payload.detail);
            } else {
              message = errorText;
            }
          } catch (parseError) {
            message = errorText;
          }
        }
        throw new Error(message);
      }

      return response.json();
    },
  });

  const computeRouteMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await fetch(`${API_BASE_URL}/v1/routes/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let message = `Route optimization failed with status ${response.status}`;
        if (errorText) {
          try {
            const payload = JSON.parse(errorText);
            if (payload?.detail) {
              message = Array.isArray(payload.detail)
                ? payload.detail.map((item) => item.msg ?? String(item)).join('\n')
                : String(payload.detail);
            } else {
              message = errorText;
            }
          } catch (parseError) {
            message = errorText;
          }
        }
        throw new Error(message);
      }

      return response.json();
    },
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
      }));
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setRouteLegs(legs);
      setRouteSummaryVisible(legs.length > 0);
      setRouteSummary({
        totalDistanceMeters: data.total_distance_meters ?? null,
        totalEtaSeconds: data.total_eta_seconds ?? null,
        originAddress: locationLabel ?? data.origin_address ?? null,
        distanceProvider: data.distance_provider ?? null,
        usesLiveTraffic: Boolean(data.uses_live_traffic),
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
  const trackWidthForAnimation = routeTrackWidth || 140;
  const routePulseScale = routeButtonPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const routePulseOpacity = routeButtonPulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.38] });
  const routeTravelerTranslate = routeButtonTraveler.interpolate({
    inputRange: [0, 1],
    outputRange: [-12, Math.max(trackWidthForAnimation - 18, 0)],
  });
  const routeProgressTranslate = routeButtonTraveler.interpolate({
    inputRange: [0, 1],
    outputRange: [-trackWidthForAnimation, 0],
  });
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Animated.View
          style={[
            styles.heroCard,
            {
              opacity: heroAnim,
              transform: [{ translateY: heroTranslateY }, { scale: heroScale }],
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

        {(locationLabel || reverseGeocodeError) && (
          <View style={styles.locationCard}>
            <View style={styles.locationHeader}>
              <View style={styles.locationRow}>
                <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#38bdf8" />
                <Text style={styles.locationLabel}>You are here</Text>
              </View>
              <Pressable
                onPress={handleRefreshLocation}
                disabled={isRefreshingLocation}
                style={({ pressed }) => [
                  styles.locationRefreshButton,
                  isRefreshingLocation && styles.locationRefreshButtonDisabled,
                  pressed && !isRefreshingLocation && styles.locationRefreshButtonPressed,
                ]}
              >
                {isRefreshingLocation ? (
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
        )}

        <Animated.View
          style={[
            styles.topActions,
            {
              opacity: heroAnim,
              transform: [{ translateY: topActionsTranslateY }],
            },
          ]}
        >
          <Pressable
            onPress={() => selectedCount && setSelectedOverlayVisible(true)}
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
            onPress={handleOptimizeRoute}
            disabled={!selectedCount || computeRouteMutation.isPending}
            style={({ pressed }) => [
              styles.routeButton,
              (!selectedCount || computeRouteMutation.isPending) && styles.routeButtonDisabled,
              pressed && !(computeRouteMutation.isPending || !selectedCount) && styles.routeButtonPressed,
            ]}
          >
            {computeRouteMutation.isPending && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.routeButtonPulseOverlay,
                  {
                    opacity: routePulseOpacity,
                    transform: [{ scale: routePulseScale }],
                  },
                ]}
              />
            )}
            {computeRouteMutation.isPending ? (
              <View style={styles.routeButtonLoaderWrapper}>
                <View style={styles.routeButtonLoadingContent}>
                  <Animated.View
                    style={[
                      styles.routeButtonSpinner,
                      { transform: [{ rotate: routeSpinnerRotation }] },
                    ]}
                  >
                    <MaterialCommunityIcons name="navigation-variant" size={18} color="#fff" />
                  </Animated.View>
                  <Text style={styles.routeButtonLoadingText}>Building route</Text>
                </View>
                {/* <View
                  style={styles.routeButtonAnimationTrack}
                  onLayout={({ nativeEvent }) => {
                    const width = nativeEvent.layout.width;
                    setRouteTrackWidth((prev) => (Math.abs(prev - width) < 0.5 ? prev : width));
                  }}
                >
                  <Animated.View
                    style={[
                      styles.routeButtonAnimationProgress,
                      { transform: [{ translateX: routeProgressTranslate }] },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.routeButtonAnimationVehicle,
                      { transform: [{ translateX: routeTravelerTranslate }] },
                    ]}
                  >
                    <MaterialCommunityIcons name="truck-fast" size={14} color="#14532d" />
                  </Animated.View>
                </View> */}
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

        {computeRouteMutation.isPending && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.processingBanner,
              {
                opacity: processingOpacity,
                transform: [{ translateY: topActionsTranslateY }],
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
        )}

        {(extractionInFlight || computeRouteMutation.isPending || routeLegs.length > 0) && (
          <Animated.View style={[styles.statusPills, { opacity: heroAnim }]}>
            {extractionInFlight && (
              <View style={styles.statusPill}>
                <MaterialCommunityIcons name="file-search-outline" size={16} color="#2563eb" />
                <Text style={styles.statusPillText}>Extracting addresses…</Text>
              </View>
            )}
            {computeRouteMutation.isPending && (
              <View style={styles.statusPill}>
                <MaterialCommunityIcons name="map-clock" size={16} color="#16a34a" />
                <Text style={styles.statusPillText}>Optimizing route…</Text>
              </View>
            )}
            {routeLegs.length > 0 && !computeRouteMutation.isPending && (
              <Pressable
                onPress={() => setRouteSummaryVisible(true)}
                style={({ pressed }) => [styles.statusPillReady, pressed && styles.statusPillReadyPressed]}
              >
                <MaterialCommunityIcons name="map-marker-check-outline" size={16} color="#166534" />
                <Text style={styles.statusPillReadyText}>Route ready</Text>
                {routeSummary?.totalDistanceMeters != null ? (
                  <Text style={styles.statusPillReadyMeta}>
                    {formatDistance(routeSummary.totalDistanceMeters)}
                    {routeSummary?.usesLiveTraffic ? ' • Live traffic' : ''}
                  </Text>
                ) : (
                  routeSummary?.usesLiveTraffic && (
                    <Text style={styles.statusPillReadyMeta}>Live traffic</Text>
                  )
                )}
                <Text style={styles.statusPillReadyAction}>View</Text>
              </Pressable>
            )}
          </Animated.View>
        )}

        {hasImages ? (
          <ScrollView
            horizontal
            style={styles.previewStrip}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.previewContent}
          >
            {images.map((image) => (
              <Pressable
                key={image.id}
                onPress={() => setActiveImageId(image.id)}
                style={({ pressed }) => [
                  styles.previewWrapper,
                  activeImage?.id === image.id && styles.previewWrapperActive,
                  pressed && styles.previewWrapperPressed,
                ]}
              >
                <Image source={{ uri: image.uri }} style={styles.previewImage} />
              </Pressable>
            ))}
            <Pressable
              onPress={handleAddImage}
              style={({ pressed }) => [styles.addCard, pressed && styles.addCardPressed]}
            >
              <MaterialCommunityIcons name="image-plus" size={32} color="#1d4ed8" />
              <Text style={styles.addLabel}>Add image</Text>
            </Pressable>
          </ScrollView>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyStateCard}>
              <MaterialCommunityIcons name="inbox-arrow-down-outline" size={40} color="#3b82f6" />
              <Text style={styles.emptyStateTitle}>Start your route</Text>
              <Text style={styles.emptyStateSubtitle}>
                Import or capture a shipping label to extract addresses and plan stops automatically.
              </Text>
              <Pressable
                onPress={handleAddImage}
                style={({ pressed }) => [styles.emptyActionButton, pressed && styles.emptyActionButtonPressed]}
              >
                <MaterialCommunityIcons name="image-plus" size={22} color="#1d4ed8" />
                <Text style={styles.emptyActionText}>Add image</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeImage && (
          <View style={styles.contentCard}>
            <View style={styles.activeHeader}>
              <Text style={styles.sectionTitle}>Selected image</Text>
              <Pressable
                onPress={() => removeImage(activeImage.id)}
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
                  onPress={() => refreshExtraction(activeImage.id, activeImage.asset)}
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
                      onPress={() => selectable && toggleCandidate(activeImage.id, candidate.localId)}
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
        )}

        <StatusBar style="dark" />
      </ScrollView>

      <Modal
        animationType="slide"
        transparent
        visible={selectedOverlayVisible}
        onRequestClose={() => setSelectedOverlayVisible(false)}
      >
        <View style={styles.modalWrapper}>
          <Animated.View style={[styles.modalBackdrop, { opacity: overlayBackdropOpacity }]} />
          <Pressable
            style={styles.modalDismissArea}
            onPress={() => setSelectedOverlayVisible(false)}
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
              onPress={() => setSelectedOverlayVisible(false)}
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

      <Modal
        animationType="slide"
        transparent
        visible={routeSummaryVisible}
        onRequestClose={() => setRouteSummaryVisible(false)}
      >
        <View style={styles.modalWrapper}>
          <Animated.View style={[styles.modalBackdrop, { opacity: routeBackdropOpacity }]} />
          <Pressable
            style={styles.modalDismissArea}
            onPress={() => setRouteSummaryVisible(false)}
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
                {/* {routeSummary.originAddress ? (
                  <View style={styles.routeSummaryRow}>
                    <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#166534" />
                    <Text style={styles.routeSummaryText} numberOfLines={2}>
                      {routeSummary.originAddress}
                    </Text>
                  </View>
                ) : null} */}
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
                </View>
                {(routeSummary.distanceProvider || routeSummary.usesLiveTraffic) && (
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
                  </View>
                )}
              </View>
            )}
            <ScrollView style={styles.modalScroll}>
              {routeLegs.map((leg) => (
                <View key={leg.order} style={styles.routeStep}>
                  <View style={styles.routeOrder}>
                    <Text style={styles.routeOrderText}>{leg.order + 1}</Text>
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
                            {formatDuration(leg.etaSeconds)}
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
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setRouteSummaryVisible(false)}
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
                onPress={handleOpenRoute}
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
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  selectedChipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
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
  routeButtonAnimationTrack: {
    width: '82%',
    maxWidth: 220,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
    marginTop: 12,
    overflow: 'hidden',
  },
  routeButtonAnimationProgress: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(34, 197, 94, 0.45)',
  },
  routeButtonAnimationVehicle: {
    position: 'absolute',
    top: -5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#047857',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 2,
  },
  routeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
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
  previewStrip: {
    paddingVertical: 4,
  },
  previewContent: {
    alignItems: 'center',
    gap: 12,
    paddingRight: 12,
  },
  addCard: {
    width: 96,
    height: 96,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#2563eb',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  addCardPressed: {
    opacity: 0.8,
  },
  addLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1d4ed8',
  },
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
  previewWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
    elevation: 2,
  },
  previewWrapperActive: {
    borderColor: '#2563eb',
  },
  previewWrapperPressed: {
    opacity: 0.85,
  },
  previewImage: {
    width: 96,
    height: 96,
  },
  section: {
    gap: 12,
  },
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
    fontSize: 20,
    fontWeight: '600',
    color: '#0f172a',
  },
  mainPreview: {
    width: '100%',
    height: 240,
    borderRadius: 16,
    backgroundColor: '#cbd5f5',
  },
  centeredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 15,
    color: '#1e293b',
  },
  metaText: {
    fontSize: 13,
    color: '#475569',
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '500',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#1d4ed8',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  secondaryButtonPressed: {
    backgroundColor: '#eff6ff',
  },
  secondaryButtonLabel: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  textButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  textButtonPressed: {
    opacity: 0.6,
  },
  textButtonLabel: {
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: '600',
  },
  addressCard: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 14,
    gap: 6,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
    elevation: 2,
  },
  addressCardSelected: {
    borderWidth: 2,
    borderColor: '#22c55e',
  },
  addressCardDisabled: {
    opacity: 0.5,
  },
  addressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  addressText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  badge: {
    fontSize: 12,
    color: '#1d4ed8',
    fontWeight: '600',
  },
  badgeSelected: {
    fontSize: 12,
    color: '#15803d',
    fontWeight: '700',
  },
  badgeDisabled: {
    fontSize: 12,
    color: '#7f1d1d',
  },
  modalWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalDismissArea: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 16,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    zIndex: 1,
  },
  modalSheetLarge: {
    maxHeight: '92%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#cbd5f5',
    marginBottom: 12,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalSummary: {
    gap: 8,
  },
  modalSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalSummaryText: {
    fontSize: 14,
    color: '#0f172a',
  },
  modalSummaryMeta: {
    fontSize: 13,
    color: '#475569',
  },
  modalScroll: {
    maxHeight: 360,
  },
  routeSummaryCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 16,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  routeSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeSummaryText: {
    flex: 1,
    fontSize: 14,
    color: '#14532d',
    fontWeight: '600',
  },
  routeSummaryMetrics: {
    flexDirection: 'row',
    gap: 16,
  },
  routeSummaryMetric: {
    flex: 1,
    gap: 4,
  },
  routeSummaryMetricLabel: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  routeSummaryMetricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  routeSummaryTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  routeSummaryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#e2e8f0',
  },
  routeSummaryTagText: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '600',
  },
  routeSummaryTagTraffic: {
    backgroundColor: '#dcfce7',
  },
  routeSummaryTagTrafficText: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '600',
  },
  modalAddressMeta: {
    fontSize: 13,
    color: '#475569',
  },
  modalButton: {
    marginTop: 8,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flex: 1,
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  overlayImageSection: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 10,
  },
  overlayImageHeader: {
    gap: 4,
  },
  overlayImageTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  overlayImageSubtitle: {
    fontSize: 13,
    color: '#475569',
  },
  overlayStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  overlayStatusText: {
    fontSize: 13,
    color: '#2563eb',
  },
  overlayHint: {
    fontSize: 13,
    color: '#64748b',
  },
  overlayAddressCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  overlayAddressCardSelected: {
    borderWidth: 2,
    borderColor: '#22c55e',
    backgroundColor: '#ecfdf5',
  },
  overlayAddressCardDisabled: {
    opacity: 0.6,
  },
  overlayAddressCardPressed: {
    opacity: 0.85,
  },
  overlayAddressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  overlayAddressIcon: {
    width: 24,
    alignItems: 'center',
  },
  overlayAddressText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  overlayPill: {
    fontSize: 12,
    color: '#1d4ed8',
    fontWeight: '600',
  },
  overlayPillSelected: {
    fontSize: 12,
    color: '#15803d',
    fontWeight: '700',
  },
  overlayPillDisabled: {
    fontSize: 12,
    color: '#7f1d1d',
  },
  routeStep: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  routeOrder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeOrderText: {
    color: '#fff',
    fontWeight: '700',
  },
  routeContent: {
    flex: 1,
    gap: 4,
  },
  routeLabel: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '600',
  },
  routeCoords: {
    fontSize: 13,
    color: '#475569',
  },
  routeLegMetaRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  routeLegMeta: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '500',
  },
  routeLegMetaSub: {
    fontSize: 12,
    color: '#475569',
  },
});