import grayScottShader from './gray-scott.wgsl?raw';

/**
 * Gray-Scott Reaction-Diffusion simulation running on WebGPU compute shaders.
 * Uses ping-pong buffers for state updates and a parameter texture for spatial control.
 */
export class Simulation {
  readonly width: number;
  readonly height: number;
  
  private device: GPUDevice;
  private pipeline: GPUComputePipeline;
  private bindGroups: GPUBindGroup[];
  private stateBuffers: GPUBuffer[];
  private paramBuffer: GPUBuffer;
  private uniformBuffer: GPUBuffer;
  private currentBuffer = 0;

  // Exposed for external updates
  private paramData: Float32Array;
  private uniformData: Float32Array;
  private paused = false;

  constructor(device: GPUDevice, width: number, height: number) {
    this.device = device;
    this.width = width;
    this.height = height;

    // Create compute pipeline
    const shaderModule = device.createShaderModule({
      label: 'Gray-Scott Shader',
      code: grayScottShader,
    });

    this.pipeline = device.createComputePipeline({
      label: 'Gray-Scott Pipeline',
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });

    // Create state buffers (U and V concentrations, 2 floats per cell)
    const stateSize = width * height * 2 * 4; // 2 floats * 4 bytes
    this.stateBuffers = [
      device.createBuffer({
        label: 'State Buffer A',
        size: stateSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
      device.createBuffer({
        label: 'State Buffer B',
        size: stateSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    ];

    // Parameter buffer (f, k per cell - 2 floats)
    const paramSize = width * height * 2 * 4;
    this.paramBuffer = device.createBuffer({
      label: 'Parameter Buffer',
      size: paramSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.paramData = new Float32Array(width * height * 2);

    // Uniform buffer (dt, Du, Dv, mouseX, mouseY, mouseRadius, mouseStrength, time)
    this.uniformBuffer = device.createBuffer({
      label: 'Uniform Buffer',
      size: 32, // 8 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.uniformData = new Float32Array(8);
    this.uniformData[0] = 1.0;    // dt
    this.uniformData[1] = 0.21;   // Du (substrate diffusion - faster)
    this.uniformData[2] = 0.105;  // Dv (activator diffusion - slower)
    this.uniformData[3] = -1;     // mouseX (normalized, -1 = inactive)
    this.uniformData[4] = -1;     // mouseY
    this.uniformData[5] = 0.05;   // mouseRadius
    this.uniformData[6] = 0.02;   // mouseStrength (feed boost)
    this.uniformData[7] = 0;      // time

    // Create bind groups for ping-pong
    this.bindGroups = [
      device.createBindGroup({
        label: 'Bind Group A->B',
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.stateBuffers[0] } },
          { binding: 1, resource: { buffer: this.stateBuffers[1] } },
          { binding: 2, resource: { buffer: this.paramBuffer } },
          { binding: 3, resource: { buffer: this.uniformBuffer } },
        ],
      }),
      device.createBindGroup({
        label: 'Bind Group B->A',
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.stateBuffers[1] } },
          { binding: 1, resource: { buffer: this.stateBuffers[0] } },
          { binding: 2, resource: { buffer: this.paramBuffer } },
          { binding: 3, resource: { buffer: this.uniformBuffer } },
        ],
      }),
    ];

    // Initialize with substrate U=1, activator V=0, with seed regions
    this.reset();
  }

  /**
   * Reset simulation to clean initial state
   * Patterns will only form where parameter masks allow (text regions)
   */
  reset() {
    const data = new Float32Array(this.width * this.height * 2);
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = (y * this.width + x) * 2;
        data[idx] = 1.0;     // U = 1 (full substrate)
        data[idx + 1] = 0.0; // V = 0 (no activator - patterns seeded by mask)
      }
    }

    this.device.queue.writeBuffer(this.stateBuffers[0], 0, data);
    this.device.queue.writeBuffer(this.stateBuffers[1], 0, data);

    // Initialize parameters with extinction background
    this.setDefaultParameters();
  }

