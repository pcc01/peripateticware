// Unit tests for src/api/sessionEvents.ts — the mobile side of the GPS
// live-map feature. logLocationEvent() is what fires the location_update
// session_events row that the teacher's live map polls for.
//
// Run with:  npx jest --config jest.unit.config.js

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
}));

import { apiFetch } from '../client';
import { logLocationEvent, logSessionEvent } from '../sessionEvents';

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('logLocationEvent', () => {
  it('POSTs a location_update event with lat/lng/accuracy to the session events endpoint', async () => {
    mockedApiFetch.mockResolvedValueOnce(undefined as any);

    await logLocationEvent('session-123', 40.7308, -73.9973, 12.5);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    const [path, options] = mockedApiFetch.mock.calls[0];
    expect(path).toBe('/api/v1/sessions/session-123/events');
    expect(options?.method).toBe('POST');

    const body = JSON.parse(options!.body as string);
    expect(body).toEqual({
      event_type: 'location_update',
      metadata: { latitude: 40.7308, longitude: -73.9973, accuracy: 12.5 },
    });
  });

  it('defaults accuracy to null when not provided', async () => {
    mockedApiFetch.mockResolvedValueOnce(undefined as any);

    await logLocationEvent('session-123', 1, 2);

    const body = JSON.parse(mockedApiFetch.mock.calls[0][1]!.body as string);
    expect(body.metadata.accuracy).toBeNull();
  });

  it('is best-effort — never throws when the network call fails', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('network down'));

    await expect(logLocationEvent('session-123', 1, 2)).resolves.toBeUndefined();
  });
});

describe('logSessionEvent', () => {
  it('POSTs the given event type, phase, and metadata', async () => {
    mockedApiFetch.mockResolvedValueOnce(undefined as any);

    await logSessionEvent('session-123', 'phase_started', 'inquiry', { foo: 'bar' });

    const [path, options] = mockedApiFetch.mock.calls[0];
    expect(path).toBe('/api/v1/sessions/session-123/events');
    const body = JSON.parse(options!.body as string);
    expect(body).toEqual({ event_type: 'phase_started', phase: 'inquiry', metadata: { foo: 'bar' } });
  });

  it('is best-effort — never throws when the network call fails', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('network down'));

    await expect(logSessionEvent('session-123', 'capture_added')).resolves.toBeUndefined();
  });
});
