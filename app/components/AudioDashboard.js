"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";

const encodeWAV = (audioBuffer) => {
	const numberOfChannels = audioBuffer.numberOfChannels;
	const sampleRate = audioBuffer.sampleRate;
	const format = 1;
	const bitDepth = 16;
	const bytesPerSample = bitDepth / 8;
	const numFrames = audioBuffer.length;

	const channels = [];
	for (let i = 0; i < numberOfChannels; i++) {
		channels.push(audioBuffer.getChannelData(i));
	}

	const buffer = new ArrayBuffer(
		44 + numFrames * numberOfChannels * bytesPerSample
	);
	const view = new DataView(buffer);

	const writeString = (offset, string) => {
		for (let i = 0; i < string.length; i++) {
			view.setUint8(offset + i, string.charCodeAt(i));
		}
	};

	const writeFloat = (offset, input) => {
		for (let i = 0; i < input.length; i++) {
			view.setInt16(
				offset + i * 2,
				input[i] < 0 ? input[i] * 0x8000 : input[i] * 0x7fff,
				true
			);
		}
	};

	writeString(0, "RIFF");
	view.setUint32(4, 36 + numFrames * numberOfChannels * bytesPerSample, true);
	writeString(8, "WAVE");
	writeString(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, format, true);
	view.setUint16(22, numberOfChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * numberOfChannels * bytesPerSample, true);
	view.setUint16(32, numberOfChannels * bytesPerSample, true);
	view.setUint16(34, bitDepth, true);
	writeString(36, "data");
	view.setUint32(40, numFrames * numberOfChannels * bytesPerSample, true);
	writeFloat(44, channels[0]);

	return new Uint8Array(buffer);
};

