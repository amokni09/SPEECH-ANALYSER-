
import React, { useState, useRef, FC } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { SpeechAnalysis } from './types';
import { BrainIcon, BoltIcon, ShieldCheckIcon } from './components/IconComponents';

const ScoreGauge: FC<{ score: number; label: string; Icon: FC<{ className?: string }> }> = ({ score, label, Icon }) => {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const scoreColor = score > 75 ? 'text-green-400' : score > 50 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="flex flex-col items-center space-y-2">
      <div className="relative flex items-center justify-center">
        <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} stroke="currentColor" strokeWidth="12" className="text-gray-700" />
          <circle
            cx="60"
            cy="60"
            r={radius}
            stroke="currentColor"
            strokeWidth="12"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={`${scoreColor} transition-all duration-1000 ease-out`}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className={`text-3xl font-bold ${scoreColor}`}>{score}</span>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <Icon className="w-5 h-5 text-gray-400" />
        <span className="text-sm font-medium text-gray-300">{label}</span>
      </div>
    </div>
  );
};

const App: FC = () => {
  const [analysis, setAnalysis] = useState<SpeechAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setAnalysis(null);
    setIsLoading(false);
    setError(null);
    setIsRecording(false);
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!['audio/mpeg', 'audio/wav', 'audio/x-wav'].includes(file.type)) {
        setError('Please upload an MP3 or WAV file.');
        return;
      }
      setIsLoading(true);
      setError(null);
      setAnalysis(null);

      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64String = (reader.result as string).split(',')[1];
          await analyzeAudio(base64String, file.type);
        } catch (e) {
          setError('Could not read the file. Please try again.');
          setIsLoading(false);
        }
      };
      reader.onerror = () => {
        setError('Failed to read the file.');
        setIsLoading(false);
      };
      reader.readAsDataURL(file);
      // Reset file input value to allow re-uploading the same file
      event.target.value = '';
    }
  };

  const analyzeAudio = async (base64String: string, mimeType: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const speechAnalysisSchema = {
          type: Type.OBJECT,
          properties: {
              confidence_score: { type: Type.NUMBER, description: "A score from 0-100 representing the speaker's confidence." },
              clarity_score: { type: Type.NUMBER, description: "A score from 0-100 for speech clarity." },
              fluency_score: { type: Type.NUMBER, description: "A score from 0-100 for speech fluency." },
              emotional_tone: { type: Type.STRING, description: "The dominant emotional tone, e.g., confident, anxious, monotone." },
              filler_words_detected: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of detected filler words." },
              average_pause_length_seconds: { type: Type.NUMBER, description: "Average length of pauses in seconds." },
              issues_detected: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of key issues found in the speech." },
              summary_feedback: { type: Type.STRING, description: "A concise summary of the feedback." },
              improvement_advice: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of actionable improvement suggestions." }
          },
          required: ['confidence_score', 'clarity_score', 'fluency_score', 'emotional_tone', 'filler_words_detected', 'average_pause_length_seconds', 'issues_detected', 'summary_feedback', 'improvement_advice']
      };

      const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ parts: [
            { text: `You are an AI speech analysis assistant. Analyze the provided audio. Identify signs of hesitation, lack of confidence, unclear expression, and emotional tone. Focus on voice tone, hesitation (fillers like “um”, “uh”, “like”, pauses), speech fluency, rhythm, clarity, and emotional delivery.` },
            { text: `Your response MUST be a single JSON object matching the provided schema. Do not include any other text, markdown, or explanations outside of the JSON object.` },
            { inlineData: { data: base64String, mimeType: mimeType }}
          ]}],
          config: {
              responseMimeType: "application/json",
              responseSchema: speechAnalysisSchema,
          }
      });

      const resultJson = response.text;
      const parsedResult: SpeechAnalysis = JSON.parse(resultJson);
      setAnalysis(parsedResult);
    } catch (e) {
      console.error(e);
      setError('An error occurred during analysis. The model may be unable to process this audio. Please try a different audio file.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleRecording = async () => {
    if (isRecording) {
      // Stop recording
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setIsRecording(true);
        setError(null);
        setAnalysis(null);
        audioChunksRef.current = [];
        
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        
        recorder.ondataavailable = (event) => {
          audioChunksRef.current.push(event.data);
        };

        recorder.onstop = async () => {
          setIsLoading(true);
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64String = (reader.result as string).split(',')[1];
            await analyzeAudio(base64String, 'audio/wav');
          };
          reader.readAsDataURL(audioBlob);
          stream.getTracks().forEach(track => track.stop()); // Release microphone
        };
        
        recorder.start();
      } catch (err) {
        console.error("Error accessing microphone:", err);
        setError("Microphone access denied. Please allow microphone permissions in your browser settings.");
        setIsRecording(false);
      }
    }
  };
  
  const renderInitialView = () => (
    <div className="text-center">
      <h1 className="text-4xl sm:text-5xl font-bold mb-4">Speech Analyser</h1>
      <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-8">
        Get instant feedback on your public speaking. Upload or record your speech to analyze your confidence, clarity, and fluency.
      </p>
      <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".mp3,.wav" />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg transition-colors w-full sm:w-auto text-lg flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          Upload Audio
        </button>
        <button
          onClick={handleToggleRecording}
          className={`font-bold py-3 px-6 rounded-lg transition-colors w-full sm:w-auto text-lg flex items-center justify-center gap-2 ${
            isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {isRecording ? (
             <>
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                </span>
                Stop Recording
             </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              Record Speech
            </>
          )}
        </button>
      </div>
    </div>
  );

  const renderAnalysis = () => analysis && (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-center mb-8">Your Speech Analysis</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">
          <ScoreGauge score={analysis.confidence_score} label="Confidence" Icon={ShieldCheckIcon} />
          <ScoreGauge score={analysis.clarity_score} label="Clarity" Icon={BrainIcon} />
          <ScoreGauge score={analysis.fluency_score} label="Fluency" Icon={BoltIcon} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-xl font-semibold mb-3">Summary</h3>
          <p className="text-gray-300">{analysis.summary_feedback}</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-xl font-semibold mb-3">Key Metrics</h3>
          <ul className="space-y-2 text-gray-300">
            <li><strong>Emotional Tone:</strong> <span className="font-medium text-indigo-400">{analysis.emotional_tone}</span></li>
            <li><strong>Avg. Pause Length:</strong> {analysis.average_pause_length_seconds}s</li>
            <li><strong>Filler Words:</strong> {analysis.filler_words_detected.length > 0 ? analysis.filler_words_detected.join(', ') : 'None detected'}</li>
          </ul>
        </div>
      </div>
      <div className="bg-gray-800 p-6 rounded-lg">
        <h3 className="text-xl font-semibold mb-3">Issues Detected</h3>
        <ul className="list-disc list-inside space-y-2 text-red-400">
          {analysis.issues_detected.map((issue, index) => <li key={index}>{issue}</li>)}
        </ul>
      </div>
      <div className="bg-gray-800 p-6 rounded-lg">
        <h3 className="text-xl font-semibold mb-3">Improvement Advice</h3>
        <ul className="list-decimal list-inside space-y-2 text-green-400">
          {analysis.improvement_advice.map((advice, index) => <li key={index}>{advice}</li>)}
        </ul>
      </div>
      <div className="text-center pt-4">
        <button onClick={resetState} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-colors text-lg">
          Analyze Another Speech
        </button>
      </div>
    </div>
  );
  
  const renderLoading = () => (
    <div className="text-center flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-400"></div>
        <p className="text-lg text-gray-300 mt-4">Analyzing your speech... This may take a moment.</p>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 font-sans">
      <div className="w-full max-w-4xl mx-auto">
        <main className="bg-gray-800/50 backdrop-blur-sm p-6 sm:p-10 rounded-2xl shadow-2xl border border-gray-700">
          {!isLoading && !analysis && renderInitialView()}
          {isLoading && renderLoading()}
          {!isLoading && analysis && renderAnalysis()}
          {error && <div className="text-red-400 text-center mt-4 bg-red-900/50 p-3 rounded-lg">{error}</div>}
        </main>
      </div>
    </div>
  );
};

export default App;