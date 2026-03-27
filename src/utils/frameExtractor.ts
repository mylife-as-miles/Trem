/**
 * Frame Extraction Utility
 * Extracts keyframes from video using server-side FFmpeg
 */

export const extractFramesFromVideo = async (videoBlob: Blob, onLog?: (msg: string) => void): Promise<string[]> => {
    return new Promise(async (resolve, reject) => {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const frames: string[] = [];

        if (!ctx) return reject(new Error("Could not get canvas context"));

        const url = URL.createObjectURL(videoBlob);
        video.src = url;
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = "anonymous";

        // Wait for metadata to load to get duration/dimensions
        await new Promise((r) => { video.onloadedmetadata = r; });

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Rate: 1 frame per second (1 fps)
        const duration = video.duration;
        const fps = 1;
        const interval = 1 / fps;
        let currentTime = 0;

        const processFrame = async () => {
            if (currentTime >= duration) {
                // Done
                URL.revokeObjectURL(url);
                if (onLog) onLog(`Extracted ${frames.length} frames.`);
                resolve(frames);
                return;
            }

            // Seek
            video.currentTime = currentTime;

            // Wait for seek to complete
            await new Promise<void>((r) => {
                video.onseeked = () => r();
            });

            // Draw
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Compressing to JPEG 0.7 to save context size
            const base64 = canvas.toDataURL('image/jpeg', 0.7);
            frames.push(base64);

            // Next frame
            currentTime += interval;
            processFrame();
        };

        // Start processing
        processFrame();
    });
};

const blobToDataURL = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};
