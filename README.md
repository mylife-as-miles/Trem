# Trem-AI: The Cognitive Video Engine 🧠🎥

> **Transform raw footage into structured, searchable, and editable narratives using the power of Multimodal AI.**

Trem-AI is an advanced **Video Repository & Production Agent** designed to bridge the gap between raw media assets and finished content. By leveraging **Google Gemini 3.0** and **On-Device Processing**, it turns a folder of unrelated video clips into a semantic knowledge base, ready for programmatic editing via **Remotion**.

---

## 🚀 Key Capabilities

### 1. **Intelligent Ingestion Pipeline**
The ingestion engine is the heart of Trem-AI, capable of processing hours of footage with semantic understanding.
- **Micro-Service Architecture in the Browser**: Uses Web Workers and Service Workers to offload 100% of processing from the UI thread.
- **Parallel Processing**: Ingests up to **3 assets simultaneously** for maximum throughput.
- **Streaming AI Analysis**: Utilizes **Gemini 3.0 Flash (Thinking Mode)** with response streaming to perform deep cognitive analysis without browser timeouts.
- **Audio Intelligence**: Automatic transcription using **Whisper**, generating frame-accurate subtitles (SRT) for every clip.
- **Visual Intelligence**: Keyframe analysis detects objects, scenes, actions, and even reads text within the video.

### 2. **Cognitive Repository Structure**
Trem-AI doesn't just store files; it *understands* them.
- **Automatic Scene Detection**: Identifies cuts and transitions based on visual and audio cues.
- **Semantic Tagging**: Auto-generates consistent tags across your entire library.
- **Narrative Synthesis**: The "Big Brain" agent reads all transcripts and visual descriptions to generate a cohesive "Story Architecture" for your repository.

### 3. **The "Space-Age" Dashboard**
A premium, glassmorphic interface designed for pro-sumer workflow.
- **Workspace Management**: Organize projects into distinct workspaces.
- **Live "Thinking" Logs**: Watch the AI reasoning process in real-time as it streams thoughts to the console.
- **Manual Commit Flow**: Review the AI's generated structure before finalizing—you are always the pilot.

### 4. **Programmatic Video Editing**
Built on top of **Remotion**, allowing you to edit VIDEO as CODE.
- **Timeline Editor**: A visual timeline to arrange your narrative.
- **React-Based Clips**: Edit text, overlays, and effects using standard React components.
- **Instant Preview**: Zero-render preview engine using browser-based composition.

---

## 🛠️ Technical Architecture

### **The Cloudflare Worker Backend**
Trem-AI now uses a real backend for ingestion and storage orchestration.
- **`worker/src/index.ts`**: The API layer for projects, assets, uploads, and workflow kickoff.
- **`worker/src/workflows/ingestion-workflow.ts`**: The ingestion workflow that reads from R2 and uses server-side provider secrets.
- **Robustness**: Durable Objects, D1, R2, and Workflows coordinate state outside the browser.

### **The AI Stack**
We use a server-side "Mixture of Experts" approach:
1.  **Gemini**: Used for asset analysis and project-level synthesis inside the Cloudflare Worker workflow.
2.  **Whisper (via Replicate)**: Used for transcription inside the Cloudflare Worker workflow.

---

## � Feature Walkthrough

### **1. Dashboard (`src/dashboard`)**
The command center.
- **`CreateWorkspaceView`**: Initialize new project contexts.
- **`RepoOverviewPage`**: A stats-heavy view of your repository (Total Duration, Asset Count, Token Usage).

### **2. Ingestion Studio (`src/dashboard/create`)**
- **File Picker**: Drag-and-drop interface supporting Video, Audio, and Image formats.
- **Frame Extractor**: A dedicated Main-Thread process that extracts 1 FPS keyframes for visual analysis.
- **Job Monitor**: A terminal-style live log viewer connecting directly to the Service Worker's broadcast channel.

### **3. The Editor (`src/dashboard/edit`)**
- **`RemotionEditPage`**: The integration point for Remotion.
- **`TimelineEditorPage`**: Custom-built timeline UI supporting multi-track visualization.

---

## 💻 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | React 19, Vite 6 |
| **Language** | TypeScript |
| **Styling** | TailwindCSS, CSS Variables |
| **State Management** | Zustand |
| **Database** | Cloudflare D1, IndexedDB (legacy/local compatibility) |
| **AI Models** | Google Gemini, Replicate Whisper |
| **Video Engine** | Remotion |
| **Background** | Cloudflare Workers, Workflows, Durable Objects, Service Workers (legacy compatibility) |

---

## � Installation & Setup

### Prerequisites
- Node.js (v18+)
- Cloudflare account
- Vercel project (for the frontend)

### 1. Clone & Install
```bash
git clone https://github.com/your-org/trem-ai.git
cd trem-ai
npm install
```

### 2. Environment Configuration
Create `.env.local`:
```env
VITE_API_URL="https://your-worker.your-subdomain.workers.dev"
```

Provider secrets now live in Cloudflare Worker secrets:

```bash
cd worker
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put REPLICATE_API_TOKEN
```

### 3. Start Development
```bash
npm run dev
```
*Note: This will verify Service Worker registration and Database integrity on startup.*

---

## 🚧 Project Structure

```text
src/
├── dashboard/           # UI Views
│   ├── create/          # Ingestion Workflows
│   ├── edit/            # Video Editor (Remotion)
│   ├── repo/            # Repository Visualization
│   └── settings/        # App Configuration
├── services/            # Logic Layer
│   ├── gemini/          # AI Model Integration
│   └── whisperService.ts # Transcription Logic
├── sw.ts                # Service Worker (The "Backend")
├── utils/
│   ├── db.ts            # IndexedDB Wrapper
│   └── audioExtractor.ts # FFmpeg/Audio Logic
└── main.tsx             # Entry Point
```

---

## 🤝 Contributing

We welcome contributions! Please focus on **Performance Optimization** and **New AI Agents**.

1. Fork the repo.
2. Create your branch (`git checkout -b feature/NewAgent`).
3. Commit your changes.
4. Push to the branch.
5. Create a Pull Request.

---

## 📄 License

MIT License. Built for the Future of Video.
