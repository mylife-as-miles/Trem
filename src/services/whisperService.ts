/**
 * Whisper Transcription Service
 * Handles audio transcription using Replicate's Whisper API
 */

// Note: Replicate package needs to be installed: npm install replicate
// For now, we'll create a mock implementation that can be swapped with real API

export interface WhisperSegment {
    id: number;
    start: number;
    end: number;
    text: string;
}

export interface WhisperTranscription {
    text: string;
    segments: WhisperSegment[];
    srt: string;
    language?: string;
}

export interface WhisperAPIOutput {
    segments: {
        id: number;
        start: number;
        end: number;
        text: string;
        seek?: number;
        tokens?: number[];
        avg_logprob?: number;
        compression_ratio?: number;
        no_speech_prob?: number;
    }[];
    transcription: string;
    translation?: string | null;
    detected_language?: string;
}


/**
 * Transcribe audio using Replicate's Whisper API
 * @param audioBlob - Audio file to transcribe
 * @param options - Transcription options
 * @returns Transcription result with text, segments, and SRT
 */
export const transcribeAudio = async (
    audioBlob: Blob,
    options: {
        language?: string;
        translate?: boolean;
        onProgress?: (logs: string) => void;
    } = {}
): Promise<WhisperTranscription> => {
    try {
        // Check file size - Vercel has ~4.5MB payload limit, base64 adds 33% overhead
        // Limit to 3MB to be safe (will become ~4MB in base64)
        const MAX_SIZE_MB = 3;
        if (audioBlob.size > MAX_SIZE_MB * 1024 * 1024) {
            console.warn(`Audio file too large (${(audioBlob.size / 1024 / 1024).toFixed(1)}MB > ${MAX_SIZE_MB}MB limit). Using mock transcription.`);
            return mockTranscription();
        }

        // Convert blob to base64 data URL
        const base64Audio = await blobToDataURL(audioBlob);

        // Call API Proxy
        const response = await fetch('/api/predictions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${import.meta.env.VITE_REPLICATE_API_TOKEN}`,
            },
            body: JSON.stringify({
                version: '8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e',
                input: {
                    audio: base64Audio,
                    language: options.language || 'auto',
                    translate: options.translate || false,
                    temperature: 0,
                    transcription: 'srt',
                    suppress_tokens: '-1',
                    logprob_threshold: -1,
                    no_speech_threshold: 0.6,
                    condition_on_previous_text: true,
                    compression_ratio_threshold: 2.4,
                    temperature_increment_on_fallback: 0.2
                }
            })
        });

        // Read full response text ONCE to avoid "body stream already read" errors
        const responseText = await response.text();

        // 1. Check for HTTP errors
        if (!response.ok) {
            let errorDetails = {};
            const isHtml = responseText.trim().startsWith('<');

            if (isHtml) {
                console.warn('API returned HTML instead of JSON. Likely 404 or SPA fallback.', responseText.substring(0, 100));
                throw new Error('API Error: Endpoint not found. Are you running "vercel dev"? (Received HTML)');
            }

            try {
                errorDetails = JSON.parse(responseText);
            } catch {
                console.warn('API returned non-JSON error response:', responseText.substring(0, 100));
            }

            // Check if it's a configuration error from our API
            if (response.status === 500) {
                // @ts-ignore
                if (errorDetails.error === 'Server configuration error') {
                    console.error('CRITICAL: Missing REPLICATE_API_TOKEN in Vercel environment variables. Please check VERCEL_SETUP.md.');
                }
                console.warn('Server error. Using mock transcription as fallback.');
                return mockTranscription();
            }
            throw new Error(`Replicate API error: ${response.statusText}`);
        }

        // 2. Validate JSON Content-Type (optional but good practice)
        // If we got past !response.ok, check content-type to be sure
        const contentType = response.headers.get("content-type");
        if (contentType && !contentType.includes("application/json")) {
            const isHtml = responseText.trim().startsWith('<');
            if (isHtml) {
                throw new Error('API Error: Endpoint returned HTML. Are you running "vercel dev"?');
            }
            console.warn(`API returned unexpected content-type: ${contentType}. Likely SPA fallback or 404.`);
            console.warn('Response preview:', responseText.substring(0, 100));
            return mockTranscription();
        }

        // 3. Parse JSON safely
        let prediction;
        try {
            prediction = JSON.parse(responseText);
        } catch (e) {
            if (responseText.trim().startsWith('<')) {
                throw new Error('API Error: Endpoint returned HTML. Are you running "vercel dev"?');
            }
            console.warn('Failed to parse successful response as JSON:', responseText.substring(0, 100));
            return mockTranscription();
        }

        // 4. Poll for completion if needed (Replicate API always returns prediction object first)
        let output = prediction.output;
        if (prediction.id && (prediction.status === 'starting' || prediction.status === 'processing')) {
            output = await pollPrediction(prediction.id, options.onProgress);
        }

        // 5. Handle stringified JSON output (Replicate quirks)
        if (typeof output === 'string') {
            try {
                output = JSON.parse(output);
            } catch (e) {
                // It might actually be just a string (plain text transcription)
                // WhisperX usually implies JSON, but standard Whisper can be text.
                // We'll leave it as string if it fails to parse.
                // console.warn('Output is string but not JSON:', output);
            }
        }

        return parseWhisperOutput(output);

    } catch (error) {
        console.error('Whisper transcription error:', error);
        // Fallback to mock
        return mockTranscription();
    }
};

