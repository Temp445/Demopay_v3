import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, UserCheck, UserX, ShieldCheck, AlertTriangle, Users, ScanFace, LogOut } from 'lucide-react';

import { faceApiService } from '../../../lib/faceDetectionServices/faceApiService';
import { databaseService } from '../../../lib/faceDetectionServices/faceDetectionDatabase';
import { similarityService, MatchResult } from '../../../lib/faceDetectionServices/similarity';
import { useCamera } from '../../../hooks/useCamera';
import { useAuth } from '../../../contexts/AuthContext';
import { useTenant } from '../../../contexts/TenantContext'; 
import VisitorQuickAddPanel from './VisitorQuickAddPanel';
import VisitorExitRequestPanel from './VisitorExitRequestPanel';
import VisitorNotificationBar from './VisitorNotificationBar';
import { validateLocationAgainstBranches } from '../../../lib/locationService';
import toast from 'react-hot-toast';

type FaceStatus = 'authenticated' | 'recently_punched' | 'cooldown' | 'unregistered' | 'scanning' | 'waiting';

interface FaceVerificationResult {
  face: { boundingBox: { originX: number; originY: number; width: number; height: number } };
  match: MatchResult | null;
  status: FaceStatus;
  embedding: number[];
  timestamp: number;
  remainingCooldown?: number;
}

interface PunchNotification {
  id: string;
  name: string;
  entry: 'IN' | 'OUT' | 'PROCESSING' | 'PENDING' | 'EXIT_CONFIRMED' | 'EXIT_DENIED';
  time: Date;
  outTime?: Date; 
  visitorId?: string;
}

const SUCCESS_BANNER_DURATION_MS = 10 * 1000;

