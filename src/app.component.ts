
import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
  ViewChild,
  ElementRef,
  OnDestroy,
  effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { GeminiService, LandmarkHistory } from './services/gemini.service';

type ViewState = 'welcome' | 'capturing' | 'loading' | 'result' | 'error';

interface ResultData {
  image: string;
  name: string;
  history: string;
  sources: any[];
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnDestroy {
  private geminiService = inject(GeminiService);

  view = signal<ViewState>('welcome');
  loadingMessage = signal<string>('');
  errorMessage = signal<string>('');
  result = signal<ResultData | null>(null);
  
  @ViewChild('videoElement') videoElement?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement?: ElementRef<HTMLCanvasElement>;
  
  private stream: MediaStream | null = null;
  
  // Speech Synthesis state
  private speechSynthesis = window.speechSynthesis;
  private utterance = signal<SpeechSynthesisUtterance | null>(null);
  isPlaying = signal(false);

  constructor() {
    effect(() => {
      const currentResult = this.result();
      if (this.speechSynthesis.speaking) {
        this.speechSynthesis.cancel();
      }
      
      if (currentResult) {
        const newUtterance = new SpeechSynthesisUtterance(currentResult.history);
        newUtterance.onstart = () => this.isPlaying.set(true);
        newUtterance.onend = () => this.isPlaying.set(false);
        newUtterance.onpause = () => this.isPlaying.set(false);
        newUtterance.onresume = () => this.isPlaying.set(true);
        this.utterance.set(newUtterance);
      } else {
        this.utterance.set(null);
        this.isPlaying.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    this.stopCamera();
    if (this.speechSynthesis.speaking) {
      this.speechSynthesis.cancel();
    }
  }
  
  async startCapture(): Promise<void> {
    this.view.set('capturing');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (this.videoElement) {
        this.videoElement.nativeElement.srcObject = this.stream;
      }
    } catch (err) {
      console.error("Error accessing camera: ", err);
      this.errorMessage.set('Could not access the camera. Please check permissions and try again.');
      this.view.set('error');
    }
  }

  captureImage(): void {
    if (!this.videoElement || !this.canvasElement) return;
    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    const context = canvas.getContext('2d');
    if (!context) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageDataUrl = canvas.toDataURL('image/jpeg');
    this.stopCamera();
    this.processImage(imageDataUrl);
  }

  handleFileUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageDataUrl = e.target?.result as string;
        this.processImage(imageDataUrl);
      };
      reader.readAsDataURL(file);
    }
  }

  private async processImage(imageDataUrl: string): Promise<void> {
    this.view.set('loading');
    const base64Image = imageDataUrl.split(',')[1];
    
    try {
      this.loadingMessage.set('Identifying landmark...');
      const landmarkName = await this.geminiService.identifyLandmark(base64Image);
      if (!landmarkName) {
        throw new Error("Landmark could not be identified.");
      }

      this.loadingMessage.set(`Fetching history for ${landmarkName}...`);
      const landmarkHistory = await this.geminiService.fetchLandmarkHistory(landmarkName);

      this.loadingMessage.set('Preparing your tour...');
      this.result.set({
        image: imageDataUrl,
        name: landmarkName,
        history: landmarkHistory.history,
        sources: landmarkHistory.sources
      });
      this.view.set('result');
    } catch (error) {
      console.error(error);
      const err = error as Error;
      this.errorMessage.set(err.message || 'An unknown error occurred.');
      this.view.set('error');
    }
  }

  narrateHistory(): void {
    const utt = this.utterance();
    if (!utt) return;
  
    if (this.speechSynthesis.speaking && !this.speechSynthesis.paused) {
      this.speechSynthesis.pause();
    } else if (this.speechSynthesis.paused) {
      this.speechSynthesis.resume();
    } else {
      this.speechSynthesis.speak(utt);
    }
  }

  stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }
  
  reset(): void {
    this.stopCamera();
    if (this.speechSynthesis.speaking || this.speechSynthesis.paused) {
      this.speechSynthesis.cancel();
    }
    this.result.set(null);
    this.view.set('welcome');
  }
}
