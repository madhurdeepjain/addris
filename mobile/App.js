import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Alert,
  Button,
  Image,
  Linking,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';

const queryClient = new QueryClient();

function useJobStatus(jobId) {
  return useQuery({
    queryKey: ['job-status', jobId],
    enabled: Boolean(jobId),
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/v1/jobs/${jobId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch job ${jobId}`);
      }
      return response.json();
    },
    refetchInterval: (query) => {
      const status = query?.state?.data?.status;
      if (!status || status === 'processing' || status === 'pending') {
        return 2000;
      }
      return false;
    },
  });
}

function useJobHistory(enabled = true) {
  return useQuery({
    queryKey: ['job-history'],
    enabled,
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/v1/jobs`);
      if (!response.ok) {
        throw new Error('Failed to fetch job history');
      }
      return response.json();
    },
    refetchInterval: enabled ? 30000 : false,
  });
}

function UploadScreen() {
  const [image, setImage] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [location, setLocation] = useState(null);

  const jobStatus = useJobStatus(jobId);
  const history = useJobHistory(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    (async () => {
      const camera = await ImagePicker.requestCameraPermissionsAsync();
      if (camera.status !== 'granted') {
        Alert.alert('Permission required', 'Camera access is needed to capture delivery images.');
      }

      const library = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (library.status !== 'granted') {
        Alert.alert('Permission required', 'Photo library access is needed to select images.');
      }

      const locationPermission = await Location.requestForegroundPermissionsAsync();
      if (locationPermission.status === 'granted') {
        const current = await Location.getCurrentPositionAsync({});
        setLocation({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        });
      }
    })();
  }, []);

  useEffect(() => {
    const status = jobStatus.data?.status;
    if (status && status !== 'processing' && status !== 'pending') {
      queryClient.invalidateQueries({ queryKey: ['job-history'] }).catch(() => {});
    }
  }, [jobStatus.data?.status, queryClient]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      setImage(result.assets[0]);
      setJobId(null);
    }
  };

  const captureImage = async () => {
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      setImage(result.assets[0]);
      setJobId(null);
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!image) {
        throw new Error('Please select an image first.');
      }

      const formData = new FormData();
      const fileUri = image.uri;
      const filename = fileUri.split('/').pop() ?? 'upload.jpg';
      const extensionMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
      const extension = extensionMatch ? extensionMatch[1].toLowerCase() : null;
      const inferredType = image.mimeType
        ?? (extension === 'png'
            ? 'image/png'
            : extension === 'heic' || extension === 'heif'
              ? 'image/heic'
              : 'image/jpeg');

      formData.append('image', {
        uri: fileUri,
        name: filename,
        type: inferredType,
      });

      if (location) {
        formData.append('latitude', String(location.latitude));
        formData.append('longitude', String(location.longitude));
      }

      const response = await fetch(`${API_BASE_URL}/v1/jobs`, {
        method: 'POST',
        body: formData,
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.status !== 202) {
        let message = `Upload failed with status ${response.status}`;
        const errorText = await response.text();
        if (errorText) {
          try {
            const errorPayload = JSON.parse(errorText);
            if (errorPayload?.detail) {
              message = Array.isArray(errorPayload.detail)
                ? errorPayload.detail.map((item) => item.msg ?? String(item)).join('\n')
                : String(errorPayload.detail);
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
      setJobId(data.job_id);
      queryClient.invalidateQueries({ queryKey: ['job-history'] }).catch(() => {});
    },
    onError: (error) => {
      Alert.alert('Upload failed', error.message);
    },
  });

  const routeLegs = useMemo(() => jobStatus.data?.route ?? [], [jobStatus.data]);
  const addresses = useMemo(() => jobStatus.data?.addresses ?? [], [jobStatus.data]);
  const jobErrors = useMemo(() => jobStatus.data?.errors ?? [], [jobStatus.data]);

  const handleOpenRoute = useCallback(() => {
    if (!routeLegs.length) {
      return;
    }

    if (routeLegs.length === 1) {
      const target = routeLegs[0];
      const query = `${target.latitude},${target.longitude}`;
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
      Linking.openURL(url).catch(() => {
        Alert.alert('Navigation unavailable', 'Unable to open the maps application.');
      });
      return;
    }

    const origin = routeLegs[0];
    const destination = routeLegs[routeLegs.length - 1];
    const waypoints = routeLegs.slice(1, -1)
      .map((leg) => `${leg.latitude},${leg.longitude}`)
      .join('|');

    const queryParts = [
      'api=1',
      `origin=${encodeURIComponent(`${origin.latitude},${origin.longitude}`)}`,
      `destination=${encodeURIComponent(`${destination.latitude},${destination.longitude}`)}`,
    ];
    if (waypoints) {
      queryParts.push(`waypoints=${encodeURIComponent(waypoints)}`);
    }

    const url = `https://www.google.com/maps/dir/?${queryParts.join('&')}`;

    Linking.openURL(url).catch(() => {
      Alert.alert('Navigation unavailable', 'Unable to open the maps application.');
    });
  }, [routeLegs]);

  const onRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['job-history'] }).catch(() => {});
    if (jobId) {
      queryClient.invalidateQueries({ queryKey: ['job-status', jobId] }).catch(() => {});
    }
  }, [jobId, queryClient]);

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
    return candidate.raw_text;
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={history.isFetching} onRefresh={onRefresh} />
        }
      >
        <Text style={styles.title}>Addris Delivery Assistant</Text>

        <View style={styles.buttonRow}>
          <Button title="Pick image" onPress={pickImage} />
          <Button title="Capture" onPress={captureImage} />
        </View>

        {image && (
          <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="cover" />
        )}

        <Button
          title={uploadMutation.isLoading ? 'Uploading…' : 'Upload image'}
          onPress={() => uploadMutation.mutate()}
          disabled={uploadMutation.isLoading || !image}
        />

        {uploadMutation.isLoading && <ActivityIndicator style={styles.loader} />}

        {jobId && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job Status</Text>
            {jobStatus.isLoading && <Text>Fetching job details…</Text>}
            {jobStatus.error && <Text style={styles.errorText}>{jobStatus.error.message}</Text>}
            {jobStatus.data && (
              <View>
                <Text style={styles.statusText}>Status: {jobStatus.data.status}</Text>
                <Text>Addresses detected:</Text>
                {addresses.length === 0 && <Text>No addresses extracted yet.</Text>}
                {addresses.map((address, index) => (
                  <View key={`${address.raw_text}-${index}`} style={styles.addressCard}>
                    <Text style={styles.addressText}>{displayLabel(address)}</Text>
                    <Text style={styles.metaText}>Confidence: {(address.confidence * 100).toFixed(1)}%</Text>
                    <Text style={styles.metaText}>Status: {address.status}</Text>
                    {address.status === 'failed' && address.message && (
                      <Text style={styles.errorText}>{address.message}</Text>
                    )}
                  </View>
                ))}

                {routeLegs.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Optimized Route</Text>
                    {routeLegs.map((leg) => (
                      <Text key={leg.order} style={styles.routeText}>
                        {leg.order + 1}. {leg.label}
                      </Text>
                    ))}
                    <Button title="Open in Maps" onPress={handleOpenRoute} />
                  </View>
                )}

                {jobErrors.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Errors</Text>
                    {jobErrors.map((error) => (
                      <Text key={error} style={styles.errorText}>
                        {error}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Jobs</Text>
          {history.isLoading && <ActivityIndicator />}
          {history.error && (
            <Text style={styles.errorText}>
              {history.error.message ?? 'Unable to load history'}
            </Text>
          )}
          {history.data?.jobs?.length === 0 && <Text>No jobs created yet.</Text>}
              {history.data?.jobs?.slice(0, 10).map((job) => (
            <View key={job.job_id} style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle}>{job.job_id}</Text>
                <Text style={styles.metaText}>{job.status}</Text>
              </View>
              <Text style={styles.metaText}>
                Created: {new Date(job.created_at).toLocaleString()}
              </Text>
              {job.addresses.length > 0 && (
                <Text style={styles.metaText} numberOfLines={1}>
                  First address: {displayLabel(job.addresses[0])}
                </Text>
              )}
                  <Button
                    title="View"
                    onPress={() => {
                      setJobId(job.job_id);
                      queryClient
                        .invalidateQueries({ queryKey: ['job-status', job.job_id] })
                        .catch(() => {});
                    }}
                  />
            </View>
          ))}
        </View>

        <StatusBar style="dark" />
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <UploadScreen />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f7f7f7',
  },
  container: {
    flexGrow: 1,
    padding: 16,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  preview: {
    width: '100%',
    height: 240,
    borderRadius: 12,
  },
  loader: {
    marginTop: 12,
  },
  section: {
    paddingVertical: 8,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '500',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '500',
  },
  addressCard: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
    gap: 4,
  },
  addressText: {
    fontSize: 15,
    fontWeight: '500',
  },
  metaText: {
    fontSize: 13,
    color: '#555',
  },
  errorText: {
    color: '#b00020',
    fontSize: 14,
  },
  routeText: {
    fontSize: 16,
  },
  historyCard: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    marginRight: 8,
  },
});
