import * as faceapi from 'face-api.js';
import { supabase } from '../lib/supabase';

const VISITOR_MATCH_THRESHOLD = 0.45;

/* ---------------- HELPERS ---------------- */

const euclideanDistance = (a: number[], b: number[]) =>
  Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));

const isSameDay = (a: string | null, b: Date) => {
  if (!a) return false;
  const d1 = new Date(a);
  return (
    d1.getFullYear() === b.getFullYear() &&
    d1.getMonth() === b.getMonth() &&
    d1.getDate() === b.getDate()
  );
};

/* ---------------- MAIN HANDLER ---------------- */

export async function handleUnverifiedVisitor(params: {
  video: HTMLVideoElement;
  lastDescriptorRef: React.MutableRefObject<number[] | null>;
  facePresentRef: React.MutableRefObject<boolean>;
}) {
  const { video, lastDescriptorRef, facePresentRef } = params;

  /* ---------- DETECT FACE ---------- */
  // We keep the threshold low here to detect *movement*, 
  // but we will filter for *quality* below.
  const detection = await faceapi
    .detectSingleFace(
      video,
      new faceapi.TinyFaceDetectorOptions({
        inputSize: 224,
        scoreThreshold: 0.5, 
      })
    )
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    return { success: false };
  }

  /* ---------- QUALITY CHECK (PROPER VIEW) ---------- */
  // 1. Extract dimensions
  const { box, score } = detection.detection;
  const { videoWidth, videoHeight } = video;

  // 2. Strict Confidence Check: 
  // 0.5 detects a face, but 0.85 ensures they are facing the camera and not blurry.
  if (score < 0.85) {
    return { success: false };
  }

  // 3. Face Size Check:
  // Face must be at least 15% of the screen width (prevents background captures).
  const minFaceWidth = videoWidth * 0.15;
  if (box.width < minFaceWidth) {
    return { success: false };
  }

  // 4. Centering Check:
  // Face center X should be within the middle 60% of the screen.
  const faceCenterX = box.x + box.width / 2;
  const screenCenterX = videoWidth / 2;
  const allowedOffset = videoWidth * 0.3; // Allow 30% deviation left/right

  if (Math.abs(faceCenterX - screenCenterX) > allowedOffset) {
    return { success: false };
  }

  /* ---------- PROCESS VALID FACE ---------- */
  
  const descriptor = Array.from(detection.descriptor);

  /* ---------- SAME FACE STILL PRESENT ---------- */
  if (
    facePresentRef.current &&
    lastDescriptorRef.current &&
    euclideanDistance(lastDescriptorRef.current, descriptor) <
      VISITOR_MATCH_THRESHOLD
  ) {
    return { success: false };
  }

  /* ---------- NEW FACE APPEARANCE ---------- */
  facePresentRef.current = true;
  lastDescriptorRef.current = descriptor;

  /* ---------- CAPTURE IMAGE ---------- */
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d')?.drawImage(video, 0, 0);

  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, 'image/jpeg', 0.8)
  );

  if (!blob) return { success: false };

  const photoBytes = new Uint8Array(await blob.arrayBuffer());

  /* ---------- FETCH ALL VISITORS ---------- */
  const { data: visitors, error } = await supabase
    .from('attendance_visitor')
    .select('id, total_visits, face_descriptor, last_seen_at');

  if (error) {
    console.error('Fetch visitors failed:', error);
    return { success: false };
  }

  let matchedVisitor: any = null;

  for (const v of visitors ?? []) {
    if (!v.face_descriptor) continue;

    if (
      euclideanDistance(v.face_descriptor as number[], descriptor) <
      VISITOR_MATCH_THRESHOLD
    ) {
      matchedVisitor = v;
      break;
    }
  }

  const now = new Date();
  let visitorId: string;

  /* ---------- EXISTING VISITOR ---------- */
  if (matchedVisitor) {
    visitorId = matchedVisitor.id;

    const sameDay = isSameDay(matchedVisitor.last_seen_at, now);

    await supabase
      .from('attendance_visitor')
      .update({
        total_visits: sameDay
          ? matchedVisitor.total_visits
          : (matchedVisitor.total_visits ?? 0) + 1,
        last_seen_at: now.toISOString(),
      })
      .eq('id', visitorId);
  }

  /* ---------- NEW VISITOR ---------- */
  else {
    const { data, error } = await supabase
      .from('attendance_visitor')
      .insert({
        photo: photoBytes,
        face_descriptor: descriptor, // jsonb
        total_visits: 1, // 👈 first day = 1
        last_seen_at: now.toISOString(),
      })
      .select()
      .single();

    if (error || !data) {
      console.error('Insert visitor failed:', error);
      return { success: false };
    }

    visitorId = data.id;
  }

  /* ---------- VISITOR IN / OUT ---------- */
  const { data: lastEntry } = await supabase
    .from('attendance_visitor_timestamp')
    .select('entry')
    .eq('visitor_id', visitorId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextEntry = lastEntry?.entry === 'IN' ? 'OUT' : 'IN';

  await supabase.from('attendance_visitor_timestamp').insert({
    visitor_id: visitorId,
    entry: nextEntry,
  });

  return { success: true };
}