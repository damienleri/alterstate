# AlterState

Iterative image modification web app powered by generative AI (Gemini 2.5 Flash).

## Features

- **Image Upload**: Upload images or select from previous uploads
- **Grid-based Selection**: Interactive 6x6 grid overlay for precise area selection
- **AI-powered Modifications**: Use natural language to modify selected regions
- **Iterative Editing**: Continue editing with the modified image
- **Local Storage**: Files stored locally on the server for development

## Tech Stack

- [TanStack Start](https://tanstack.com/start/latest) - Full-stack React framework
- [AI SDK 6](https://ai-sdk.dev/docs/announcing-ai-sdk-6-beta) - Gemini integration
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) - Image processing

## Getting Started

### Prerequisites

- Node.js 18+
- Google Generative AI API key ([get one here](https://aistudio.google.com/app/apikey))

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

3. Add your Google Generative AI API key to `.env`:

```
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
```

### Running the App

Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Usage

1. **Upload an image** or select from previous uploads
2. **Click cells** on the 6x6 grid to select regions you want to modify
3. **Enter a prompt** describing how you want to modify the selected cells
4. **Submit** to generate the modified image
5. **Toggle grid** to continue editing or select new regions

## Project Structure

```
src/
├── routes/
│   ├── __root.tsx          # Root layout
│   ├── index.tsx            # Main page
│   └── api/                 # API endpoints
│       ├── upload.ts        # Image upload
│       ├── modify-image.ts  # AI modification
│       └── images.$filename.ts
├── components/
│   ├── ImageUpload.tsx      # Upload component
│   ├── ImageCanvas.tsx      # Grid overlay
│   ├── PromptInput.tsx      # Prompt form
│   └── ImageGallery.tsx     # Previous uploads
├── utils/
│   ├── storage.ts           # File storage
│   └── imageProcessing.ts   # Canvas utilities
└── styles/
    └── globals.css          # Global styles

uploads/
├── original/                # Uploaded images
└── modified/                # Generated images

temp/                        # Debug images (gitignored)
```

## Building For Production

```bash
npm run build
npm run start
```

## Future Enhancements

- Parallel LLM requests for comparison
- Multiple attempt judging
- Customizable grid size
- Undo/redo functionality
- Export modification history

---

Built with [TanStack Start](https://tanstack.com/start)
