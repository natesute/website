// Pixel renderer with hover underline support and staggered visibility

struct Uniforms {
    time: f32,
    simWidth: f32,
    simHeight: f32,
    _pad: f32,
    // Underline region (normalized 0-1)
    underlineX: f32,
    underlineY: f32,
    underlineW: f32,
    underlineH: f32,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

// State is vec2<u32>: x = on/off, y = age
@group(0) @binding(0) var<storage, read> state: array<vec2<u32>>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;

// Hash for random delay values
fn hashDelay(p: vec2<u32>) -> f32 {
    let n = p.x * 127u + p.y * 311u + 7919u;
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
    
    let cellX = u32(input.uv.x * uniforms.simWidth);
    let cellY = u32(input.uv.y * uniforms.simHeight);
    
    let cx = min(cellX, w - 1u);
    let cy = min(cellY, h - 1u);
    
    let idx = cy * w + cx;
    let cellState = state[idx];
    let isOn = cellState.x == 1u;
    let age = cellState.y;
    
    // Colors
    let void_black = vec3<f32>(0.039, 0.039, 0.039);
    let white = vec3<f32>(0.910, 0.890, 0.870);
    
    // Check if in underline region
    let inUnderline = input.uv.x >= uniforms.underlineX && 
                      input.uv.x <= uniforms.underlineX + uniforms.underlineW &&
                      input.uv.y >= uniforms.underlineY && 
                      input.uv.y <= uniforms.underlineY + uniforms.underlineH &&
                      uniforms.underlineW > 0.0;
    
    // Underline takes priority - always white
    if (inUnderline) {
        return vec4<f32>(white, 1.0);
    }
    
    if (!isOn) {
        return vec4<f32>(void_black, 1.0);
    }
    
    // Random visibility delay per pixel (0-100ms range)
    // Use squared distribution to weight toward lower delays
    let delayRand = hashDelay(vec2<u32>(cx, cy));
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
