# Addris Mobile App

Expo-based React Native application that lets drivers capture delivery documents, upload them to the Addris backend, and monitor address extraction status.

## Features

- Capture or import delivery images and upload them to the FastAPI backend
- Launch the optimized route in Google Maps for navigation
- Pull-to-refresh to ensure mobile state matches the backend
- Reverse geocodes the driver’s current location to show a nearby address

## Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo` optional)
- iOS Simulator (Xcode) or Android Emulator / Expo Go

## Setup

```bash
cd mobile
npm install
```

Optionally configure the backend API endpoint by setting an Expo public env value:

```bash
export EXPO_PUBLIC_API_URL="http://127.0.0.1:8000"
```

## Run the app

```bash
npx expo start
```

Use the on-screen options to open in Expo Go, an iOS simulator, or an Android emulator.

The app requests camera, media library, and location permissions on first launch. Once an image is captured or selected, tap **Upload image** to send it to the backend and watch the job status update in real time. Use the **Open in Maps** button (when available) to hand off navigation to Google Maps.

### Environment variables

Expo reads `EXPO_PUBLIC_*` variables at build time. During development you can set `EXPO_PUBLIC_API_URL` via your shell or an `.env`/`app.config.js` file (see [Expo environment docs](https://docs.expo.dev/guides/environment-variables/)) so the mobile client points at the correct backend instance.
