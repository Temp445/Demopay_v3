import * as ort from 'onnxruntime-web';
import { DetectedFace } from './faceDetection';

export class FaceEmbeddingService {
  private session: ort.InferenceSession | null = null;
  private isInitialized = false;
  
  // NOTE: You must host a face recognition model (like mobilefacenet.onnx) 
  // in your public/models directory.
  private readonly MODEL_URL = '/model/mobilefacenet.onnx'; 
  private readonly INPUT_SIZE = 112;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Set paths for ONNX WASM binaries explicitly
      ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

      this.session = await ort.InferenceSession.create(this.MODEL_URL, {
        executionProviders: ['wasm']
      });

      this.isInitialized = true;
      console.log('Face embedding service initialized using ONNX.');
    } catch (error) {
      console.error('Failed to initialize embedding service. Make sure the .onnx model is in your public folder.', error);
      throw error;
    }
  }

  async generateEmbedding(face: DetectedFace): Promise<number[]> {
    if (!this.isInitialized || !this.session) {
      await this.initialize();
    }

    if (!this.session) {
      throw new Error('ONNX model failed to load.');
    }

    // 1. Preprocess the ImageData into a standardized Tensor
    const tensor = this.preprocessImage(face.imageData);

    // 2. Feed the Tensor into the ONNX session
    const feeds: Record<string, ort.Tensor> = {};
    const inputName = this.session.inputNames[0];
    feeds[inputName] = tensor;

    // 3. Execute inference
    const results = await this.session.run(feeds);
    const outputName = this.session.outputNames[0];
    const outputTensor = results[outputName];

    // 4. Extract array and normalize to match cosine similarity expectations
    const embedding = Array.from(outputTensor.data as Float32Array);
    return this.normalizeEmbedding(embedding);
  }

  private preprocessImage(imageData: ImageData): ort.Tensor {
    // Neural networks require a standard input size (typically 112x112 for face models)
    const canvas = document.createElement('canvas');
    canvas.width = this.INPUT_SIZE;
    canvas.height = this.INPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create canvas context');

    // Draw the original face image scaled to the exact model input size
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx?.putImageData(imageData, 0, 0);

    ctx.drawImage(tempCanvas, 0, 0, this.INPUT_SIZE, this.INPUT_SIZE);
    
    const resizedData = ctx.getImageData(0, 0, this.INPUT_SIZE, this.INPUT_SIZE).data;
    
    // Create a Float32Array shaped as [1, 3, 112, 112] (NCHW format)
    const floatData = new Float32Array(3 * this.INPUT_SIZE * this.INPUT_SIZE);
    
    for (let y = 0; y < this.INPUT_SIZE; y++) {
      for (let x = 0; x < this.INPUT_SIZE; x++) {
        const idx = (y * this.INPUT_SIZE + x) * 4;
        const r = resizedData[idx];
        const g = resizedData[idx + 1];
        const b = resizedData[idx + 2];
        
        // Map channels into the NCHW flat array layout
        const rIdx = y * this.INPUT_SIZE + x;
        const gIdx = this.INPUT_SIZE * this.INPUT_SIZE + y * this.INPUT_SIZE + x;
        const bIdx = 2 * this.INPUT_SIZE * this.INPUT_SIZE + y * this.INPUT_SIZE + x;

        // Standard normalization for MobileFaceNet models: (pixel - 127.5) / 128.0
        floatData[rIdx] = (r - 127.5) / 128.0;
        floatData[gIdx] = (g - 127.5) / 128.0;
        floatData[bIdx] = (b - 127.5) / 128.0;
      }
    }

    return new ort.Tensor('float32', floatData, [1, 3, this.INPUT_SIZE, this.INPUT_SIZE]);
  }

  private normalizeEmbedding(embedding: number[]): number[] {
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? embedding.map(val => val / magnitude) : embedding;
  }

  dispose(): void {
    if (this.session) {
      this.session = null;
    }
    this.isInitialized = false;
  }
}

export const faceEmbeddingService = new FaceEmbeddingService();