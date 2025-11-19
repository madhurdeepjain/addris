import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export function ImagePreviewStrip({ images, activeImageId, onSelectImage, onAddImage }) {
  return (
    <ScrollView
      horizontal
      style={styles.previewStrip}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.previewContent}
    >
      {images.map((image) => (
        <Pressable
          key={image.id}
          onPress={() => onSelectImage(image.id)}
          style={({ pressed }) => [
            styles.previewWrapper,
            activeImageId === image.id && styles.previewWrapperActive,
            pressed && styles.previewWrapperPressed,
          ]}
        >
          <Image source={{ uri: image.uri }} style={styles.previewImage} />
        </Pressable>
      ))}
      <Pressable
        onPress={onAddImage}
        style={({ pressed }) => [styles.addCard, pressed && styles.addCardPressed]}
      >
        <MaterialCommunityIcons name="image-plus" size={32} color="#1d4ed8" />
        <Text style={styles.addLabel}>Add image</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
});
