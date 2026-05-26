import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || loading()"
      [class]="classes()"
    >
      @if (loading()) {
        <span
          class="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden="true"
        ></span>
      }
      <ng-content />
    </button>
  `,
})
export class ButtonComponent {
  variant = input<ButtonVariant>('primary');
  size = input<ButtonSize>('md');
  type = input<'button' | 'submit'>('button');
  disabled = input<boolean>(false);
  loading = input<boolean>(false);
  fullWidth = input<boolean>(false);

  readonly classes = computed(() => {
    const base =
      'inline-flex items-center justify-center font-medium rounded-xl transition-colors focus-ring disabled:opacity-50 disabled:cursor-not-allowed';

    const sizes: Record<ButtonSize, string> = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-5 py-2.5 text-base',
    };

    const variants: Record<ButtonVariant, string> = {
      primary: 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-card',
      secondary: 'bg-white text-zinc-900 border border-zinc-200 hover:bg-stone-50 shadow-card',
      ghost: 'bg-transparent text-zinc-700 hover:bg-zinc-100',
      danger: 'bg-red-600 text-white hover:bg-red-700 shadow-card',
    };

    return [
      base,
      sizes[this.size()],
      variants[this.variant()],
      this.fullWidth() ? 'w-full' : '',
    ]
      .filter(Boolean)
      .join(' ');
  });
}