/**
 * Parse Whisper API output into structured format
 */
const parseWhisperOutput = (output: WhisperAPIOutput): WhisperTranscription => {
    // 1. Try to get native segments
    let segments: WhisperSegment[] = [];
    if (output.segments && Array.isArray(output.segments)) {
        segments = output.segments.map((s) => ({
            id: s.id,
            start: s.start,
            end: s.end,
            text: (s.text || "").trim()
        }));
    }

    // 2. Determine SRT
    // Use provided transcription if it looks like SRT, otherwise generate from segments
    let srt = output.transcription || "";
    const isSRT = srt.includes('-->');

    if (!isSRT && segments.length > 0) {
        srt = generateSRT(segments);
    }
    else if (isSRT && segments.length === 0) {
        // Fallback: Parse SRT if no segments provided
        segments = parseSRT(srt);
    }

    // 3. Construct full text
    // Prefer the 'transcription' field if it's plain text and not SRT
    let text = "";
    if (output.transcription && !isSRT) {
        text = output.transcription;
    } else {
        text = segments.map(s => s.text).join(' ');
    }

    return {
        text,
        segments,
        srt,
        language: output.detected_language
    };
};

/**
 * Generate SRT string from segments
 */
export const generateSRT = (segments: WhisperSegment[]): string => {
    return segments.map((seg, i) => {
        const start = formatTime(seg.start);
        const end = formatTime(seg.end);
        return `${i + 1}\n${start} --> ${end}\n${seg.text}\n\n`;
    }).join("");
};

/**
 * Format seconds to SRT timestamp (HH:MM:SS,ms)
 */
const formatTime = (seconds: number): string => {
    const date = new Date(seconds * 1000);
    const hh = String(Math.floor(seconds / 3600)).padStart(2, "0"); // Handle hours manually for >24h support safety
    const mm = String(date.getUTCMinutes()).padStart(2, "0");
    const ss = String(date.getUTCSeconds()).padStart(2, "0");
    const ms = String(date.getUTCMilliseconds()).padStart(3, "0");
    return `${hh}:${mm}:${ss},${ms}`;
};

/**
 * Parse SRT format into segments
 */
const parseSRT = (srt: string): WhisperSegment[] => {
    if (!srt) return [];

    const segments: WhisperSegment[] = [];
    const blocks = srt.trim().split(/\n\s*\n/); // Split by empty lines

    for (const block of blocks) {
        const lines = block.split('\n');
        if (lines.length < 3) continue;

        // Handle cases where ID might be merged or missing
        let timeLineIndex = 1;
        if (!lines[1].includes('-->')) {
            timeLineIndex = 0; // Maybe no ID
            if (!lines[0].includes('-->')) continue; // Invalid block
        }

        const id = timeLineIndex === 1 ? parseInt(lines[0]) : segments.length + 1;
        const timeParts = lines[timeLineIndex].split(' --> ');
        const start = srtTimeToSeconds(timeParts[0]);
        const end = srtTimeToSeconds(timeParts[1]);
        const text = lines.slice(timeLineIndex + 1).join('\n');

        segments.push({ id, start, end, text });
    }

    return segments;
};

/**
 * Convert SRT timestamp to seconds
 */
