import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-spinner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-block animate-spin rounded-full border-2 border-current border-r-transparent"
      [style.height]="size()"
      [style.width]="size()"
      role="status"
      aria-label="Loading"
    ></span>
  `,
})
export class SpinnerComponent {
  size = input<string>('1rem');
}