export default function AudioDashboard() {
	const containerRef = useRef(null);
	const wavesurferRef = useRef(null);
	const mediaRecorderRef = useRef(null);
	const audioContextRef = useRef(null);
	const analyserRef = useRef(null);
	const animationFrameRef = useRef(null);

	const [isRecording, setIsRecording] = useState(false);
	const [isPlaying, setIsPlaying] = useState(false);
	const [voiceAuthenticity, setVoiceAuthenticity] = useState(null);
	const [connectionStrength, setConnectionStrength] = useState(0);
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [analysisResult, setAnalysisResult] = useState(null);
	const [consoleLogs, setConsoleLogs] = useState([]);

	useEffect(() => {
		if (!containerRef.current) return;

		// Initialize WaveSurfer with glassmorphism styling
		wavesurferRef.current = WaveSurfer.create({
			container: containerRef.current,
			waveColor: "#a78bfa",
			progressColor: "#7c3aed",
			cursorColor: "#e9d5ff",
			barWidth: 2,
			barRadius: 3,
			barGap: 2,
			height: 80,
			autoplay: false,
		});

		wavesurferRef.current.on("play", () => setIsPlaying(true));
		wavesurferRef.current.on("pause", () => setIsPlaying(false));

		// Initialize AudioContext for real-time analysis
		const initAudioContext = async () => {
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					audio: true,
				});
				audioContextRef.current = new (window.AudioContext ||
					window.webkitAudioContext)();
				const source = audioContextRef.current.createMediaStreamSource(stream);

				analyserRef.current = audioContextRef.current.createAnalyser();
				analyserRef.current.fftSize = 256;
				source.connect(analyserRef.current);

				addLog("Microphone access granted");
				addLog("AudioContext initialized");
			} catch (error) {
				addLog(`Microphone error: ${error.message}`);
				console.error("Microphone error:", error);
			}
		};

		initAudioContext();

		return () => {
			if (wavesurferRef.current) {
				wavesurferRef.current.destroy();
			}
			if (audioContextRef.current) {
				audioContextRef.current.close();
			}
		};
	}, []);

	const addLog = (message) => {
		setConsoleLogs((prev) => [...prev.slice(-3), `• ${message}`]);
	};

	const updateWaveformWithFrequency = () => {
		if (!analyserRef.current) return;

		const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
		analyserRef.current.getByteFrequencyData(dataArray);

		// Calculate average frequency for connection strength
		const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
		setConnectionStrength(Math.min(100, average * 2));

		animationFrameRef.current = requestAnimationFrame(
			updateWaveformWithFrequency
		);
	};

	const startRecording = async () => {
		try {
			if (!analyserRef.current) {
				addLog("AudioContext not ready");
				return;
			}

			setIsRecording(true);
			setAnalysisResult(null);
			addLog("Recording started...");

			// Get the audio context's stream
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			mediaRecorderRef.current = new MediaRecorder(stream);
			const audioChunks = [];

			mediaRecorderRef.current.ondataavailable = (e) => {
				audioChunks.push(e.data);
			};

			mediaRecorderRef.current.onstop = async () => {
				const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
				addLog("Recording completed");

				// Load to waveform for visualization
				const url = URL.createObjectURL(audioBlob);
				wavesurferRef.current.load(url);

				// Analyze the audio
				await analyzeAudio(audioBlob);
			};

			mediaRecorderRef.current.start();
			updateWaveformWithFrequency();
		} catch (error) {
			addLog(`Recording error: ${error.message}`);
			console.error("Recording error:", error);
			setIsRecording(false);
		}
	};

	const stopRecording = () => {
		if (mediaRecorderRef.current && isRecording) {
			mediaRecorderRef.current.stop();
			setIsRecording(false);
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
			}
			addLog("Preparing analysis...");
		}
	};

	const analyzeAudio = async (audioBlob) => {
		setIsAnalyzing(true);
		addLog("Transcribing audio with Whisper...");

		try {
			const formData = new FormData();
			formData.append("audio", audioBlob);

			const response = await fetch("/api/voice-auth", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				throw new Error(`API error: ${response.status}`);
			}

			const result = await response.json();

			if (result.success) {
				setVoiceAuthenticity(result.confidence);
				setAnalysisResult(result);
				addLog(`📝 Transcribed: "${result.transcription.substring(0, 40)}..."`);
				addLog(
					`Voice: ${result.status === "real" ? "✓ Real" : "✗ AI Generated"}`
				);
				addLog(`💡 ${result.reasoning}`);
				addLog(`Confidence: ${result.confidence}%`);
			} else {
				addLog("Analysis failed");
			}
		} catch (error) {
			addLog(`Analysis error: ${error.message}`);
			console.error("Analysis error:", error);
		} finally {
			setIsAnalyzing(false);
		}
	};

	const togglePlayPause = () => {
		if (wavesurferRef.current) {
			wavesurferRef.current.playPause();
		}
	};

	const handleRecordButtonClick = () => {
		if (isRecording) {
			stopRecording();
		} else {
			startRecording();
		}
	};

	return (
		<div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
			{/* Main Glassmorphism Card */}
			<div className="w-full max-w-2xl">
				<div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 shadow-2xl hover:shadow-purple-500/20 transition-all duration-300">
					{/* Header */}
					<div className="mb-8">
						<h1 className="text-4xl font-bold bg-linear-to-r from-purple-300 via-pink-300 to-purple-300 bg-clip-text text-transparent mb-2">
							Audio Call
						</h1>
						<p className="text-purple-200/60 text-sm">
							{isRecording ? "Recording..." : "Ready to record"}
						</p>
					</div>

					{/* Waveform Container */}
					<div className="backdrop-blur-lg bg-black/30 border border-white/10 rounded-2xl p-6 mb-8 hover:border-white/20 transition-colors">
						<div ref={containerRef} className="w-full" />
					</div>

					{/* Controls */}
					<div className="flex gap-4 mb-8 justify-center">
						<button
							onClick={handleRecordButtonClick}
							disabled={isAnalyzing}
							className={`backdrop-blur-md ${
								isRecording
									? "bg-red-500/30 hover:bg-red-500/50 border-red-400/50"
									: "bg-purple-500/30 hover:bg-purple-500/50 border-purple-400/50"
							} border hover:border-opacity-100 text-white rounded-full p-4 transition-all duration-300 transform hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed`}
						>
							{isRecording ? (
								<svg
									className="w-6 h-6 animate-pulse"
									fill="currentColor"
									viewBox="0 0 20 20"
								>
									<rect x="6" y="4" width="2" height="12" />
									<rect x="12" y="4" width="2" height="12" />
								</svg>
							) : (
								<svg
									className="w-6 h-6"
									fill="currentColor"
									viewBox="0 0 20 20"
								>
									<circle cx="10" cy="10" r="7" />
								</svg>
							)}
						</button>
						<button
							onClick={togglePlayPause}
							disabled={isAnalyzing || !wavesurferRef.current}
							className="backdrop-blur-md bg-slate-500/30 hover:bg-slate-500/50 border border-slate-400/50 hover:border-slate-300 text-white rounded-full p-4 transition-all duration-300 transform hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{isPlaying ? (
								<svg
									className="w-6 h-6"
									fill="currentColor"
									viewBox="0 0 20 20"
								>
									<path d="M5.75 1.172A.5.5 0 005 1.65v16.7a.5.5 0 00.75.478l10.896-8.35a.5.5 0 000-.796L5.75 1.172z" />
								</svg>
							) : (
								<svg
									className="w-6 h-6"
									fill="currentColor"
									viewBox="0 0 20 20"
								>
									<path d="M5.5 3a.5.5 0 00-.5.5v13a.5.5 0 001 0V3.5a.5.5 0 00-.5-.5zm9 0a.5.5 0 00-.5.5v13a.5.5 0 001 0V3.5a.5.5 0 00-.5-.5z" />
								</svg>
							)}
						</button>
					</div>

					{/* Connection Strength */}
					<div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
						<div className="flex items-center justify-between mb-3">
							<p className="text-white/70 text-sm font-medium">
								Connection Strength
							</p>
							<svg
								className="w-4 h-4 text-green-400"
								fill="currentColor"
								viewBox="0 0 20 20"
							>
								<path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
							</svg>
						</div>
						<div className="w-full bg-white/10 rounded-full h-2">
							<div
								className="bg-linear-to-r from-green-400 to-emerald-400 h-2 rounded-full transition-all duration-500"
								style={{ width: `${connectionStrength}%` }}
							/>
						</div>
					</div>

					{/* Voice Authentication & Analysis Results */}
					<div className="grid grid-cols-2 gap-4 mb-8">
						<div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-6">
							<p className="text-white/70 text-sm mb-3">Voice Authentication</p>
							{voiceAuthenticity !== null ? (
								<div className="flex items-center gap-3">
									<div className="text-3xl font-bold text-purple-300">
										{voiceAuthenticity}%
									</div>
									<div className="flex gap-1">
										<div
											className={`w-2 h-2 rounded-full ${
												analysisResult?.status === "real"
													? "bg-green-400 animate-pulse"
													: "bg-red-400 animate-pulse"
											}`}
										/>
										<span
											className={`text-xs font-medium ${
												analysisResult?.status === "real"
													? "text-green-400"
													: "text-red-400"
											}`}
										>
											{analysisResult?.status === "real" ? "Real" : "Fake"}
										</span>
									</div>
								</div>
							) : (
								<p className="text-white/50 text-xs">No data yet</p>
							)}
						</div>

						{/* ChatGPT Analysis Results */}
						<div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-6">
							<p className="text-white/70 text-sm mb-3">ChatGPT Analysis</p>
							{analysisResult ? (
								<div className="space-y-2 text-xs">
									<p className="text-white/60">
										<span className="text-purple-300">
											{analysisResult.reasoning}
										</span>
									</p>
									{analysisResult.indicators && (
										<div className="mt-2 pt-2 border-t border-white/10">
											<p className="text-white/50 mb-1">Indicators:</p>
											<p className="text-white/60">
												• {analysisResult.indicators.natural_speech_patterns}
											</p>
										</div>
									)}
								</div>
							) : (
								<p className="text-white/50 text-xs">Pending analysis...</p>
							)}
						</div>
					</div>

					{/* Console Logs */}
					<div className="backdrop-blur-md bg-black/40 border border-white/10 rounded-xl p-4">
						<p className="text-white/50 text-xs font-mono mb-2">
							Console Logs:
						</p>
						<div className="space-y-1 min-h-16">
							{consoleLogs.length > 0 ? (
								consoleLogs.map((log, idx) => (
									<p key={idx} className="text-green-400/70 text-xs font-mono">
										{log}
									</p>
								))
							) : (
								<p className="text-green-400/70 text-xs font-mono">
									• Ready to record...
								</p>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
