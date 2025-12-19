// Pixel renderer with hover underline, staggered visibility, and idle wobble

struct Uniforms {
    time: f32,
    simWidth: f32,
    simHeight: f32,
    wobbleEnabled: f32,  // 1.0 = enabled, 0.0 = disabled
    // Underline region (normalized 0-1)
    underlineX: f32,
    underlineY: f32,
    underlineW: f32,
    underlineH: f32,
    // Canvas dimensions for aspect ratio correction
    canvasWidth: f32,
    canvasHeight: f32,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

// State is vec2<u32>: x = on/off, y = age
@group(0) @binding(0) var<storage, read> state: array<vec2<u32>>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;
// Mask stores intensity: 0 = background, ~68 = shadow (#444), ~255 = main text (#fff)
@group(0) @binding(2) var<storage, read> mask: array<u32>;

// Hash for random values
fn hash(p: vec2<u32>) -> f32 {
    let n = p.x * 127u + p.y * 311u + 7919u;
    let h = n * 0xcc9e2d51u;
    let h2 = h ^ (h >> 15u);
    return f32(h2 & 0xFFFFu) / 65535.0;
}

// Hash with time component for wobble
fn hashTime(p: vec2<u32>, t: u32) -> f32 {
    let n = p.x * 127u + p.y * 311u + t * 5381u + 7919u;
    let h = n * 0xcc9e2d51u;
    let h2 = h ^ (h >> 15u);
    return f32(h2 & 0xFFFFu) / 65535.0;
}

// Check if a grid cell contains a star and calculate its contribution
fn getStarBrightness(cellX: i32, cellY: i32, pixelX: f32, pixelY: f32, time: f32, maxCellX: i32, maxCellY: i32) -> f32 {
    if (cellX < 0 || cellY < 0 || cellX >= maxCellX || cellY >= maxCellY) {
        return 0.0;
    }
    
    let starSeed = hash(vec2<u32>(u32(cellX), u32(cellY)));
    
    // ~0.045% can be stars (~18 potential positions)
    if (starSeed >= 0.00045) {
        return 0.0;
    }
    
    // Star center is at cell center
    let starCenterX = f32(cellX) + 0.5;
    let starCenterY = f32(cellY) + 0.5;
    
    // Square distance (Chebyshev) - makes rectangular stars
    // Scale X slightly to make stars a bit taller than wide
    let dx = abs(pixelX - starCenterX) * 1.15;
    let dy = abs(pixelY - starCenterY);
    let dist = max(dx, dy);
    
    // Star size: mostly 1 pixel, occasionally slightly larger
    let sizeRand = fract(starSeed * 7919.0);
    var starRadius: f32;
    if (sizeRand < 0.85) {
        starRadius = 0.45;  // Small stars (most common) - 1 pixel
    } else {
        starRadius = 0.6;   // Slightly larger - still small
    }
    
    // Skip if outside star radius - hard pixel edge, no blur
    if (dist > starRadius) {
        return 0.0;
    }
    
    // Staggered emergence over ~20 seconds
    let birthTime = starSeed * 22000.0;
    if (time < birthTime) {
        return 0.0;
    }
    
    let starAge = time - birthTime;
    
    // Initial fade-in over 2 seconds
    let initialFade = smoothstep(0.0, 2.0, starAge);
    
    // Animation phase
    let starPhaseOffset = starSeed * 739.0;
    let phase = fract((starAge * 0.1) + starPhaseOffset);
    
    // Twinkle envelope
    let fadeIn = smoothstep(0.0, 0.15, phase);
    let fadeOut = smoothstep(1.0, 0.7, phase);
    let twinkle = fadeIn * fadeOut;
    
    // Shimmer
    let shimmer = 0.9 + 0.1 * sin(time * 2.0 + starPhaseOffset * 50.0);
    
    // Hard-edged pixels: full brightness if inside, no falloff
    return twinkle * shimmer * initialFade;
}

// Twinkling star effect - uses aspect-corrected UVs for consistent star shapes
fn calculateStar(screenUV: vec2<f32>, time: f32, void_black: vec3<f32>) -> vec4<f32> {
    // Apply aspect ratio correction so stars remain square (not stretched)
    let canvasAspect = uniforms.canvasWidth / uniforms.canvasHeight;
    
    // Determine grid density based on the shorter dimension
    // Use 200 cells along the shorter axis, scale the longer axis proportionally
    var gridScaleX = 200.0;
    var gridScaleY = 200.0;
    
    if (canvasAspect > 1.0) {
        // Canvas is wider than tall - more cells horizontally
        gridScaleX = 200.0 * canvasAspect;
    } else {
        // Canvas is taller than wide - more cells vertically
        gridScaleY = 200.0 / canvasAspect;
    }
    
    // Grid coordinates with aspect correction
    let gridX = screenUV.x * gridScaleX;
    let gridY = screenUV.y * gridScaleY;
    let cellX = i32(gridX);
    let cellY = i32(gridY);
    
    // Grid bounds for star visibility
    let maxCellX = i32(gridScaleX) + 1;
    let maxCellY = i32(gridScaleY) + 1;
    
    // Check current cell and 8 neighbors for stars (to catch larger stars)
    var brightness = 0.0;
    brightness = max(brightness, getStarBrightness(cellX - 1, cellY - 1, gridX, gridY, time, maxCellX, maxCellY));
    brightness = max(brightness, getStarBrightness(cellX,     cellY - 1, gridX, gridY, time, maxCellX, maxCellY));
    brightness = max(brightness, getStarBrightness(cellX + 1, cellY - 1, gridX, gridY, time, maxCellX, maxCellY));
    brightness = max(brightness, getStarBrightness(cellX - 1, cellY,     gridX, gridY, time, maxCellX, maxCellY));
    brightness = max(brightness, getStarBrightness(cellX,     cellY,     gridX, gridY, time, maxCellX, maxCellY));
    brightness = max(brightness, getStarBrightness(cellX + 1, cellY,     gridX, gridY, time, maxCellX, maxCellY));
    brightness = max(brightness, getStarBrightness(cellX - 1, cellY + 1, gridX, gridY, time, maxCellX, maxCellY));
    brightness = max(brightness, getStarBrightness(cellX,     cellY + 1, gridX, gridY, time, maxCellX, maxCellY));
    brightness = max(brightness, getStarBrightness(cellX + 1, cellY + 1, gridX, gridY, time, maxCellX, maxCellY));
    
    if (brightness < 0.01) {
        return vec4<f32>(void_black, 1.0);
    }
    
    // Soft blue-white star color
    let starColor = vec3<f32>(0.75, 0.82, 0.92);
    let finalColor = mix(void_black, starColor, brightness * 0.85);
    return vec4<f32>(finalColor, 1.0);
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 4>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(1.0, -1.0),
        vec2<f32>(-1.0, 1.0),
        vec2<f32>(1.0, 1.0)
    );
    
