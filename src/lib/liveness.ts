import * as faceapi from 'face-api.js';

export async function detectBlink(video: HTMLVideoElement) {
  // detect face and landmarks
  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
    .withFaceLandmarks();

  if (!detection) return false;

  const leftEye = detection.landmarks.getLeftEye();
  const rightEye = detection.landmarks.getRightEye();

  // calculate eye aspect ratio (EAR) to detect blink
  function ear(eye: faceapi.Point[]) {
    const [p1, p2, p3, p4, p5, p6] = eye;
    const vert1 = p2.y - p6.y;
    const vert2 = p3.y - p5.y;
    const horiz = p1.x - p4.x;
    return (vert1 + vert2) / (2 * horiz);
  }

  const leftEAR = ear(leftEye);
  const rightEAR = ear(rightEye);

  const avgEAR = (leftEAR + rightEAR) / 2;

  // If EAR drops below threshold → blink detected
  return avgEAR < 0.25;
}

export async function isLiveFace(video: HTMLVideoElement) {
  // You can combine multiple frames for more reliability
  const blinkDetected = await detectBlink(video);
  return blinkDetected;
}
