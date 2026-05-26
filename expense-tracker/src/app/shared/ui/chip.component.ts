import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      [class]="classes()"
      (click)="toggle.emit()"
    >
      <ng-content />
    </button>
  `,
})
export class ChipComponent {
  active = input<boolean>(false);
  toggle = output<void>();

  readonly classes = computed(() => {
    const base =
      'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors focus-ring border';
    return this.active()
      ? `${base} bg-zinc-900 text-white border-zinc-900`
      : `${base} bg-white text-zinc-700 border-zinc-200 hover:bg-stone-50`;
  });
}
