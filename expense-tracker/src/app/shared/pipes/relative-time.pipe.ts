import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'relativeTime', standalone: true })
export class RelativeTimePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    if (!value) return '—';
    const date = typeof value === 'string' ? new Date(value) : value;
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 0) return 'just now';

    const sec = Math.floor(diffMs / 1000);
    if (sec < 45) return 'just now';

    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min ago`;

    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;

    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    });
  }
}
