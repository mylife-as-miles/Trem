import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import type { ViewType } from '../store/useTremStore';
import { mountTremLandingScene } from './tremLandingScene';
import './tremLandingPage.css';

interface TremLandingPageProps {
    onNavigate: (view: ViewType | string) => void;
}

const CAPABILITIES = [
    {
        name: 'Prompt-to-edit passes',
        description: 'Turn a direction into a cut plan.',
        action: 'trem-edit' as const,
    },
    {
        name: 'Repository ingestion',
        description: 'Stage footage and references in one place.',
        action: 'create-repo' as const,
    },
    {
        name: 'Asset-first iteration',
        description: 'Pull media in before the first pass.',
        action: 'assets' as const,
    },
];

const STATS = [
    { value: '3', suffix: '', label: 'core workspaces' },
    { value: '12', suffix: '+', label: 'ready edit directions' },
    { value: '1', suffix: '', label: 'shared repo layer' },
];

const FOOTER_ACTIONS = [
    { label: 'Open Edit', meta: 'Prompt a revision', action: 'trem-edit' as const },
    { label: 'Open Create', meta: 'Start from zero', action: 'trem-create' as const },
    { label: 'Open Assets', meta: 'Review source media', action: 'assets' as const },
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

        const ctx = gsap.context(() => {
            gsap.to('.hero-discover', {
                y: 10,
                duration: 1.8,
                repeat: -1,
                yoyo: true,
                ease: 'sine.inOut',
            });

            gsap.utils.toArray<HTMLElement>('.landing-surface-card--float').forEach((card, index) => {
                gsap.to(card, {
                    y: index % 2 === 0 ? -8 : 8,
                    duration: 3.4 + index * 0.35,
                    repeat: -1,
                    yoyo: true,
                    ease: 'sine.inOut',
                });
            });
        }, pageRef);

        const fadeNodes = Array.from(pageRef.current.querySelectorAll<HTMLElement>('.fade-up'));
        fadeNodes.forEach((node) => {
            gsap.set(node, { opacity: 0, y: 30 });
        });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting && entry.target instanceof HTMLElement && !entry.target.dataset.revealed) {
                    entry.target.dataset.revealed = 'true';
                    gsap.to(entry.target, {
                        opacity: 1,
                        y: 0,
                        duration: 0.9,
                        ease: 'power3.out',
                    });
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15 });

        fadeNodes.forEach((node) => observer.observe(node));

        return () => {
            observer.disconnect();
            ctx.revert();
        };
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
                    <li><a href="#stats">Signal</a></li>
                    <li><a href="#footer">Footer</a></li>
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
                            Ingest footage, brief the change, and move from direction to timeline without leaving Trem.
                        </p>

                        <div className="hero-avatars fade-up">
                            <div className="avatar">ED</div>
                            <div className="avatar">AU</div>
                            <div className="avatar">FX</div>
                            <div className="avatar">CAM</div>
                            <span className="avatar-text">For editorial, motion, and social teams.</span>
                        </div>

                        <div className="hero-surface-group fade-up">
                            <div className="landing-surface-card landing-surface-card--float hero-surface-card">
                                <span className="surface-kicker">Live Workspaces</span>
                                <strong>Edit / Create / Assets</strong>
                            </div>
                            <div className="landing-surface-card landing-surface-card--float hero-surface-card">
                                <span className="surface-kicker">Working Rhythm</span>
                                <strong>Prompt. Review. Cut.</strong>
                            </div>
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
                            <div className="landing-surface-card stats-shell fade-up">
                                <p className="quote">
                                    Prompts matter. Context matters more.
                                </p>

                                <div className="stats-grid">
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

                                <div className="capability-strip">
                                    {CAPABILITIES.map((capability) => (
                                        <button
                                            key={capability.name}
                                            type="button"
                                            className="capability-chip"
                                            onClick={() => onNavigate(capability.action)}
                                        >
                                            <span className="chip-dot" />
                                            {capability.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <footer className="landing-footer" id="footer">
                    <div className="landing-surface-card footer-shell fade-up">
                        <div className="footer-lead">
                            <span className="surface-kicker">Trem</span>
                            <h2>Ready to cut?</h2>
                            <p>Choose a surface and keep moving.</p>
                        </div>

                        <div className="footer-actions">
                            {FOOTER_ACTIONS.map((action) => (
                                <button
                                    key={action.label}
                                    type="button"
                                    className="footer-action"
                                    onClick={() => onNavigate(action.action)}
                                >
                                    <span className="footer-action-title">{action.label}</span>
                                    <span className="footer-action-meta">{action.meta}</span>
                                </button>
                            ))}
                        </div>

                        <div className="footer-bottom">
                            <div className="footer-mark">
                                <span className="footer-mark-icon">T</span>
                                <span>Trem AI Agent Hub</span>
                            </div>
                            <div className="footer-links">
                                <a href="#hero">Top</a>
                                <a href="/trem-edit">Edit</a>
                                <a href="/trem-create">Create</a>
                            </div>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default TremLandingPage;
