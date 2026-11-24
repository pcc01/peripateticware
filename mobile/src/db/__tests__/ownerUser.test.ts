jest.mock('@/src/api/client', () => ({
  getStoredUser: jest.fn(),
}));

import { getStoredUser } from '@/src/api/client';
import { getCurrentUserId } from '../ownerUser';

describe('getCurrentUserId', () => {
  it('returns the cached user id', async () => {
    (getStoredUser as jest.Mock).mockResolvedValueOnce({ id: 'user-a' });
    expect(await getCurrentUserId()).toBe('user-a');
  });

  it('returns an empty string when no user is cached, never null/undefined', async () => {
    (getStoredUser as jest.Mock).mockResolvedValueOnce(null);
    expect(await getCurrentUserId()).toBe('');
  });
});
