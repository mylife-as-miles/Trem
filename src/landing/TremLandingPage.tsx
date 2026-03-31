import React, { useEffect, useRef, useState } from 'react';
import type { ViewType } from '../store/useTremStore';
import { mountTremLandingScene } from './tremLandingScene';
import './tremLandingPage.css';

interface TremLandingPageProps {
    onNavigate: (view: ViewType | string) => void;
}

const CAPABILITIES = [
    {
        name: 'Prompt-to-edit passes',
        description: 'Describe the revision once and let Trem turn it into a structured edit plan.',
        action: 'trem-edit' as const,
    },
    {
        name: 'Repository ingestion',
        description: 'Turn raw footage, stills, and audio into a working source repository in one flow.',
        action: 'create-repo' as const,
    },
    {
        name: 'Asset-first iteration',
        description: 'Attach source media, notes, and references before Trem starts cutting.',
        action: 'assets' as const,
    },
    {
        name: 'Create from scratch',
        description: 'Start with a fresh concept and move straight into Trem Create.',
        action: 'trem-create' as const,
    },
    {
        name: 'Review-ready timelines',
        description: 'Move from direction to timeline decisions without losing repository context.',
        action: 'trem-edit' as const,
    },
];

const STATS = [
    { value: '3', suffix: '', label: 'core workspaces across Edit, Create, and Assets' },
    { value: '12', suffix: '+', label: 'motion and revision directions ready to launch' },
    { value: '1', suffix: '', label: 'shared repo layer for footage, briefs, and output' },
];

const TremLandingPage: React.FC<TremLandingPageProps> = ({ onNavigate }) => {
    const pageRef = useRef<HTMLDivElement | null>(null);
    const sceneRootRef = useRef<HTMLDivElement | null>(null);
    const nightModeRef = useRef(false);
    const [isNight, setIsNight] = useState(false);

    useEffect(() => {
        nightModeRef.current = isNight;
    }, [isNight]);

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'auto' });
    }, []);

    useEffect(() => {
        if (!sceneRootRef.current) {
            return;
        }

        const cleanup = mountTremLandingScene(sceneRootRef.current, {
            getNightMode: () => nightModeRef.current,
        });

        return cleanup;
    }, []);

    useEffect(() => {
        if (!pageRef.current) {
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, { threshold: 0.15 });

        const fadeNodes = pageRef.current.querySelectorAll('.fade-up');
        fadeNodes.forEach((node) => observer.observe(node));

        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={pageRef}
            className={`trem-landing-page ${isNight ? 'is-night' : ''}`}
        >
            <div ref={sceneRootRef} className="landing-scene-root" aria-hidden="true" />

            <button
                type="button"
                className={`theme-toggle ${isNight ? 'night' : ''}`}
                id="themeToggle"
                title="Toggle day/night"
                onClick={() => setIsNight((current) => !current)}
            >
                <span className="theme-toggle-knob" id="themeKnob">{isNight ? 'N' : 'D'}</span>
            </button>

            <nav className="top-nav">
                <a className="nav-logo" href="#hero">
                    <span className="icon">T</span>
                    Trem
                </a>

                <ul className="nav-links">
                    <li><a href="#hero">Home</a></li>
                    <li><a href="#stats">About</a></li>
                    <li><a href="#services">Capabilities</a></li>
                </ul>

                <button
                    type="button"
                    className="nav-cta"
                    onClick={() => onNavigate('trem-edit')}
                >
                    Launch Trem
                </button>
            </nav>

            <div className="page-content">
                <section className="hero" id="hero">
                    <div className="hero-left">
                        <h1 className="fade-up">You shape the story.<br />Trem shapes the cut.</h1>

                        <button
                            type="button"
                            className="hero-cta fade-up"
                            onClick={() => onNavigate('trem-edit')}
                        >
                            <span className="cta-icon">&gt;</span>
                            <span className="cta-label">Open the edit workspace</span>
                        </button>

                        <p className="hero-desc fade-up">
                            Trem is an AI editing partner for creators, studios, and social teams. Ingest footage, build source repositories, direct revisions in plain language, and keep every pass anchored to real assets.
                        </p>

                        <div className="hero-avatars fade-up">
                            <div className="avatar">ED</div>
                            <div className="avatar">AU</div>
                            <div className="avatar">FX</div>
                            <div className="avatar">CAM</div>
                            <span className="avatar-text">Built for editors, motion teams, and content studios.</span>
                        </div>
                    </div>

                    <div className="hero-right" />

                    <div className="hero-discover">
                        <span className="discover-text">Discover more</span>
                        <a className="discover-arrow" href="#stats" aria-label="Discover more">v</a>
                    </div>
                </section>

                <section className="stats-section" id="stats">
                    <div className="stats-row">
                        <div className="stats-left" />

                        <div className="stats-right">
                            <p className="quote fade-up">
                                Most video AI tools understand prompts. Very few understand footage context, repository structure, and the way real edit notes evolve over time.
                            </p>

                            <div className="stats-grid fade-up">
                                {STATS.map((stat) => (
                                    <div key={stat.label} className="stat-item">
                                        <div className="stat-num">
                                            {stat.value}
                                            {stat.suffix && <sup>{stat.suffix}</sup>}
                                        </div>
                                        <div className="stat-label">{stat.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="services-section" id="services">
                    <div className="services-right">
                        <p className="section-quote fade-up">Direction should feel creative. Execution should feel inevitable.</p>
                        <p className="section-desc fade-up">
                            Trem keeps the product loop tight: source media in one place, edit intent in one surface, and clean handoffs between creative planning, repository prep, and execution.
                        </p>

                        <div className="service-list fade-up">
                            {CAPABILITIES.map((capability) => (
                                <button
                                    key={capability.name}
                                    type="button"
                                    className="service-item"
                                    onClick={() => onNavigate(capability.action)}
                                >
                                    <span className="svc-copy">
                                        <span className="svc-name">{capability.name}</span>
                                        <span className="svc-desc">{capability.description}</span>
                                    </span>
                                    <span className="svc-arrow">&gt;</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="services-left" />
                </section>
            </div>
        </div>
    );
};

export default TremLandingPage;
