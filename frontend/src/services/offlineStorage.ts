// src/services/offlineStorage.ts
export const offlineStorage = {
  async save(key: string, data: any) {
    localStorage.setItem(key, JSON.stringify(data))
    return { success: true }
  },

  async get(key: string) {
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : null
  },

  async delete(key: string) {
    localStorage.removeItem(key)
    return { success: true }
  }
}