// Gray-Scott Reaction-Diffusion Compute Shader
// Simulates two chemicals U (substrate) and V (activator) with spatially-varying parameters

struct Uniforms {
    dt: f32,           // Time step
    Du: f32,           // Diffusion rate of U (substrate)
    Dv: f32,           // Diffusion rate of V (activator)
    mouseX: f32,       // Normalized mouse X (-1 if inactive)
    mouseY: f32,       // Normalized mouse Y
    mouseRadius: f32,  // Cursor influence radius
    mouseStrength: f32,// Feed rate boost from cursor
    time: f32,         // Current time for animation
}

@group(0) @binding(0) var<storage, read> currentState: array<vec2<f32>>;
@group(0) @binding(1) var<storage, read_write> nextState: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> params: array<vec2<f32>>; // (f, k) per cell
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

const WIDTH: u32 = 512u;
const HEIGHT: u32 = 512u;

fn getIndex(x: u32, y: u32) -> u32 {
    // Wrap around for toroidal boundary
    let wx = (x + WIDTH) % WIDTH;
    let wy = (y + HEIGHT) % HEIGHT;
    return wy * WIDTH + wx;
}

fn laplacian(x: u32, y: u32) -> vec2<f32> {
    // 9-point stencil for smoother Laplacian
    let center = currentState[getIndex(x, y)];
    
    // Cardinal neighbors (weight 0.2)
    let north = currentState[getIndex(x, y - 1u)];
    let south = currentState[getIndex(x, y + 1u)];
    let east = currentState[getIndex(x + 1u, y)];
    let west = currentState[getIndex(x - 1u, y)];
    
    // Diagonal neighbors (weight 0.05)
    let ne = currentState[getIndex(x + 1u, y - 1u)];
    let nw = currentState[getIndex(x - 1u, y - 1u)];
    let se = currentState[getIndex(x + 1u, y + 1u)];
    let sw = currentState[getIndex(x - 1u, y + 1u)];
    
    // Weighted sum approximating ∇²
    return (north + south + east + west) * 0.2 
         + (ne + nw + se + sw) * 0.05 
         - center;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    if (id.x >= WIDTH || id.y >= HEIGHT) {
        return;
    }
    
    let idx = getIndex(id.x, id.y);
    let state = currentState[idx];
    let u = state.x;  // Substrate concentration
    let v = state.y;  // Activator concentration
    
    // Get local parameters
    var p = params[idx];
    var f = p.x;  // Feed rate
    let k = p.y;  // Kill rate
    
    // Mouse interaction: boost feed rate near cursor
    if (uniforms.mouseX >= 0.0) {
        let pos = vec2<f32>(f32(id.x) / f32(WIDTH), f32(id.y) / f32(HEIGHT));
        let mousePos = vec2<f32>(uniforms.mouseX, uniforms.mouseY);
        let dist = length(pos - mousePos);
        if (dist < uniforms.mouseRadius) {
            let influence = 1.0 - (dist / uniforms.mouseRadius);
            f = f + uniforms.mouseStrength * influence * influence;
        }
    }
    
    // Compute Laplacian for diffusion
    let lap = laplacian(id.x, id.y);
    
    // Gray-Scott reaction terms
    let reaction = u * v * v;
    
    // Update equations
    let du = uniforms.Du * lap.x - reaction + f * (1.0 - u);
    let dv = uniforms.Dv * lap.y + reaction - (f + k) * v;
    
    // Apply update with time step
    var newU = u + du * uniforms.dt;
    var newV = v + dv * uniforms.dt;
    
    // Clamp to valid range
    newU = clamp(newU, 0.0, 1.0);
    newV = clamp(newV, 0.0, 1.0);
    
    nextState[idx] = vec2<f32>(newU, newV);
}



