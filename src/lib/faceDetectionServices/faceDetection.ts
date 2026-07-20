import { FaceLandmarker, FilesetResolver, FaceLandmarkerResult } from '@mediapipe/tasks-vision';

export interface DetectedFace {
  landmarks: { x: number; y: number; z: number }[];
  boundingBox: {
    originX: number;
    originY: number;
    width: number;
    height: number;
  };
  confidence: number;
  imageData: ImageData;
}

export interface QualityMetrics {
  lighting: number;
  pose: number;
  occlusion: number;
  overall: number;
}

class FaceDetectionService {
  private faceLandmarker: FaceLandmarker | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
      );

      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 10,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize FaceLandmarker:', error);
      throw error;
    }
  }

  async detectFaces(
    videoElement: HTMLVideoElement,
    timestamp: number
  ): Promise<DetectedFace[]> {
    if (!this.faceLandmarker || !this.isInitialized) {
      throw new Error('FaceLandmarker not initialized');
    }

    const results: FaceLandmarkerResult = this.faceLandmarker.detectForVideo(
      videoElement,
      timestamp
    );

    if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
      return [];
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    ctx.drawImage(videoElement, 0, 0);

    const detectedFaces: DetectedFace[] = [];

    for (let i = 0; i < results.faceLandmarks.length; i++) {
      const landmarks = results.faceLandmarks[i];
      const boundingBox = this.calculateBoundingBox(landmarks, canvas.width, canvas.height);

      const faceCanvas = document.createElement('canvas');
      faceCanvas.width = boundingBox.width;
      faceCanvas.height = boundingBox.height;
      const faceCtx = faceCanvas.getContext('2d');
      if (!faceCtx) continue;

      faceCtx.drawImage(
        canvas,
        boundingBox.originX,
        boundingBox.originY,
        boundingBox.width,
        boundingBox.height,
        0,
        0,
        boundingBox.width,
        boundingBox.height
      );

      const imageData = faceCtx.getImageData(0, 0, faceCanvas.width, faceCanvas.height);

      detectedFaces.push({
        landmarks: landmarks.map(l => ({ x: l.x, y: l.y, z: l.z || 0 })),
        boundingBox,
        confidence: 0.9,
        imageData,
      });
    }

    return detectedFaces;
  }

  private calculateBoundingBox(
    landmarks: { x: number; y: number }[],
    width: number,
    height: number
  ) {
    let minX = 1, minY = 1, maxX = 0, maxY = 0;

    landmarks.forEach(landmark => {
      minX = Math.min(minX, landmark.x);
      minY = Math.min(minY, landmark.y);
      maxX = Math.max(maxX, landmark.x);
      maxY = Math.max(maxY, landmark.y);
    });

    const padding = 0.2;
    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;

    const originX = Math.max(0, (minX - boxWidth * padding) * width);
    const originY = Math.max(0, (minY - boxHeight * padding) * height);
    const finalWidth = Math.min(width - originX, (boxWidth * (1 + 2 * padding)) * width);
    const finalHeight = Math.min(height - originY, (boxHeight * (1 + 2 * padding)) * height);

    return {
      originX: Math.round(originX),
      originY: Math.round(originY),
      width: Math.round(finalWidth),
      height: Math.round(finalHeight),
    };
  }

  assessQuality(face: DetectedFace): QualityMetrics {
    const lighting = this.assessLighting(face.imageData);
    const pose = this.assessPose(face.landmarks);
    const occlusion = this.assessOcclusion(face.landmarks);

    const overall = (lighting + pose + occlusion) / 3;

    return { lighting, pose, occlusion, overall };
  }

  private assessLighting(imageData: ImageData): number {
    const pixels = imageData.data;
    let totalBrightness = 0;
    let count = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      const brightness = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      totalBrightness += brightness;
      count++;
    }

    const avgBrightness = totalBrightness / count;

    const ideal = 128;
    const diff = Math.abs(avgBrightness - ideal);
    return Math.max(0, 1 - diff / ideal);
  }

  private assessPose(landmarks: { x: number; y: number; z: number }[]): number {
    if (landmarks.length < 468) return 0.5;

    const noseTip = landmarks[1];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];

    const eyeCenterX = (leftEye.x + rightEye.x) / 2;
    const horizontalDeviation = Math.abs(noseTip.x - eyeCenterX);

    const verticalDeviation = Math.abs(noseTip.y - leftEye.y);

    const totalDeviation = horizontalDeviation + verticalDeviation;
    return Math.max(0, 1 - totalDeviation * 5);
  }

  private assessOcclusion(landmarks: { x: number; y: number; z: number }[]): number {
    return 0.9;
  }

  dispose(): void {
    if (this.faceLandmarker) {
      this.faceLandmarker.close();
      this.faceLandmarker = null;
    }
    this.isInitialized = false;
  }
}

export const faceDetectionService = new FaceDetectionService();
