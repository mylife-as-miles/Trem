# Vercel Deployment Setup

To ensure the application runs correctly in production (Vercel), you must configure the following Environment Variables in your Vercel Project Settings.

## Required Environment Variables

| Variable Name | Description | Required For |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Your Google Gemini API Key | Chat, Analysis, Orchestrator |
| `REPLICATE_API_TOKEN` | Your Replicate API Token | Whisper Transcription (Audio/Video ingestion) |

## Common Errors

### 500 Internal Server Error on `/api/predictions`
**Cause:** The `REPLICATE_API_TOKEN` is missing in the Vercel environment.
**Fix:** Add `REPLICATE_API_TOKEN` to Vercel > Settings > Environment Variables. Redeploy the application (or promote the latest build) for changes to take effect.

### 503 Service Unavailable (Gemini)
**Cause:** The AI model `gemini-3-flash-preview` is currently overloaded.
**Fix:** The application will automatically retry. If the issue persists for a long time, consider switching to `gemini-1.5-flash` in `services/geminiService.ts`.
