// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import axios, { AxiosInstance } from 'axios';
import { LoginRequest, LoginResponse, SignUpRequest, SignUpResponse, User } from '../../types/auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

class AuthService {
  private client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({ baseURL });
  }

  async login(credentials: LoginRequest): Promise<LoginResponse> {
    // TODO: Uncomment when backend ready
    // const response = await this.client.post('/auth/login', credentials);
    // return response.data;

    // STUB: Fake login for demo
    return this.stubLogin(credentials);
  }

  async signup(data: SignUpRequest): Promise<SignUpResponse> {
    // TODO: Uncomment when backend ready
    // const response = await this.client.post('/auth/signup', data);
    // return response.data;

    // STUB: Fake signup for demo
    return this.stubSignup(data);
  }

  async logout(): Promise<void> {
    // TODO: Uncomment when backend ready
    // await this.client.post('/auth/logout');
    localStorage.removeItem('auth_token');
  }

  async refreshToken(token: string): Promise<string> {
    // TODO: Uncomment when backend ready
    // const response = await this.client.post('/auth/refresh', { token });
    // return response.data.token;
    return token;
  }

  async verify(): Promise<User> {
    // TODO: Uncomment when backend ready
    // const response = await this.client.get('/auth/me');
    // return response.data;
    throw new Error('Not authenticated');
  }

  // STUB METHODS FOR DEMO
  private stubLogin(credentials: LoginRequest): LoginResponse {
    // Simulate different users for demo
    let user: User;
    if (credentials.email === 'teacher@example.com') {
      user = {
        id: 'teacher-1',
        email: 'teacher@example.com',
        name: 'Jane Smith',
        role: 'teacher',
        school_id: 'school-1',
        created_at: new Date().toISOString(),
      };
    } else if (credentials.email === 'student@example.com') {
      user = {
        id: 'student-1',
        email: 'student@example.com',
        name: 'Alex Johnson',
        role: 'student',
        school_id: 'school-1',
        created_at: new Date().toISOString(),
      };
    } else if (credentials.email === 'parent@example.com') {
      user = {
        id: 'parent-1',
        email: 'parent@example.com',
        name: 'Margaret Brown',
        role: 'parent',
        school_id: 'school-1',
        created_at: new Date().toISOString(),
      };
    } else {
      // Generic user for any other email
      user = {
        id: `user-${Date.now()}`,
        email: credentials.email,
        name: credentials.email.split('@')[0],
        role: 'student',
        school_id: 'school-1',
        created_at: new Date().toISOString(),
      };
    }

    return {
      token: `fake-jwt-token-${Date.now()}`,
      user,
    };
  }

  private stubSignup(data: SignUpRequest): SignUpResponse {
    const user: User = {
      id: `user-${Date.now()}`,
      email: data.email,
      name: data.name,
      role: data.role,
      school_id: data.school_id,
      created_at: new Date().toISOString(),
    };

    return {
      token: `fake-jwt-token-${Date.now()}`,
      user,
    };
  }
}

export const authService = new AuthService(API_BASE_URL);

