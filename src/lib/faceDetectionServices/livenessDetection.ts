import { DetectedFace } from './faceDetection';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface LivenessSignals {
  textureScore: number;     // higher = more texture variance (real face)
  reflectionScore: number;  // lower = fewer screen glare spots (real face)
  motionScore: number;      // higher = more micro-motion (real face)
}

export interface LivenessResult {
  isLive: boolean;
  confidence: number;         // 0–1
  signals: LivenessSignals;
  spoofType: 'none' | 'photo' | 'screen' | 'unknown';
}

// ─────────────────────────────────────────────────────────
// Constants / Thresholds
// ─────────────────────────────────────────────────────────

const TEXTURE_SPOOF_THRESHOLD = 130;  // Laplacian variance – below this = spoof (screens usually lack high-freq texture)
const REFLECTION_SPOOF_THRESHOLD = 0.02; // fraction of over-exposed pixels (screens glare uniformly)
const MOTION_SPOOF_THRESHOLD = 3.0;  // mean abs luma diff per-pixel (screens are very still relative to background)
const MOTION_HISTORY_FRAMES = 6;
const CONFIDENCE_LIVE_FLOOR = 0.50; // min score to be considered live

// ─────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────

export class LivenessDetectionService {
  private prevFrameData: Uint8ClampedArray | null = null;
  private motionHistory: number[] = [];

  reset() {
    this.prevFrameData = null;
    this.motionHistory = [];
  }

  /**
   * Main entry point – call once per frame per face.
   */
  updateFrame(face: DetectedFace): LivenessResult {
    // ── Signal 1: Texture Variance (Laplacian) ────────────
    const textureScore = this.calculateTextureVariance(face.imageData);

    // ── Signal 2: Specular Reflection / Glare ─────────────
    const reflectionScore = this.calculateReflectionScore(face.imageData);

    // ── Signal 3: Temporal Motion ──────────────────────────
    const motionScore = this.calculateMotionScore(face.imageData);

    const signals: LivenessSignals = { textureScore, reflectionScore, motionScore };
    return this.computeResult(signals);
  }

  // ─────────────────────────────────────────────────────
  // Signal implementations
  // ─────────────────────────────────────────────────────


  /**
   * Laplacian variance approximation as sharpness measure.
   * Printed photos and screen captures have compressed, smoother textures.
   */
  private calculateTextureVariance(imageData: ImageData): number {
    const { data, width, height } = imageData;
    if (width < 4 || height < 4) return 100; // can't assess, assume OK

    // Convert to greyscale and apply 3×3 Laplacian kernel
    let sum = 0;
    let sumSq = 0;
    let count = 0;

    const grey = new Float32Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      grey[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        // 3×3 Laplacian: centre×4 – neighbours
        const lap =
          -grey[idx - width - 1] - grey[idx - width] - grey[idx - width + 1]
          - grey[idx - 1] + 8 * grey[idx] - grey[idx + 1]
          - grey[idx + width - 1] - grey[idx + width] - grey[idx + width + 1];
        sum += lap;
        sumSq += lap * lap;
        count++;
      }
    }

    if (count === 0) return 100;
    const mean = sum / count;
    const variance = sumSq / count - mean * mean;
    return Math.max(0, variance);
  }

  /**
   * Fraction of pixels that are very bright (≥240) in all channels.
   * Screens produce large bright patches; real skin does not.
   */
  private calculateReflectionScore(imageData: ImageData): number {
    const { data } = imageData;
    let brightCount = 0;
    const totalPixels = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i] >= 240 && data[i + 1] >= 240 && data[i + 2] >= 240) {
        brightCount++;
      }
    }

    return totalPixels > 0 ? brightCount / totalPixels : 0;
  }

  /**
   * Mean absolute pixel difference between current and previous frame.
   * A still photo gives near-zero variance across frames.
   */
  private calculateMotionScore(imageData: ImageData): number {
    const current = imageData.data;

    if (!this.prevFrameData || this.prevFrameData.length !== current.length) {
      this.prevFrameData = new Uint8ClampedArray(current);
      return 5; // first frame: assume some motion
    }

    let totalDiff = 0;
    const pixelCount = current.length / 4;
    for (let i = 0; i < current.length; i += 4) {
      // luma difference only
      const curL = 0.299 * current[i] + 0.587 * current[i + 1] + 0.114 * current[i + 2];
      const prevL = 0.299 * this.prevFrameData[i] + 0.587 * this.prevFrameData[i + 1] + 0.114 * this.prevFrameData[i + 2];
      totalDiff += Math.abs(curL - prevL);
    }

    this.prevFrameData = new Uint8ClampedArray(current);

    const meanDiff = pixelCount > 0 ? totalDiff / pixelCount : 0;
    this.motionHistory.push(meanDiff);
    if (this.motionHistory.length > MOTION_HISTORY_FRAMES) {
      this.motionHistory.shift();
    }

    // Return rolling average
    return this.motionHistory.reduce((a, b) => a + b, 0) / this.motionHistory.length;
  }

  // ─────────────────────────────────────────────────────
  // Composite scoring
  // ─────────────────────────────────────────────────────

  private computeResult(signals: LivenessSignals): LivenessResult {
    const { textureScore, reflectionScore, motionScore } = signals;

    const textureFlag = textureScore < TEXTURE_SPOOF_THRESHOLD;
    const reflectionFlag = reflectionScore > REFLECTION_SPOOF_THRESHOLD;
    const motionFlag = motionScore < MOTION_SPOOF_THRESHOLD;

    const spoofSignalCount = [textureFlag, reflectionFlag, motionFlag].filter(Boolean).length;

    // Spoof type heuristic
    let spoofType: LivenessResult['spoofType'] = 'none';
    if (reflectionFlag && motionFlag) spoofType = 'screen';
    else if (textureFlag && motionFlag && !reflectionFlag) spoofType = 'photo';
    else if (spoofSignalCount >= 2) spoofType = 'unknown';

    // Confidence: start at 0.5, penalise each spoof signal, boost with texture
    let confidence = 0.50;
    confidence -= spoofSignalCount * 0.25;
    const textureNorm = Math.min(1, textureScore / 300);
    confidence += textureNorm * 0.20;
    confidence = Math.max(0, Math.min(1, confidence));

    // Live = max 1 spoof signal AND confidence above floor
    const isLive = spoofSignalCount <= 1 && confidence >= CONFIDENCE_LIVE_FLOOR;

    if (!isLive && spoofType === 'none') spoofType = 'unknown';

    return { isLive, confidence, signals, spoofType };
  }

  // ─────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────

  private dist2d(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
  }
}

export const livenessDetectionService = new LivenessDetectionService();
