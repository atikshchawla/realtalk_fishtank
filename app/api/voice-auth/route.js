import { NextResponse } from "next/server";

// API endpoint for voice authentication using OpenAI
export async function POST(request) {
	console.log("\n" + "=".repeat(80));
	console.log("🎤 [VOICE AUTH] New request received");
	console.log("⏰ [VOICE AUTH] Timestamp:", new Date().toISOString());

	try {
		const formData = await request.formData();
		const audioFile = formData.get("audio");

		console.log("📦 [VOICE AUTH] FormData received");
		console.log(
			"🎵 [VOICE AUTH] Audio file:",
			audioFile ? "✓ Present" : "❌ Missing"
		);

		if (!audioFile) {
			console.error("❌ [VOICE AUTH] No audio file provided");
			return NextResponse.json(
				{ error: "No audio file provided" },
				{ status: 400 }
			);
		}

		// Convert the file to a buffer
		const buffer = await audioFile.arrayBuffer();
		const audioBuffer = Buffer.from(buffer);
		console.log(
			"💾 [VOICE AUTH] Audio buffer created, size:",
			audioBuffer.length,
			"bytes"
		);

		// Step 1: Transcribe audio with Whisper (includes sighs, pauses, etc)
		console.log("\n📝 [VOICE AUTH] Step 1: Starting Whisper transcription...");
		const transcription = await transcribeAudio(audioBuffer);

		if (!transcription.success) {
			console.error(
				"❌ [VOICE AUTH] Transcription failed:",
				transcription.error
			);
			return NextResponse.json(
				{ error: "Transcription failed", details: transcription.error },
				{ status: 400 }
			);
		}

		console.log(
			"✅ [VOICE AUTH] Transcription successful:",
			transcription.text
		);

		// For now, just return transcription without ChatGPT analysis
		console.log("✅ [VOICE AUTH] Transcription completed successfully");
		console.log("\n🎯 [VOICE AUTH] TRANSCRIPTION RESULT:");
		console.log(`   Text: "${transcription.text}"`);
		console.log(`   Length: ${transcription.text.length} characters`);
		console.log("=".repeat(80) + "\n");

		return NextResponse.json({
			success: true,
			transcription: transcription.text,
			// Temporary placeholder values for UI
			analysis: {
				is_real: true,
				confidence: 90,
				reasoning: "Transcription completed - analysis disabled for testing",
				indicators: {
					natural_speech_patterns: true,
					emotional_content: true,
					speech_flow: "natural",
					artifacts: [],
				},
			},
			confidence: 90,
			status: "transcribed",
			reasoning: "Transcription completed successfully",
		});
	} catch (error) {
		console.error("❌ [VOICE AUTH] Fatal error:", error.message);
		console.error("📋 [VOICE AUTH] Stack:", error.stack);
		console.log("=".repeat(80) + "\n");
		return NextResponse.json(
			{ error: "Internal server error", details: error.message },
			{ status: 500 }
		);
	}
}

