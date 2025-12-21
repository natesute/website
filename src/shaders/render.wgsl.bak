// Render shader: maps text mask and RD state to monochrome output with film grain

struct Uniforms {
    time: f32,
    simWidth: f32,
    simHeight: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
    _pad4: f32,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var<storage, read> state: array<vec2<f32>>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;
@group(0) @binding(2) var<storage, read> params: array<vec2<f32>>; // f,k parameters (encodes mask)

// Full-screen quad vertices
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

// Get index for bilinear sampling
fn getIndex(x: u32, y: u32) -> u32 {
    let w = u32(uniforms.simWidth);
    let h = u32(uniforms.simHeight);
    let wx = min(x, w - 1u);
    let wy = min(y, h - 1u);
    return wy * w + wx;
}

// Sample parameters (encodes text mask via k value)
fn sampleMask(uv: vec2<f32>) -> f32 {
    let x = uv.x * uniforms.simWidth;
    let y = uv.y * uniforms.simHeight;
    
    let x0 = u32(floor(x));
    let y0 = u32(floor(y));
    let x1 = x0 + 1u;
    let y1 = y0 + 1u;
    
    let fx = fract(x);
    let fy = fract(y);
    
    // k value is lower in text regions (0.062) vs background (0.1)
    // Use this to derive mask: lower k = text
    let k00 = params[getIndex(x0, y0)].y;
    let k10 = params[getIndex(x1, y0)].y;
    let k01 = params[getIndex(x0, y1)].y;
    let k11 = params[getIndex(x1, y1)].y;
    
    let k0 = mix(k00, k10, fx);
    let k1 = mix(k01, k11, fx);
    let k = mix(k0, k1, fy);
    
    // Convert k to mask: k < 0.08 means text region
    return smoothstep(0.09, 0.065, k);
}

// Sample RD state for texture
fn sampleV(uv: vec2<f32>) -> f32 {
    let x = uv.x * uniforms.simWidth;
    let y = uv.y * uniforms.simHeight;
    
    let x0 = u32(floor(x));
    let y0 = u32(floor(y));
    let x1 = x0 + 1u;
    let y1 = y0 + 1u;
    
    let fx = fract(x);
    let fy = fract(y);
    
    let v00 = state[getIndex(x0, y0)].y;
    let v10 = state[getIndex(x1, y0)].y;
    let v01 = state[getIndex(x0, y1)].y;
    let v11 = state[getIndex(x1, y1)].y;
    
    let v0 = mix(v00, v10, fx);
    let v1 = mix(v01, v11, fx);
    return mix(v0, v1, fy);
}

// Procedural organic noise for texture
fn organicNoise(uv: vec2<f32>, time: f32) -> f32 {
    let p = uv * 50.0;
    let n1 = sin(p.x * 1.0 + time * 0.1) * cos(p.y * 1.3);
    let n2 = sin(p.x * 2.1 + p.y * 1.7 + time * 0.05) * 0.5;
    let n3 = cos(p.x * 0.7 - p.y * 2.3) * 0.3;
    return (n1 + n2 + n3) * 0.15 + 0.85;
}

// Film grain noise
fn grain(uv: vec2<f32>, time: f32) -> f32 {
    let noise = fract(sin(dot(uv + time * 0.001, vec2<f32>(12.9898, 78.233))) * 43758.5453);
    return (noise - 0.5) * 0.02;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    // Get text mask from parameters
    let mask = sampleMask(input.uv);
    
    // Get RD pattern for subtle texture variation
    let v = sampleV(input.uv);
    let rdTexture = smoothstep(0.1, 0.35, v);
    
    // Organic noise for additional texture
    let organic = organicNoise(input.uv, uniforms.time);
    
    // Color palette
    let void_black = vec3<f32>(0.078, 0.067, 0.059);       // #14110F (warm tint)
    let pattern_white = vec3<f32>(0.910, 0.890, 0.870);    // #e8e4de
    
    // Combine: mask defines where white appears, RD adds texture within
    let textureBlend = mix(0.85, 1.0, rdTexture * organic);
    let intensity = mask * textureBlend;
    
    var color = mix(void_black, pattern_white, intensity);
    
    // Apply film grain
    let g = grain(input.uv, uniforms.time);
    color = color + vec3<f32>(g, g, g);
    
    // Subtle vignette
    let vignette = 1.0 - length(input.uv - 0.5) * 0.2;
    color = color * vignette;
    
    return vec4<f32>(color, 1.0);
}
