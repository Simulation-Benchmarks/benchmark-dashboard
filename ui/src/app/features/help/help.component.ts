import { DOCUMENT, NgStyle } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

interface TourStep {
  selector: string;
  fallbackSelector?: string;
  title: string;
  description: string;
}

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [ButtonModule, DialogModule, NgStyle],
  templateUrl: './help.component.html',
  styleUrl: './help.component.css',
})
export class HelpComponent implements OnDestroy {
  private readonly tourAnimationMs = 180;
  private readonly document = inject(DOCUMENT);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private highlightedElement?: HTMLElement;
  private positionTimer?: number;
  private closeTimer?: number;
  private readonly tourSteps: TourStep[] = [
    {
      selector: '.benchmark-grid',
      title: 'Choose a benchmark',
      description:
        'Start in the benchmark table. Selecting a row filters the published runs below to that benchmark family.',
    },
    {
      selector: '.metadata-button',
      fallbackSelector: '.benchmark-grid',
      title: 'Inspect benchmark metadata',
      description:
        'Use the metadata button to load the benchmark definition on demand and inspect its parameters and metrics.',
    },
    {
      selector: '.runs-grid',
      title: 'Review published runs',
      description:
        'The lower table groups published runs by software. The group name links to the software URL; expand it to inspect versions, publication dates, RoHub links, and named graphs.',
    },
    {
      selector: '.compare-trigger',
      title: 'Compare compatible runs',
      description:
        'Select at least two runs from the same benchmark, then use Compare to open shared tables and plots.',
    },
    {
      selector: '.log-launcher',
      title: 'Trace backend SPARQL queries',
      description:
        'Open Logs to inspect live SPARQL queries, copy them, and run them directly on the RoHub endpoint.',
    },
  ];
  @ViewChild('tourCard') tourCard?: ElementRef<HTMLDivElement>;
  visible = false;
  tourVisible = false;
  tourClosing = false;
  tourStepIndex = 0;
  tourCardStyle: Record<string, string> = {
    top: '16px',
    left: '16px',
  };

  open(): void {
    this.visible = true;
  }

  startTour(): void {
    this.visible = false;
    window.clearTimeout(this.closeTimer);
    this.tourVisible = true;
    this.tourClosing = false;
    this.tourStepIndex = 0;
    this.syncTourStep();
  }

  closeTour(): void {
    if (!this.tourVisible || this.tourClosing) return;
    this.tourClosing = true;
    window.clearTimeout(this.positionTimer);
    this.positionTimer = undefined;
    this.closeTimer = window.setTimeout(() => {
      this.tourVisible = false;
      this.tourClosing = false;
      this.clearHighlight();
      this.changeDetector.detectChanges();
    }, this.tourAnimationMs);
    this.changeDetector.detectChanges();
  }

  nextTourStep(): void {
    if (this.tourStepIndex >= this.tourSteps.length - 1) {
      this.closeTour();
      return;
    }
    this.tourStepIndex += 1;
    this.syncTourStep();
  }

  previousTourStep(): void {
    if (this.tourStepIndex === 0) return;
    this.tourStepIndex -= 1;
    this.syncTourStep();
  }

  get currentTourStep(): TourStep {
    return this.tourSteps[this.tourStepIndex];
  }

  get hasPreviousStep(): boolean {
    return this.tourStepIndex > 0;
  }

  get lastTourStep(): boolean {
    return this.tourStepIndex === this.tourSteps.length - 1;
  }

  get tourStepCount(): number {
    return this.tourSteps.length;
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  onViewportChange(): void {
    if (this.tourVisible) this.positionTourCard();
  }

  private syncTourStep(): void {
    window.clearTimeout(this.positionTimer);
    this.positionTimer = window.setTimeout(() => {
      const element = this.resolveStepElement();
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
      this.changeDetector.detectChanges();
      this.positionTimer = window.setTimeout(() => this.positionTourCard(), 220);
    }, 0);
  }

  private positionTourCard(): void {
    const element = this.resolveStepElement();
    const card = this.tourCard?.nativeElement;
    if (!card) return;

    this.clearHighlight();
    if (element) {
      this.highlightedElement = element;
      this.highlightedElement.classList.add('tour-target');
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const cardWidth = Math.min(360, viewportWidth - 32);
    const cardHeight = card.offsetHeight || 240;

    if (!element) {
      this.tourCardStyle = {
        top: `${Math.max(16, (viewportHeight - cardHeight) / 2)}px`,
        left: `${Math.max(16, (viewportWidth - cardWidth) / 2)}px`,
        width: `${cardWidth}px`,
      };
      this.changeDetector.detectChanges();
      return;
    }

    const rect = element.getBoundingClientRect();
    const placeBelow = rect.top < cardHeight + 48;
    const top = placeBelow ? rect.bottom + 16 : rect.top - cardHeight - 16;
    const left = rect.left + rect.width / 2 - cardWidth / 2;

    this.tourCardStyle = {
      top: `${Math.max(16, Math.min(top, viewportHeight - cardHeight - 16))}px`,
      left: `${Math.max(16, Math.min(left, viewportWidth - cardWidth - 16))}px`,
      width: `${cardWidth}px`,
    };
    this.changeDetector.detectChanges();
  }

  private resolveStepElement(): HTMLElement | undefined {
    return (
      this.document.querySelector<HTMLElement>(this.currentTourStep.selector) ||
      (this.currentTourStep.fallbackSelector
        ? this.document.querySelector<HTMLElement>(this.currentTourStep.fallbackSelector)
        : undefined) ||
      undefined
    );
  }

  private clearHighlight(): void {
    this.highlightedElement?.classList.remove('tour-target');
    this.highlightedElement = undefined;
  }

  ngOnDestroy(): void {
    this.tourVisible = false;
    this.tourClosing = false;
    window.clearTimeout(this.closeTimer);
    window.clearTimeout(this.positionTimer);
    this.clearHighlight();
  }
}
