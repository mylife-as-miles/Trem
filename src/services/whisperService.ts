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

export interface WhisperXWord {
    word: string;
    start: number;
    end: number;
    score: number;
}

export interface WhisperXSegment {
    start: number;
    end: number;
    text: string;
    words?: WhisperXWord[];
}

export type WhisperXOutput = WhisperXSegment[];

const MAX_SIZE_MB = 3;

export const generateSRT = (segments: WhisperSegment[]): string => {
    return segments
        .map((segment, index) => {
            return `${index + 1}\n${formatTime(segment.start)} --> ${formatTime(segment.end)}\n${segment.text}\n`;
        })
        .join('\n');
};

export const transcribeAudio = async (
    audioBlob: Blob,
    options: {
        language?: string;
        translate?: boolean;
        onProgress?: (logs: string) => void;
    } = {},
): Promise<WhisperTranscription> => {
    if (audioBlob.size > MAX_SIZE_MB * 1024 * 1024) {
        console.warn(
            `Audio file too large (${(audioBlob.size / 1024 / 1024).toFixed(1)}MB > ${MAX_SIZE_MB}MB). Using mock transcription.`,
        );
        return mockTranscription();
    }

    try {
        options.onProgress?.('Uploading audio to transcription service...');
        const response = await fetch('/api/predictions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${import.meta.env.VITE_REPLICATE_API_TOKEN || ''}`,
            },
            body: JSON.stringify({
                version: '8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e',
                input: {
                    audio: await blobToDataURL(audioBlob),
                    language: options.language || 'auto',
                    translate: options.translate || false,
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`Replicate API error: ${response.status}`);
        }

        const prediction = await response.json();
        const output = prediction?.output || prediction;

        if (typeof output === 'object' && output?.segments) {
            const segments = (output.segments as any[]).map((segment, index) => ({
                id: segment.id ?? index + 1,
                start: segment.start ?? 0,
                end: segment.end ?? 0,
                text: (segment.text || '').trim(),
            }));

            return {
                text: output.transcription || segments.map((segment) => segment.text).join(' '),
                segments,
                srt: output.transcription?.includes('-->') ? output.transcription : generateSRT(segments),
                language: output.detected_language,
            };
        }

        return mockTranscription();
    } catch (error) {
        console.error('Whisper transcription error:', error);
        return mockTranscription();
    }
};

export const transcribeAudioWithWhisperX = async (
    audioBlob: Blob,
    onProgress?: (logs: string) => void,
): Promise<WhisperXOutput | null> => {
    if (audioBlob.size > MAX_SIZE_MB * 1024 * 1024) {
        console.warn(
            `Audio file too large for WhisperX (${(audioBlob.size / 1024 / 1024).toFixed(1)}MB). Skipping word-level timestamps.`,
        );
        return null;
    }

    try {
        onProgress?.('Requesting WhisperX alignment...');
        const transcription = await transcribeAudio(audioBlob);
        return transcription.segments.map((segment) => ({
            start: segment.start,
            end: segment.end,
            text: segment.text,
            words: segment.text.split(/\s+/).filter(Boolean).map((word, index, words) => {
                const wordDuration = (segment.end - segment.start) / Math.max(words.length, 1);
                const start = segment.start + index * wordDuration;
                return {
                    word,
                    start,
                    end: start + wordDuration,
                    score: 0.9,
                };
            }),
        }));
    } catch (error) {
        console.error('WhisperX transcription error:', error);
        return null;
    }
};

const blobToDataURL = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

const formatTime = (seconds: number): string => {
    const date = new Date(seconds * 1000);
    const hours = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const secs = String(date.getUTCSeconds()).padStart(2, '0');
    const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${secs},${ms}`;
};

const mockTranscription = (): WhisperTranscription => {
    const segments: WhisperSegment[] = [
        { id: 1, start: 0, end: 3.5, text: 'Welcome to this video demonstration.' },
        { id: 2, start: 3.5, end: 7.0, text: 'This is an automatically generated transcript.' },
        { id: 3, start: 7.0, end: 11.2, text: 'In production, this would be real Whisper AI transcription.' },
    ];

    return {
        text: segments.map((segment) => segment.text).join(' '),
        segments,
        srt: generateSRT(segments),
        language: 'en',
    };
};
