import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, Check, AlertCircle, RefreshCw, User, ShieldCheck, FlipHorizontal, Timer } from 'lucide-react';
import { databaseService } from '../../../lib/faceDetectionServices/faceDetectionDatabase';
import { faceApiService } from '../../../lib/faceDetectionServices/faceApiService';
import { similarityService } from '../../../lib/faceDetectionServices/similarity';
import { useAuth } from '../../../contexts/AuthContext';

interface FaceRecognitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName?: string;
  mode: 'enroll' | 'verify';
  onSuccess: (employeeId?: string) => void;
}

export default function FaceRecognitionModal({
  isOpen, onClose, employeeId, employeeName, mode, onSuccess
}: FaceRecognitionModalProps) {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [processingFace, setProcessingFace] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean; message: string; confidence?: number; isCooldown?: boolean;
  } | null>(null);
  const [hasEnrolled, setHasEnrolled] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setVerificationResult(null);
      setProcessingFace(false);
    } else {
      stopCamera();
    }
  }, [isOpen, employeeId]);

  useEffect(() => {
    if (!isOpen) return;

    const initialize = async () => {
      try {
        setLoading(true);
        setError(null);
        await faceApiService.initialize();

        if (employeeId) {
          const faceData = await databaseService.getEmployeeFaceData(employeeId);
          const userData = Array.isArray(faceData) ? faceData[0] : faceData;
          setHasEnrolled(!!(userData && userData.face_descriptor));

          if (mode === 'verify' && !userData?.face_descriptor) {
            setError('No face data found. Please enroll first.');
          }
        }
        setLoading(false);
      } catch (err) {
        setError('Engine failed to initialize.');
        setLoading(false);
      }
    };
    initialize();
    return () => stopCamera();
  }, [isOpen, employeeId, mode]);

  useEffect(() => {
    if (isOpen && !loading) startCamera();
  }, [isOpen, loading, facingMode]);

  const startCamera = async () => {
    stopCamera(); 
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 }, 
          facingMode: facingMode 
        },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
      }
    } catch (err) {
      setError('Camera access denied. Check browser permissions.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const toggleCamera = () => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  const handleProcess = async () => {
    if (!videoRef.current || !cameraActive) return;
    
    try {
      setProcessingFace(true);
      setError(null);
      setVerificationResult(null);

      // --- BIOMETRIC COOLDOWN CHECK ---
      if (mode === 'verify') {
        const settings = await databaseService.getCompanySettings(tenantId);
        const cooldownMinutes = settings?.biometric_cooldown_minutes ?? 5; 

        if (cooldownMinutes > 0) {
          const lastPunch = await databaseService.getLastAttendance(employeeId);
          const punchTimeStr = lastPunch?.timestamp || lastPunch?.created_at;
          
          if (punchTimeStr) {
            const lastPunchTime = new Date(punchTimeStr).getTime();
            const now = new Date().getTime();
            const diffMinutes = (now - lastPunchTime) / (1000 * 60);

            if (diffMinutes < cooldownMinutes) {
              const remaining = Math.ceil(cooldownMinutes - diffMinutes);
              setVerificationResult({
                success: false,
                isCooldown: true,
                message: `Wait ${remaining} min${remaining > 1 ? 's' : ''}`
              });
              setProcessingFace(false);
              return; 
            }
          }
        }
      }

      // Capture the face embedding
      const embedding = await faceApiService.getEmbedding(videoRef.current);
      await new Promise(resolve => setTimeout(resolve, 1200)); // Artificial delay for scan effect

      if (!embedding) {
        setError('Face not detected. Look directly at the camera.');
        setProcessingFace(false);
        return;
      }

      // Capture the image as base64 for both enroll and verify
      const videoWidth = videoRef.current.videoWidth || 320;
      const videoHeight = videoRef.current.videoHeight || 240;
      
      const MAX_SIZE = 400;
      let scale = 1;
      if (videoWidth > videoHeight) {
          scale = MAX_SIZE / videoWidth;
      } else {
          scale = MAX_SIZE / videoHeight;
      }
      
      const targetWidth = videoWidth * scale;
      const targetHeight = videoHeight * scale;

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (facingMode === 'user') {
          // Un-mirror the captured image if using the front camera
          ctx.translate(targetWidth, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(videoRef.current, 0, 0, targetWidth, targetHeight);
      }
      
      const base64 = canvas.toDataURL('image/jpeg', 0.6);

      if (mode === 'enroll') {
        const success = await databaseService.saveEmployeeFaceData(employeeId, embedding, base64, tenantId);
        if (success) {
          setVerificationResult({ success: true, message: 'Scan Complete!' });
          setTimeout(() => { onSuccess(employeeId, base64); onClose(); }, 1500);
        }
      } else {
        const faceData = await databaseService.getEmployeeFaceData(employeeId);
        const userData = Array.isArray(faceData) ? faceData[0] : faceData;
        const storedEmbRaw = JSON.parse(userData.face_descriptor);
        const storedEmbedding = Array.isArray(storedEmbRaw[0]) ? storedEmbRaw[0] : storedEmbRaw;

        const similarity = similarityService.cosineSimilarity(embedding, storedEmbedding);
        if (similarityService.isMatch(similarity)) {
          setVerificationResult({ success: true, message: 'Identity Verified!', confidence: similarity * 100 });
          setTimeout(() => { onSuccess(employeeId, base64); onClose(); }, 1500);
        } else {
          setVerificationResult({ success: false, message: 'Verification Failed' });
        }
      }
    } catch (err) {
      setError('Processing Error.');
    } finally {
      setProcessingFace(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-center items-center bg-slate-950/95 backdrop-blur-md sm:p-6 transition-all">
      
      {/* Container: Centered Card on all devices */}
      <div className="relative flex flex-col w-[92%] sm:w-full max-h-[95dvh] sm:max-h-none sm:h-auto bg-white shadow-2xl overflow-hidden rounded-[32px] sm:rounded-[36px] max-w-[440px] animate-in fade-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 sm:px-6 sm:py-5 border-b border-slate-100 shrink-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 rounded-xl">
              <ShieldCheck className="text-indigo-600" size={22} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                {mode === 'enroll' ? 'Biometric Scan' : 'Face Verification'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5 truncate max-w-[200px]">
                {employeeName || 'Confirm your identity'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 transition-all rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 active:scale-90">
            <X size={22} strokeWidth={2.5} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col p-4 sm:p-6 overflow-y-auto bg-slate-50/50 shrink-0">
          {error && (
            <div className="flex items-center p-3 mb-4 text-sm font-medium text-red-600 bg-red-50 rounded-xl border border-red-100 animate-in shake duration-300 shrink-0">
              <AlertCircle className="shrink-0 mr-3" size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Camera Container */}
          <div className="relative w-full aspect-[3/4] sm:aspect-[4/5] bg-slate-950 rounded-[24px] sm:rounded-[32px] overflow-hidden shadow-xl sm:shadow-2xl border-4 sm:border-[8px] border-white isolate shrink-0 mx-auto">
            {loading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900">
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 mb-4 sm:mb-6">
                  <div className="absolute inset-0 rounded-full border-[2px] sm:border-[3px] border-indigo-500/20"></div>
                  <div className="absolute inset-0 rounded-full border-[2px] sm:border-[3px] border-indigo-500 border-t-transparent animate-spin"></div>
                  <div className="absolute inset-2 rounded-full border-[2px] sm:border-[3px] border-cyan-400/20"></div>
                  <div className="absolute inset-2 rounded-full border-[2px] sm:border-[3px] border-cyan-400 border-b-transparent animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <User className="text-white w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
                  </div>
                </div>
                <div className="flex flex-col items-center space-y-2">
                  <p className="text-indigo-400 font-bold tracking-[0.2em] text-[10px] sm:text-xs uppercase animate-pulse">Initializing System</p>
                  <div className="flex space-x-1">
                    <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${processingFace ? 'opacity-50' : 'opacity-100'} ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} 
                />

                {/* CYBER SCAN LASER */}
                {processingFace && !verificationResult && (
                  <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
                    <div className="absolute w-full h-[3px] bg-indigo-400 shadow-[0_0_24px_6px_rgba(99,102,241,1)] animate-scan-fast"></div>
                    <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/20 to-transparent h-1/2 animate-scan-glow"></div>
                  </div>
                )}

                {/* Floating Switch Camera Button */}
                {!processingFace && !verificationResult && (
                  <button 
                    onClick={toggleCamera}
                    className="absolute bottom-5 right-5 z-30 p-3 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full text-white transition-all active:scale-90 border border-white/20 shadow-xl"
                  >
                    <FlipHorizontal size={20} />
                  </button>
                )}
              </>
            )}

            {/* Success / Failure / Cooldown Overlay */}
            {verificationResult && (
              <div className={`absolute inset-0 z-40 flex flex-col items-center justify-center p-6 text-center backdrop-blur-md animate-in zoom-in duration-300
                ${verificationResult.success ? 'bg-emerald-500/90' : 
                  verificationResult.isCooldown ? 'bg-amber-500/90' : 'bg-rose-500/90'}`}>
                
                <div className="bg-white/20 p-4 rounded-full mb-4 shadow-inner">
                  {verificationResult.success ? (
                    <Check className="text-white" size={48} strokeWidth={3} />
                  ) : verificationResult.isCooldown ? (
                    <Timer className="text-white animate-pulse" size={48} strokeWidth={3} />
                  ) : (
                    <X className="text-white" size={48} strokeWidth={3} />
                  )}
                </div>
                
                <p className="text-xl sm:text-2xl font-bold text-white drop-shadow-md leading-tight">
                  {verificationResult.message}
                </p>
                
                {verificationResult.isCooldown && (
                   <p className="text-xs sm:text-sm font-semibold text-white/90 mt-3 bg-black/20 px-4 py-1.5 rounded-full">
                     Cooldown Active
                   </p>
                )}
              </div>
            )}
          </div>
          
          {/* Subtle helper text */}
          <p className="mt-4 sm:mt-5 text-center text-xs sm:text-sm font-medium text-slate-500 px-4 shrink-0">
            {processingFace ? 'Decoding facial geometry...' : 'Position face within frame'}
          </p>
        </div>

        {/* Bottom Action Button */}
        <div className="p-4 sm:p-6 border-t border-slate-100 bg-white shrink-0 z-10">
          <button
            onClick={handleProcess}
            disabled={loading || !cameraActive || processingFace || !!verificationResult?.success || !!verificationResult?.isCooldown}
            className={`group flex items-center justify-center w-full py-3.5 sm:py-4 text-base sm:text-lg font-semibold text-white transition-all rounded-2xl shadow-md active:scale-[0.98] disabled:opacity-50 disabled:grayscale disabled:scale-100
              ${mode === 'enroll' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-900 hover:bg-slate-800'}`}
          >
            {processingFace ? (
              <RefreshCw className="mr-2 animate-spin" size={20} />
            ) : (
              mode === 'enroll' ? <User className="mr-2" size={20} /> : <Camera className="mr-2" size={20} />
            )}
            <span>
              {processingFace ? 'Scanning...' : (mode === 'enroll' ? (hasEnrolled ? 'Recapture' : 'Enroll Now') : 'Verify Face')}
            </span>
          </button>
        </div>
      </div>

      {/* Custom Tailwind Animations for Laser Scan Effect */}
      <style>{`
        @keyframes scanFast {
          0% { top: -5%; }
          100% { top: 105%; }
        }
        @keyframes scanGlow {
          0% { top: -35%; opacity: 0; }
          50% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .animate-scan-fast {
          animation: scanFast 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .animate-scan-glow {
          animation: scanGlow 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
}