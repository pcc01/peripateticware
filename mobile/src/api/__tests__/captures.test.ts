// Unit tests for src/api/captures.ts — specifically the GPS live-map wiring
// in uploadCapture(): after a successful upload, it should fire a
// location_update session event (best-effort, never blocking the upload)
// when the caller has a sessionId and GPS coordinates.
//
// Run with:  npx jest --config jest.unit.config.js

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
  getToken: jest.fn().mockResolvedValue('test-token'),
  API_BASE: 'http://test.local',
}));

jest.mock('../sessionEvents', () => ({
  logLocationEvent: jest.fn().mockResolvedValue(undefined),
}));

import { uploadCapture } from '../captures';
import { logLocationEvent } from '../sessionEvents';

const mockedLogLocationEvent = logLocationEvent as jest.MockedFunction<typeof logLocationEvent>;

function mockFetchOk(capture: Record<string, unknown>) {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => capture,
  });
}

const FILE = { uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg' };
const CAPTURE = { id: 'cap-1', capture_type: 'photo', created_at: '2026-07-16T00:00:00Z' };

describe('uploadCapture — GPS live-map wiring', () => {
  it('fires logLocationEvent after a successful upload when sessionId + coords are present', async () => {
    mockFetchOk(CAPTURE);

    const result = await uploadCapture({
      file: FILE,
      captureType: 'photo',
      sessionId: 'session-123',
      latitude: 40.7308,
      longitude: -73.9973,
    });

    expect(result).toEqual(CAPTURE);
    expect(mockedLogLocationEvent).toHaveBeenCalledTimes(1);
    expect(mockedLogLocationEvent).toHaveBeenCalledWith('session-123', 40.7308, -73.9973);
  });

  it('does not fire logLocationEvent when coordinates are missing', async () => {
    mockFetchOk(CAPTURE);

    await uploadCapture({
      file: FILE,
      captureType: 'photo',
      sessionId: 'session-123',
    });

    expect(mockedLogLocationEvent).not.toHaveBeenCalled();
  });

  it('does not fire logLocationEvent when there is no sessionId', async () => {
    mockFetchOk(CAPTURE);

    await uploadCapture({
      file: FILE,
      captureType: 'photo',
      latitude: 40.7308,
      longitude: -73.9973,
    });

    expect(mockedLogLocationEvent).not.toHaveBeenCalled();
  });

  it('is best-effort — a failing location event does not fail the upload', async () => {
    mockFetchOk(CAPTURE);
    mockedLogLocationEvent.mockRejectedValueOnce(new Error('network down'));

    await expect(
      uploadCapture({
        file: FILE,
        captureType: 'photo',
        sessionId: 'session-123',
        latitude: 40.7308,
        longitude: -73.9973,
      })
    ).resolves.toEqual(CAPTURE);
  });

  it('throws and does not fire a location event when the upload itself fails', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'server error' }),
    });

    await expect(
      uploadCapture({
        file: FILE,
        captureType: 'photo',
        sessionId: 'session-123',
        latitude: 40.7308,
        longitude: -73.9973,
      })
    ).rejects.toThrow('server error');

    expect(mockedLogLocationEvent).not.toHaveBeenCalled();
  });
});