    var uvs = array<vec2<f32>, 4>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 0.0)
    );
    
    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
    output.uv = uvs[vertexIndex];
    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let w = u32(uniforms.simWidth);
    let h = u32(uniforms.simHeight);
    
    // Colors
    let void_black = vec3<f32>(0.039, 0.055, 0.078);       // #0A0E14 (pure midnight)
    let white = vec3<f32>(0.910, 0.890, 0.870);
    
    // Aspect ratio correction: maintain square simulation proportions
    let canvasAspect = uniforms.canvasWidth / uniforms.canvasHeight;
    let simAspect = uniforms.simWidth / uniforms.simHeight;  // Should be 1.0 for square
    
    var uv = input.uv;
    
    // Adjust UVs to maintain aspect ratio (fit simulation in canvas center)
    if (canvasAspect > simAspect) {
        // Canvas is wider than simulation - letterbox horizontally
        let scale = canvasAspect / simAspect;
        uv.x = (uv.x - 0.5) * scale + 0.5;
    } else {
        // Canvas is taller than simulation - letterbox vertically
        let scale = simAspect / canvasAspect;
        uv.y = (uv.y - 0.5) * scale + 0.5;
    }
    
    // Shift simulation content up to compensate for extra canvas height
    uv.y = uv.y + 0.07;
    
    // If outside the simulation bounds, show background (with stars if enabled)
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        if (uniforms.wobbleEnabled > 0.5) {
            return calculateStar(input.uv, uniforms.time, void_black);
        }
        return vec4<f32>(void_black, 1.0);
    }
    
    let cellX = u32(uv.x * uniforms.simWidth);
    let cellY = u32(uv.y * uniforms.simHeight);
    
    var cx = min(cellX, w - 1u);
    var cy = min(cellY, h - 1u);
    
    // Check if in underline region (using aspect-corrected UVs)
    let inUnderline = uv.x >= uniforms.underlineX && 
                      uv.x <= uniforms.underlineX + uniforms.underlineW &&
                      uv.y >= uniforms.underlineY && 
                      uv.y <= uniforms.underlineY + uniforms.underlineH &&
                      uniforms.underlineW > 0.0;
    
    // Underline takes priority - always white
    if (inUnderline) {
        return vec4<f32>(white, 1.0);
    }
    
    // === IDLE WOBBLE EFFECT ===
    // Only runs when enabled (after shift-up animation completes)
    if (uniforms.wobbleEnabled > 0.5) {
        // Time slot changes every ~1 second
        let timeSlot = u32(uniforms.time * 1.0);
        
        // Each pixel has a chance to wobble based on position + time
        let wobbleChance = hashTime(vec2<u32>(cx, cy), timeSlot);
        
        // ~3% of pixels wobble each time slot
        if (wobbleChance < 0.03) {
            // Determine wobble direction (1 of 4 directions)
            let dir = u32(wobbleChance * 133.0) % 4u;
            if (dir == 0u && cx > 0u) { cx = cx - 1u; }
            else if (dir == 1u && cx < w - 1u) { cx = cx + 1u; }
            else if (dir == 2u && cy > 0u) { cy = cy - 1u; }
            else if (dir == 3u && cy < h - 1u) { cy = cy + 1u; }
        }
    }
    
    let idx = cy * w + cx;
    let cellState = state[idx];
    let isOn = cellState.x == 1u;
    let age = cellState.y;
    
    if (!isOn) {
        // Twinkling stars on background pixels (uses screen-space for consistency)
        if (uniforms.wobbleEnabled > 0.5) {
            return calculateStar(input.uv, uniforms.time, void_black);
        }
        return vec4<f32>(void_black, 1.0);
    }
    
    // Random visibility delay per pixel (0-100ms range)
    // Use squared distribution to weight toward lower delays
    let delayRand = hash(vec2<u32>(cx, cy));
    // Square the random value to skew toward 0
    let skewed = delayRand * delayRand;
    // Map to 0-6 frames (~0-100ms at 60fps with 2-frame steps)
    let visibilityDelay = u32(skewed * 6.0);
    
    // If age hasn't exceeded delay, stay invisible
    if (age < visibilityDelay) {
        return vec4<f32>(void_black, 1.0);
    }
    
    // Check mask intensity to differentiate shadow from main text
    let maskIntensity = mask[idx];
    
    // Main text (intensity > 128) is bright white, shadow is faint blizzard blue
    if (maskIntensity > 128u) {
        return vec4<f32>(white, 1.0);
    } else {
        // Shadow pixels - faint blizzard blue tint
        let shadow_color = vec3<f32>(0.55, 0.65, 0.72);
        return vec4<f32>(shadow_color, 1.0);
    }
}
