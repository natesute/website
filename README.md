# Morphogenetic Website

A personal website rendered entirely through Gray-Scott Reaction-Diffusion simulation on WebGPU compute shaders.

## Concept

This website embodies a "living document" paradigm where all content emerges from biological algorithms. The interface is not built - it is grown. Text and layouts form through the same reaction-diffusion processes that create patterns in nature: fingerprints, animal markings, coral structures.

## Technical Stack

- **WebGPU** - Modern GPU API for compute shaders
- **Gray-Scott Model** - Two-chemical reaction-diffusion system
- **TypeScript** - Type-safe implementation
- **Vite** - Fast development server and bundler

## Architecture

```
512x512 Simulation Grid
        ↓
   Compute Shader (gray-scott.wgsl)
        ↓
   State Buffer (U, V concentrations)
        ↓
   Fragment Shader (render.wgsl)
        ↓
   Full-screen Canvas (bilinear upscale)
```

### Key Components

- **Simulation** (`src/simulation/`) - Gray-Scott compute pipeline with ping-pong buffers
- **Typography** (`src/typography/`) - Text rasterization to parameter masks
- **Rendering** (`src/shaders/`) - V concentration to monochrome color mapping
- **Content** (`src/content/`) - Page definitions and state machine
- **Interaction** (`src/interaction/`) - Cursor as chemical feed agent

## Visual Design

- **Palette**: Near-void black (#0a0a0a) to warm cream white (#e8e4de)
- **Typography**: Cormorant Garamond (classical serif)
- **Aesthetic**: Gwern-inspired utilitarian + Dune-like biological computing

## Running Locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 in Chrome or Edge (WebGPU required).

## Building for Production

```bash
npm run build
```

Output in `dist/` folder.

## Browser Support

WebGPU is required:
- Chrome 113+
- Edge 113+
- Safari 17+ (with feature flag)
- Firefox (experimental)

A static fallback is shown for unsupported browsers.

## Parameters

The Gray-Scott model behavior is controlled by feed (f) and kill (k) rates:

| Pattern | Feed | Kill | Description |
|---------|------|------|-------------|
| Maze | 0.029 | 0.057 | Neural/mycelial networks |
| Coral | 0.055 | 0.062 | Dense fingerprint-like patterns |
| Mitosis | 0.037 | 0.065 | Dividing spots |
| Solitons | 0.030 | 0.062 | Wandering isolated dots |

## License

MIT