// Step 1: Transcribe audio with Whisper
async function transcribeAudio(audioBuffer) {
	try {
		console.log("🌩️  [WHISPER API] Starting transcription...");

		// Verify API key exists
		if (!process.env.OPENAI_API_KEY) {
			console.error("❌ [WHISPER API] OPENAI_API_KEY not found in environment");
			return {
				success: false,
				error: "OPENAI_API_KEY not configured",
			};
		}

		console.log(
			"🔑 [WHISPER API] API key found, length:",
			process.env.OPENAI_API_KEY.length
		);
		console.log(
			"📊 [WHISPER API] Audio buffer size:",
			audioBuffer.length,
			"bytes"
		);

		// Create multipart form manually since Node.js FormData issues
		const boundary = `----formdata-${Date.now()}`;
		const CRLF = "\r\n";

		// Build multipart body manually
		let body = "";

		// Add model field
		body += `--${boundary}${CRLF}`;
		body += `Content-Disposition: form-data; name="model"${CRLF}${CRLF}`;
		body += `whisper-1${CRLF}`;

		// Add file field
		body += `--${boundary}${CRLF}`;
		body += `Content-Disposition: form-data; name="file"; filename="audio.wav"${CRLF}`;
		body += `Content-Type: audio/wav${CRLF}${CRLF}`;

		// Convert to buffer and combine
		const textBuffer = Buffer.from(body, "utf8");
		const endBuffer = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, "utf8");
		const finalBody = Buffer.concat([textBuffer, audioBuffer, endBuffer]);

		console.log("📨 [WHISPER API] Sending request to OpenAI...");
		console.log(
			"📍 [WHISPER API] Endpoint: https://api.openai.com/v1/audio/transcriptions"
		);
		console.log("🎯 [WHISPER API] Model: whisper-1");
		console.log(
			"📦 [WHISPER API] Manual multipart, size:",
			finalBody.length,
			"bytes"
		);

		// TEMPORARY: Mock transcription for testing UI (remove when credits added)
		console.log("🧪 [WHISPER API] Using mock transcription (quota exceeded)");

		// Simulate API delay
		await new Promise((resolve) => setTimeout(resolve, 1000));

		const mockText =
			"Hello world, this is a test transcription from the mock API";

		console.log("✅ [WHISPER API] Mock transcription successful");
		console.log(`📝 [WHISPER API] Mock Result: "${mockText}"`);

		return {
			success: true,
			text: mockText,
		};

		// REAL API CODE (uncomment when you have credits):
		/*
		const response = await fetch(
			"https://api.openai.com/v1/audio/transcriptions",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
					'Content-Type': `multipart/form-data; boundary=${boundary}`,
				},
				body: finalBody,
			}
		);

		console.log(`📡 [WHISPER API] Response status: ${response.status}`);

		if (!response.ok) {
			const error = await response.json();
			console.error("❌ [WHISPER API] API Error:", error);
			return {
				success: false,
				error: error.error?.message || "Transcription failed",
			};
		}

		const data = await response.json();
		console.log("✅ [WHISPER API] Transcription successful");
		console.log(`📝 [WHISPER API] Result: "${data.text}"`);

		return {
			success: true,
			text: data.text,
		};
		*/
	} catch (error) {
		console.error("❌ [WHISPER API] Error:", error.message);
		console.error("📋 [WHISPER API] Stack trace:", error.stack);
		return {
			success: false,
			error: error.message,
		};
	}
}
// Step 2: Analyze transcription with ChatGPT
async function analyzeWithChatGPT(transcription) {
	try {
		console.log("🤖 [CHATGPT API] Starting analysis...");
		console.log(`📝 [CHATGPT API] Transcription: "${transcription}"`);

		// Verify API key exists
		if (!process.env.OPENAI_API_KEY) {
			console.error("❌ [CHATGPT API] OPENAI_API_KEY not found in environment");
			return {
				success: false,
				error: "OPENAI_API_KEY not configured",
			};
		}

		console.log(
			"🔑 [CHATGPT API] API key found, length:",
			process.env.OPENAI_API_KEY.length
		);

		const prompt = `Analyze this transcribed voice and determine if it's a real human voice or AI-generated.

Transcription: "${transcription}"

Consider these indicators:
1. Natural hesitations (um, uh, ah)
2. Pauses and breathing sounds
3. Emotional variation in tone
4. Spontaneous speech patterns
5. Grammar imperfections
6. Natural self-corrections
7. Filler words and repetitions
8. Unnatural smoothness/perfection

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "is_real": true/false,
  "confidence": 0-100,
  "reasoning": "brief explanation",
  "indicators": {
    "natural_speech_patterns": true/false,
    "emotional_content": true/false,
    "speech_flow": "natural/unnatural/mixed",
    "artifacts": []
  }
}`;

		console.log("📨 [CHATGPT API] Sending request to OpenAI...");
		console.log("🎯 [CHATGPT API] Model: gpt-4-turbo, Temperature: 0.3");

		const response = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
			},
			body: JSON.stringify({
				model: "gpt-4-turbo",
				messages: [
					{
						role: "user",
						content: prompt,
					},
				],
				temperature: 0.3,
				max_tokens: 500,
			}),
		});

		console.log(`📡 [CHATGPT API] Response status: ${response.status}`);

		if (!response.ok) {
			const errorData = await response.json();
			console.error("❌ [CHATGPT API] API Error Response:", errorData);
			return {
				success: false,
				error: errorData.error?.message || "ChatGPT API call failed",
			};
		}

		const data = await response.json();
		console.log("✅ [CHATGPT API] Response received successfully");
		console.log(
			"📊 [CHATGPT API] Response data:",
			JSON.stringify(data, null, 2)
		);

		const content = data.choices[0].message.content;
		console.log("📄 [CHATGPT API] Raw content:", content);

		// Parse JSON from response
		const jsonMatch = content.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			console.error("❌ [CHATGPT API] Could not find JSON in response");
			console.error("📋 [CHATGPT API] Full response:", content);
			return {
				success: false,
				error: "Invalid JSON in ChatGPT response",
			};
		}

		const result = JSON.parse(jsonMatch[0]);
		console.log("✨ [CHATGPT API] Parsed result:", result);
		console.log(
			`🎯 [CHATGPT API] Final verdict: ${
				result.is_real ? "✓ REAL" : "✗ AI_GENERATED"
			} (Confidence: ${result.confidence}%)`
		);

		return {
			success: true,
			result: result,
		};
	} catch (error) {
		console.error("❌ [CHATGPT API] Error:", error.message);
		console.error("📋 [CHATGPT API] Stack trace:", error.stack);
		return {
			success: false,
			error: error.message,
		};
	}
}
