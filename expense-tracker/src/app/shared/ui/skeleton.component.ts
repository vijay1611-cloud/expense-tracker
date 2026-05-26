import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="animate-pulse rounded-md bg-zinc-200"
      [style.height]="height()"
      [style.width]="width()"
    ></div>
  `,
})
export class SkeletonComponent {
  height = input<string>('1rem');
  width = input<string>('100%');
}
