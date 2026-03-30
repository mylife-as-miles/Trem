// Mocked FilePicker to show integration with new apiClient
import React, { useState } from 'react';
import { apiClient } from '../../api-client';

export const FilePicker = ({ projectId }: { projectId: string }) => {
    const [uploading, setUploading] = useState(false);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        setUploading(true);
        try {
            for (const file of e.target.files) {
                // Determine type (video, audio, image)
                let type = 'video';
                if (file.type.startsWith('audio/')) type = 'audio';
                if (file.type.startsWith('image/')) type = 'image';

                // Real Edge R2 upload flow! No more IndexedDB blob crashing.
                await apiClient.createAsset(projectId, file.name, type, file);
            }
            alert('Uploads complete! Start ingestion.');
        } catch (e) {
            console.error(e);
            alert('Upload failed');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div>
            <input type="file" multiple onChange={handleFileChange} disabled={uploading} />
            {uploading && <p>Uploading direct to R2...</p>}

            <button onClick={() => apiClient.startIngestion(projectId)} disabled={uploading}>
                Start Pipeline
            </button>
        </div>
    );
};
