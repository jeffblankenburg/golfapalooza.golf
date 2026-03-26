"use client";

import { useState, useCallback } from "react";

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  error: string | null;
  loading: boolean;
  permissionState: "granted" | "denied" | "prompt" | null;
}

interface GeolocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    error: null,
    loading: false,
    permissionState: null,
  });

  const requestLocation = useCallback(async (): Promise<GeolocationResult | null> => {
    // Check if geolocation is supported
    if (!navigator.geolocation) {
      setState((s) => ({
        ...s,
        error: "Geolocation is not supported by your browser",
        loading: false,
      }));
      return null;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    return new Promise<GeolocationResult | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const result = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          setState({
            ...result,
            error: null,
            loading: false,
            permissionState: "granted",
          });
          resolve(result);
        },
        (error) => {
          let errorMessage: string;
          let permissionState: "denied" | "prompt" | null = null;

          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = "Location permission denied";
              permissionState = "denied";
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = "Location unavailable";
              break;
            case error.TIMEOUT:
              errorMessage = "Location request timed out";
              break;
            default:
              errorMessage = "An unknown error occurred";
          }

          setState((s) => ({
            ...s,
            error: errorMessage,
            loading: false,
            permissionState,
          }));
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000, // Cache for 1 minute
        }
      );
    });
  }, []);

  const checkPermission = useCallback(async (): Promise<PermissionState | null> => {
    if (!navigator.permissions) {
      return null;
    }

    try {
      const result = await navigator.permissions.query({ name: "geolocation" });
      setState((s) => ({
        ...s,
        permissionState: result.state as "granted" | "denied" | "prompt",
      }));
      return result.state;
    } catch {
      return null;
    }
  }, []);

  return {
    ...state,
    requestLocation,
    checkPermission,
  };
}
