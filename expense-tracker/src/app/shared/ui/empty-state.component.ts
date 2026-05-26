import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center justify-center text-center py-12 px-6">
      <div
        class="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-zinc-400 mb-4"
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          class="h-6 w-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9 17H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2m-6 0v4l3-2 3 2v-4m-6 0h6"
          />
        </svg>
      </div>
      <h3 class="text-lg font-semibold text-zinc-900">{{ title() }}</h3>
      @if (description(); as desc) {
        <p class="text-sm text-zinc-500 mt-1 max-w-sm">{{ desc }}</p>
      }
      <div class="mt-4">
        <ng-content />
      </div>
    </div>
  `,
})
export class EmptyStateComponent {
  title = input.required<string>();
  description = input<string | null>(null);
}
