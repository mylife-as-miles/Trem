import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '50mb', // Increase limit for video uploads
        },
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const { file } = req.body;
    if (!file) {
        res.status(400).json({ error: 'No file provided' });
        return;
    }

    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `${uuidv4()}.mp4`);
    const outputPath = path.join(tempDir, `${uuidv4()}.mp3`);

    try {
        // Write base64 input to file
        // Handles "data:video/mp4;base64,..." header if present
        const base64Data = file.replace(/^data:.*,/, '');
        await fs.promises.writeFile(inputPath, Buffer.from(base64Data, 'base64'));

        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .noVideo()
                .audioCodec('libmp3lame')
                .on('end', resolve)
                .on('error', reject)
                .save(outputPath);
        });

        // Read output and return as base64
        const audioBuffer = await fs.promises.readFile(outputPath);
        const audioBase64 = `data:audio/mp3;base64,${audioBuffer.toString('base64')}`;

        res.status(200).json({ audio: audioBase64 });

    } catch (error) {
        console.error('Audio extraction error:', error);
        res.status(500).json({ error: error.message || 'Extraction failed' });
    } finally {
        // Cleanup temp files
        try {
            if (fs.existsSync(inputPath)) await fs.promises.unlink(inputPath);
            if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
        } catch (cleanupErr) {
            console.warn('Cleanup warning:', cleanupErr);
        }
    }
}
