// Growth Cellular Automaton with age tracking
// Cells spread from seeds and track how long they've been alive

struct Uniforms {
    time: f32,
    width: f32,
    height: f32,
    _pad: f32,
}

// State is now vec2: x = on/off (0 or 1), y = age (frames since creation)
@group(0) @binding(0) var<storage, read> currentState: array<vec2<u32>>;
@group(0) @binding(1) var<storage, read_write> nextState: array<vec2<u32>>;
@group(0) @binding(2) var<storage, read> mask: array<u32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

fn getIndex(x: i32, y: i32) -> u32 {
    let w = i32(uniforms.width);
    let h = i32(uniforms.height);
    let wx = ((x % w) + w) % w;
    let wy = ((y % h) + h) % h;
    return u32(wy * w + wx);
}

fn isOn(x: i32, y: i32) -> bool {
    return currentState[getIndex(x, y)].x == 1u;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let w = u32(uniforms.width);
    let h = u32(uniforms.height);
    
    if (id.x >= w || id.y >= h) {
        return;
    }
    
    let idx = id.y * w + id.x;
    let x = i32(id.x);
    let y = i32(id.y);
    
    let current = currentState[idx];
    let isCurrentlyOn = current.x == 1u;
    let currentAge = current.y;
    let inTextRegion = mask[idx];
    
    // If not in text region, stay off
    if (inTextRegion == 0u) {
        nextState[idx] = vec2<u32>(0u, 0u);
        return;
    }
    
    // If already on, stay on and increment age
    if (isCurrentlyOn) {
        nextState[idx] = vec2<u32>(1u, currentAge + 1u);
        return;
    }
    
    // Check for active neighbors (8-connected)
    var hasActiveNeighbor = false;
    if (isOn(x - 1, y)) { hasActiveNeighbor = true; }
    if (isOn(x + 1, y)) { hasActiveNeighbor = true; }
    if (isOn(x, y - 1)) { hasActiveNeighbor = true; }
    if (isOn(x, y + 1)) { hasActiveNeighbor = true; }
    if (isOn(x - 1, y - 1)) { hasActiveNeighbor = true; }
    if (isOn(x + 1, y - 1)) { hasActiveNeighbor = true; }
    if (isOn(x - 1, y + 1)) { hasActiveNeighbor = true; }
    if (isOn(x + 1, y + 1)) { hasActiveNeighbor = true; }
    
    // Grow if has neighbor - age starts at 0
    if (hasActiveNeighbor) {
        nextState[idx] = vec2<u32>(1u, 0u);
    } else {
        nextState[idx] = vec2<u32>(0u, 0u);
    }
}
