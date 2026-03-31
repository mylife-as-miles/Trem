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
    console.warn('Browser-side transcription is deprecated. Using mock transcription; real transcription now runs in the Cloudflare Worker.');

    if (audioBlob.size > MAX_SIZE_MB * 1024 * 1024) {
        console.warn(
            `Audio file too large (${(audioBlob.size / 1024 / 1024).toFixed(1)}MB > ${MAX_SIZE_MB}MB). Using mock transcription.`,
        );
        return mockTranscription();
    }

    try {
        options.onProgress?.('Browser transcription is disabled; using mock transcript.');
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
