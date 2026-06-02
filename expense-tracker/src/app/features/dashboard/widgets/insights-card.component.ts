import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { InsightsService } from '../../../services/insights.service';
import { CardComponent } from '../../../shared/ui/card.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton.component';
import { ButtonComponent } from '../../../shared/ui/button.component';

@Component({
  selector: 'app-insights-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardComponent, SkeletonComponent, ButtonComponent],
  template: `
    <app-card>
      <div class="flex items-start justify-between gap-3 mb-3">
        <div class="flex items-center gap-2">
          <span
            class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-white"
            aria-hidden="true"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </span>
          <h2 class="text-sm font-semibold text-zinc-900">Monthly insight</h2>
        </div>
        @if (!insights.loading() && insights.insight()) {
          <app-button variant="ghost" size="sm" (click)="refresh()">Refresh</app-button>
        }
      </div>

      @if (insights.loading()) {
        <div class="space-y-2">
          <app-skeleton height="0.875rem" />
          <app-skeleton height="0.875rem" />
          <app-skeleton height="0.875rem" width="60%" />
        </div>
      } @else if (insights.error()) {
        <p class="text-sm text-zinc-500">
          Couldn't generate an insight right now ({{ insights.error() }}).
        </p>
      } @else if (insights.insight()) {
        <p class="text-sm text-zinc-700 leading-relaxed">{{ insights.insight()!.insight }}</p>
      } @else {
        <p class="text-sm text-zinc-500">Upload a recent statement to see your first insight.</p>
      }
    </app-card>
  `,
})
export class InsightsCardComponent implements OnInit {
  readonly insights = inject(InsightsService);

  async ngOnInit(): Promise<void> {
    await this.insights.load();
  }

  async refresh(): Promise<void> {
    await this.insights.load();
  }
}
