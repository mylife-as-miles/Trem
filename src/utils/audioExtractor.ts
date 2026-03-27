/**
 * Audio Extraction Utility
 * Extracts audio track from video blob using Web Audio API
 */

// @ts-ignore
import lamejs from 'lamejs';

/**
 * Extracts audio from a video blob and converts it to WAV or MP3 format
 * @param videoBlob - The video file as a Blob
 * @returns Audio blob (WAV if small, MP3 if large)
 */

// Helper to encode AudioBuffer to WAV
const encodeWAV = (samples: Float32Array, sampleRate: number): Blob => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // file length
    view.setUint32(4, 36 + samples.length * 2, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw)
    view.setUint16(20, 1, true);
    // channel count (mono)
    view.setUint16(22, 1, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * 2, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, 2, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, samples.length * 2, true);

    // Write samples
    floatTo16BitPCM(view, 44, samples);

    return new Blob([view], { type: 'audio/wav' });
};

const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
};

const floatTo16BitPCM = (output: DataView, offset: number, input: Float32Array) => {
    for (let i = 0; i < input.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
};
// Helper to encode AudioBuffer to MP3
const encodeMP3 = (samples: Float32Array, sampleRate: number): Blob => {
    // Convert Float32 to Int16
    const buffer = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Initialize Encoder
    // Mono, SampleRate, 32kbps (sufficient for speech)
    // @ts-ignore
    const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 32);
    const mp3Data = [];

    // Encode in chunks
    const sampleBlockSize = 1152; // multiple of 576
    for (let i = 0; i < buffer.length; i += sampleBlockSize) {
        const sampleChunk = buffer.subarray(i, i + sampleBlockSize);
        const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }
    }

    // Flush
    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
    }

    return new Blob(mp3Data, { type: 'audio/mp3' });
};



export const extractAudioFromVideo = async (videoBlob: Blob, onLog?: (msg: string) => void): Promise<Blob> => {
    try {
        const arrayBuffer = await videoBlob.arrayBuffer();
        // @ts-ignore - Web Audio API types might be missing or conflict
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Decode
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Mix down to mono for efficiency
        const channelData = audioBuffer.getChannelData(0);
        const originalSampleRate = audioBuffer.sampleRate;

        // Downsample to 16kHz (Whisper's native rate) to reduce file size
        const TARGET_SAMPLE_RATE = 16000;
        let finalSamples: Float32Array;
        let finalSampleRate: number;

        if (originalSampleRate > TARGET_SAMPLE_RATE) {
            // Downsample using linear interpolation
            const ratio = originalSampleRate / TARGET_SAMPLE_RATE;
            const newLength = Math.floor(channelData.length / ratio);
            finalSamples = new Float32Array(newLength);

            for (let i = 0; i < newLength; i++) {
                const srcIndex = i * ratio;
                const srcIndexFloor = Math.floor(srcIndex);
                const srcIndexCeil = Math.min(srcIndexFloor + 1, channelData.length - 1);
                const t = srcIndex - srcIndexFloor;
                finalSamples[i] = channelData[srcIndexFloor] * (1 - t) + channelData[srcIndexCeil] * t;
            }
            finalSampleRate = TARGET_SAMPLE_RATE;
            const logMsg = `Audio downsampled: ${originalSampleRate}Hz → ${TARGET_SAMPLE_RATE}Hz (${(channelData.length * 2 / 1024 / 1024).toFixed(1)}MB → ${(finalSamples.length * 2 / 1024 / 1024).toFixed(1)}MB)`;
            console.log(logMsg);
            if (onLog) onLog(logMsg);
        } else {
            finalSamples = channelData;
            finalSampleRate = originalSampleRate;
        }

        // 1. Try WAV first
        const wavBlob = encodeWAV(finalSamples, finalSampleRate);
        const MB = 1024 * 1024;

        if (wavBlob.size < 3 * MB) {
            const logMsg = `[AudioExtractor] WAV size ${(wavBlob.size / MB).toFixed(2)}MB is within limit. Using WAV.`;
            console.log(logMsg);
            if (onLog) onLog(logMsg);
            return wavBlob;
        }

        const largeLog = `[AudioExtractor] WAV size ${(wavBlob.size / MB).toFixed(2)}MB too large. Encoding MP3...`;
        console.log(largeLog);
        if (onLog) onLog(largeLog);

        // 2. Fallback to MP3
        try {
            const mp3Blob = encodeMP3(finalSamples, finalSampleRate);
            const mp3Log = `[AudioExtractor] MP3 Encoded: ${(mp3Blob.size / MB).toFixed(2)}MB`;
            console.log(mp3Log);
            if (onLog) onLog(mp3Log);
            return mp3Blob;
        } catch (mp3Error) {
            console.warn("[AudioExtractor] MP3 encoding failed", mp3Error);
            if (onLog) onLog(`⚠️ MP3 encoding failed, using oversized WAV.`);
            return wavBlob;
        }

    } catch (error) {
        // EncodingError usually means no audio track found in the video
        if (String(error).includes('EncodingError') || String(error).includes('Unable to decode')) {
            const noAudioMsg = '[AudioExtractor] No audio track detected in video source.';
            console.log(noAudioMsg);
            if (onLog) onLog(`ℹ️ ${noAudioMsg}`);
            return null as any;
        }

        console.error('Audio extraction error (client-side):', error);
        if (onLog) onLog(`❌ Audio extraction error: ${String(error)}`);
        return null as any;
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

/**
 * Convert audio blob to base64 for API upload
 * @param audioBlob - The audio file as a Blob
 * @returns Base64 encoded string
 */
export const audioToBase64 = (audioBlob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
    });
};
