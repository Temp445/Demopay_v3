
import { supabase } from './supabase';
import type { Visitor, VisitorSettings } from '../types/visitor';

export interface VisitorDetectionResult {
  isNewVisitor: boolean;
  visitor: Visitor | null;
  requiresApproval: boolean;
  canEnter: boolean;
  message: string;
}

export async function detectAndProcessVisitor(
  tenantId: string,
  faceDescriptor: Float32Array | number[],
  videoElement?: HTMLVideoElement
): Promise<VisitorDetectionResult> {
  try {
    const settings = await getVisitorSettings(tenantId);

    const existingVisitor = await findMatchingVisitor(
      tenantId,
      faceDescriptor,
      settings?.face_match_threshold || 0.60
    );

    if (existingVisitor) {
      return await handleReturningVisitor(existingVisitor, settings);
    } else {
      return await handleNewVisitor(
        tenantId,
        faceDescriptor,
        videoElement,
        settings
      );
    }
  } catch (error) {
    console.error('Error detecting and processing visitor:', error);
    return {
      isNewVisitor: false,
      visitor: null,
      requiresApproval: false,
      canEnter: false,
      message: 'Error processing visitor detection',
    };
  }
}

async function getVisitorSettings(tenantId: string): Promise<VisitorSettings | null> {
  try {
    const { data, error } = await supabase
      .from('visitor_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching visitor settings:', error);
    }

    return data || null;
  } catch (error) {
    console.error('Error in getVisitorSettings:', error);
    return null;
  }
}

async function findMatchingVisitor(
  tenantId: string,
  faceDescriptor: Float32Array | number[],
  threshold: number
): Promise<Visitor | null> {
  try {
    const { data: visitors, error } = await supabase
      .from('attendance_visitor')
      .select('*')
      .eq('tenant_id', tenantId);

    if (error) throw error;

    if (!visitors || visitors.length === 0) return null;

    const descriptorArray = Array.from(faceDescriptor);

    for (const visitor of visitors) {
      const similarity = calculateCosineSimilarity(
        descriptorArray,
        visitor.face_descriptor
      );

      if (similarity >= threshold) {
        return visitor;
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding matching visitor:', error);
    return null;
  }
}

function calculateCosineSimilarity(desc1: number[], desc2: any): number {
  try {
    const arr1 = desc1;
    const arr2 = Array.isArray(desc2) ? desc2 : Object.values(desc2);

    if (arr1.length !== arr2.length) return 0;

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < arr1.length; i++) {
      dotProduct += arr1[i] * arr2[i];
      mag1 += arr1[i] * arr1[i];
      mag2 += arr2[i] * arr2[i];
    }

    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);

    if (mag1 === 0 || mag2 === 0) return 0;

    const cosineSimilarity = dotProduct / (mag1 * mag2);
    return (cosineSimilarity + 1) / 2;
  } catch (error) {
    console.error('Error calculating cosine similarity:', error);
    return 0;
  }
}

async function handleReturningVisitor(
  visitor: Visitor,
  settings: VisitorSettings | null
): Promise<VisitorDetectionResult> {
  const requiresApproval = settings?.require_employee_approval !== false;
  const autoEntry = settings?.allow_automatic_entry === true;

  let canEnter = false;
  let message = `Welcome back, ${visitor.visitor_name || 'Visitor'}!`;

  if (visitor.visitor_status === 'approved') {
    canEnter = true;
    message = `Welcome back, ${visitor.visitor_name || 'Visitor'}! You may enter.`;
  } else if (visitor.visitor_status === 'pending' || visitor.visitor_status === 'verification_pending') {
    canEnter = false;
    message = 'Your visit request is pending approval.';
  } else if (visitor.visitor_status === 'rejected') {
    canEnter = false;
    message = 'Your visit request was rejected. Please contact reception.';
  }

  if (autoEntry && !requiresApproval) {
    canEnter = true;
  }

  return {
    isNewVisitor: false,
    visitor,
    requiresApproval,
    canEnter,
    message,
  };
}

async function handleNewVisitor(
  tenantId: string,
  faceDescriptor: Float32Array | number[],
  videoElement?: HTMLVideoElement,
  settings?: VisitorSettings | null
): Promise<VisitorDetectionResult> {
  try {
    let imageData: Uint8Array | undefined;

    if (videoElement) {
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.drawImage(videoElement, 0, 0);
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.8);
        });
        const arrayBuffer = await blob.arrayBuffer();
        imageData = new Uint8Array(arrayBuffer);
      }
    }

    const { data: newVisitor, error } = await supabase
      .from('attendance_visitor')
      .insert({
        tenant_id: tenantId,
        face_descriptor: Array.from(faceDescriptor),
        visitor_status: 'pending',
        visitor_image_data: imageData,
      })
      .select()
      .single();

    if (error) throw error;

    const requiresApproval = settings?.require_employee_approval !== false;
    const autoEntry = settings?.allow_automatic_entry === true;

    return {
      isNewVisitor: true,
      visitor: newVisitor,
      requiresApproval,
      canEnter: autoEntry && !requiresApproval,
      message: 'New visitor detected. Please provide your details.',
    };
  } catch (error) {
    console.error('Error creating new visitor:', error);
    throw error;
  }
}

export async function createVisitorClockInOut(
  tenantId: string,
  visitorId: string
): Promise<{ isClockIn: boolean; timestampId: string }> {
  try {
    const { data: existingTimestamps, error: fetchError } = await supabase
      .from('attendance_visitor_timestamp')
      .select('*')
      .eq('visitor_id', visitorId)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1);

    if (fetchError) throw fetchError;

    if (existingTimestamps && existingTimestamps.length > 0) {
      const { error: updateError } = await supabase
        .from('attendance_visitor_timestamp')
        .update({ clock_out: new Date().toISOString() })
        .eq('id', existingTimestamps[0].id);

      if (updateError) throw updateError;

      return {
        isClockIn: false,
        timestampId: existingTimestamps[0].id,
      };
    } else {
      const { data: newTimestamp, error: insertError } = await supabase
        .from('attendance_visitor_timestamp')
        .insert({
          tenant_id: tenantId,
          visitor_id: visitorId,
          clock_in: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) throw insertError;

      return {
        isClockIn: true,
        timestampId: newTimestamp.id,
      };
    }
  } catch (error) {
    console.error('Error creating visitor clock in/out:', error);
    throw error;
  }
}

export async function getPendingVisitorApprovals(
  tenantId: string,
  employeeId: string
): Promise<Visitor[]> {
  try {
    const { data, error } = await supabase
      .from('attendance_visitor')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('employee_to_visit', employeeId)
      .eq('visitor_status', 'verification_pending')
      .order('last_visit_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching pending visitor approvals:', error);
    return [];
  }
}

export async function getVisitorsRequiringConfirmation(
  tenantId: string,
  employeeId: string
): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('attendance_visitor_timestamp')
      .select(`
        *,
        visitor:attendance_visitor!inner(
          *
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('visitor.employee_to_visit', employeeId)
      .not('clock_out', 'is', null)
      .eq('is_confirmed', false)
      .order('clock_out', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching visitors requiring confirmation:', error);
    return [];
  }
}

export function captureVisitorImage(video: HTMLVideoElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) return '';

  ctx.drawImage(video, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.8);
}
