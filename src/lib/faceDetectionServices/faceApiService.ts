import * as faceapi from '@vladmandic/face-api';

const CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

class FaceApiService {
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    try {
      // Load the exact same 3 models used in your mobile app
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(CDN),
        faceapi.nets.faceLandmark68Net.loadFromUri(CDN),
        faceapi.nets.faceRecognitionNet.loadFromUri(CDN) // High-accuracy ResNet model
      ]);
      this.isInitialized = true;
      console.log('Face API initialized with Unified ResNet-34');
    } catch (error) {
      console.error('Unified Engine initialization failed', error);
      throw error;
    }
  }

  // Used for single face Verification/Enrollment Modal
  async getEmbedding(videoElement: HTMLVideoElement): Promise<number[] | null> {
    if (!this.isInitialized) await this.initialize();

    const result = await faceapi.detectSingleFace(
      videoElement, 
      new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
    )
    .withFaceLandmarks()
    .withFaceDescriptor();

    if (!result) return null;
    return Array.from(result.descriptor);
  }

  // NEW: Used for the multi-face Kiosk/Attendance page
  async detectAllFacesWithEmbeddings(videoElement: HTMLVideoElement) {
    if (!this.isInitialized) await this.initialize();
    
    // Detect multiple faces simultaneously
    const results = await faceapi.detectAllFaces(
      videoElement,
      new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
    ).withFaceLandmarks().withFaceDescriptors();

    // Map to your existing UI's bounding box structure
    return results.map(res => ({
      face: {
        boundingBox: {
          originX: res.detection.box.x,
          originY: res.detection.box.y,
          width: res.detection.box.width,
          height: res.detection.box.height,
        }
      },
      embedding: Array.from(res.descriptor)
    }));
  }
}

export const faceApiService = new FaceApiService();