export const FaceAttendancePage = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant(); 
  const tenantId = currentTenant?.id; 

  const { videoRef, isReady, error: cameraError } = useCamera({
    width: 1280,
    height: 720,
    facingMode: 'user',
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const lastFrameTimeRef = useRef<number>(0);
  const fpsCounterRef = useRef<number[]>([]);

  // Ref to strictly track verification state inside async loops
  const isVerifyingRef = useRef<boolean>(false);

  const cachedEmbeddingsRef = useRef<Array<{
    id: string;
    user_id: string;
    user_name: string;
    embedding: number[];
    type: 'employee' | 'visitor';
  }>>([]);

  const scannerLocationDataRef = useRef<{ latitude?: number; longitude?: number; status?: string; distanceMeters?: number } | null>(null);

  const attendanceSaveMap = useRef<Map<string, number>>(new Map());
  const cooldownMsRef = useRef<number>(5 * 60 * 1000);
  const isProcessingUnknownRef = useRef<boolean>(false);
  const captureImageEnabledRef = useRef(false);

  const [isInitialized, setIsInitialized] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [results, setResults] = useState<FaceVerificationResult[]>([]);
  const [fps, setFps] = useState(0);
  const [recentPunches, setRecentPunches] = useState<PunchNotification[]>([]);
  const [showVisitorPanel, setShowVisitorPanel] = useState(false);
  const [showExitRequestPanel, setShowExitRequestPanel] = useState(false);

  const exitPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const primaryResult = results.length > 0 ? results[0] : null;

  useEffect(() => {
    const init = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 100));
        await faceApiService.initialize();
        setIsInitialized(true);
      } catch (err) {
        console.error('[FaceVerification] init error:', err);
      }
    };
    init();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (exitPollRef.current) clearInterval(exitPollRef.current);
      // faceApiService doesn't need explicit dispose
    };
  }, []);

  const startExitPolling = (punchId: string, visitorId: string, _visitorName: string) => {
    if (exitPollRef.current) clearInterval(exitPollRef.current);

    exitPollRef.current = setInterval(async () => {
      try {
        const { data } = await import('../../../lib/supabase').then(m =>
          m.supabase
            .from('attendance_visitor_visits')
            .select('visitor_status')
            .eq('visitor_id', visitorId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()
        );

        if (!data) return;

        if (data.visitor_status !== 'exit_pending') {
          if (exitPollRef.current) clearInterval(exitPollRef.current);
          exitPollRef.current = null;

          const { supabase: sb } = await import('../../../lib/supabase');
          const { data: ts } = await sb
            .from('attendance_visitor_timestamp')
            .select('entry, timestamp')
            .eq('visitor_id', visitorId)
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();

          const exitApproved = ts?.entry === 'OUT';
          const outTime = exitApproved && ts?.timestamp ? new Date(ts.timestamp) : undefined;

          attendanceSaveMap.current.set(visitorId, Date.now() + (exitApproved ? 15000 : 5000));

          setRecentPunches(prev => prev.map(p =>
            p.id === punchId
              ? { ...p, entry: exitApproved ? 'EXIT_CONFIRMED' : 'EXIT_DENIED', outTime }
              : p
          ));
          setTimeout(() => {
            setRecentPunches(prev => prev.filter(p => p.id !== punchId));
          }, exitApproved ? 8000 : 8000);
        }
      } catch (err) {
        console.error('Exit poll error:', err);
      }
    }, 3000);
  };

  useEffect(() => {
    if (isVerifying && isReady && videoRef.current && !isFetchingData) {
      verifyLoop();
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isVerifying, isReady, isFetchingData]);

  const processAttendancePunch = async (employeeId: string, employeeName: string, activeTenantId?: string | null) => {
    const punchId = Math.random().toString();
    const punchTime = new Date();

    setRecentPunches(prev => [
      { id: punchId, name: employeeName, entry: 'PROCESSING' as const, time: punchTime },
      ...prev
    ].slice(0, 10));

    try {
      const lastRecord = await databaseService.getLastAttendance(employeeId);
      let nextEntry: 'IN' | 'OUT' = 'IN';

      if (lastRecord && lastRecord.timestamp) {
        const recordDate = new Date(lastRecord.timestamp);
        const today = new Date();

        if (
          recordDate.getDate() === today.getDate() &&
          recordDate.getMonth() === today.getMonth() &&
          recordDate.getFullYear() === today.getFullYear()
        ) {
          nextEntry = lastRecord.entry === 'IN' ? 'OUT' : 'IN';
        }
      }

      let base64ImageData: string | undefined = undefined;
      
      if (captureImageEnabledRef.current && videoRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = 350;
        canvas.height = 260;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          base64ImageData = canvas.toDataURL('image/jpeg', 0.6);
        }
      }

      const success = await databaseService.markAttendance(
        employeeId, 
        nextEntry, 
        activeTenantId ?? undefined, 
        'Facial Recognition', 
        scannerLocationDataRef.current ?? undefined,
        base64ImageData
      );

      if (success) {
        setRecentPunches(prev => prev.map(p =>
          p.id === punchId ? { ...p, entry: nextEntry } : p
        ));
        setTimeout(() => {
          setRecentPunches(prev => prev.filter(p => p.id !== punchId));
        }, 15000);
      } else {
        setRecentPunches(prev => prev.filter(p => p.id !== punchId));
      }
    } catch (err) {
      console.error("Failed to process attendance:", err);
      setRecentPunches(prev => prev.filter(p => p.id !== punchId));
    }
  };

  const handleNewVisitor = async (embedding: number[]) => {
    if (!videoRef.current) {
      isProcessingUnknownRef.current = false;
      return;
    }

    try {
      const visitorEmbeddings = cachedEmbeddingsRef.current.filter(
        e => e.type === 'visitor' && e.embedding && e.embedding.length === embedding.length
      );

      const existingMatch = similarityService.findBestMatch(embedding, visitorEmbeddings);

      if (existingMatch) {
        console.log(`[FaceVerification] Dedup: matched existing visitor ${existingMatch.userId}`);
        attendanceSaveMap.current.set(existingMatch.userId, Date.now());

        databaseService.recordVisitorPunch(existingMatch.userId, tenantId).then((entryType) => {
          const punchId = Math.random().toString();
          const name = existingMatch.userName || 'Visitor';
          if (entryType === 'PENDING') {
            setRecentPunches(prev => [{ id: punchId, name, entry: 'PENDING' as const, time: new Date(), visitorId: existingMatch.userId }, ...prev].slice(0, 10));
            startExitPolling(punchId, existingMatch.userId, name);
          } else {
            setRecentPunches(prev => [{ id: punchId, name, entry: (entryType || 'IN') as PunchNotification['entry'], time: new Date() }, ...prev].slice(0, 10));
          }
        });
        return;
      }

      const dbVisitors = await databaseService.getAllVisitorsFaceData(tenantId);
      const validDbVisitors = dbVisitors.filter(
        (v: any) => v.embedding && Array.isArray(v.embedding) && v.embedding.length === embedding.length
      );
      const dbMatch = similarityService.findBestMatch(embedding, validDbVisitors);

      if (dbMatch) {
        if (!cachedEmbeddingsRef.current.some(e => e.user_id === dbMatch.userId)) {
          const dbRecord = validDbVisitors.find((v: any) => v.user_id === dbMatch.userId);
          if (dbRecord) cachedEmbeddingsRef.current.push(dbRecord as any);
        }
        attendanceSaveMap.current.set(dbMatch.userId, Date.now());

        databaseService.recordVisitorPunch(dbMatch.userId, tenantId).then((entryType) => {
          const punchId = Math.random().toString();
          const name = dbMatch.userName || 'Visitor';
          if (entryType === 'PENDING') {
            setRecentPunches(prev => [{ id: punchId, name, entry: 'PENDING' as const, time: new Date(), visitorId: dbMatch.userId }, ...prev].slice(0, 10));
            startExitPolling(punchId, dbMatch.userId, name);
          } else {
            setRecentPunches(prev => [{ id: punchId, name, entry: (entryType || 'IN') as PunchNotification['entry'], time: new Date() }, ...prev].slice(0, 10));
          }
        });
        return;
      }

      const punchId = Math.random().toString();
      setRecentPunches(prev => [
        { id: punchId, name: 'Registering New Visitor...', entry: 'PROCESSING' as const, time: new Date() },
        ...prev
      ].slice(0, 10));

      await new Promise(resolve => setTimeout(resolve, 50));

      const canvas = document.createElement('canvas');
      canvas.width = 350;
      canvas.height = 260;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const base64ImageData = canvas.toDataURL('image/jpeg', 0.6);

      const tempVisitorId = `temp-visitor-${Date.now()}`;
      cachedEmbeddingsRef.current.push({
        id: tempVisitorId,
        user_id: tempVisitorId,
        user_name: 'Visitor',
        embedding: embedding,
        type: 'visitor'
      });
      attendanceSaveMap.current.set(tempVisitorId, Date.now());

      const newVisitor = await databaseService.createNewVisitor(embedding, base64ImageData, tenantId);

      if (newVisitor) {
        const cacheIndex = cachedEmbeddingsRef.current.findIndex(e => e.id === tempVisitorId);
        if (cacheIndex !== -1) {
          cachedEmbeddingsRef.current[cacheIndex].id = newVisitor.id;
          cachedEmbeddingsRef.current[cacheIndex].user_id = newVisitor.id;
        }
        attendanceSaveMap.current.delete(tempVisitorId);
        attendanceSaveMap.current.set(newVisitor.id, Date.now());

        const entryType = await databaseService.recordVisitorPunch(newVisitor.id, tenantId);

        setRecentPunches(prev => prev.map(p =>
          p.id === punchId ? { ...p, name: 'New Visitor', entry: (entryType || 'IN') as PunchNotification['entry'] } : p
        ));

        setTimeout(() => {
          setRecentPunches(prev => prev.filter(p => p.id !== punchId));
        }, 15000);
      }
    } catch (err) {
      console.error("Failed to register visitor:", err);
      setRecentPunches(prev => prev.filter(p => p.entry !== 'PROCESSING' || p.name !== 'Registering New Visitor...'));
    } finally {
      setTimeout(() => {
        isProcessingUnknownRef.current = false;
      }, 30000);
    }
  };

  const verifyLoop = useCallback(async () => {
    if (!videoRef.current || !isVerifyingRef.current) return;

    try {
      const resultsFromApi = await faceApiService.detectAllFacesWithEmbeddings(videoRef.current);

      // RACE CONDITION FIX: Clear ghost boxes if stopped during detection
      if (!isVerifyingRef.current) {
        clearCanvas();
        setResults([]);
        return;
      }

      if (resultsFromApi.length > 0) {
        const allEmbeddings = cachedEmbeddingsRef.current;
        const newResults: FaceVerificationResult[] = [];

        for (let i = 0; i < resultsFromApi.length; i++) {
          const face = resultsFromApi[i].face;
          const embedding = resultsFromApi[i].embedding;

          let status: FaceStatus;
          let match: MatchResult | null = null;
          let remainingCooldown = 0;
          const now = Date.now();

          const validStoredEmbeddings = allEmbeddings.filter(stored => {
            return stored.embedding && stored.embedding.length === embedding.length;
          });

          const employeeEmbeddings = validStoredEmbeddings.filter(e => e.type === 'employee');
          const visitorEmbeddings = validStoredEmbeddings.filter(e => e.type === 'visitor');

          match = similarityService.findBestMatch(embedding, employeeEmbeddings);
          let isVisitorMatch = false;

          if (!match) {
            match = similarityService.findBestMatch(embedding, visitorEmbeddings);
            if (match) isVisitorMatch = true;
          }

          if (match) {
            const lastPunchTime = attendanceSaveMap.current.get(match.userId) ?? 0;
            const timeSinceLastPunch = now - lastPunchTime;
            const currentCooldownMs = cooldownMsRef.current;
            const isPendingExit = recentPunches.some(p => p.visitorId === match.userId && p.entry === 'PENDING');

            let bypassCooldown = false;
            if ((isVisitorMatch || match!.userName === 'Visitor') && isPendingExit) {
                bypassCooldown = true;
            }

            if (timeSinceLastPunch > currentCooldownMs || bypassCooldown) {
              status = 'authenticated';
              attendanceSaveMap.current.set(match.userId, now);

              if (isVisitorMatch || match.userName === 'Visitor') {
                databaseService.recordVisitorPunch(match.userId, tenantId).then((entryType) => {
                  const punchId = Math.random().toString();
                  const name = match.userName || 'Visitor';
                  if (entryType === 'PENDING') {
                    setRecentPunches(prev => [{ id: punchId, name, entry: 'PENDING' as const, time: new Date(), visitorId: match.userId }, ...prev].slice(0, 10));
                    startExitPolling(punchId, match.userId, name);
                  } else {
                    setRecentPunches(prev => [{ id: punchId, name, entry: (entryType || 'IN') as PunchNotification['entry'], time: new Date() }, ...prev].slice(0, 10));
                  }
                });
              } else {
                processAttendancePunch(match.userId, match.userName, tenantId);
              }
            } else if (timeSinceLastPunch < SUCCESS_BANNER_DURATION_MS) {
              status = 'recently_punched';
            } else {
              if (isPendingExit) {
                status = 'waiting'; 
              } else {
                status = 'cooldown';
                remainingCooldown = Math.ceil((currentCooldownMs - timeSinceLastPunch) / 1000);
              }
            }
          } else {
            status = 'unregistered';

            if (!isProcessingUnknownRef.current) {
              isProcessingUnknownRef.current = true;
              handleNewVisitor(embedding);
            }
          }

          newResults.push({ face, match, status, embedding, timestamp: Date.now(), remainingCooldown });
        }

        setResults(newResults);
        drawOverlays(newResults);
      } else {
        setResults([]);
        clearCanvas();
      }
    } catch (err) {
      console.error('[FaceVerification] loop error:', err);
    }

    const endTime = performance.now();
    const delta = endTime - lastFrameTimeRef.current;
    if (delta > 0) {
      fpsCounterRef.current.push(1000 / delta);
      if (fpsCounterRef.current.length > 10) fpsCounterRef.current.shift();
      setFps(Math.round(fpsCounterRef.current.reduce((a, b) => a + b, 0) / fpsCounterRef.current.length));
    }
    lastFrameTimeRef.current = endTime;

    if (isVerifyingRef.current) {
      animationFrameRef.current = requestAnimationFrame(verifyLoop);
    }
  }, [tenantId]);

  const drawOverlays = (verResults: FaceVerificationResult[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    verResults.forEach((result) => {
      const { boundingBox } = result.face;

      let colour = '#EAB308';
      let label = '';

      switch (result.status) {
        case 'authenticated':
        case 'recently_punched':
          label = result.match!.userName;
          colour = '#10B981';
          break;
        case 'cooldown':
          const mins = Math.floor(result.remainingCooldown! / 60);
          const secs = result.remainingCooldown! % 60;
          const timeText = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
          label = `⌛ Next Clock in/out after ${timeText}`;
          colour = '#3B82F6';
          break;
        case 'unregistered':
          label = 'Unknown (Registering...)';
          colour = '#F97316';
          break;
        default:
          label = 'Scanning…';
      }

      ctx.strokeStyle = colour;
      ctx.lineWidth = 6;
      ctx.strokeRect(boundingBox.originX, boundingBox.originY, boundingBox.width, boundingBox.height);

      const len = Math.min(20, boundingBox.width * 0.15);
      ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(boundingBox.originX, boundingBox.originY + len); ctx.lineTo(boundingBox.originX, boundingBox.originY); ctx.lineTo(boundingBox.originX + len, boundingBox.originY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(boundingBox.originX + boundingBox.width - len, boundingBox.originY); ctx.lineTo(boundingBox.originX + boundingBox.width, boundingBox.originY); ctx.lineTo(boundingBox.originX + boundingBox.width, boundingBox.originY + len); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(boundingBox.originX, boundingBox.originY + boundingBox.height - len); ctx.lineTo(boundingBox.originX, boundingBox.originY + boundingBox.height); ctx.lineTo(boundingBox.originX + len, boundingBox.originY + boundingBox.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(boundingBox.originX + boundingBox.width - len, boundingBox.originY + boundingBox.height); ctx.lineTo(boundingBox.originX + boundingBox.width, boundingBox.originY + boundingBox.height); ctx.lineTo(boundingBox.originX + boundingBox.width, boundingBox.originY + boundingBox.height - len); ctx.stroke();

      ctx.font = 'bold 16px sans-serif';
      const textWidth = ctx.measureText(label).width;
      const labelY = boundingBox.originY > 40 ? boundingBox.originY - 10 : boundingBox.originY + boundingBox.height + 26;

      ctx.fillStyle = colour;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(boundingBox.originX, labelY - 22, textWidth + 16, 28);
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(label, boundingBox.originX + 8, labelY - 3);
    });
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const toggleVerification = async () => {
    if (!tenantId) {
      console.error("Cannot start scan: No active Tenant ID found.");
      return; 
    }

    if (!isVerifying) {
      setIsFetchingData(true);
      try {
        const [settings, employeeRecords, visitorRecords, configRes] = await Promise.all([
          databaseService.getCompanySettings(tenantId),
          databaseService.getAllFaceData(tenantId), // Must be scoped in backend too!
          databaseService.getAllVisitorsFaceData(tenantId),
          import('../../../lib/supabase').then(m => m.supabase
            .from('attendance_validation_config')
            .select('require_location, capture_image_while_face_clockin')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .maybeSingle()
          )
        ]);

        const requireLocation = !!configRes?.data?.require_location;

        if (requireLocation) {
          try {
            const branchLocations = settings?.branch_locations || [];
            const locResult = await validateLocationAgainstBranches(branchLocations);
            scannerLocationDataRef.current = {
              latitude: locResult.latitude,
              longitude: locResult.longitude,
              distanceMeters: locResult.distanceMeters ?? undefined,
              status: locResult.status,
            };
          } catch (locErr: any) {
            console.error("Location error:", locErr);
            toast.error(locErr.message || "Location required to start scanner");
            setIsFetchingData(false);
            return; // Abort starting scan
          }
        } else {
          scannerLocationDataRef.current = null;
        }

        const dbCooldown = settings?.biometric_cooldown_minutes ?? 5;
        console.log(`[Scanner] Biometric Cooldown initialized at: ${dbCooldown} minutes`);
        cooldownMsRef.current = dbCooldown * 60 * 1000;
        
        captureImageEnabledRef.current = !!configRes?.data?.capture_image_while_face_clockin;

        // STRICT TENANT FILTERING: Prevents cross-organization matching
        const flattenedEmbeddings = (employeeRecords as any[]).flatMap((record: any) => {
          
          if (record.tenant_id && record.tenant_id !== tenantId) {
            console.warn(`[Security] Blocked unauthorized cross-tenant employee: ${record.employee_name}`);
            return []; 
          }

          let parsedDescriptor = record.descriptor;
          if (typeof parsedDescriptor === 'string') {
            try { parsedDescriptor = JSON.parse(parsedDescriptor); }
            catch (e) { return []; }
          }
          if (!Array.isArray(parsedDescriptor)) return [];
          const isMultiAngle = Array.isArray(parsedDescriptor) && Array.isArray(parsedDescriptor[0]);
          const descriptors = isMultiAngle ? (parsedDescriptor as number[][]) : [parsedDescriptor as number[]];

          return descriptors
            .filter((desc: any) => Array.isArray(desc) && desc.length > 0)
            .map((desc: any, index: number) => ({
              id: `${record.id}-${index}`,
              user_id: record.employee_id,
              user_name: record.employee_name,
              embedding: desc,
              type: 'employee' as const
            }));
        });

        const safeVisitorRecords = (visitorRecords as any[]).filter((v: any) => 
          !v.tenant_id || v.tenant_id === tenantId
        );

        cachedEmbeddingsRef.current = [...flattenedEmbeddings, ...safeVisitorRecords];
      } catch (err) {
        console.error("Failed to load terminal data", err);
      } finally {
        setIsFetchingData(false);
      }
    }

    setIsVerifying(prev => {
      const nextState = !prev;
      isVerifyingRef.current = nextState;
      
      if (!nextState) {
        setResults([]);
        clearCanvas();
        setRecentPunches([]);
        isProcessingUnknownRef.current = false;
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      }
      return nextState;
    });
  };

  const getBannerConfig = (result: FaceVerificationResult) => {
    switch (result.status) {
      case 'authenticated':
      case 'recently_punched':
        return { text: `Success! ${result.match!.userName}`, color: 'bg-emerald-600/90 border-emerald-400', icon: <UserCheck className="w-5 h-5 md:w-6 md:h-6 text-white" /> };
      case 'unregistered':
        return { text: 'New visitor detected, registering...', color: 'bg-orange-600/90 border-orange-400', icon: <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 text-white" /> };
      default:
        return { text: 'Scanning face...', color: 'bg-slate-900/80 border-slate-700', icon: <Loader2 className="w-5 h-5 md:w-6 md:h-6 text-white animate-spin" /> };
    }
  };

  if (cameraError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 p-6">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center border border-slate-100">
          <div className="w-20 h-20 mx-auto mb-6 bg-red-50 rounded-2xl flex items-center justify-center">
            <UserX className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Camera Unavailable</h2>
          <p className="text-slate-500 leading-relaxed mb-6">{cameraError}</p>
          <p className="text-xs text-slate-400">Please check your camera permissions and try reloading the page.</p>
        </div>
      </div>
    );
  }

  const showBanner = isVerifying && primaryResult && primaryResult.status !== 'cooldown';
  const bannerConfig = primaryResult ? getBannerConfig(primaryResult) : null;

  return (
    <div className="w-full h-[calc(100vh-4rem)] md:h-[calc(100vh-5rem)] bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50/30 flex flex-col md:flex-row p-3 md:p-6 gap-3 md:gap-6 font-sans overflow-hidden">

      {/* ── Camera Viewfinder ── */}
      <div className="flex-1 min-h-0 flex flex-col rounded-2xl md:rounded-3xl overflow-hidden bg-slate-900 shadow-2xl ring-1 ring-white/10 relative">

        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline autoPlay muted />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />

        {/* Scanning indicator */}
        {isVerifying && (
          <div className="absolute top-4 left-4 md:top-6 md:left-6 z-20 flex flex-wrap gap-2 md:gap-3 pointer-events-none">
            <div className="bg-black/50 backdrop-blur-xl px-3 py-1.5 md:px-4 md:py-2 rounded-full text-white/90 text-xs md:text-sm font-medium flex items-center gap-2 border border-white/10 shadow-lg">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              Scanning
            </div>
          </div>
        )}

        {/* Status banner */}
        {showBanner && bannerConfig && (
          <div className="absolute top-20 left-2 flex justify-center z-30 pointer-events-none px-4">
            <div className={`flex items-start gap-3 md:gap-4 px-5 py-2.5 md:px-8 md:py-3 rounded-2xl border backdrop-blur-xl shadow-2xl transition-all duration-500 animate-fade-in-up ${bannerConfig.color} max-w-full`}>
              {bannerConfig.icon}
              <span className="text-white text-xs md:text-sm font-semibold tracking-wide truncate">{bannerConfig.text}</span>
            </div>
          </div>
        )}

        {/* Loading overlay */}
        {(!isReady || isFetchingData || (!isInitialized && isReady)) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-white z-40 backdrop-blur-xl p-6 text-center">
            <div className="relative mb-6">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border-4 border-blue-400/30 flex items-center justify-center">
                <Loader2 className="w-8 h-8 md:w-10 md:h-10 animate-spin text-blue-400" />
              </div>
            </div>
            <p className="text-lg md:text-xl font-semibold tracking-wide mb-1">
              {!isReady ? 'Initializing Camera…' : !isInitialized ? 'Loading Models…' : 'Loading Directory…'}
            </p>
            <p className="text-sm text-white/50">Please wait while we set things up</p>
          </div>
        )}

        {/* Idle watermark */}
        {!isVerifying && isReady && isInitialized && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-5 pointer-events-none">
            <div className="bg-black/40 backdrop-blur-md rounded-3xl px-8 py-6 flex flex-col items-center gap-3 border border-white/10">
              <ScanFace className="w-12 h-12 text-white/60" />
              <p className="text-white/70 text-sm font-medium">Press Start Scan to begin</p>
            </div>
          </div>
        )}

        {/* ── Recent Activity Overlay (top-right) ── */}
        {recentPunches.length > 0 && (
          <div className="absolute top-4 right-4 md:top-6 md:right-6 z-20 w-[280px] md:w-[320px] max-h-[60%] overflow-y-auto pointer-events-none space-y-2">
            {recentPunches.map(punch => {
              const isPending = punch.entry === 'PENDING';
              const isConfirmed = punch.entry === 'EXIT_CONFIRMED';
              const isDenied = punch.entry === 'EXIT_DENIED';
              const isProcessing = punch.entry === 'PROCESSING';
              const isIn = punch.entry === 'IN';

              const cardClass = isPending
                ? 'bg-amber-900/60 border-amber-400/30'
                : isConfirmed
                ? 'bg-emerald-900/60 border-emerald-400/30'
                : isDenied
                ? 'bg-red-900/60 border-red-400/30'
                : isProcessing
                ? 'bg-slate-900/60 border-white/10'
                : isIn
                ? 'bg-emerald-900/50 border-emerald-400/30'
                : 'bg-blue-900/50 border-blue-400/30';

              const iconClass = isPending
                ? 'bg-amber-400/20 text-amber-300'
                : isConfirmed
                ? 'bg-emerald-400/20 text-emerald-300'
                : isDenied
                ? 'bg-red-400/20 text-red-300'
                : isProcessing
                ? 'bg-white/10 text-white/70'
                : isIn
                ? 'bg-emerald-400/20 text-emerald-300'
                : 'bg-blue-400/20 text-blue-300';

              const subText = isPending
                ? 'Awaiting exit approval…'
                : isConfirmed
                ? `Exit Confirmed ✓ · Clocked out at ${(punch.outTime ?? punch.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : isDenied
                ? 'Exit Denied ⚠ · Visitor remains on premises'
                : isProcessing
                ? 'Verifying…'
                : `Clocked ${punch.entry} · ${punch.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

              const badge = isConfirmed ? '✓ OUT' : isDenied ? '✗ DENIED' : isPending ? '⏳' : punch.entry !== 'PROCESSING' ? punch.entry : null;

              return (
                <div
                  key={punch.id}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl backdrop-blur-xl border shadow-lg transition-all duration-300 animate-fade-in-up ${cardClass}`}
                >
                  <div className={`p-1.5 rounded-lg shrink-0 ${iconClass}`}>
                    {(isProcessing || isPending) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-xs text-white truncate">{punch.name}</p>
                    <p className={`text-[10px] font-medium ${
                      isDenied ? 'text-red-300/80' : isPending ? 'text-amber-300/80' : isConfirmed ? 'text-emerald-300/80' : isProcessing ? 'text-white/40' : isIn ? 'text-emerald-300/80' : 'text-blue-300/80'
                    }`}>{subText}</p>
                  </div>
                  {badge && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                      isConfirmed ? 'bg-emerald-400/20 text-emerald-300' :
                      isDenied ? 'bg-red-400/20 text-red-300' :
                      isPending ? 'bg-amber-400/20 text-amber-300' :
                      isIn ? 'bg-emerald-400/20 text-emerald-300' : 'bg-blue-400/20 text-blue-300'
                    }`}>{badge}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Side Panel ── */}
      <div className="w-full md:w-[340px] lg:w-1/2 max-h-[60vh] md:h-full shrink-0 flex flex-col bg-white rounded-2xl md:rounded-3xl shadow-xl ring-1 ring-slate-200/60 overflow-hidden">

        {/* Controls */}
        <div className="p-4 md:p-5 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-800 tracking-tight">Face Attendance Scanner</h2>
          </div>

          <button
            onClick={toggleVerification}
            disabled={!isReady || isFetchingData || !isInitialized}
            className={`w-full py-3 md:py-3.5 rounded-xl font-bold transition-all duration-200 flex items-center justify-center gap-2.5 shadow-lg text-sm md:text-base ${isVerifying
              ? 'bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white shadow-rose-500/25'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-600/25'
              } disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed active:scale-[0.98]`}
          >
            {isVerifying ? <><UserX className="w-4 h-4 md:w-5 md:h-5" /> Stop Scan</> : <><ShieldCheck className="w-4 h-4 md:w-5 md:h-5" /> Start Scan</>}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setShowVisitorPanel(v => !v); setShowExitRequestPanel(false); }}
              className={`py-2.5 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 border text-sm active:scale-[0.98] ${
                showVisitorPanel
                  ? 'bg-blue-600 text-white border-blue-600 shadow-blue-500/25 shadow-lg'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              Visitors
            </button>
            <button
              onClick={() => { setShowExitRequestPanel(v => !v); setShowVisitorPanel(false); }}
              className={`py-2.5 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 border text-sm active:scale-[0.98] ${
                showExitRequestPanel
                  ? 'bg-orange-500 text-white border-orange-500 shadow-orange-400/25 shadow-lg'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              <LogOut className="w-4 h-4" />
              Exit Req.
            </button>
          </div>
        </div>

        {/* Panel content */}
        {showVisitorPanel ? (
          <div className="flex-1 bg-white overflow-hidden flex flex-col">
            <VisitorQuickAddPanel onClose={() => setShowVisitorPanel(false)} />
          </div>
        ) : showExitRequestPanel ? (
          <div className="flex-1 bg-white overflow-hidden flex flex-col">
            <VisitorExitRequestPanel onClose={() => setShowExitRequestPanel(false)} />
          </div>
        ) : (
          <div className="hidden md:flex flex-1 flex-col items-center justify-center p-6 text-center bg-white">
            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
              <ScanFace className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-400 mb-1">Ready to scan</p>
            <p className="text-xs text-slate-300">Activity will overlay on the camera feed</p>
          </div>
        )}
      </div>

      <VisitorNotificationBar />

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};