import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '50mb',
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
    const id = uuidv4();
    const inputPath = path.join(tempDir, `${id}.mp4`);
    const outputPattern = path.join(tempDir, `${id}-%d.jpg`);

    try {
        const base64Data = file.replace(/^data:.*,/, '');
        await fs.promises.writeFile(inputPath, Buffer.from(base64Data, 'base64'));

        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                // Extract 1 frame every 1 second (1 fps)
                // User requested 10-20 frames for 10s video -> 1-2 fps
                .outputOptions(['-vf', 'fps=1'])
                .on('end', resolve)
                .on('error', reject)
                .save(outputPattern);
        });

        // Read all generated frame files
        const files = await fs.promises.readdir(tempDir);
        const frameFiles = files.filter(f => f.startsWith(`${id}-`) && f.endsWith('.jpg'));

        // Sort numerically to maintain order
        frameFiles.sort((a, b) => {
            const numA = parseInt(a.replace(`${id}-`, '').replace('.jpg', ''));
            const numB = parseInt(b.replace(`${id}-`, '').replace('.jpg', ''));
            return numA - numB;
        });

        const frames = [];
        for (const frameFile of frameFiles) {
            const framePath = path.join(tempDir, frameFile);
            const buffer = await fs.promises.readFile(framePath);
            frames.push(`data:image/jpeg;base64,${buffer.toString('base64')}`);
            // Cleanup individual frame
            await fs.promises.unlink(framePath);
        }

        res.status(200).json({ frames });

    } catch (error) {
        console.error('Frame extraction error:', error);
        res.status(500).json({ error: error.message || 'Extraction failed' });
    } finally {
        try {
            if (fs.existsSync(inputPath)) await fs.promises.unlink(inputPath);
        } catch (cleanupErr) {
            console.warn('Cleanup warning:', cleanupErr);
        }
    }
}
