import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="classes()">
      <ng-content />
    </div>
  `,
})
export class CardComponent {
  padded = input<boolean>(true);
  classes = () => {
    const pad = this.padded() ? 'p-6' : '';
    return `bg-white rounded-2xl shadow-card border border-zinc-100 ${pad}`.trim();
  };
}
