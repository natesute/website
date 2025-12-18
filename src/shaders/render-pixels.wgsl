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
    let void_black = vec3<f32>(0.063, 0.071, 0.086);       // #101216 (cool tint)
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
    
    // If outside the simulation bounds, show background
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
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
    
    // All visible cells are white
    return vec4<f32>(white, 1.0);
}
