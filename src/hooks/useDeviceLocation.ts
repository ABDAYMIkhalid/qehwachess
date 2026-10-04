import { useState } from 'react';

export interface DeviceCoordinates {
  latitude: number;
  longitude: number;
}

type LocationError = 'unavailable' | 'denied' | 'timeout' | 'unknown';

export function useDeviceLocation() {
  const [coordinates, setCoordinates] = useState<DeviceCoordinates | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<LocationError | null>(null);

  function requestLocation() {
    if (!navigator.geolocation) {
      setError('unavailable');
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLoading(false);
      },
      (locationError) => {
        setError(
          locationError.code === locationError.PERMISSION_DENIED
            ? 'denied'
            : locationError.code === locationError.POSITION_UNAVAILABLE
              ? 'unavailable'
              : locationError.code === locationError.TIMEOUT
                ? 'timeout'
                : 'unknown',
        );
        setLoading(false);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  }

  return { coordinates, loading, error, requestLocation };
}

export function distanceInKm(from: DeviceCoordinates, to: DeviceCoordinates) {
  const radians = Math.PI / 180;
  const latitudeDelta = (to.latitude - from.latitude) * radians;
  const longitudeDelta = (to.longitude - from.longitude) * radians;
  const rawArc =
    Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(from.latitude * radians)
    * Math.cos(to.latitude * radians)
    * Math.sin(longitudeDelta / 2) ** 2;
  const arc = Math.min(1, Math.max(0, rawArc));
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}