  /**
   * Seed V chemical within text regions based on the parameter mask
   * Called after setting parameters from mask to kickstart pattern formation
   */
  seedFromMask() {
    const data = new Float32Array(this.width * this.height * 2);
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = (y * this.width + x) * 2;
        const paramIdx = idx; // Same indexing
        
        // Check if this is a text region (low k = pattern-forming regime)
        const k = this.paramData[paramIdx + 1];
        const isTextRegion = k < 0.07; // Text regions have lower k
        
        data[idx] = 1.0;
        if (isTextRegion) {
          // Seed V in text regions to kickstart patterns
          data[idx + 1] = 0.25 + Math.random() * 0.1;
        } else {
          data[idx + 1] = 0.0;
        }
      }
    }
    
    this.device.queue.writeBuffer(this.stateBuffers[0], 0, data);
    this.device.queue.writeBuffer(this.stateBuffers[1], 0, data);
  }

  /**
   * Set default background parameters (extinction regime - no patterns)
   */
  private setDefaultParameters() {
    for (let i = 0; i < this.width * this.height; i++) {
      this.paramData[i * 2] = 0.010;     // f - very low feed
      this.paramData[i * 2 + 1] = 0.085; // k - high kill (extinction)
    }
    this.uploadParameters();
  }

  /**
   * Update parameter field from mask texture data
   * @param maskData - Grayscale mask where white = text region
   * @param textF - Feed rate for text regions
   * @param textK - Kill rate for text regions
   * @param bgF - Feed rate for background
   * @param bgK - Kill rate for background
   */
  setParametersFromMask(
    maskData: Uint8ClampedArray,
    maskWidth: number,
    maskHeight: number,
    textF: number,
    textK: number,
    bgF: number,
    bgK: number
  ) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        // Sample mask with bilinear interpolation
        const mx = (x / this.width) * maskWidth;
        const my = (y / this.height) * maskHeight;
        const mi = (Math.floor(my) * maskWidth + Math.floor(mx)) * 4;
        const maskValue = maskData[mi] / 255; // Grayscale from R channel

        const idx = (y * this.width + x) * 2;
        this.paramData[idx] = bgF + (textF - bgF) * maskValue;
        this.paramData[idx + 1] = bgK + (textK - bgK) * maskValue;
      }
    }
    this.uploadParameters();
  }

  /**
   * Blend current parameters toward target (for smooth transitions)
   */
  blendParameters(
    maskData: Uint8ClampedArray,
    maskWidth: number,
    maskHeight: number,
    textF: number,
    textK: number,
    bgF: number,
    bgK: number,
    blend: number
  ) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const mx = (x / this.width) * maskWidth;
        const my = (y / this.height) * maskHeight;
        const mi = (Math.floor(my) * maskWidth + Math.floor(mx)) * 4;
        const maskValue = maskData[mi] / 255;

        const idx = (y * this.width + x) * 2;
        const targetF = bgF + (textF - bgF) * maskValue;
        const targetK = bgK + (textK - bgK) * maskValue;

        this.paramData[idx] = this.paramData[idx] + (targetF - this.paramData[idx]) * blend;
        this.paramData[idx + 1] = this.paramData[idx + 1] + (targetK - this.paramData[idx + 1]) * blend;
      }
    }
    this.uploadParameters();
  }

  private uploadParameters() {
    this.device.queue.writeBuffer(this.paramBuffer, 0, this.paramData as Float32Array<ArrayBuffer>);
  }

  /**
   * Set cursor position for interaction
   */
  setCursor(x: number, y: number, active: boolean) {
    this.uniformData[3] = active ? x : -1;
    this.uniformData[4] = active ? y : -1;
  }

  /**
   * Inject chemical at a point (for click effects)
   * Note: Currently uses cursor uniform approach instead of direct buffer modification
   */
  injectAt(_x: number, _y: number, _radius: number = 0.02) {
    // Buffer readback is expensive - instead we boost feed rate via cursor uniform
    // This method is a placeholder for future direct injection if needed
  }

  /**
   * Execute one simulation step
   */
  step() {
    this.uniformData[7] += 0.016; // Increment time
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData as Float32Array<ArrayBuffer>);

    const commandEncoder = this.device.createCommandEncoder();
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroups[this.currentBuffer]);
    pass.dispatchWorkgroups(
      Math.ceil(this.width / 16),
      Math.ceil(this.height / 16)
    );
    pass.end();
    this.device.queue.submit([commandEncoder.finish()]);

    this.currentBuffer = 1 - this.currentBuffer;
  }

  /**
   * Pause simulation (patterns are static)
   */
  pause() {
    this.paused = true;
  }

  /**
   * Resume simulation
   */
  resume() {
    this.paused = false;
  }

  /**
   * Check if simulation is paused
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Get the current state buffer for rendering
   */
  getCurrentStateBuffer(): GPUBuffer {
    return this.stateBuffers[this.currentBuffer];
  }

  /**
   * Get simulation dimensions
   */
  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /**
   * Get parameter buffer (contains mask data via f,k values)
   */
  getParamBuffer(): GPUBuffer {
    return this.paramBuffer;
  }
}

