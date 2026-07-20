import * as faceapi from 'face-api.js';
import { supabase } from './supabase';
import { getTenantId } from './tenantDb';
import {
  FaceLandmarker,
  FilesetResolver,
  FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

/* =====================================================
   📦 GLOBALS & STATE
   ===================================================== */
let modelsLoaded = false;
let faceDescriptors: { employeeId: string; descriptor: Float32Array }[] = [];
let faceLandmarker: FaceLandmarker | null = null;
let lastLivenessResult: boolean | null = null;


const ENROLLMENT_CAPTURES = 5;
const MIN_CAPTURES = 3;
const MATCH_THRESHOLD = 0.45;

/* =====================================================
   ⚙️ INITIALIZATION
   ===================================================== */

/**
 * Initializes FaceAPI (Recognition) and MediaPipe (Liveness)
 */
export async function initFaceRecognition() {
  if (modelsLoaded && faceLandmarker) return;

  // 1. Load FaceAPI Models (for Recognition)
  if (!modelsLoaded) {
    await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
    await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
    await loadFaceDescriptors();
    modelsLoaded = true;
  }

  // 2. Load MediaPipe Model (for Liveness)
  if (!faceLandmarker) {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
    });
  }
}

/* =====================================================
   🗄️ DATABASE & DESCRIPTORS
   ===================================================== */

