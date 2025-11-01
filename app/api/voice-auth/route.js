import { NextResponse } from "next/server";
import FormData from "form-data";

// API endpoint for voice authentication using OpenAI
export async function POST(request) {
	try {
		const formData = await request.formData();
		const audioFile = formData.get("audio");

		if (!audioFile) {
			return NextResponse.json(
				{ error: "No audio file provided" },
				{ status: 400 }
			);
		}

		// Convert the file to a buffer
		const buffer = await audioFile.arrayBuffer();
		const audioBuffer = Buffer.from(buffer);

		// Step 1: Transcribe audio with Whisper (includes sighs, pauses, etc)
		const transcription = await transcribeAudio(audioBuffer);

		if (!transcription.success) {
			return NextResponse.json(
				{ error: "Transcription failed", details: transcription.error },
				{ status: 400 }
			);
		}

		// Step 2: Send transcription to ChatGPT for authenticity analysis
		const analysis = await analyzeWithChatGPT(transcription.text);

		if (!analysis.success) {
			return NextResponse.json(
				{ error: "Analysis failed", details: analysis.error },
				{ status: 400 }
			);
		}

		return NextResponse.json({
			success: true,
			transcription: transcription.text,
			analysis: analysis.result,
			confidence: analysis.result.confidence,
			status: analysis.result.is_real ? "real" : "ai_generated",
			reasoning: analysis.result.reasoning,
			indicators: analysis.result.indicators,
		});
	} catch (error) {
		console.error("Voice auth error:", error);
		return NextResponse.json(
			{ error: "Internal server error", details: error.message },
			{ status: 500 }
		);
	}
}

// Step 1: Transcribe audio with Whisper
async function transcribeAudio(audioBuffer) {
	try {
		const openaiFormData = new FormData();
		openaiFormData.append("file", audioBuffer, {
			filename: "audio.wav",
			contentType: "audio/wav",
		});
		openaiFormData.append("model", "whisper-1");

		const response = await fetch(
			"https://api.openai.com/v1/audio/transcriptions",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
				},
				body: openaiFormData,
			}
		);

		if (!response.ok) {
			const error = await response.json();
			return {
				success: false,
				error: error.error?.message || "Transcription failed",
			};
		}

		const data = await response.json();
		return {
			success: true,
			text: data.text,
		};
	} catch (error) {
		return {
			success: false,
			error: error.message,
		};
	}
}
// Analyze audio for authenticity indicators
async function analyzeVoiceAuthenticity(audioBuffer) {
	try {
		// Send to OpenAI for analysis using GPT vision or analyze with Whisper confidence
		const audioContext = new (
			typeof window !== "undefined" ? window.AudioContext : global.AudioContext
		)();

		// Decode audio data
		const audioData = await audioContext.decodeAudioData(audioBuffer);
		const channelData = audioData.getChannelData(0);

		// Calculate various metrics
		const metrics = {
			// Frequency domain analysis
			frequency_analysis: analyzeFrequencyContent(channelData),
			// Check for AI artifacts
			artifacts: detectAIArtifacts(channelData),
			// Natural speech characteristics
			natural_speech_score: calculateNaturalSpeechScore(channelData),
			// Emotional content detection
			emotional_score: calculateEmotionalScore(channelData),
		};

		// Determine if voice is real based on metrics
		const realness_score = calculateRealnessScore(metrics);

		return {
			is_real: realness_score > 60,
			realness_score: Math.round(realness_score),
			...metrics,
		};
	} catch (error) {
		console.error("Authenticity analysis error:", error);
		// Return default values if analysis fails
		return {
			is_real: false,
			realness_score: 50,
			frequency_analysis: "unknown",
			artifacts: [],
			natural_speech_score: 50,
			emotional_score: 0,
		};
	}
}

// Analyze frequency content
function analyzeFrequencyContent(channelData) {
	const mean = channelData.reduce((a, b) => a + b) / channelData.length;
	const variance =
		channelData.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) /
		channelData.length;
	const stdDev = Math.sqrt(variance);

	// Natural speech typically has moderate variance
	if (stdDev > 0.1 && stdDev < 0.3) {
		return "natural";
	} else if (stdDev > 0.3) {
		return "high_variation";
	} else {
		return "low_variation";
	}
}

// Detect AI artifacts in audio
function detectAIArtifacts(channelData) {
	const artifacts = [];

	// Check for repetitive patterns (common in AI-generated speech)
	const sections = [];
	for (let i = 0; i < channelData.length; i += 1000) {
		const section = channelData.slice(i, i + 1000);
		const energy = Math.sqrt(
			section.reduce((sum, val) => sum + val * val, 0) / section.length
		);
		sections.push(energy);
	}

	// Calculate variance of energy sections
	const meanEnergy = sections.reduce((a, b) => a + b) / sections.length;
	const energyVariance =
		sections.reduce((sq, n) => sq + Math.pow(n - meanEnergy, 2), 0) /
		sections.length;

	if (energyVariance < 0.001) {
		artifacts.push("repetitive_energy_pattern");
	}

	// Check for unnatural silence patterns
	let silenceCount = 0;
	for (let i = 0; i < channelData.length; i++) {
		if (Math.abs(channelData[i]) < 0.01) {
			silenceCount++;
		}
	}
	const silenceRatio = silenceCount / channelData.length;
	if (silenceRatio > 0.4) {
		artifacts.push("excessive_silence");
	}

	return artifacts;
}

// Calculate natural speech score
function calculateNaturalSpeechScore(channelData) {
	// Check for smooth amplitude transitions (natural speech has gradual changes)
	let transitionScore = 0;
	for (let i = 1; i < Math.min(1000, channelData.length); i++) {
		const diff = Math.abs(channelData[i] - channelData[i - 1]);
		if (diff < 0.05) {
			transitionScore++;
		}
	}
	const smoothness =
		(transitionScore / Math.min(999, channelData.length)) * 100;

	// Natural speech typically has 70-90% smooth transitions
	return Math.max(0, Math.min(100, smoothness * 1.2));
}

// Calculate emotional content score
function calculateEmotionalScore(channelData) {
	// Simple heuristic: variation in amplitude indicates emotional content
	const max = Math.max(...channelData);
	const min = Math.min(...channelData);
	const range = max - min;

	// Natural speech has moderate range with emotion
	if (range > 0.3 && range < 0.8) {
		return 75;
	} else if (range > 0.1) {
		return 50;
	} else {
		return 25;
	}
}

// Calculate overall realness score
function calculateRealnessScore(metrics) {
	let score = 50; // Base score

	// Adjust based on frequency analysis
	if (metrics.frequency_analysis === "natural") {
		score += 20;
	} else if (metrics.frequency_analysis === "low_variation") {
		score -= 15;
	}

	// Adjust based on artifacts
	score -= metrics.artifacts.length * 10;

	// Adjust based on natural speech score
	score += (metrics.natural_speech_score - 50) * 0.3;

	// Adjust based on emotional content
	if (metrics.emotional_score > 60) {
		score += 10;
	}

	return Math.max(0, Math.min(100, score));
}
