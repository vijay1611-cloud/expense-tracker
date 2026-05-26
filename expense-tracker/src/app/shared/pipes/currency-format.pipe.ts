import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'currencyFormat',
  standalone: true,
})
export class CurrencyFormatPipe implements PipeTransform {
  transform(
    value: number | null | undefined,
    currency: string = 'USD',
    locale: string = 'en-US',
  ): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(Number(value));
    } catch {
      return `${currency} ${Number(value).toFixed(2)}`;
    }
  }
}