async function loadFaceDescriptors() {
  const tenantId = await getTenantId();

  const { data, error } = await supabase
    .from('employee_face_data')
    .select('employee_id, face_descriptor')
    .eq('tenant_id', tenantId);

  if (error) throw error;

  faceDescriptors = data
    .map((item) => {
      try {
        const parsed = JSON.parse(item.face_descriptor);
        if (!Array.isArray(parsed) || parsed.length !== 128) return null;

        return {
          employeeId: item.employee_id,
          descriptor: new Float32Array(parsed),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean) as { employeeId: string; descriptor: Float32Array }[];

  console.log(`Loaded ${faceDescriptors.length} enrolled faces`);
}

/* =====================================================
   🔐 LIVENESS DETECTION (MEDIA-PIPE)
   ===================================================== */

function calculateEyeAspectRatio(points: { x: number, y: number }[]) {
  const dist = (a: { x: number, y: number }, b: { x: number, y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const A = dist(points[1], points[5]);
  const B = dist(points[2], points[4]);
  const C = dist(points[0], points[3]);

  return (A + B) / (2 * C);
}

/**
 * Checks for Liveness: Requires Blink AND Head Movement
 * Duration: ~1.5 - 2 seconds scan
 */
export async function mediapipeLivenessCheck(
  video: HTMLVideoElement
): Promise<{ isLive: boolean; reason?: string }> {
  await initFaceRecognition();
  if (!faceLandmarker) return { isLive: false, reason: 'MODEL_ERROR' };

  let lastEAR = 0;
  let blinkDetected = false;
  let headMovement = 0;
  let lastYaw: number | null = null;
  
  // We run a loop to analyze frames over time
  // 15 iterations * 100ms = ~1.5 seconds of analysis
  const ITERATIONS = 15; 
  
  for (let i = 0; i < ITERATIONS; i++) {
    const now = performance.now();
    
    // Detect landmarks
    const res: FaceLandmarkerResult = faceLandmarker.detectForVideo(video, now);

    if (res.faceLandmarks && res.faceLandmarks.length > 0) {
      const landmarks = res.faceLandmarks[0];

      /* ---- 1. BLINK DETECTION (EAR) ---- */
      // MediaPipe indices for eyes
      const leftEye = [33, 160, 158, 133, 153, 144].map((i) => landmarks[i]);
      const rightEye = [362, 385, 387, 263, 373, 380].map((i) => landmarks[i]);

      const ear = (calculateEyeAspectRatio(leftEye) + calculateEyeAspectRatio(rightEye)) / 2;

      // Threshold: Eye open > 0.25, Eye closed < 0.18
      if (lastEAR > 0.25 && ear < 0.18) {
        blinkDetected = true;
      }
      lastEAR = ear;

      /* ---- 2. HEAD MOVEMENT (YAW) ---- */
      // Uses the transformation matrix to detect rotation
      const matrix = res.facialTransformationMatrixes?.[0]?.data;
      if (matrix) {
        // Calculate Yaw (rotation around Y-axis)
        const yaw = Math.atan2(matrix[8], matrix[0]);
        if (lastYaw !== null) {
          headMovement += Math.abs(yaw - lastYaw);
        }
        lastYaw = yaw;
      }
    }

    // Small delay between checks
    await new Promise((r) => setTimeout(r, 100));
  }

  // VALIDATION LOGIC
  // 1. Must blink at least once
  // 2. Head movement must be significant (prevent static photo)
  // Threshold 0.15 radians is approx 8-9 degrees of accumulated movement
  // const isLive = blinkDetected && headMovement > 0.15;

  if (!blinkDetected) return { isLive: false, reason: 'NO_BLINK_DETECTED' };
  if (headMovement <= 0.15) return { isLive: false, reason: 'NO_HEAD_MOVEMENT' };

  return { isLive: true };
}

/* =====================================================
   📸 CORE FACE FUNCTIONS
   ===================================================== */

/* ---------------- VERIFY FACE ---------------- */
export async function verifyFace(
  video: HTMLVideoElement,
  employeeId: string
) {
  await initFaceRecognition();

  /* 🔒 1. LIVENESS CHECK (Using MediaPipe) */
  // We check liveness BEFORE matching to save resources on spoof attempts
  // const liveness = await mediapipeLivenessCheck(video);

  if (lastLivenessResult === null) {
  const liveness = await mediapipeLivenessCheck(video);
  lastLivenessResult = liveness.isLive;

  if (!liveness.isLive) {
    return {
      verified: false,
      reason: `SPOOF_DETECTED: ${liveness.reason}`,
    };
  }
}


  /* ⬇ 2. EXISTING RECOGNITION LOGIC */
  const stored = faceDescriptors.find(
    (fd) => fd.employeeId === employeeId
  );

  if (!stored) {
    return { verified: false, reason: 'NOT_ENROLLED' };
  }

  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    return { verified: false, reason: 'NO_FACE_DETECTED' };
  }

  const distance = faceapi.euclideanDistance(
    detection.descriptor,
    stored.descriptor
  );

  const verified = distance < MATCH_THRESHOLD;

  return {
    verified,
    employeeId: verified ? employeeId : undefined,
    distance,
    confidence: Math.max(0, (1 - distance) * 100),
  };
}

/* ---------------- ENROLL FACE ---------------- */
export async function enrollFace(employeeId: string, video: HTMLVideoElement) {
  await initFaceRecognition();

  const descriptors: Float32Array[] = [];

  for (let i = 0; i < ENROLLMENT_CAPTURES; i++) {
    await new Promise((r) => setTimeout(r, 400));

    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (detection) descriptors.push(detection.descriptor);
  }

  if (descriptors.length < MIN_CAPTURES) {
    throw new Error('Not enough clear face captures');
  }

  const averaged = averageDescriptors(descriptors);
  const tenantId = await getTenantId();

  const { data: existing } = await supabase
    .from('employee_face_data')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('employee_id', employeeId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('employee_face_data')
      .update({
        face_descriptor: JSON.stringify(Array.from(averaged)),
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('employee_id', employeeId);
  } else {
    await supabase.from('employee_face_data').insert([
      {
        tenant_id: tenantId,
        employee_id: employeeId,
        face_descriptor: JSON.stringify(Array.from(averaged)),
        created_at: new Date().toISOString(),
      },
    ]);
  }

  // Update local cache
  faceDescriptors = faceDescriptors.filter(
    (fd) => fd.employeeId !== employeeId
  );
  faceDescriptors.push({ employeeId, descriptor: averaged });

  return true;
}

/* ---------------- IDENTIFY FACE (1:N) ---------------- */// Add/Update this inside faceRecognition.ts

export async function identifyFace(video: HTMLVideoElement) {
  await initFaceRecognition();

  // 1. FAST GEOMETRY CHECK (Too Close / Too Far)
  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    return { matched: false, reason: 'NO_FACE_DETECTED' };
  }

  // Check Face Size relative to Video Size (Prevent "Too Close")
  const videoWidth = video.videoWidth;
  const faceWidth = detection.detection.box.width;
  const faceRatio = faceWidth / videoWidth;

  if (faceRatio > 0.55) { // Face takes up > 55% of width
    return { matched: false, reason: 'TOO_CLOSE' };
  }
  if (faceRatio < 0.15) { // Face takes up < 15% of width
    return { matched: false, reason: 'TOO_FAR' };
  }

  // 2. LIVENESS CHECK (MediaPipe)
  // This runs for ~1.5s. UI should say "Checking..." during this.
  const liveness = await mediapipeLivenessCheck(video);

  if (!liveness.isLive) {
    // Returns reasons like 'NO_BLINK_DETECTED' or 'NO_HEAD_MOVEMENT'
    return { matched: false, reason: liveness.reason || 'SPOOF_DETECTED' };
  }

  // 3. MATCHING LOGIC (1:N)
  let bestMatch: { employeeId: string; distance: number } | null = null;
  const MATCH_THRESHOLD = 0.45;

  for (const fd of faceDescriptors) {
    const distance = faceapi.euclideanDistance(detection.descriptor, fd.descriptor);
    if (!bestMatch || distance < bestMatch.distance) {
      bestMatch = { employeeId: fd.employeeId, distance };
    }
  }

  if (!bestMatch || bestMatch.distance > MATCH_THRESHOLD) {
    // If liveness passed but face unknown, it's a Visitor
    return { matched: false, reason: 'UNVERIFIED_FACE', descriptor: detection.descriptor };
  }

  return {
    matched: true,
    employeeId: bestMatch.employeeId,
    distance: bestMatch.distance,
    reason: 'VERIFIED',
  };
}

/* ---------------- UTILS ---------------- */

export async function deleteFaceData(employeeId: string) {
  const tenantId = await getTenantId();

  await supabase
    .from('employee_face_data')
    .delete()
    .eq('employee_id', employeeId)
    .eq('tenant_id', tenantId);

  faceDescriptors = faceDescriptors.filter(
    (fd) => fd.employeeId !== employeeId
  );

  return true;
}

export async function hasEnrolledFace(employeeId: string) {
  const tenantId = await getTenantId();

  const { data } = await supabase
    .from('employee_face_data')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('tenant_id', tenantId)
    .limit(1);

  return Array.isArray(data) && data.length > 0;
}

function averageDescriptors(descriptors: Float32Array[]): Float32Array {
  const avg = new Float32Array(128);
  for (let i = 0; i < 128; i++) {
    avg[i] =
      descriptors.reduce((sum, d) => sum + d[i], 0) /
      descriptors.length;
  }
  return avg;
}