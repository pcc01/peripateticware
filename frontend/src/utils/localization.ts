// src/utils/localization.ts
export class Localization {
  static formatNumber(num: number): string {
    return new Intl.NumberFormat().format(num)
  }

  static formatCurrency(num: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(num)
  }

  static formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toLocaleDateString()
  }
}