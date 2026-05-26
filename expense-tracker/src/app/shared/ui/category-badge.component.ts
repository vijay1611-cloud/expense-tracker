import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TransactionCategory } from '../../models/transaction.model';
import { CATEGORY_STYLES } from '../category';
import { CategoryIconComponent } from './category-icon.component';

@Component({
  selector: 'app-category-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CategoryIconComponent],
  template: `
    <span [class]="classes()">
      <app-category-icon [category]="category()" size="0.75rem" />
      <span>{{ category() }}</span>
    </span>
  `,
})
export class CategoryBadgeComponent {
  category = input.required<TransactionCategory>();

  readonly classes = computed(() => {
    const s = CATEGORY_STYLES[this.category()];
    return `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.iconBgClass} ${s.iconTextClass}`;
  });
}