const srtTimeToSeconds = (timeStr: string): number => {
    if (!timeStr) return 0;
    const [hours, minutes, seconds] = timeStr.split(':');
    const [secs, millis] = seconds.split(',');
    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(secs) + parseInt(millis || '0') / 1000;
};

/**
 * Convert blob to data URL
 */
const blobToDataURL = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

/**
 * Mock transcription for testing without API
 */
const mockTranscription = (): WhisperTranscription => {
    const segments = [
        { id: 1, start: 0, end: 3.5, text: 'Welcome to this video demonstration.' },
        { id: 2, start: 3.5, end: 7.0, text: 'This is an automatically generated transcript.' },
        { id: 3, start: 7.0, end: 11.2, text: 'In production, this would be real Whisper AI transcription.' }
    ];

    return {
        text: 'Welcome to this video demonstration. This is an automatically generated transcript. In production, this would be real Whisper AI transcription.',
        segments,
        srt: generateSRT(segments),
        language: 'en'
    };
};

export interface WhisperXSegment {
    start: number;
    end: number;
    text: string;
    words?: {
        word: string;
        start: number;
        end: number;
        score: number;
    }[];
}

export type WhisperXOutput = WhisperXSegment[];

/**
 * Transcribe using WhisperX for word-level timestamps (Replicate)
 */
export const transcribeAudioWithWhisperX = async (
    audioBlob: Blob,
    onProgress?: (logs: string) => void
): Promise<WhisperXOutput | null> => {
    try {
        // Check file size - Vercel has ~4.5MB payload limit
        const MAX_SIZE_MB = 3;
        if (audioBlob.size > MAX_SIZE_MB * 1024 * 1024) {
            console.warn(`Audio file too large for WhisperX (${(audioBlob.size / 1024 / 1024).toFixed(1)}MB). Skipping word-level timestamps.`);
            return null;
        }

        const base64Audio = await blobToDataURL(audioBlob);

        const response = await fetch('/api/predictions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${import.meta.env.VITE_REPLICATE_API_TOKEN}`,
            },
            body: JSON.stringify({
                version: 'carnifexer/whisperx:1e0315854645f245d04ff09f5442778e97b8588243c7fe40c644806bde297e04',
                input: {
                    audio: base64Audio,
                    debug: true,
                    only_text: false,
                    align_output: true
                }
            })
        });

        if (!response.ok) {
            const responseText = await response.text();

            if (responseText.trim().startsWith('<')) {
                throw new Error('API Error: Endpoint returned HTML. Are you running "vercel dev"?');
            }

            console.error(`WhisperX Replicate error: ${response.statusText} - ${responseText}`);
            return null;
        }

        const responseText = await response.text();
        let prediction;
        try {
            prediction = JSON.parse(responseText);
        } catch (e) {
            if (responseText.trim().startsWith('<')) {
                throw new Error('API Error: Endpoint returned HTML. Are you running "vercel dev"?');
            }
            throw e;
        }

        // Poll if not complete
        let output = prediction.output;
        if (prediction.id && (prediction.status === 'starting' || prediction.status === 'processing')) {
            output = await pollPrediction(prediction.id, onProgress);
        }

        // Parse output if it's a string (WhisperX API sometimes returns stringified JSON)
        if (typeof output === 'string') {
            try {
                output = JSON.parse(output);
            } catch (e) {
                console.warn('Failed to parse WhisperX output string:', e);
            }
        }

        return output as WhisperXOutput;

    } catch (error) {
        console.error('WhisperX transcription error:', error);
        return null;
    }
};
async function pollPrediction(id: string, onProgress?: (logs: string) => void): Promise<any> {
    while (true) {
        const response = await fetch(`/api/predictions/${id}`, {
            headers: {
                'Authorization': `Bearer ${import.meta.env.VITE_REPLICATE_API_TOKEN}`,
                'Content-Type': 'application/json',
            }
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Polling failed: ${response.status} ${text}`);
        }

        const prediction = await response.json();

        // Stream logs if available
        if (onProgress && prediction.logs) {
            onProgress(prediction.logs);
        }

        if (prediction.status === 'succeeded') {
            return prediction.output;
        } else if (prediction.status === 'failed' || prediction.status === 'canceled') {
            throw new Error(`Prediction ${prediction.status}`);
        }

        // Wait 1s
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
};
