import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, useVideoConfig } from 'remotion';

export const MyVideo: React.FC<{ title?: string }> = ({ title = "Trem AI Project" }) => {
    const frame = useCurrentFrame();
    const { fps, durationInFrames } = useVideoConfig(); // durationInFrames comes from Player prop

    const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
    const scale = interpolate(frame, [0, 30], [0.8, 1], { extrapolateRight: 'clamp' });

    return (
        <AbsoluteFill className="bg-slate-900 flex items-center justify-center">
            <div
                style={{ opacity, transform: `scale(${scale})` }}
                className="text-center"
            >
                <h1 className="text-8xl font-bold text-white mb-4 tracking-tighter">
                    {title}
                </h1>
                <p className="text-2xl text-emerald-400 font-mono">
                    Frame: {frame} / {Math.floor(frame / fps)}s
                </p>
            </div>
        </AbsoluteFill>
    );
};
