jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

import * as Location from 'expo-location';
import { getOneShotLocation } from '../oneShotLocation';

describe('getOneShotLocation', () => {
  it('returns ok with coordinates when permission is granted', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: { latitude: 37.8199, longitude: -122.4783 },
    });

    const result = await getOneShotLocation();
    expect(result).toEqual({ ok: true, latitude: 37.8199, longitude: -122.4783 });
  });

  it('returns permission_denied without calling getCurrentPositionAsync', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

    const result = await getOneShotLocation();
    expect(result).toEqual({ ok: false, reason: 'permission_denied' });
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('returns unavailable when the GPS read throws', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(new Error('timeout'));

    const result = await getOneShotLocation();
    expect(result).toEqual({ ok: false, reason: 'unavailable' });
  });
});
